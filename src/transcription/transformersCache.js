// Transformers.js keeps downloaded models in the browser's Cache Storage, under this name. A model is "ready" once both its files are there.
// Kept apart from the engine so the page can ask "is it downloaded?" without loading the engine, which is large.
export const MODEL_CACHE_NAME = "transformers-cache";
const MODEL_FILES = ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];

/**
 * @param {string} repo Hugging Face repository, for example "onnx-community/whisper-base".
 * @param {CacheStorage} [cacheStorage]
 */
export async function isModelCached(repo, cacheStorage = globalThis.caches) {
  if (!cacheStorage) return false;
  const cache = await cacheStorage.open(MODEL_CACHE_NAME);
  const keys = (await cache.keys()).map((r) => r.url);
  return MODEL_FILES.every((file) => keys.some((url) => url.includes(`/${repo}/`) && url.endsWith(file)));
}
