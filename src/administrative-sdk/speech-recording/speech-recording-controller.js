import Base64Utils from '../utils/base64-utils';
import Connection from '../connection/connection-controller';
import SpeechRecording from './speech-recording';
import Student from '../student/student';
import when from 'when';

/**
 * Controller class for the SpeechRecording model.
 */
export default class SpeechRecordingController {
  /**
   * @param {Connection} connection - Object to use for making a connection to the REST API and Websocket server.
   */
  constructor(connection) {
    this._connection = connection;
  }

  /**
   * Initialise the speech recording challenge through RPCs.
   *
   * @param {SpeechChallenge} challenge - SpeechChallenge.
   * @private
   */
  speechRecordingInitChallenge(challenge) {
    return this._connection._session.call('nl.itslanguage.recording.init_challenge',
      [this._connection._recordingId, challenge.organisationId, challenge.id]).then(
      // RPC success callback
      recordingId => {
        console.log('Challenge initialised for recordingId: ' + this._connection._recordingId);
        return recordingId;
      },
      // RPC error callback
      res => {
        Connection.logRPCError(res);
        return Promise.reject(res);
      }
    );
  }

  /**
   * Initialise the speech recording audio specs through RPCs.
   *
   * @param {AudioRecorder} recorder - AudioRecorder.
   * @param {Function} dataavailableCb - Callback.
   * @private
   */
  speechRecordingInitAudio(recorder, dataavailableCb) {
    // Indicate to the socket server that we're about to start recording a
    // challenge. This allows the socket server some time to fetch the metadata
    // and reference audio to start the recording when audio is actually submitted.
    const specs = recorder.getAudioSpecs();
    return this._connection._session.call('nl.itslanguage.recording.init_audio',
      [this._connection._recordingId, specs.audioFormat], specs.audioParameters)
      .then(recordingId => {
        console.log('Accepted audio parameters for recordingId after init_audio: ' + this._connection._recordingId);
        // Start listening for streaming data.
        recorder.addEventListener('dataavailable', dataavailableCb);
        return recordingId;
      })
      .catch(res => {
        Connection.logRPCError(res);
        return Promise.reject(res);
      });
  }

  /**
   * Start a speech recording from streaming audio.
   *
   * @param {SpeechChallenge} challenge - The speech challenge to perform.
   * @param {AudioRecorder} recorder - The audio recorder to extract audio from.
   * @returns {Promise} A {@link https://github.com/cujojs/when} Promise containing a {@link SpeechRecording}.
   * @emits {string} 'ReadyToReceive' when the call is made to receive audio. The recorder can now send audio.
   * @throws {Promise} If challenge is not an object or not defined.
   * @throws {Promise} If challenge has no id.
   * @throws {Promise} If challenge has no organisationId.
   * @throws {Promise} If the connection is not open.
   * @throws {Promise} If the recorder is already recording.
   * @throws {Promise} If a session is already in progress.
   * @throws {Promise} If something went wrong during recording.
   */
  startStreamingSpeechRecording(challenge, recorder) {
    // Validate required domain model.
    // Validate environment prerequisites.
    if (typeof challenge !== 'object' || !challenge) {
      return Promise.reject(new Error('"challenge" parameter is required or invalid'));
    }
    if (!challenge.id) {
      return Promise.reject(new Error('challenge.id field is required'));
    }
    if (!challenge.organisationId) {
      return Promise.reject(new Error('challenge.organisationId field is required'));
    }
    if (!this._connection._session) {
      return Promise.reject(new Error('WebSocket connection was not open.'));
    }
    if (recorder.isRecording()) {
      return Promise.reject(new Error('Recorder should not yet be recording.'));
    }
    if (this._connection._recordingId !== null) {
      return Promise.reject(new Error('Session with recordingId ' + this._connection._recordingId +
        ' still in progress.'));
    }
    const self = this;
    return new when.Promise((resolve, reject, notify) => {
      self._connection._recordingId = null;

      function _cb(data) {
        const student = new Student(challenge.organisationId, data.studentId);
        const recording = new SpeechRecording(
          challenge.id, student, data.id);
        recording.created = new Date(data.created);
        recording.updated = new Date(data.updated);
        recording.audioUrl = self._connection.addAccessToken(data.audioUrl);
        recording.recordingId = self._connection._recordingId;
        resolve(recording);
      }

      function recordedCb(activeRecordingId, audioBlob, forcedStop) {
        self._connection._session.call('nl.itslanguage.recording.close',
          [self._connection._recordingId]).then(
          // RPC success callback
          res => {
            // Pass along details to the success callback
            _cb(res, forcedStop);
          },
          // RPC error callback
          res => {
            Connection.logRPCError(res);
            reject(res);
          });
        recorder.removeEventListener('recorded', recordedCb);
        recorder.removeEventListener('dataavailable', startStreaming);
      }

      // Start streaming the binary audio when the user instructs
      // the audio recorder to start recording.
      function startStreaming(chunk) {
        const encoded = Base64Utils._arrayBufferToBase64(chunk);
        console.log('Sending audio chunk to websocket for recordingId: ' +
          self._connection._recordingId);
        self._connection._session.call('nl.itslanguage.recording.write',
          [self._connection._recordingId, encoded, 'base64']).then(
          // RPC success callback
          res => {
            // Wrote data.
            console.log('Wrote data');
            return res;
          },
          // RPC error callback
          res => {
            Connection.logRPCError(res);
            reject(res);
          }
        );
      }

      function startRecording(recordingId) {
        self._connection._recordingId = recordingId;
        console.log('Got recordingId after initialisation: ' + self._connection._recordingId);
      }

      recorder.addEventListener('recorded', recordedCb);
      self._connection._session.call('nl.itslanguage.recording.init_recording', [])
        .then(startRecording)
        .then(() => {
          self.speechRecordingInitChallenge(challenge)
              .then(() => {
                const p = new Promise(resolve_ => {
                  if (recorder.hasUserMediaApproval()) {
                    resolve_();
                  } else {
                    recorder.addEventListener('ready', resolve_);
                  }
                });
                p.then(() => {
                  self.speechRecordingInitAudio(recorder, startStreaming)
                    .catch(reject);
                });
              })
            .then(() => notify('ReadyToReceive'))
            .catch(reject);
        },
          res => {
            Connection.logRPCError(res);
            reject(res);
          });
    })
      .then(res => {
        self._connection._recordingId = null;
        return Promise.resolve(res);
      })
      .catch(error => {
        self._connection._recordingId = null;
        return Promise.reject(error);
      });
  }

