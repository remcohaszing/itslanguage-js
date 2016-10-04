/* camelcase,
 new-cap
 */


const WavePacker = require('../wave-packer');

describe('WavePacker warning tests', function() {
  it('Should warn when the sample rates are invalid', function() {
    spyOn(console, 'warn');
    var warning = '48000 or 44100 are the only supported recordingSampleRates';
    var wavePacker = new WavePacker();
    wavePacker.init(0, 0, 0);
    expect(console.warn).toHaveBeenCalledWith(warning);
    expect(wavePacker.recordingSampleRate).toBe(0);
    expect(wavePacker.sampleRate).toBe(0);
    expect(wavePacker.channels).toBe(0);

    warning = 'sampleRate must be equal, half or a quarter of the ' +
      'recording sample rate';
    wavePacker.init(48000, 0, 0);
    expect(console.warn).toHaveBeenCalledWith(warning);
    expect(wavePacker.recordingSampleRate).toBe(48000);
    expect(wavePacker.sampleRate).toBe(0);
    expect(wavePacker.channels).toBe(0);
  });
});
