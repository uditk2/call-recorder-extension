import { AppError } from "../domain/errors.js";
import { planWindows } from "../domain/transcription/speechPlanner.js";
import { placeSegments } from "../domain/transcription/transcript.js";

export const SAMPLE_RATE = 16_000;

/**
 * Makes a transcript of one recording: decode the audio, pick the stretches with speech, send them to the engine one window at a time,
 * and save the result. Knows nothing about Chrome or any particular engine; everything it uses is handed in.
 */
export class TranscriptionService {
  d;
  /** @param {{ decoder: import("../domain/transcription/ports.js").AudioDecoder, engine: import("../domain/transcription/ports.js").TranscriptionEngine, repository: import("../domain/transcription/ports.js").TranscriptRepository, clock: import("../domain/ports.js").Clock }} deps */
  constructor(deps) {
    this.d = deps;
  }

  /**
   * @param {object} job
   * @param {{ id: string; title: string }} job.record
   * @param {Blob} job.file The recording's audio or video file.
   * @param {string} job.modelId
   * @param {string} [job.language] A language code, or "auto".
   * @param {(p: import("../domain/transcription/ports.js").TranscriptionProgress) => void} [job.onProgress]
   * @param {AbortSignal} [job.signal] Aborting stops after the window that is running.
   * @returns {Promise<import("../domain/transcription/transcript.js").Transcript>}
   */
  async run({ record, file, modelId, language = "auto", onProgress = () => {}, signal }) {
    const stopIfAborted = () => {
      if (signal?.aborted) throw new AppError("cancelled", "Transcription stopped.");
    };
    onProgress({ phase: "decoding" });
    const pcm = await this.d.decoder.decode(file);
    stopIfAborted();

    await this.d.engine.prepare(modelId, (p) => onProgress({ phase: "model", ...p }));
    stopIfAborted();

    const plan = planWindows(pcm, SAMPLE_RATE);
    const segments = [];
    const started = this.d.clock.now();
    for (let i = 0; i < plan.windows.length; i++) {
      // Checked before each window, so a stop that arrives while a window is running takes effect as soon as that window ends.
      stopIfAborted();
      const w = plan.windows[i];
      const audio = pcm.subarray(Math.floor(w.start * SAMPLE_RATE), Math.ceil(w.end * SAMPLE_RATE));
      const raw = await this.d.engine.transcribe(audio, { language: language === "auto" ? undefined : language });
      segments.push(...placeSegments(raw, w.start, w.end));
      const done = i + 1;
      // The estimate counts audio, not windows, because a window of speech takes about as long however short it is.
      const elapsed = this.d.clock.now() - started;
      onProgress({
        phase: "transcribing",
        done,
        total: plan.windows.length,
        etaMs: done < plan.windows.length ? Math.round((elapsed / done) * (plan.windows.length - done)) : 0,
        segments: [...segments],
      });
    }

    stopIfAborted();
    const transcript = {
      recordId: record.id,
      title: record.title,
      createdAt: this.d.clock.now(),
      model: modelId,
      language,
      durationSec: plan.totalSec,
      segments,
    };
    await this.d.repository.save(transcript);
    return transcript;
  }
}
