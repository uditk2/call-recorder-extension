// Every tunable number and name lives here, so no module repeats a literal.
import konveneDevOrigins from "./domain/sites/konveneDevOrigins.json";
import konveneOrigins from "./domain/sites/konveneOrigins.json";
// Set by build.mjs. Only the development build knows about localhost, so the store version never asks for it.
const DEV_BUILD = typeof __DEV_BUILD__ !== "undefined" && __DEV_BUILD__;
// The store build leaves Konvene out. Tests and the dev build keep it.
const KONVENE_BUILD = typeof __KONVENE_BUILD__ === "undefined" || __KONVENE_BUILD__;
export const CONFIG = {
  /** True only in the development build. */
  devBuild: DEV_BUILD,
  /** Subfolder of the browser's Downloads folder used when no custom folder is chosen. */
  downloadsFolder: "Call Recordings",
  /** Directory in the browser's private file system where live recordings are written. */
  stagingDir: "recordings",
  /** How often the encoder hands over a chunk, so only a second or so is ever held in memory. */
  timesliceMs: 1000,
  video: { maxWidth: 1280, maxHeight: 720, maxFrameRate: 15, bitsPerSecond: 800_000 },
  audio: { sampleRate: 48_000 },
  /** Origins where the Konvene bridge runs. build.mjs copies the same list into the manifest. */
  /** Transcription: where the Whisper models come from. They are downloaded once, then kept on this computer. */
  transcription: { remoteHost: "https://huggingface.co/" },
  konveneOrigins: [...(KONVENE_BUILD ? konveneOrigins : []), ...(DEV_BUILD ? konveneDevOrigins : [])],
};
