/**
 * Turns speech into text. The first implementation runs Whisper through Transformers.js (src/transcription/transformersEngine.js).
 * Another engine, for example whisper.cpp or a WebGPU one, only has to follow this shape.
 * @typedef {object} TranscriptionEngine
 * @property {(modelId: string, onProgress: (p: { loadedBytes: number; totalBytes: number }) => void) => Promise<void>} prepare
 *   Downloads the model the first time, keeps it on this computer, and loads it.
 * @property {(audio: Float32Array, options: { language?: string }) => Promise<{ start: number; end: number; text: string }[]>} transcribe
 *   One window of 16 kHz mono audio, at most 30 seconds. Times are in seconds from the start of the window.
 * @property {() => Promise<void>} dispose Frees the model's memory.
 */

/**
 * Turns an audio or video file into the 16 kHz mono samples that Whisper reads.
 * @typedef {object} AudioDecoder
 * @property {(file: Blob) => Promise<Float32Array>} decode
 */

/**
 * @typedef {object} TranscriptRepository
 * @property {() => Promise<import("./transcript.js").Transcript[]>} all
 * @property {(recordId: string) => Promise<import("./transcript.js").Transcript | undefined>} get
 * @property {(transcript: import("./transcript.js").Transcript) => Promise<void>} save
 * @property {(recordId: string) => Promise<void>} remove
 */

/**
 * Saves a finished transcript where the person will find it. The returned names are the files that were written.
 * @typedef {object} TranscriptFiles
 * @property {(record: object, transcript: import("./transcript.js").Transcript) => Promise<string[]>} save
 */

/**
 * What the person sees while a transcript is made.
 * @typedef {{ phase: "decoding" }
 *   | { phase: "model"; loadedBytes: number; totalBytes: number }
 *   | { phase: "transcribing"; done: number; total: number; etaMs: number | null; segments: import("./transcript.js").TranscriptSegment[] }
 * } TranscriptionProgress
 */
