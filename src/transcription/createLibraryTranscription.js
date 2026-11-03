import { KeyValueTranscriptRepository } from "../application/keyValueTranscriptRepository.js";
import { TranscriptionService } from "../application/transcriptionService.js";
import { CONFIG } from "../config.js";
import { ChromeKeyValueStore } from "../infra/chromeKeyValueStore.js";
import { lazyEngine } from "./lazyEngine.js";
import { WebAudioDecoder } from "./webAudioDecoder.js";

/** Puts the transcription pieces together for the library page. This is the only place that knows which engine is used. */
export function createLibraryTranscription() {
  // The development build can point at a local model server, so tests do not need the internet.
  const remoteHost = (CONFIG.devBuild && localStorage.getItem("transcriptionHost")) || CONFIG.transcription.remoteHost;
  const engine = lazyEngine(async () => {
    const { createTransformersEngine } = await import(chrome.runtime.getURL("transcribe/engine.js"));
    return createTransformersEngine({
      wasmPaths: chrome.runtime.getURL("transcribe/ort/"),
      remoteHost,
      // One thread fewer than the processor has, so the page stays usable while it works.
      threads: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
    });
  });
  const repository = new KeyValueTranscriptRepository(new ChromeKeyValueStore());
  const service = new TranscriptionService({ decoder: new WebAudioDecoder(), engine, repository, clock: { now: () => Date.now() } });
  return { service, repository, engine };
}
