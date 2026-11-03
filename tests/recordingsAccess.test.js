import { describe, expect, it } from "vitest";
import { RecordingsAccess } from "../src/transcription/recordingsAccess.js";
import { RecordingFolderFiles } from "../src/transcription/recordingFolderFiles.js";
import { DirectoryFolderWriter } from "../src/recorder/folderWriter.js";

/** A folder in memory that behaves like a FileSystemDirectoryHandle for the parts we use. */
function fakeDir(name, { permission = "granted" } = {}) {
  const files = new Map();
  const dirs = new Map();
  const notFound = () => Object.assign(new Error("not found"), { name: "NotFoundError" });
  const dir = {
    name,
    files,
    dirs,
    permission,
    async queryPermission() {
      return dir.permission;
    },
    async requestPermission() {
      return dir.permission;
    },
    async getDirectoryHandle(n, { create } = {}) {
      if (!dirs.has(n)) {
        if (!create) throw notFound();
        dirs.set(n, fakeDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n, { create } = {}) {
      if (!files.has(n)) {
        if (!create) throw notFound();
        files.set(n, "");
      }
      return {
        async getFile() {
          return new Blob([files.get(n)]);
        },
        async createWritable() {
          let text = "";
          return {
            async write(t) {
              text += t;
            },
            async close() {
              files.set(n, text);
            },
          };
        },
      };
    },
  };
  return dir;
}
const memoryHandles = (initial) => {
  let handle = initial;
  return { get: async () => handle, set: async (h) => void (handle = h) };
};

const downloaded = {
  id: "r1",
  title: "Call",
  fileName: "call-a.mp4",
  location: { kind: "downloads", downloadId: 1, path: "/Users/me/Downloads/Call Recordings/call-a/call-a.mp4" },
};

function setup({ root, output, picked }) {
  const rootHandles = memoryHandles(root);
  const outputHandles = memoryHandles(output);
  const access = new RecordingsAccess({ outputHandles, rootHandles, pickDirectory: async () => picked, rootName: "Call Recordings" });
  return { access, rootHandles, outputHandles };
}
function withRecording(root, folder = "call-a", file = "call-a.mp4") {
  const dir = folder ? [...[root.dirs.get(folder) ?? (root.dirs.set(folder, fakeDir(folder)), root.dirs.get(folder))]][0] : root;
  dir.files.set(file, "video bytes");
  return root;
}

describe("RecordingsAccess", () => {
  it("is ready when a recordings folder is kept and still allowed", async () => {
    const root = withRecording(fakeDir("Call Recordings"));
    const { access } = setup({ root });
    expect(await access.ready(downloaded)).toBe(root);
  });
  it("is not ready with no folder yet, or when Chrome needs the person to allow it again", async () => {
    expect(await setup({}).access.ready(downloaded)).toBeNull();
    const asking = withRecording(fakeDir("Call Recordings", { permission: "prompt" }));
    expect(await setup({ root: asking }).access.ready(downloaded)).toBeNull();
  });
  it("asks for the folder once, checks that it holds the recording, and keeps it", async () => {
    const picked = withRecording(fakeDir("Call Recordings"));
    const { access, rootHandles } = setup({ picked });
    expect(await access.grant(downloaded)).toBe(picked);
    expect(await rootHandles.get()).toBe(picked);
  });
  it("refuses a folder that does not hold the recording, and keeps nothing", async () => {
    const { access, rootHandles } = setup({ picked: fakeDir("Documents") });
    await expect(access.grant(downloaded)).rejects.toMatchObject({
      code: "not-found",
      message: expect.stringContaining('"Call Recordings"'),
    });
    expect(await rootHandles.get()).toBeUndefined();
  });
  it("only renews the permission when the folder is already kept", async () => {
    const root = withRecording(fakeDir("Call Recordings", { permission: "prompt" }));
    const { access } = setup({ root });
    root.permission = "granted"; // the person allowed it
    expect(await access.grant(downloaded)).toBe(root);
  });
  it("uses the folder the person chose for a recording saved there", async () => {
    const chosen = withRecording(fakeDir("Calls"), "call-b", "call-b.mp4");
    const record = {
      id: "r2",
      title: "B",
      fileName: "call-b.mp4",
      location: { kind: "folder", folderName: "Calls", relativePath: ["call-b", "call-b.mp4"] },
    };
    const { access } = setup({ output: chosen });
    expect(await access.ready(record)).toBe(chosen);
    await expect(access.grant({ ...record, location: { ...record.location } })).resolves.toBe(chosen);
  });
  it("finds older recordings that sit straight in the folder", async () => {
    const root = withRecording(fakeDir("Call Recordings"), "", "call-old.mp4");
    const old = {
      id: "r3",
      title: "Old",
      fileName: "call-old.mp4",
      location: { kind: "downloads", downloadId: 2, path: "/x/Call Recordings/call-old.mp4" },
    };
    const { access } = setup({ root });
    expect(await (await access.readFile(root, old)).text()).toBe("video bytes");
  });
  it("says so plainly when the recording was moved or deleted", async () => {
    const { access } = setup({});
    await expect(access.readFile(fakeDir("Call Recordings"), downloaded)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("RecordingsAccess from the setup page", () => {
  it("keeps the Call Recordings folder the person shows us, and then reports transcripts as allowed", async () => {
    const picked = fakeDir("Call Recordings");
    const { access, rootHandles } = setup({ picked });
    expect(await access.isEnabled({ folderName: null })).toBe(false);
    expect(await access.enable({ folderName: null })).toBe("Downloads/Call Recordings");
    expect(await rootHandles.get()).toBe(picked);
    expect(await access.isEnabled({ folderName: null })).toBe(true);
  });
  it("refuses another folder and tells the person how to make the right one", async () => {
    const { access, rootHandles } = setup({ picked: fakeDir("Documents") });
    await expect(access.enable({ folderName: null })).rejects.toMatchObject({ message: expect.stringContaining("New Folder") });
    expect(await rootHandles.get()).toBeUndefined();
  });
  it("only asks Chrome to allow the chosen output folder when recordings are saved there", async () => {
    const chosen = fakeDir("Calls", { permission: "prompt" });
    const { access } = setup({ output: chosen });
    expect(await access.isEnabled({ folderName: "Calls" })).toBe(false);
    chosen.permission = "granted"; // the person said yes in Chrome's prompt
    expect(await access.enable({ folderName: "Calls" })).toBe("Calls");
    expect(await access.isEnabled({ folderName: "Calls" })).toBe(true);
  });
  it("says so when Chrome did not allow the chosen folder", async () => {
    const { access } = setup({ output: fakeDir("Calls", { permission: "denied" }) });
    await expect(access.enable({ folderName: "Calls" })).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("RecordingFolderFiles", () => {
  const transcript = { segments: [{ start: 1, end: 3, text: "Hello." }] };
  it("saves transcript.txt and subtitles named after the video, in the recording's own folder", async () => {
    const root = withRecording(fakeDir("Call Recordings"));
    const { access } = setup({ root });
    const names = await new RecordingFolderFiles(access).save(downloaded, transcript);
    expect(names).toEqual(["transcript.txt", "call-a.srt"]);
    const folder = root.dirs.get("call-a");
    expect(folder.files.get("transcript.txt")).toBe("[0:01] Hello.");
    // Players such as VLC load subtitles only when the file has the video's name.
    expect(folder.files.get("call-a.srt")).toContain("00:00:01,000 --> 00:00:03,000");
    expect(folder.files.get("call-a.mp4")).toBe("video bytes");
  });
  it("names the files after an older recording that has no folder of its own", async () => {
    const root = withRecording(fakeDir("Call Recordings"), "", "call-old.mp4");
    const old = {
      id: "r3",
      title: "Old",
      fileName: "call-old.mp4",
      location: { kind: "downloads", downloadId: 2, path: "/x/Call Recordings/call-old.mp4" },
    };
    const names = await new RecordingFolderFiles(setup({ root }).access).save(old, transcript);
    expect(names).toEqual(["call-old-transcript.txt", "call-old.srt"]);
    expect(root.files.has("call-old-transcript.txt")).toBe(true);
  });
  it("fails clearly when the folder is not available", async () => {
    await expect(new RecordingFolderFiles(setup({}).access).save(downloaded, transcript)).rejects.toThrow("not available");
  });
});

describe("DirectoryFolderWriter", () => {
  const file = { stream: () => new Blob(["data"]).stream() };
  it("puts each recording in a folder of its own and never overwrites a file", async () => {
    const root = fakeDir("Calls");
    // Streams are checked in the browser test. Here the writer's naming and folder rules are what matter.
    const sinks = [];
    const origGet = root.getDirectoryHandle.bind(root);
    root.getDirectoryHandle = async (n, o) => {
      const sub = await origGet(n, o);
      sub.getFileHandle = ((orig) => async (fn, opts) => {
        const h = await orig(fn, opts);
        return {
          ...h,
          createWritable: async () =>
            new WritableStream({
              write(c) {
                sinks.push([n, fn, c.length]);
              },
            }),
        };
      })(sub.getFileHandle.bind(sub));
      return sub;
    };
    const writer = new DirectoryFolderWriter(memoryHandles(root));
    const first = await writer.write(file, "call-a.mp4", "call-a");
    expect(first).toEqual({ folderName: "Calls", relativePath: ["call-a", "call-a.mp4"] });
    expect(root.dirs.has("call-a")).toBe(true);
    expect(sinks.some(([folder, name]) => folder === "call-a" && name === "call-a.mp4")).toBe(true);
  });
  it("refuses to write when the folder needs to be allowed again", async () => {
    const root = fakeDir("Calls", { permission: "prompt" });
    await expect(new DirectoryFolderWriter(memoryHandles(root)).write(file, "a.mp4", "a")).rejects.toThrow("allow the output folder again");
  });
});
