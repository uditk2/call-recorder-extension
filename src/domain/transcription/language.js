// Calls switch language: Hindi, then English, then Hindi again. Whisper writes a whole window in one language, so the language is
// chosen again for every window. These rules keep that choice steady when a window is too short or too unclear to judge.

/** Below this the guess is a coin toss, so the language of the window before is kept. */
export const MIN_CONFIDENCE = 0.5;
/** A window shorter than this is a word or two ("okay", "haan"), too little to tell a language from. */
export const MIN_JUDGED_SEC = 2;

/**
 * @param {{ language: string; confidence: number } | undefined} detected What the model guessed for this window.
 * @param {string | undefined} previous The language chosen for the window before.
 * @param {number} windowSec Length of this window.
 * @returns {string | undefined} A language code, or undefined when nothing is known yet (the model then assumes English).
 */
export function chooseLanguage(detected, previous, windowSec) {
  if (!detected) return previous;
  if (previous && (windowSec < MIN_JUDGED_SEC || detected.confidence < MIN_CONFIDENCE)) return previous;
  return detected.language;
}

/**
 * The language that most of the speech was in.
 * @param {Map<string, number>} secondsByLanguage
 * @returns {string | undefined}
 */
export function dominantLanguage(secondsByLanguage) {
  let best;
  let bestSec = 0;
  for (const [language, sec] of secondsByLanguage) {
    if (sec > bestSec) {
      best = language;
      bestSec = sec;
    }
  }
  return best;
}

/**
 * A line of example text Whisper is told came just before the audio, so it copies the spelling. Hindi and English mixed in one
 * sentence is how most people talk, and without this the model writes the Hindi in Urdu letters (the small model that fits on
 * a laptop cannot write Devanagari) and drops or translates whichever language the window is not tagged with. With it,
 * both come out in English letters, in one pass. Kept short: a long hint gets copied into the transcript.
 */
export const HINGLISH_HINT = "Namaste, kaise ho? Haan, theek hai. Main kal bhej deta hoon.";

/**
 * How to ask the model to write a window in a given language.
 * @param {string | undefined} language
 * @returns {{ language: string | undefined; hint?: string }}
 */
export function decodingFor(language) {
  // Urdu is what the model hears for much spoken Hindi, and a Hindi call is the more likely, so both are written as Hinglish.
  if (language === "hi" || language === "ur") return { language: "hi", hint: HINGLISH_HINT };
  return { language };
}
