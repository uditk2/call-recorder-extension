/**
 * An engine that is only built when it is first used. The library page stays small and quick, and the big engine file is read
 * only when someone presses Transcribe.
 * @param {() => Promise<import("../domain/transcription/ports.js").TranscriptionEngine>} load
 * @returns {import("../domain/transcription/ports.js").TranscriptionEngine}
 */
export function lazyEngine(load) {
  let engine = null;
  const get = async () => (engine ??= await load());
  return {
    async prepare(modelId, onProgress) {
      return (await get()).prepare(modelId, onProgress);
    },
    async transcribe(audio, options) {
      return (await get()).transcribe(audio, options);
    },
    async detectLanguage(audio) {
      return (await get()).detectLanguage?.(audio);
    },
    async dispose() {
      if (engine) await engine.dispose();
    },
  };
}
