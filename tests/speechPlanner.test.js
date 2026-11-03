import { describe, expect, it } from "vitest";
import { findSpeechRegions, frameLevelsDb, packWindows, planWindows } from "../src/domain/transcription/speechPlanner.js";

const SR = 16_000;
/** Audio made of pieces: a number is seconds of near-silence, { say: n } is n seconds of a loud tone. */
function audio(...parts) {
  const chunks = parts.map((p) => {
    const seconds = typeof p === "number" ? p : p.say;
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) {
      out[i] =
        typeof p === "number" ? 0.0005 * Math.sin(i * 0.9) : 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR) * (0.6 + 0.4 * Math.sin(i / 900));
    }
    return out;
  });
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

describe("speech planner", () => {
  it("measures loudness per frame", () => {
    const levels = frameLevelsDb(audio(1, { say: 1 }), SR);
    expect(levels.length).toBe(100);
    expect(levels[10]).toBeLessThan(-50);
    expect(levels[75]).toBeGreaterThan(-25);
  });

  it("finds one stretch of speech between silences, with padding", () => {
    const levels = frameLevelsDb(audio(4, { say: 3 }, 4), SR);
    const regions = findSpeechRegions(levels);
    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(3.7, 1);
    expect(regions[0].end).toBeCloseTo(7.3, 1);
  });

  it("keeps a short pause inside one stretch and splits on a long one", () => {
    const levels = frameLevelsDb(audio(2, { say: 2 }, 0.4, { say: 2 }, 6, { say: 2 }, 2), SR);
    const regions = findSpeechRegions(levels);
    expect(regions).toHaveLength(2);
  });

  it("ignores a click that is too short to be speech", () => {
    const levels = frameLevelsDb(audio(3, { say: 0.06 }, 3), SR);
    expect(findSpeechRegions(levels)).toHaveLength(0);
  });

  it("sends nothing for a silent recording", () => {
    const plan = planWindows(audio(30), SR);
    expect(plan.windows).toEqual([]);
    expect(plan.sendSec).toBe(0);
    expect(plan.totalSec).toBeCloseTo(30);
  });

  it("packs nearby speech into one window and starts a new one after a long silence", () => {
    const plan = planWindows(audio({ say: 5 }, 2, { say: 5 }, 40, { say: 5 }), SR);
    expect(plan.windows).toHaveLength(2);
    expect(plan.windows[0].end - plan.windows[0].start).toBeLessThan(15);
    expect(plan.sendSec).toBeLessThan(plan.totalSec * 0.4);
  });

  it("never makes a window longer than the limit, and cuts long speech at a quiet moment", () => {
    // 70 seconds of speech with a brief dip (0.3 s) near 24 s, the quietest place close to the first window's end.
    const pcm = audio({ say: 24 }, 0.3, { say: 46 });
    const plan = planWindows(pcm, SR, { mergeGapSec: 0.6 });
    expect(plan.windows.length).toBeGreaterThanOrEqual(3);
    for (const w of plan.windows) expect(w.end - w.start).toBeLessThanOrEqual(28.001);
    // The first cut lands in the dip, not through the middle of speech.
    expect(plan.windows[0].end).toBeGreaterThan(23.5);
    expect(plan.windows[0].end).toBeLessThan(24.8);
  });

  it("covers every stretch of speech, in order and without overlap", () => {
    const plan = planWindows(audio(3, { say: 20 }, 1, { say: 15 }, 9, { say: 4 }), SR);
    for (let i = 1; i < plan.windows.length; i++) expect(plan.windows[i].start).toBeGreaterThanOrEqual(plan.windows[i - 1].end);
    expect(plan.windows[0].start).toBeLessThan(3);
    expect(plan.windows.at(-1).end).toBeGreaterThan(plan.totalSec - 1);
  });

  it("packWindows on nothing is nothing", () => {
    expect(packWindows([], new Float32Array(0))).toEqual([]);
  });
});
