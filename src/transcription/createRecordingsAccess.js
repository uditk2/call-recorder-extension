import { CONFIG } from "../config.js";
import { directoryHandleStore, recordingsRootStore } from "../shared/directoryHandleStore.js";
import { RecordingsAccess } from "./recordingsAccess.js";

/** The setup page and the library page both ask for the same folder, so they build the same object. */
export function createRecordingsAccess() {
  return new RecordingsAccess({
    outputHandles: directoryHandleStore,
    rootHandles: recordingsRootStore,
    pickDirectory: () => window.showDirectoryPicker({ id: "call-recorder-recordings", mode: "readwrite", startIn: "downloads" }),
    rootName: CONFIG.downloadsFolder,
  });
}
