import { describe, expect, it } from "vitest";
import { formatClock, placeSegments, toPlainText, toSrt, transcriptFileName } from "../src/domain/transcription/transcript.js";
import { TRANSCRIPTION_MODELS, modelById, recommendModel } from "../src/domain/transcription/models.js";

describe("placing segments on the recording's clock", () => {
  it("adds the window's start to every time", () => {
    const out = placeSegments([{ start: 1, end: 3.5, text: " Hello there. " }], 60, 88);
    expect(out).toEqual([{ start: 61, end: 63.5, text: "Hello there." }]);
  });
  it("drops empty text and the markers Whisper writes for nothing", () => {
    const out = placeSegments(
      [
        { start: 0, end: 1, text: "  " },
        { start: 1, end: 2, text: "[BLANK_AUDIO]" },
        { start: 2, end: 3, text: "(silence)" },
        { start: 3, end: 4, text: "Yes." },
        { start: 4, end: 5, text: " . " },
        { start: 5, end: 6, text: "..." },
      ],
      0,
      10,
    );
    expect(out.map((s) => s.text)).toEqual(["Yes."]);
  });
  it("keeps an open ended last segment inside its window", () => {
    const out = placeSegments([{ start: 20, end: Number.NaN, text: "Bye." }], 100, 125);
    expect(out[0].start).toBe(120);
    expect(out[0].end).toBe(125);
  });
  it("never lets a segment run past the window", () => {
    const out = placeSegments([{ start: 5, end: 99, text: "Long." }], 0, 28);
    expect(out[0].end).toBe(28);
  });
});

describe("writing a transcript out", () => {
  const segments = [
    { start: 0.5, end: 2.25, text: "Hello." },
    { start: 65, end: 70, text: "Second line." },
  ];
  it("formats clocks", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });
  it("plain text, with or without times", () => {
    expect(toPlainText(segments)).toBe("Hello.\nSecond line.");
    expect(toPlainText(segments, { timestamps: true })).toBe("[0:00] Hello.\n[1:05] Second line.");
  });
  it("subtitles in SubRip format", () => {
    expect(toSrt(segments)).toBe("1\n00:00:00,500 --> 00:00:02,250\nHello.\n\n2\n00:01:05,000 --> 00:01:10,000\nSecond line.\n");
  });
  it("gives a subtitle at least half a second on screen", () => {
    expect(toSrt([{ start: 10, end: 10, text: "Hi." }])).toContain("00:00:10,000 --> 00:00:10,500");
  });
  it("makes safe file names", () => {
    expect(transcriptFileName('Weekly: "planning" / Q4?', "txt")).toBe("Weekly planning Q4.txt");
    expect(transcriptFileName("   ", "srt")).toBe("transcript.srt");
  });
});

describe("models", () => {
  it("finds a model by id and refuses an unknown one", () => {
    expect(modelById("base").multilingual).toBe(true);
    expect(modelById("tiny.en").multilingual).toBe(false);
    expect(() => modelById("nope")).toThrow();
  });
  it("suggests a small model on a small machine and a bigger one on a big machine", () => {
    expect(recommendModel({ deviceMemoryGb: 2, cores: 4 })).toBe("tiny.en");
    expect(recommendModel({ deviceMemoryGb: 4, cores: 4 })).toBe("base");
    expect(recommendModel({ deviceMemoryGb: 8, cores: 4 })).toBe("base");
    expect(recommendModel({ deviceMemoryGb: 8, cores: 12 })).toBe("small");
  });
  it("only suggests models that exist", () => {
    for (const machine of [{ deviceMemoryGb: 1 }, {}, { deviceMemoryGb: 8, cores: 16 }]) {
      expect(TRANSCRIPTION_MODELS.map((m) => m.id)).toContain(recommendModel(machine));
    }
  });
});
