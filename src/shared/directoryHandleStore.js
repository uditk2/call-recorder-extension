// Folder handles cannot go in chrome.storage, so they live in IndexedDB. There are two: the output folder the person chose for
// recordings, and the "Call Recordings" folder in Downloads they allowed us to read, so recordings can be transcribed.
// Every extension page and the offscreen engine share the extension's origin, so they all see the same ones.
const DB_NAME = "call-recorder";
const STORE = "handles";
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the folder store."));
  });
}
async function run(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Folder store failed."));
    });
  } finally {
    db.close();
  }
}
/** @param {string} key */
export function createDirectoryHandleStore(key) {
  return {
    get: () => run("readonly", (s) => s.get(key)),
    set: async (handle) => {
      await run("readwrite", (s) => s.put(handle, key));
    },
    clear: async () => {
      await run("readwrite", (s) => s.delete(key));
    },
  };
}
export const directoryHandleStore = createDirectoryHandleStore("output-folder");
export const recordingsRootStore = createDirectoryHandleStore("recordings-root");

/**
 * @typedef {object} DirectoryHandleStore
 * @property {() => Promise<FileSystemDirectoryHandle | undefined>} get
 * @property {(handle: FileSystemDirectoryHandle) => Promise<void>} set
 * @property {() => Promise<void>} clear
 */
