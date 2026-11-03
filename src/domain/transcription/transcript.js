// What a transcript is, and how it is written out as text. Pure functions, no browser APIs.

/**
 * @typedef {object} TranscriptSegment
 * @property {number} start Seconds from the start of the recording.
 * @property {number} end
 * @property {string} text
 */

/**
 * @typedef {object} Transcript
 * @property {string} recordId
 * @property {string} title
 * @property {number} createdAt
 * @property {string} model Model id.
 * @property {string} language "auto" or a language code.
 * @property {number} durationSec Length of the recording.
 * @property {TranscriptSegment[]} segments
 */

/** Things Whisper writes when there is nothing to hear. They are not speech. */
const NOISE_MARKERS = /^[\[(*♪\s]*(blank[_ ]audio|silence|music|noise|inaudible|no speech)[\])*♪\s.]*$/i;

/**
 * Turns what the engine returned for one window into segments on the recording's own clock.
 * @param {{ start: number; end: number; text: string }[]} raw Times in seconds from the start of the window.
 * @param {number} windowStart Seconds from the start of the recording to the start of the window.
 * @param {number} windowEnd
 * @returns {TranscriptSegment[]}
 */
export function placeSegments(raw, windowStart, windowEnd) {
  const out = [];
  for (const r of raw) {
    const text = r.text.replace(/\s+/g, " ").trim();
    // Nothing but punctuation (Whisper sometimes writes a lone full stop) is not a line of speech.
    if (!/[\p{L}\p{N}]/u.test(text) || NOISE_MARKERS.test(text)) continue;
    const start = Math.min(windowEnd, windowStart + Math.max(0, r.start));
    // Whisper sometimes leaves the last segment open ended. Keep it inside the window.
    const end = Math.min(windowEnd, Math.max(start, windowStart + (Number.isFinite(r.end) ? r.end : windowEnd - windowStart)));
    out.push({ start, end, text });
  }
  return out;
}

/** 5:09 or 1:05:09. */
export function formatClock(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function srtClock(sec) {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}

/** The text of the call. With timestamps, each line starts with the time it was said, like [1:05]. */
export function toPlainText(segments, { timestamps = false } = {}) {
  return segments.map((s) => (timestamps ? `[${formatClock(s.start)}] ${s.text}` : s.text)).join("\n");
}

/** SubRip subtitles, which most video players can load next to the recording. */
export function toSrt(segments) {
  return segments.map((s, i) => `${i + 1}\n${srtClock(s.start)} --> ${srtClock(Math.max(s.end, s.start + 0.5))}\n${s.text}\n`).join("\n");
}

/** A file name for a download, without characters that file systems reject. */
export function transcriptFileName(title, extension) {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "transcript";
  return `${base}.${extension}`;
}
