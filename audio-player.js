const CordovaMediaPlayer = require('./cordova-media-player');
const WebAudioPlayer = require('./web-audio-player');
/**
 *@module its.AudioPlayer
 * ITSLanguage AudioPlayer non-graphical component.
 */
module.exports = class AudioPlayer {
  /**
   * @constructor
   * @param {object} [options] Override any of the default settings.
   *
   */
  constructor(options) {
    this.settings = Object.assign({}, options);

    this._playbackCompatibility();
    const self = this;
    const callbacks = {
      playingCb() {
        self.fireEvent('playing', []);
      },
      timeupdateCb() {
        self.fireEvent('timeupdate', []);
      },
      durationchangeCb() {
        self.fireEvent('durationchange', []);
      },
      canplayCb() {
        self.fireEvent('canplay', []);
      },
      endedCb() {
        self.fireEvent('ended', []);
      },
      pauseCb() {
        self.fireEvent('pause', []);
      },
      progressCb() {
        self.fireEvent('progress', []);
      },
      errorCb() {
        self.fireEvent('error', []);
      }
    };
    this.player = this._getBestPlayer(callbacks);

    // The addEventListener interface exists on object.Element DOM elements.
    // However, this is just a simple class without any relation to the DOM.
    // Therefore we have to implement a pub/sub mechanism ourselves.
    // See:

    // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget.addEventListener
    // http://stackoverflow.com/questions/10978311/implementing-events-in-my-own-object

    this.events = {};

    this.resetEventListeners = function() {
      self.events = {};
    };

    this.addEventListener = function(name, handler) {
      if (self.events.hasOwnProperty(name)) {
        self.events[name].push(handler);
      } else {
        self.events[name] = [handler];
      }
    };

    this.removeEventListener = function(name, handler) {
      /* This is a bit tricky, because how would you identify functions?
       This simple solution should work if you pass THE SAME handler. */
      if (!self.events.hasOwnProperty(name)) {
        return;
      }

      const index = self.events[name].indexOf(handler);
      if (index !== -1) {
        self.events[name].splice(index, 1);
      }
    };

    this.fireEvent = function(name, args) {
      if (!self.events.hasOwnProperty(name)) {
        return;
      }
      if (!args || !args.length) {
        args = [];
      }

      const evs = self.events[name];
      evs.forEach(ev => {
        ev(...args);
      });
    };
  }

  /**
   * Check for mandatory browser compatibility.
   * Logs detailed browser compatibilities related to for audio playback.
   * In case of compatibility issues, an error is thrown.
   */
  _playbackCompatibility() {
    // Detect audio playback capabilities.

    // Detect HTML5 Audio playback.
    // http://caniuse.com/#feat=audio
    this.canUseAudio = Boolean(new Audio());
    console.log('Native HTML5 Audio playback capability: ' +
      this.canUseAudio);

    // Detect Cordova Media Playback
    // It allows playing audio using the native bridge inside WebView Apps.
    // https://github.com/apache/cordova-plugin-media/blob/master/doc/index.md
    this.canUseCordovaMedia = Boolean(window.Media);
    console.log('Cordova Media playback capability: ' +
      this.canUseCordovaMedia);

    if (!(this.canUseAudio || this.canUseCordovaMedia)) {
      throw new Error(
        'Some form of audio playback capability is required');
    }

    const _audio = new Audio();
    if (_audio.canPlayType === 'function') {
      throw new Error(
        'Unable to detect audio playback capabilities');
    }

    const canPlayOggVorbis = _audio.canPlayType(
        'audio/ogg; codecs="vorbis"') !== '';
    const canPlayOggOpus = _audio.canPlayType(
        'audio/ogg; codecs="opus"') !== '';
    const canPlayWave = _audio.canPlayType('audio/wav') !== '';
    const canPlayMP3 = _audio.canPlayType('audio/mpeg; codecs="mp3"') !== '';
    const canPlayAAC = _audio.canPlayType(
        'audio/mp4; codecs="mp4a.40.2"') !== '';
    const canPlay3GPP = _audio.canPlayType(
        'audio/3gpp; codecs="samr"') !== '';

    console.log('Native Vorbis audio in Ogg container playback capability: ' +
      canPlayOggVorbis);
    console.log('Native Opus audio in Ogg container playback capability: ' +
      canPlayOggOpus);
    console.log('Native PCM audio in Waveform Audio File Format (WAVE) ' +
      'playback capability: ' + canPlayWave);
    console.log('Native MPEG Audio Layer 3 (MP3) playback capability: ' +
      canPlayMP3);
    console.log('Native Low-Complexity AAC audio in MP4 container playback ' +
      'capability: ' + canPlayAAC);
    console.log('Native AMR audio in 3GPP container playback capability: ' +
      canPlay3GPP);

    if (!(canPlayWave || canPlayMP3)) {
      throw new Error(
        'Native Wave or MP3 playback is required');
    }
  }

  /**
   * Get a player object that performs audio compression, when available.
   *
   * Using the Media Stream Recording API for recording is the prefered
   * solution. It allows recording compressed audio which makes it quicker to
   * submit. If not available, use a default createScriptProcessor is used.
   *
   * @param {GainNode} micInputGain The GainNode to analyze.
   */
  _getBestPlayer(callbacks) {
    let player = null;
    // Start by checking for a Cordova environment.
    // When running under a debugger like Ripple, both Cordova and WebAudio
    // environments get detected. While this is technically valid -Ripple is
    // running in Chrome, which supports WebAudio-, it's not a sandbox that
    // also disables functionality that would not be available on a device.
    if (this.canUseCordovaMedia) {
      // Use Cordova audio encoding (used codec depends on the platform).
      player = new CordovaMediaPlayer(callbacks);
    } else if (this.canUseAudio) {
      // Use the recorder with MediaRecorder implementation.
      player = new WebAudioPlayer(callbacks);
    } else {
      throw new Error('Unable to find a proper player.');
    }

    console.log('Player initialised.');
    return player;
  }

  /**
   * Preload audio from an URL.
   *
   * @param {string} url The URL that contains the audio.
   * @param {bool} preload Try preloading metadata and possible some audio (default). Set to false to not download
   * anything until playing.
   * @param {AudioPlayer~loadedCallback} [loadedCb] The callback that is invoked when the duration of the audio file
   * is first known.
   */
  load(url, preload, loadedCb) {
    this.player.load(url, preload, loadedCb);

    // If preloading is disabled, the 'canplay' event won't be triggered.
    // In that case, fire it manually.
    if (!preload) {
      this.fireEvent('canplay', []);
    }
  }

  /**
   * Unload previously loaded audio.
   */
  reset() {
    this.stop();
    this.player.reset();
    this.fireEvent('unloaded', []);
  }

  /**
   * Start or continue playback of audio.
   *
   * @param {number} [position] When position is given, start playing from this position (seconds).
   */
  play(position) {
    this.player.play(position);
  }

  /**
   * Stop playback of audio.
   */
  stop() {
    this.player.stop();
  }

  /**
   * Toggle audio playback. Switch from playing to paused state and back.
   */
  togglePlayback() {
    if (this.player.isPlaying()) {
      this.player.stop();
    } else {
      this.player.play();
    }
  }

  /**
   * Start preloading audio.
   */
  preload() {
    this.player.preload();
  }

  /**
   * Start playing audio at the given offset.
   *
   * @param {number} percentage Start at this percentage (0..100) of the audio stream.
   */
  scrub(percentage) {
    this.player.scrub(percentage);
  }

  /*
   * Returns the percentage of which the buffer is filled.
   *
   * @returns {number} percentage of buffer fill.
   */
  getBufferFill() {
    return this.player.getBufferFill();
  }

  /**
   * Returns the current playing time as offset in seconds from the start.
   *
   * @returns {number} time in seconds as offset from the start.
   */
  getCurrentTime() {
    return this.player.getCurrentTime();
  }

  /**
   * Returns the total duration in seconds.
   *
   * @returns {number} time in seconds of fragment duration.
   */
  getDuration() {
    return this.player.getDuration();
  }

  /**
   * Check if there is playback in progress.
   *
   * @returns `true` if user is currently playing audio, `false` otherwise.
   */
  isPlaying() {
    return this.player.isPlaying();
  }

  /**
   * Returns ready state of the player.
   *
   * @returns {bool} true when player is ready to start loading data or play, false when no audio is loaded
   * or preparing.
   */
  canPlay() {
    return this.player.canPlay();
  }
};
