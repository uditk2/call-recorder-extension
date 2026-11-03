import { describe, expect, it } from "vitest";
import { KeyValueTranscriptRepository } from "../src/application/keyValueTranscriptRepository.js";
import { SAMPLE_RATE, TranscriptionService } from "../src/application/transcriptionService.js";
import { isModelCached } from "../src/transcription/transformersCache.js";

function tone(seconds) {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin(i * 0.03) * (0.6 + 0.4 * Math.sin(i / 900));
  return out;
}
function quiet(seconds) {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) out[i] = 0.0005 * Math.sin(i * 0.9);
  return out;
}
function join(...parts) {
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}
function memoryStore() {
  const data = new Map();
  return { get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)) };
}
function setup({ pcm, files, detect }) {
  const detected = [];
  const calls = { prepared: [], windows: [] };
  let now = 1_000;
  const engine = {
    prepare: async (modelId, onProgress) => {
      calls.prepared.push(modelId);
      onProgress({ loadedBytes: 5, totalBytes: 10 });
    },
    transcribe: async (audio, options) => {
      calls.windows.push({ seconds: audio.length / SAMPLE_RATE, options });
      return [{ start: 1, end: 2, text: `window ${calls.windows.length}` }];
    },
    dispose: async () => {},
  };
  if (detect !== undefined) {
    engine.detectLanguage = async (audio) => {
      detected.push(audio.length / SAMPLE_RATE);
      if (detect instanceof Error) throw detect;
      // A function is asked once per window, so a test can make the language change during the call.
      return typeof detect === "function" ? detect(detected.length - 1) : detect;
    };
  }
  const repository = new KeyValueTranscriptRepository(memoryStore());
  const service = new TranscriptionService({
    decoder: { decode: async () => pcm },
    engine,
    repository,
    clock: { now: () => (now += 1000) },
    files,
  });
  return { service, repository, calls, detected };
}
const record = { id: "r1", title: "Weekly planning" };

