import { AppError } from "../domain/errors.js";
import { relativeToRoot } from "../domain/fileNamer.js";

/**
 * Reaching a saved recording from the library page, without picking the file each time.
 * Chrome does not let an extension read Downloads on its own, so the person allows the "Call Recordings" folder once. The handle
 * is kept, and every recording inside it (each in a folder of its own) can then be read, and its transcript saved beside it.
 * A recording saved to a folder the person chose uses that folder's handle, which we already hold.
 */
export class RecordingsAccess {
  d;
  /**
   * @param {{ outputHandles: DirectoryHandleStoreLike, rootHandles: DirectoryHandleStoreLike, pickDirectory: () => Promise<FileSystemDirectoryHandle>, rootName: string }} deps
   *   outputHandles: the folder chosen for recordings. rootHandles: the Call Recordings folder in Downloads. rootName: that folder's name.
   */
  constructor(deps) {
    this.d = deps;
  }

  /** Folder names and the file name of a recording, inside the recordings folder. Older records are found by their path or name. */
  relativePathOf(record) {
    if (record.location?.relativePath?.length) return record.location.relativePath;
    if (record.location?.kind === "downloads") return relativeToRoot(record.location.path, this.d.rootName);
    return [record.fileName];
  }

  storeFor(record) {
    return record.location?.kind === "folder" ? this.d.outputHandles : this.d.rootHandles;
  }

  /** The recordings folder, when it can be used right now without asking. Otherwise null. */
  async ready(record) {
    const root = await this.storeFor(record).get();
    if (!root) return null;
    return (await root.queryPermission({ mode: "readwrite" })) === "granted" ? root : null;
  }

  /** Asks for access. Must be called from a click, because Chrome only shows its prompts for one. */
  async grant(record) {
    const store = this.storeFor(record);
    let root = await store.get();
    if (root && (await root.requestPermission({ mode: "readwrite" })) === "granted") return root;
    if (record.location?.kind === "folder") {
      throw new AppError("not-found", `Chrome did not allow access to your recordings folder, "${record.location.folderName}".`);
    }
    root = await this.d.pickDirectory();
    try {
      await this.fileHandle(root, record);
    } catch {
      throw new AppError("not-found", `That folder does not hold this recording. Choose the "${this.d.rootName}" folder inside Downloads.`);
    }
    await store.set(root);
    return root;
  }

  /**
   * Turns transcripts on from the setup page, before any recording needs reading. Must be called from a click.
   * Recordings saved in a folder the person chose: Chrome is asked to allow that folder. Recordings saved to Downloads: the person
   * shows us the "Call Recordings" folder there once, because Chrome never lets an extension read Downloads by itself.
   * @param {{ folderName: string | null }} settings
   * @returns {Promise<string>} Where recordings will be read from, in words.
   */
  async enable({ folderName }) {
    if (folderName) {
      const chosen = await this.d.outputHandles.get();
      if (!chosen || (await chosen.requestPermission({ mode: "readwrite" })) !== "granted") {
        throw new AppError("not-found", `Chrome did not allow access to your recordings folder, "${folderName}".`);
      }
      return folderName;
    }
    const picked = await this.d.pickDirectory();
    if (picked.name !== this.d.rootName) {
      throw new AppError(
        "not-found",
        `Choose the "${this.d.rootName}" folder inside Downloads. If it is not there yet, press New Folder in that window, name it "${this.d.rootName}", and choose it.`,
      );
    }
    await this.d.rootHandles.set(picked);
    return `Downloads/${this.d.rootName}`;
  }

  /** Whether transcripts can read recordings right now, for the setup page. */
  async isEnabled({ folderName }) {
    const handle = await (folderName ? this.d.outputHandles : this.d.rootHandles).get();
    return Boolean(handle) && (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  }

  /** The folder that holds the recording's file, and the file's name. */
  async locate(root, record) {
    const path = this.relativePathOf(record);
    let dir = root;
    for (const name of path.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
    return { dir, name: path.at(-1), inRoot: path.length === 1 };
  }

  async fileHandle(root, record) {
    const { dir, name } = await this.locate(root, record);
    return dir.getFileHandle(name);
  }

  /** @returns {Promise<File>} */
  async readFile(root, record) {
    try {
      return await (await this.fileHandle(root, record)).getFile();
    } catch (e) {
      throw new AppError("not-found", "This recording is no longer in its folder. It may have been moved or deleted.");
    }
  }

  /** Writes a text file next to the recording. */
  async writeNextTo(root, record, fileName, text) {
    const { dir } = await this.locate(root, record);
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }
}

/**
 * @typedef {object} DirectoryHandleStoreLike
 * @property {() => Promise<FileSystemDirectoryHandle | undefined>} get
 * @property {(handle: FileSystemDirectoryHandle) => Promise<void>} set
 */
