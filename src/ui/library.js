import { formatBytes, formatDuration } from "../shared/format.js";
import { createLibraryTranscription } from "../transcription/createLibraryTranscription.js";
import { background, byId, el, setText, show, showError } from "./dom.js";
import { createTranscriptsView } from "./transcripts.js";
const list = byId("list");
const empty = byId("empty");
const errorBox = byId("error");
let records = [];
const titleOf = (r) => r.tabTitle || r.siteName;
/** What the Transcripts tab needs to find a recording and save its transcript next to it. */
const forTranscript = (r) => ({ id: r.id, title: titleOf(r), fileName: r.fileName, folder: r.folder, location: r.location });
const view = createTranscriptsView({
  container: byId("pane-transcripts"),
  transcription: createLibraryTranscription(),
  findRecord: async (id) => {
    const r = (await background("recording/list", {})).find((x) => x.id === id);
    return r && forTranscript(r);
  },
  onError: (e) => showError(errorBox, e),
  onClearError: () => show(errorBox, false),
});
function selectTab(name) {
  for (const id of ["recordings", "transcripts"]) {
    byId(`tab-${id}`).setAttribute("aria-selected", String(id === name));
    show(byId(`pane-${id}`), id === name);
  }
  if (name === "transcripts" && !view.isRunning()) void view.showList();
}
byId("tab-recordings").addEventListener("click", () => selectTab("recordings"));
byId("tab-transcripts").addEventListener("click", () => selectTab("transcripts"));
const STATUS = {
  recording: { label: "Recording", kind: "warn" },
  saving: { label: "Saving", kind: "warn" },
  saved: { label: "Saved", kind: "ok" },
  unfinished: { label: "Not saved yet", kind: "warn" },
  failed: { label: "Failed", kind: "err" },
};
function whereText(r) {
  if (r.status !== "saved" || !r.location) return null;
  return r.location.kind === "folder" ? `Folder: ${r.location.folderName}` : r.location.path;
}
function button(label, onClick, extra = "") {
  return el("button", {
    class: `btn small ${extra}`.trim(),
    text: label,
    on: {
      click: () => {
        show(errorBox, false);
        void onClick()
          .catch((e) => showError(errorBox, e))
          .finally(load);
      },
    },
  });
}
function card(r) {
  const status = STATUS[r.status];
  const live = r.status === "recording" || r.status === "saving";
  const where = whereText(r);
  const actions = [];
  if (r.status === "unfinished" || r.status === "failed") {
    actions.push(button("Save now", () => background("recording/recover", { recordId: r.id }).then(() => {}), "primary"));
  }
  if (r.status === "saved" && r.location?.kind === "downloads") {
    actions.push(button("Show in folder", () => background("recording/reveal", { recordId: r.id }).then(() => {})));
    actions.push(
      button("Delete file", () => background("recording/remove", { recordId: r.id, deleteFile: true }).then(() => {}), "danger"),
    );
  }
  if (r.status === "saved") {
    actions.push(
      button("Transcribe", async () => {
        selectTab("transcripts");
        await view.startFor(forTranscript(r));
      }),
    );
  }
  if (!live && !(r.status === "saved" && r.location?.kind === "downloads")) {
    actions.push(
      button("Remove from list", () => background("recording/remove", { recordId: r.id, deleteFile: false }).then(() => {}), "danger"),
    );
  }
  return el("article", { class: "card rec-item" }, [
    el("div", { class: "row spread" }, [
      el("div", { class: "title clip", text: titleOf(r) }),
      el("span", { class: `chip ${status.kind}`.trim(), text: status.label }),
    ]),
    el("div", { class: "meta" }, [
      el("span", { text: r.siteName }),
      el("span", { text: new Date(r.startedAt).toLocaleString() }),
      r.durationMs !== undefined ? el("span", { text: formatDuration(r.durationMs) }) : null,
      r.sizeBytes !== undefined ? el("span", { text: formatBytes(r.sizeBytes) }) : null,
    ]),
    where ? el("div", { class: "faint clip", text: where, attrs: { title: where } }) : null,
    r.warning ? el("p", { class: "notice warn", text: r.warning }) : null,
    r.error && r.status !== "saved" ? el("p", { class: "notice err", text: r.error }) : null,
    actions.length ? el("div", { class: "row" }, actions) : null,
  ]);
}
let poll;
async function load() {
  clearTimeout(poll);
  try {
    records = await background("recording/list", {});
    list.replaceChildren(...records.map(card));
    show(empty, records.length === 0);
    // While something is recording or saving the page keeps itself fresh.
    if (records.some((r) => r.status === "recording" || r.status === "saving")) poll = setTimeout(() => void load(), 2000);
  } catch (e) {
    showError(errorBox, e);
  }
}
setText(byId("empty"), "No recordings yet. Open a call tab, click the extension icon and press Start.");
void load();
