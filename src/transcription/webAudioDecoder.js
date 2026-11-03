import { AppError } from "../domain/errors.js";

/** Reads the sound of a recording with the browser's own decoder, as 16 kHz mono, which is what Whisper wants. */
export class WebAudioDecoder {
  AudioContextCtor;
  sampleRate;
  constructor(AudioContextCtor = globalThis.AudioContext, sampleRate = 16_000) {
    this.AudioContextCtor = AudioContextCtor;
    this.sampleRate = sampleRate;
  }
  /** @param {Blob} file */
  async decode(file) {
    // A context at the target rate makes the browser resample while it decodes, so only the small version is kept in memory.
    const context = new this.AudioContextCtor({ sampleRate: this.sampleRate });
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
      }
      return mono;
    } catch (e) {
      throw new AppError("decode-failed", "The browser could not read any sound from this file. Choose the recording itself.");
    } finally {
      await context.close();
    }
  }
}