describe("TranscriptionService", () => {
  it("sends only the speech, on the recording's own clock, and saves the result", async () => {
    const pcm = join(quiet(5), tone(6), quiet(40), tone(6), quiet(5));
    const { service, repository, calls } = setup({ pcm });
    const events = [];
    const t = await service.run({ record, file: new Blob(), modelId: "base", language: "hi", onProgress: (p) => events.push(p) });

    expect(calls.prepared).toEqual(["base"]);
    expect(calls.windows).toHaveLength(2);
    expect(calls.windows[0].options.language).toBe("hi");
    expect(calls.windows[0].options.hint).toContain("Namaste");
    // 62 seconds in, about 14 seconds are sent.
    expect(calls.windows.reduce((n, w) => n + w.seconds, 0)).toBeLessThan(16);
    expect(t.segments.map((s) => s.text)).toEqual(["window 1", "window 2"]);
    expect(t.segments[0].start).toBeGreaterThan(5);
    expect(t.segments[1].start).toBeGreaterThan(50);
    expect(t.durationSec).toBeCloseTo(62);
    expect(await repository.get("r1")).toEqual(t);

    expect(events[0]).toEqual({ phase: "decoding" });
    expect(events.some((e) => e.phase === "model" && e.loadedBytes === 5)).toBe(true);
    const last = events.at(-1);
    expect(last).toMatchObject({ phase: "transcribing", done: 2, total: 2, etaMs: 0 });
    expect(events.filter((e) => e.phase === "transcribing")[0].etaMs).toBeGreaterThan(0);
  });

  const sure = (language) => ({ language, confidence: 0.95 });

  it("uses the one default model, and finds the language by itself when nothing is chosen", async () => {
    const { service, calls, detected } = setup({ pcm: join(quiet(2), tone(5), quiet(2)), detect: sure("es") });
    const t = await service.run({ record, file: new Blob() });
    expect(calls.prepared).toEqual(["base"]);
    expect(detected).toHaveLength(1);
    expect(calls.windows[0].options.language).toBe("es");
    expect(t.language).toBe("es");
    expect(t.segments[0].language).toBe("es");
  });

  it("finds the language again for every window, so a call that switches between Hindi and English is written in both", async () => {
    // Four stretches of speech with long pauses between them, so four windows.
    const pcm = join(tone(6), quiet(5), tone(6), quiet(5), tone(6), quiet(5), tone(6));
    const order = ["hi", "en", "hi", "en"];
    const { service, calls } = setup({ pcm, detect: (i) => sure(order[i]) });
    const t = await service.run({ record, file: new Blob() });
    expect(calls.windows.map((w) => w.options.language)).toEqual(order);
    expect(t.segments.map((s) => s.language)).toEqual(order);
  });

  it("keeps the language of the window before when a window is too short or too unclear to judge", async () => {
    const pcm = join(tone(8), quiet(5), tone(1), quiet(5), tone(8), quiet(5), tone(8));
    const guesses = [sure("hi"), sure("en"), { language: "ur", confidence: 0.3 }, sure("en")];
    const { service, calls } = setup({ pcm, detect: (i) => guesses[i] });
    await service.run({ record, file: new Blob() });
    // The one second window ("okay") and the unsure window both stay Hindi; the sure English window after them switches.
    expect(calls.windows.map((w) => w.options.language)).toEqual(["hi", "hi", "hi", "en"]);
  });

  it("calls the language of a transcript the one most of the speech was in", async () => {
    const pcm = join(tone(8), quiet(5), tone(3), quiet(5), tone(7));
    const order = ["en", "hi", "en"];
    const { service } = setup({ pcm, detect: (i) => sure(order[i]) });
    expect((await service.run({ record, file: new Blob() })).language).toBe("en");
  });

  it("uses short windows for a model that switches language, and long ones for a model that cannot", async () => {
    const pcm = join(quiet(2), tone(25), quiet(2));
    const many = setup({ pcm });
    await many.service.run({ record, file: new Blob(), modelId: "base" });
    expect(many.calls.windows.every((w) => w.seconds <= 11)).toBe(true);
    expect(many.calls.windows.length).toBeGreaterThan(2);
    const english = setup({ pcm });
    await english.service.run({ record, file: new Blob(), modelId: "tiny.en" });
    expect(english.calls.windows).toHaveLength(1);
  });

  it("does not detect when the caller names the language, and carries on if detection fails", async () => {
    const named = setup({ pcm: join(quiet(2), tone(5), quiet(2)), detect: sure("es") });
    await named.service.run({ record, file: new Blob(), language: "fr" });
    expect(named.detected).toHaveLength(0);
    expect(named.calls.windows[0].options.language).toBe("fr");
    const broken = setup({ pcm: join(quiet(2), tone(5), quiet(2)), detect: new Error("no model") });
    const t = await broken.service.run({ record, file: new Blob() });
    expect(broken.calls.windows[0].options.language).toBeUndefined();
    expect(t.segments).toHaveLength(1);
  });

  it("saves the transcript files next to the recording and remembers their names", async () => {
    const saved = [];
    const files = { save: async (r, t) => (saved.push([r.id, t.segments.length]), ["transcript.txt", "transcript.srt"]) };
    const { service, repository } = setup({ pcm: join(quiet(2), tone(5), quiet(2)), files });
    const t = await service.run({ record, file: new Blob() });
    expect(saved).toEqual([["r1", 1]]);
    expect(t.files).toEqual(["transcript.txt", "transcript.srt"]);
    expect((await repository.get("r1")).files).toEqual(["transcript.txt", "transcript.srt"]);
  });

  it("keeps the transcript when its files cannot be saved, and says why", async () => {
    const files = {
      save: async () => {
        throw new Error("The recordings folder is not available.");
      },
    };
    const { service, repository } = setup({ pcm: join(quiet(2), tone(5), quiet(2)), files });
    const t = await service.run({ record, file: new Blob() });
    expect(t.files).toBeUndefined();
    expect(t.filesError).toContain("not available");
    expect((await repository.get("r1")).segments).toHaveLength(1);
  });

  it("lets the engine detect the language when the person picked automatic", async () => {
    const { service, calls } = setup({ pcm: join(quiet(2), tone(5), quiet(2)) });
    await service.run({ record, file: new Blob(), modelId: "base", language: "auto" });
    expect(calls.windows[0].options.language).toBeUndefined();
  });

  it("saves an empty transcript when there is no speech", async () => {
    const { service, calls } = setup({ pcm: quiet(20) });
    const t = await service.run({ record, file: new Blob(), modelId: "tiny.en" });
    expect(calls.windows).toHaveLength(0);
    expect(t.segments).toEqual([]);
  });

  it("stops between windows when asked, and saves nothing", async () => {
    const pcm = join(tone(10), quiet(30), tone(10), quiet(30), tone(10));
    const { service, repository, calls } = setup({ pcm });
    const controller = new AbortController();
    const run = service.run({
      record,
      file: new Blob(),
      modelId: "base",
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase === "transcribing" && p.done === 1) controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ code: "cancelled" });
    expect(calls.windows).toHaveLength(1);
    expect(await repository.all()).toEqual([]);
  });

  it("transcribing a recording again replaces the earlier transcript", async () => {
    const { service, repository } = setup({ pcm: join(quiet(2), tone(5), quiet(2)) });
    await service.run({ record, file: new Blob(), modelId: "base" });
    await service.run({ record, file: new Blob(), modelId: "small" });
    const all = await repository.all();
    expect(all).toHaveLength(1);
    expect(all[0].model).toBe("small");
  });
});

describe("KeyValueTranscriptRepository", () => {
  it("removes one transcript and keeps the others", async () => {
    const repo = new KeyValueTranscriptRepository(memoryStore());
    await repo.save({ recordId: "a", segments: [] });
    await repo.save({ recordId: "b", segments: [] });
    await repo.remove("a");
    expect((await repo.all()).map((t) => t.recordId)).toEqual(["b"]);
  });
  it("two quick saves do not overwrite each other", async () => {
    const repo = new KeyValueTranscriptRepository(memoryStore());
    await Promise.all([repo.save({ recordId: "a" }), repo.save({ recordId: "b" }), repo.save({ recordId: "c" })]);
    expect((await repo.all()).map((t) => t.recordId).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("isModelCached", () => {
  const cacheWith = (urls) => ({ open: async () => ({ keys: async () => urls.map((url) => ({ url })) }) });
  const base = "https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/";
  it("is true when both model files are stored", async () => {
    const caches = cacheWith([`${base}encoder_model_quantized.onnx`, `${base}decoder_model_merged_quantized.onnx`]);
    expect(await isModelCached("onnx-community/whisper-base", caches)).toBe(true);
  });
  it("is false when a file is missing or belongs to another model", async () => {
    expect(await isModelCached("onnx-community/whisper-base", cacheWith([`${base}encoder_model_quantized.onnx`]))).toBe(false);
    expect(
      await isModelCached(
        "onnx-community/whisper-tiny.en",
        cacheWith([`${base}encoder_model_quantized.onnx`, `${base}decoder_model_merged_quantized.onnx`]),
      ),
    ).toBe(false);
  });
  it("is false when the browser has no cache storage", async () => {
    expect(await isModelCached("x", undefined)).toBe(false);
  });
});
