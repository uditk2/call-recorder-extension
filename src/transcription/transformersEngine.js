// The first transcription engine: Whisper run through Transformers.js and ONNX Runtime Web, in the page, on this computer.
// Built as its own file (dist/transcribe/engine.js) and loaded only when someone presses Transcribe, because it is large.
import { env, pipeline } from "@huggingface/transformers";
import { modelById } from "../domain/transcription/models.js";
import { MODEL_CACHE_NAME } from "./transformersCache.js";

/**
 * @param {{ wasmPaths: string, remoteHost: string, threads: number }} options
 *   wasmPaths: folder, inside the extension, that holds the ONNX Runtime files. remoteHost: where models are downloaded from, once.
 * @returns {import("../domain/transcription/ports.js").TranscriptionEngine}
 */
export function createTransformersEngine({ wasmPaths, remoteHost, threads }) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.cacheKey = MODEL_CACHE_NAME;
  env.remoteHost = remoteHost;
  env.remotePathTemplate = "{model}/resolve/{revision}/";
  env.backends.onnx.wasm.wasmPaths = wasmPaths;
  env.backends.onnx.wasm.numThreads = threads;
  // Runs the model in a worker of its own, so the page stays responsive (the Stop button, the progress bar) while it works.
  env.backends.onnx.wasm.proxy = true;

  let recognizer = null;
  let loadedId = null;

  async function dispose() {
    await recognizer?.dispose?.();
    recognizer = null;
    loadedId = null;
  }

  return {
    async prepare(modelId, onProgress) {
      if (recognizer && loadedId === modelId) return;
      await dispose();
      const model = modelById(modelId);
      // Asks Chrome not to throw the model away when the disk is nearly full. A refusal is fine, it only means a second download.
      await navigator.storage?.persist?.().catch(() => false);
      const perFile = new Map();
      recognizer = await pipeline("automatic-speech-recognition", model.repo, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.file) return;
          perFile.set(p.file, { loaded: p.loaded, total: p.total });
          let loadedBytes = 0;
          let totalBytes = 0;
          for (const f of perFile.values()) {
            loadedBytes += f.loaded;
            totalBytes += f.total;
          }
          onProgress({ loadedBytes, totalBytes });
        },
      });
      loadedId = modelId;
    },

    async transcribe(audio, { language } = {}) {
      if (!recognizer || !loadedId) throw new Error("The model is not loaded.");
      const options = { return_timestamps: true };
      // English-only models refuse a language or task. Multilingual ones detect the language when none is given.
      if (modelById(loadedId).multilingual) {
        options.task = "transcribe";
        if (language) options.language = language;
      }
      const result = await recognizer(audio.slice(), options);
      const chunks = result.chunks?.length ? result.chunks : [{ text: result.text, timestamp: [0, null] }];
      return chunks.map((c) => ({ start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? Number.NaN, text: c.text }));
    },

    dispose,
  };
}