  /**
   * Get a speech recording in a speech challenge.
   *
   * @param {Organisation#id} organisationId - Specify an organisation identifier.
   * @param {SpeechChallenge#id} challengeId - Specify a speech challenge identifier.
   * @param {SpeechRecording#id} recordingId - Specify a speech recording identifier.
   * @returns {Promise} Promise containing a SpeechRecording.
   * @throws {Promise} {@link SpeechChallenge#id} field is required.
   * @throws {Promise} {@link Organisation#id} field is required.
   * @throws {Promise} {@link SpeechRecording#id} field is required.
   * @throws {Promise} If no result could not be found.
   */
  getSpeechRecording(organisationId, challengeId, recordingId) {
    if (!organisationId) {
      return Promise.reject(new Error('organisationId field is required'));
    }
    if (!challengeId) {
      return Promise.reject(new Error('challengeId field is required'));
    }
    if (!recordingId) {
      return Promise.reject(new Error('recordingId field is required'));
    }
    const url = this._connection.settings.apiUrl + '/challenges/speech/' + challengeId + '/recordings/' + recordingId;
    return this._connection._secureAjaxGet(url)
      .then(data => {
        const student = new Student(organisationId, data.studentId);
        const recording = new SpeechRecording(challengeId, student, data.id);
        recording.audio = null;
        recording.audioUrl = this._connection.addAccessToken(data.audioUrl);
        recording.created = new Date(data.created);
        recording.updated = new Date(data.updated);
        return recording;
      });
  }

  /**
   * List all speech recordings in a specific speech challenge.
   *
   * @param {Organisation#id} organisationId - Specify an organisation identifier to list speech recordings for.
   * @param {SpeechChallenge#id} challengeId - Specify a speech challenge identifier to list speech recordings for.
   * @returns {Promise} Promise containing a list of SpeechRecording.
   * @throws {Promise} {@link SpeechChallenge#id} is required.
   * @throws {Promise} {@link Organisation#id} is required.
   * @throws {Promise} If no result could not be found.
   */
  listSpeechRecordings(organisationId, challengeId) {
    if (!organisationId) {
      return Promise.reject(new Error('organisationId field is required'));
    }
    if (!challengeId) {
      return Promise.reject(new Error('challengeId field is required'));
    }
    const url = this._connection.settings.apiUrl + '/challenges/speech/' + challengeId + '/recordings';
    return this._connection._secureAjaxGet(url)
      .then(data => {
        const recordings = [];
        data.forEach(datum => {
          const student = new Student(organisationId, datum.studentId);
          const recording = new SpeechRecording(challengeId, student, datum.id);
          recording.audio = null;
          recording.audioUrl = this._connection.addAccessToken(datum.audioUrl);
          recording.created = new Date(datum.created);
          recording.updated = new Date(datum.updated);
          recordings.push(recording);
        });
        return recordings;
      });
  }
}