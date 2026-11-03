import { KeyValueTranscriptRepository } from "../application/keyValueTranscriptRepository.js";
import { TranscriptionService } from "../application/transcriptionService.js";
import { CONFIG } from "../config.js";
import { ChromeKeyValueStore } from "../infra/chromeKeyValueStore.js";
import { directoryHandleStore, recordingsRootStore } from "../shared/directoryHandleStore.js";
import { lazyEngine } from "./lazyEngine.js";
import { RecordingFolderFiles } from "./recordingFolderFiles.js";
import { RecordingsAccess } from "./recordingsAccess.js";
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
      // Extra threads need a cross-origin isolated page, and isolating the extension's pages stops Chrome from starting tab capture
      // (the recorder fails with "Error starting tab capture"). So the model runs on one thread, in a worker of its own.
      threads: 1,
    });
  });
  const repository = new KeyValueTranscriptRepository(new ChromeKeyValueStore());
  const access = new RecordingsAccess({
    outputHandles: directoryHandleStore,
    rootHandles: recordingsRootStore,
    pickDirectory: () => showDirectoryPicker({ id: "call-recorder-recordings", mode: "readwrite", startIn: "downloads" }),
    rootName: CONFIG.downloadsFolder,
  });
  const service = new TranscriptionService({
    decoder: new WebAudioDecoder(),
    engine,
    repository,
    clock: { now: () => Date.now() },
    files: new RecordingFolderFiles(access),
  });
  return { service, repository, engine, access };
}
