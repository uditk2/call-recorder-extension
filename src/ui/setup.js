import { KeyValueSettingsStore } from "../application/keyValueRepositories.js";
import { CONFIG } from "../config.js";
import { ChromeKeyValueStore } from "../infra/chromeKeyValueStore.js";
import { directoryHandleStore } from "../shared/directoryHandleStore.js";
import { createRecordingsAccess } from "../transcription/createRecordingsAccess.js";
import { byId, setText, show, showError } from "./dom.js";
const settings = new KeyValueSettingsStore(new ChromeKeyValueStore());
const ui = {
  allowMic: byId("allow-mic"),
  micStatus: byId("mic-status"),
  micError: byId("mic-error"),
  noiseToggle: byId("noise-toggle"),
  defaultFolder: byId("default-folder"),
  pick: byId("pick-folder"),
  reset: byId("reset-folder"),
  folderStatus: byId("folder-status"),
  folderError: byId("folder-error"),
  transcriptFolder: byId("transcript-folder"),
  allowTranscripts: byId("allow-transcripts"),
  transcriptsStatus: byId("transcripts-status"),
  transcriptsError: byId("transcripts-error"),
};
const access = createRecordingsAccess();
function chip(el, text, kind = "") {
  setText(el, text);
  el.className = `chip ${kind}`.trim();
}
async function renderMic() {
  const s = await settings.read();
  ui.noiseToggle.checked = s.noiseReduction;
  const granted = s.setupDone;
  chip(ui.micStatus, granted ? "Microphone allowed" : "Not allowed yet", granted ? "ok" : "");
  setText(ui.allowMic, granted ? "Check again" : "Allow microphone");
}
async function renderFolder() {
  const { folderName } = await settings.read();
  chip(ui.folderStatus, folderName ? `Folder: ${folderName}` : `Downloads/${CONFIG.downloadsFolder}`, "ok");
  show(ui.reset, folderName !== null);
}
async function allowMic() {
  show(ui.micError, false);
  try {
    // Asked here, on a normal extension page, because the recording engine has no window to show the prompt in.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    await settings.write({ setupDone: true });
  } catch (e) {
    await settings.write({ setupDone: false });
    showError(
      ui.micError,
      e.name === "NotAllowedError" ? "The microphone was blocked. Allow it from the lock icon in the address bar, then try again." : e,
    );
  }
  await renderMic();
}
async function pickFolder() {
  show(ui.folderError, false);
  try {
    const handle = await window.showDirectoryPicker({ id: "call-recorder", mode: "readwrite" });
    await directoryHandleStore.set(handle);
    await settings.write({ folderName: handle.name });
  } catch (e) {
    if (e.name !== "AbortError") showError(ui.folderError, e);
  }
  await Promise.all([renderFolder(), renderTranscripts()]);
}
async function renderTranscripts() {
  const { folderName } = await settings.read();
  setText(ui.transcriptFolder, folderName ? `the folder "${folderName}"` : `Downloads/${CONFIG.downloadsFolder}`);
  const on = await access.isEnabled({ folderName }).catch(() => false);
  chip(ui.transcriptsStatus, on ? "Allowed" : "Not allowed yet", on ? "ok" : "");
  setText(ui.allowTranscripts, on ? (folderName ? "Check again" : "Choose the folder again") : "Allow reading recordings");
}
async function allowTranscripts() {
  show(ui.transcriptsError, false);
  try {
    // The folder picker and Chrome's prompt only open from a click, so this runs straight from the button.
    await access.enable(await settings.read());
  } catch (e) {
    if (e.name !== "AbortError") showError(ui.transcriptsError, e);
  }
  await renderTranscripts();
}
async function resetFolder() {
  await directoryHandleStore.clear();
  await settings.write({ folderName: null });
  await Promise.all([renderFolder(), renderTranscripts()]);
}
async function init() {
  setText(ui.defaultFolder, `Downloads/${CONFIG.downloadsFolder}`);
  ui.allowMic.addEventListener("click", () => void allowMic());
  ui.pick.addEventListener("click", () => void pickFolder());
  ui.reset.addEventListener("click", () => void resetFolder());
  ui.allowTranscripts.addEventListener("click", () => void allowTranscripts());
  ui.noiseToggle.addEventListener("change", () => void settings.write({ noiseReduction: ui.noiseToggle.checked }));
  await Promise.all([renderMic(), renderFolder(), renderTranscripts()]);
}
void init();
