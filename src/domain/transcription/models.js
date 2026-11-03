// The Whisper models a user can pick. The first one is small enough for any laptop; bigger ones are more accurate but slower and
// a bigger download. Sizes are the quantised (8 bit) files in the ONNX repositories on Hugging Face.
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

/** "auto" lets a multilingual model detect the language itself. The rest are Whisper language codes. */
export const TRANSCRIPTION_LANGUAGES = [
  { code: "auto", label: "Detect automatically" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
];

/** @returns {TranscriptionModel} */
export function modelById(id) {
  const found = TRANSCRIPTION_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown transcription model: ${id}`);
  return found;
}

/**
 * The model to suggest for this computer. Bigger models need more memory and a faster processor, and the person can always change it.
 * Chrome reports memory in whole gigabytes up to 8, so 8 means "8 or more".
 * @param {{ deviceMemoryGb?: number; cores?: number }} machine
 * @returns {string} A model id.
 */
export function recommendModel({ deviceMemoryGb = 4, cores = 4 } = {}) {
  if (deviceMemoryGb < 4) return "tiny.en";
  if (deviceMemoryGb >= 8 && cores >= 8) return "small";
  return "base";
}
