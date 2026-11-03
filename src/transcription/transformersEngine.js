// The first transcription engine: Whisper run through Transformers.js and ONNX Runtime Web, in the page, on this computer.
// Built as its own file (dist/transcribe/engine.js) and loaded only when someone presses Transcribe, because it is large.
import { Tensor, env, pipeline } from "@huggingface/transformers";
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

    /**
     * Which language is spoken, as Whisper's own method does it: run the encoder, give the decoder only the start token, and compare
     * the language tokens it likes. Transformers.js does not do this by itself, it falls back to English, so a Spanish call would come
     * out translated. English-only models have nothing to detect.
     * @returns {Promise<{ language: string, confidence: number } | undefined>} Confidence is the share of the vote, from 0 to 1.
     */
    async detectLanguage(audio) {
      if (!recognizer || !loadedId || !modelById(loadedId).multilingual) return undefined;
      const { input_features } = await recognizer.processor(audio.slice());
      const config = recognizer.model.generation_config;
      const start = new Tensor("int64", BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
      const { logits } = await recognizer.model({ input_features, decoder_input_ids: start });
      const votes = Object.entries(config.lang_to_id).map(([token, id]) => [token, Number(logits.data[id])]);
      const top = Math.max(...votes.map(([, score]) => score));
      let total = 0;
      let best = { token: "", weight: 0 };
      for (const [token, score] of votes) {
        const weight = Math.exp(score - top);
        total += weight;
        if (weight > best.weight) best = { token, weight };
      }
      return { language: best.token.replace(/^<\|/, "").replace(/\|>$/, ""), confidence: best.weight / total };
    },

    async transcribe(audio, { language, hint } = {}) {
      if (!recognizer || !loadedId) throw new Error("The model is not loaded.");
      // A phrase may not repeat four words in a row for long: on a stretch it cannot make out, Whisper falls into "haan haan haan ..." and
      // keeps going for minutes.
      const options = { return_timestamps: true, no_repeat_ngram_size: 4 };
      // English-only models refuse a language or task. Multilingual ones detect the language when none is given.
      if (modelById(loadedId).multilingual) {
        options.task = "transcribe";
        if (language) options.language = language;
        // A hint is text Whisper is told came just before this audio, so it copies the spelling and style. Whisper reads it before its
        // usual start tokens, which Transformers.js does not add by itself, so the start of the sequence is built here.
        if (hint) {
          const config = recognizer.model.generation_config;
          const prompt = recognizer.tokenizer.encode(` ${hint}`, { add_special_tokens: false });
          options.decoder_input_ids = [
            config.prev_sot_token_id,
            ...prompt,
            config.decoder_start_token_id,
            config.lang_to_id[`<|${language ?? "en"}|>`],
            config.task_to_id.transcribe,
          ];
          delete options.language;
          delete options.task;
        }
      }
      const result = await recognizer(audio.slice(), options);
      const chunks = result.chunks?.length ? result.chunks : [{ text: result.text, timestamp: [0, null] }];
      const lines = chunks.map((c) => ({ start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? Number.NaN, text: c.text }));
      // Transformers.js hands the hint back at the start of the first line, so it is cut off again.
      if (hint && lines.length && lines[0].text.trim().startsWith(hint)) lines[0].text = lines[0].text.trim().slice(hint.length);
      return lines;
    },

    dispose,
  };
}
