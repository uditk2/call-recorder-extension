import { AppError, messageOf } from "../domain/errors.js";
import { chooseLanguage, decodingFor, dominantLanguage } from "../domain/transcription/language.js";
import { DEFAULT_MODEL_ID, modelById } from "../domain/transcription/models.js";
import { planWindows } from "../domain/transcription/speechPlanner.js";
import { placeSegments } from "../domain/transcription/transcript.js";

export const SAMPLE_RATE = 16_000;

/**
 * Makes a transcript of one recording: decode the audio, pick the stretches with speech, send them to the engine one window at a time,
 * and save the result. Knows nothing about Chrome or any particular engine; everything it uses is handed in.
 */
export class TranscriptionService {
  d;
  /** @param {{ decoder: import("../domain/transcription/ports.js").AudioDecoder, engine: import("../domain/transcription/ports.js").TranscriptionEngine, repository: import("../domain/transcription/ports.js").TranscriptRepository, clock: import("../domain/ports.js").Clock, files?: import("../domain/transcription/ports.js").TranscriptFiles }} deps */
  constructor(deps) {
    this.d = deps;
  }

  /**
   * @param {object} job
   * @param {{ id: string; title: string }} job.record The recording, with whatever the file store needs to find its folder.
   * @param {Blob} job.file The recording's audio or video file.
   * @param {string} [job.modelId] Defaults to the one model every transcript uses.
   * @param {string} [job.language] A language code. Without one the model detects the language itself.
   * @param {(p: import("../domain/transcription/ports.js").TranscriptionProgress) => void} [job.onProgress]
   * @param {AbortSignal} [job.signal] Aborting stops after the window that is running.
   * @returns {Promise<import("../domain/transcription/transcript.js").Transcript>}
   */
  async run({ record, file, modelId = DEFAULT_MODEL_ID, language = "auto", onProgress = () => {}, signal }) {
    const stopIfAborted = () => {
      if (signal?.aborted) throw new AppError("cancelled", "Transcription stopped.");
    };
    onProgress({ phase: "decoding" });
    const pcm = await this.d.decoder.decode(file);
    stopIfAborted();

    await this.d.engine.prepare(modelId, (p) => onProgress({ phase: "model", ...p }));
    stopIfAborted();

    const plan = planWindows(pcm, SAMPLE_RATE, { maxWindowSec: modelById(modelId).windowSec });
    const segments = [];
    const started = this.d.clock.now();
    // Calls switch language, so with "auto" the language is found again for every window, and the one before is kept when a window is
    // too short or too unclear to judge. A language the caller named is used as it is. A model that only knows English has nothing to find.
    const named = language === "auto" ? undefined : language;
    const secondsByLanguage = new Map();
    let spoken = named;
    for (let i = 0; i < plan.windows.length; i++) {
      // Checked before each window, so a stop that arrives while a window is running takes effect as soon as that window ends.
      stopIfAborted();
      const w = plan.windows[i];
      const audio = pcm.subarray(Math.floor(w.start * SAMPLE_RATE), Math.ceil(w.end * SAMPLE_RATE));
      if (!named && this.d.engine.detectLanguage) {
        try {
          spoken = chooseLanguage(await this.d.engine.detectLanguage(audio), spoken, w.end - w.start);
        } catch (e) {
          // Not worth losing the transcript for: the window before decides, or the model assumes English.
          console.warn("Language detection failed.", messageOf(e));
        }
        stopIfAborted();
      }
      if (spoken) secondsByLanguage.set(spoken, (secondsByLanguage.get(spoken) ?? 0) + (w.end - w.start));
      const raw = await this.d.engine.transcribe(audio, decodingFor(spoken));
      segments.push(...placeSegments(raw, w.start, w.end).map((s) => (spoken ? { ...s, language: spoken } : s)));
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
      language: named ?? dominantLanguage(secondsByLanguage) ?? language,
      durationSec: plan.totalSec,
      segments,
    };
    // The text files are for the person to find. If they cannot be written the transcript is still kept and shown.
    if (this.d.files) {
      try {
        transcript.files = await this.d.files.save(record, transcript);
      } catch (e) {
        transcript.filesError = messageOf(e);
      }
    }
    await this.d.repository.save(transcript);
    return transcript;
  }
}
