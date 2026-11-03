// Decides which stretches of a recording are worth sending to Whisper. Whisper works on windows of at most 30 seconds, so the plan is
// a list of windows. Silence between windows is never sent (it costs time and makes Whisper invent words), and windows are cut at
// pauses, not in the middle of a word. Pure functions over plain numbers, so they are easy to test.

export const PLANNER_DEFAULTS = {
  /** Length of one level measurement. */
  frameSec: 0.02,
  /** A window is at most this long. Whisper reads 30 seconds, and this leaves room for padding. */
  maxWindowSec: 28,
  /** Speech counts from this many dB above the quietest tenth of the recording. */
  floorOffsetDb: 10,
  /** Nothing quieter than this is speech, however quiet the room is. */
  minLevelDb: -58,
  /** Pauses shorter than this stay inside one stretch of speech. */
  mergeGapSec: 0.6,
  /** Shorter bursts are clicks and bumps, not speech. */
  minSpeechSec: 0.2,
  /** Extra audio kept on both sides of speech, so words are not clipped. */
  padSec: 0.3,
  /** When one stretch is longer than a window, the cut goes at the quietest moment in the last part of the window. */
  splitSearchSec: 6,
};

/** Loudness of each frame, in dB relative to full scale. @returns {Float32Array} */
export function frameLevelsDb(pcm, sampleRate, frameSec = PLANNER_DEFAULTS.frameSec) {
  const size = Math.max(1, Math.round(sampleRate * frameSec));
  const count = Math.ceil(pcm.length / size);
  const levels = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    const start = f * size;
    const end = Math.min(pcm.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
    levels[f] = 10 * Math.log10(sum / (end - start) + 1e-12);
  }
  return levels;
}

function percentile(values, p) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Stretches of speech as [startSec, endSec], padded and merged.
 * @param {Float32Array} levelsDb
 * @param {Partial<typeof PLANNER_DEFAULTS>} [options]
 * @returns {{ start: number; end: number }[]}
 */
export function findSpeechRegions(levelsDb, options = {}) {
  const o = { ...PLANNER_DEFAULTS, ...options };
  if (levelsDb.length === 0) return [];
  const threshold = Math.max(percentile(levelsDb, 0.1) + o.floorOffsetDb, o.minLevelDb);
  const total = levelsDb.length * o.frameSec;
  /** @type {{ start: number; end: number }[]} */
  const runs = [];
  let from = -1;
  for (let f = 0; f <= levelsDb.length; f++) {
    const loud = f < levelsDb.length && levelsDb[f] > threshold;
    if (loud && from < 0) from = f;
    if (!loud && from >= 0) {
      runs.push({ start: from * o.frameSec, end: f * o.frameSec });
      from = -1;
    }
  }
  // Close short pauses first, then drop what is too short to be speech, then pad. Padded neighbours that touch are one stretch.
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.start - last.end < o.mergeGapSec) last.end = run.end;
    else merged.push({ ...run });
  }
  const padded = merged
    .filter((r) => r.end - r.start >= o.minSpeechSec)
    .map((r) => ({ start: Math.max(0, r.start - o.padSec), end: Math.min(total, r.end + o.padSec) }));
  const result = [];
  for (const r of padded) {
    const last = result[result.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else result.push(r);
  }
  return result;
}

/** Index of the quietest frame between two times. */
function quietestFrame(levelsDb, fromSec, toSec, frameSec) {
  const a = Math.max(0, Math.floor(fromSec / frameSec));
  const b = Math.min(levelsDb.length - 1, Math.floor(toSec / frameSec));
  let best = b;
  for (let f = a; f <= b; f++) if (levelsDb[f] < levelsDb[best]) best = f;
  return best;
}

/**
 * Packs stretches of speech into windows of at most maxWindowSec. A window runs from the start of its first stretch to the end of its
 * last, so short pauses inside it are kept as they are. A stretch longer than a window is cut at the quietest nearby moment.
 * @param {{ start: number; end: number }[]} regions
 * @param {Float32Array} levelsDb
 * @param {Partial<typeof PLANNER_DEFAULTS>} [options]
 * @returns {{ start: number; end: number }[]}
 */
export function packWindows(regions, levelsDb, options = {}) {
  const o = { ...PLANNER_DEFAULTS, ...options };
  const windows = [];
  let current = null;
  const flush = () => {
    if (current) windows.push(current);
    current = null;
  };
  for (const region of regions) {
    let { start } = region;
    const { end } = region;
    if (end - start > o.maxWindowSec) {
      flush();
      while (end - start > o.maxWindowSec) {
        const cut = quietestFrame(levelsDb, start + o.maxWindowSec - o.splitSearchSec, start + o.maxWindowSec, o.frameSec) * o.frameSec;
        windows.push({ start, end: cut });
        start = cut;
      }
      current = { start, end };
    } else if (current && end - current.start <= o.maxWindowSec) {
      current.end = end;
    } else {
      flush();
      current = { start, end };
    }
  }
  flush();
  return windows;
}

/**
 * @typedef {object} TranscriptionPlan
 * @property {{ start: number; end: number }[]} windows
 * @property {number} totalSec Length of the recording.
 * @property {number} sendSec How much audio will be sent to Whisper.
 */

/** @returns {TranscriptionPlan} */
export function planWindows(pcm, sampleRate, options = {}) {
  const o = { ...PLANNER_DEFAULTS, ...options };
  const levels = frameLevelsDb(pcm, sampleRate, o.frameSec);
  const windows = packWindows(findSpeechRegions(levels, o), levels, o);
  const totalSec = pcm.length / sampleRate;
  const sendSec = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
  return { windows, totalSec, sendSec };
}
