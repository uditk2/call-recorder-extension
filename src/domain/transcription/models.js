// The Whisper models. One is used for everyone: it hears many languages, finds the language by itself, and is small enough for any
// laptop. The others are here so the choice can change in one place. Sizes are the quantised (8 bit) files in the ONNX repositories
// on Hugging Face.
/**
 * @typedef {object} TranscriptionModel
 * @property {string} id
 * @property {string} repo Hugging Face repository that holds the ONNX files.
 * @property {string} label
 * @property {number} downloadMb Approximate size of the first download.
 * @property {boolean} multilingual English-only models cannot detect or switch language.
 */

/** @type {TranscriptionModel[]} */
export const TRANSCRIPTION_MODELS = [
  { id: "tiny.en", repo: "onnx-community/whisper-tiny.en", label: "Fast, English only", downloadMb: 41, multilingual: false },
  { id: "base", repo: "onnx-community/whisper-base", label: "Balanced, many languages", downloadMb: 77, multilingual: true },
  { id: "small", repo: "onnx-community/whisper-small", label: "Most accurate, many languages", downloadMb: 249, multilingual: true },
];

/** The model every transcript is made with. */
export const DEFAULT_MODEL_ID = "base";

/** @returns {TranscriptionModel} */
export function modelById(id) {
  const found = TRANSCRIPTION_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown transcription model: ${id}`);
  return found;
}
