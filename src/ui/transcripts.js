// The Transcripts tab of the library: make a transcript of a recording, read it, copy it, save it as text or subtitles.
// There is nothing to choose. The recording is found by itself, and the transcript is saved in the recording's own folder.
import { messageOf } from "../domain/errors.js";
import { DEFAULT_MODEL_ID, modelById } from "../domain/transcription/models.js";
import { formatClock, toPlainText, toSrt, transcriptFileName } from "../domain/transcription/transcript.js";
import { formatBytes, formatDuration } from "../shared/format.js";
import { isModelCached } from "../transcription/transformersCache.js";
import { el, setText } from "./dom.js";

/** Saves text as a file by the usual download link. It goes to the Downloads folder. */
function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function eta(ms) {
  return ms === null || ms === undefined ? "" : ms < 60_000 ? "Less than a minute left." : `About ${Math.ceil(ms / 60_000)} min left.`;
}

const MODEL = modelById(DEFAULT_MODEL_ID);

/**
 * @param {object} deps
 * @param {HTMLElement} deps.container
 * @param {ReturnType<typeof import("../transcription/createLibraryTranscription.js").createLibraryTranscription>} deps.transcription
 * @param {(id: string) => Promise<object | undefined>} deps.findRecord The recording as the library knows it: id, title, folder, file name, location.
 * @param {(error: unknown) => void} deps.onError
 * @param {() => void} deps.onClearError
 */
export function createTranscriptsView({ container, transcription, findRecord, onError, onClearError }) {
  let running = null; // { controller } while a transcript is being made

  async function showList() {
    const transcripts = (await transcription.repository.all()).sort((a, b) => b.createdAt - a.createdAt);
    const cards = transcripts.map((t) =>
      el("article", { class: "card rec-item" }, [
        el("div", { class: "title clip", text: t.title }),
        el("div", { class: "meta" }, [
          el("span", { text: new Date(t.createdAt).toLocaleString() }),
          el("span", { text: formatDuration(t.durationSec * 1000) }),
          el("span", { text: `${t.segments.length} lines` }),
        ]),
        el("div", { class: "row" }, [
          el("button", { class: "btn small primary", text: "Open", on: { click: () => showViewer(t) } }),
          el("button", {
            class: "btn small danger",
            text: "Delete",
            on: { click: () => void transcription.repository.remove(t.recordId).then(showList).catch(onError) },
          }),
        ]),
      ]),
    );
    container.replaceChildren(
      ...(cards.length ? cards : [el("p", { class: "empty card", text: "No transcripts yet. Press Transcribe on a recording." })]),
    );
  }

  function showViewer(t) {
    const copyButton = el("button", { class: "btn small", text: "Copy text" });
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(toPlainText(t.segments)).then(() => {
        setText(copyButton, "Copied");
        setTimeout(() => setText(copyButton, "Copy text"), 1500);
      }, onError);
    });
    const body = t.segments.length
      ? t.segments.map((s) => el("div", { class: "seg" }, [el("time", { text: formatClock(s.start) }), el("span", { text: s.text })]))
      : [el("p", { class: "muted", text: "No speech was found in this recording." })];
    const where = t.files?.length
      ? el("p", { class: "faint", text: `Saved next to the recording: ${t.files.join(" and ")}.` })
      : t.filesError
        ? el("p", { class: "notice warn", text: t.filesError })
        : null;
    container.replaceChildren(
      el("div", { class: "row spread" }, [
        el("div", { class: "title clip", text: t.title }),
        el("button", { class: "btn small", text: "Back", on: { click: () => void showList() } }),
      ]),
      el("div", { class: "row" }, [
        copyButton,
        el("button", {
          class: "btn small",
          text: "Save as text",
          on: {
            click: () =>
              downloadText(transcriptFileName(`${t.title} transcript`, "txt"), toPlainText(t.segments, { timestamps: true }), "text/plain"),
          },
        }),
        el("button", {
          class: "btn small",
          text: "Save as subtitles",
          on: { click: () => downloadText(transcriptFileName(`${t.title} transcript`, "srt"), toSrt(t.segments), "text/plain") },
        }),
        el("button", {
          class: "btn small",
          text: "Transcribe again",
          on: {
            click: () =>
              void findRecord(t.recordId).then((r) =>
                r ? startFor(r) : onError(new Error("That recording is no longer in the library.")),
              ),
          },
        }),
      ]),
      where,
      el("section", { class: "card transcript-text" }, body),
    );
  }

  /** Starts at once when the recording can be read. Otherwise asks, once, for the folder. */
  async function startFor(record) {
    onClearError();
    const root = await transcription.access.ready(record).catch(() => null);
    if (root) return run(record, root);
    showAccessPrompt(record);
  }

  /** A pop-up over the library that asks to read the recordings folder. Closing it leaves the library as it was. */
  function showAccessPrompt(record) {
    const where = record.location?.kind === "folder" ? `"${record.location.folderName}"` : "Downloads/Call Recordings";
    const dialog = el("dialog", { class: "dialog", attrs: { "aria-labelledby": "access-title" } });
    const allow = el("button", { class: "btn primary", text: "Allow access" });
    const cancel = el("button", { class: "btn", text: "Cancel" });
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", () => dialog.remove()); // the Escape key
    allow.addEventListener("click", () => {
      allow.disabled = true;
      onClearError();
      // Chrome's folder prompt only opens from a click, so this runs straight from the button.
      transcription.access
        .grant(record)
        .then((root) => {
          close();
          return run(record, root);
        })
        .catch((e) => {
          allow.disabled = false;
          onError(e);
          close();
        });
    });
    dialog.append(
      el("h2", { class: "dialog-title", text: "Allow access to your recordings", attrs: { id: "access-title" } }),
      el("p", { text: `To make a transcript, Call Recorder needs to read ${where}.` }),
      record.location?.kind === "folder"
        ? null
        : el("p", { class: "muted", text: 'Next, pick the "Call Recordings" folder inside Downloads.' }),
      el("p", { class: "faint", text: "Everything stays on your computer." }),
      el("div", { class: "row dialog-actions" }, [allow, cancel]),
    );
    document.body.append(dialog);
    dialog.showModal();
  }

  async function run(record, root) {
    const cached = await isModelCached(MODEL.repo).catch(() => false);
    const progress = el("progress", { attrs: { max: "1", value: "0" } });
    const status = el("p", { class: "muted", attrs: { "aria-live": "polite" } });
    const live = el("div", { class: "transcript-text" });
    const stopButton = el("button", { class: "btn", text: "Stop" });
    const note = cached
      ? null
      : el("p", {
          class: "notice",
          text: `One time only: the speech model (about ${MODEL.downloadMb} MB) is being downloaded. It is needed so your recording can be turned into text here, on your computer, instead of being uploaded to a service. It is kept, so later transcripts use it and nothing is downloaded again.`,
        });
    container.replaceChildren(
      el("section", { class: "card stack" }, [
        el("div", { class: "title clip", text: `Transcribe: ${record.title}` }),
        note,
        el("p", { class: "faint", text: "Keep this tab open until it finishes. A long call can take a while." }),
        progress,
        status,
        el("div", { class: "row" }, [stopButton]),
        live,
      ]),
    );
    const controller = new AbortController();
    running = { controller };
    window.onbeforeunload = () => true;
    stopButton.addEventListener("click", () => {
      controller.abort();
      stopButton.disabled = true;
      setText(status, "Stopping after this part...");
    });
    try {
      const file = await transcription.access.readFile(root, record);
      const t = await transcription.service.run({
        record,
        file,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.phase === "decoding") setText(status, "Reading the recording...");
          if (p.phase === "model") {
            progress.value = p.totalBytes ? p.loadedBytes / p.totalBytes : 0;
            setText(status, `Downloading the speech model (${formatBytes(p.loadedBytes)} of ${formatBytes(p.totalBytes)})...`);
          }
          if (p.phase === "transcribing") {
            progress.value = p.total ? p.done / p.total : 1;
            setText(status, `Part ${p.done} of ${p.total}. ${eta(p.etaMs)}`.trim());
            live.replaceChildren(
              ...p.segments
                .slice(-4)
                .map((s) => el("div", { class: "seg" }, [el("time", { text: formatClock(s.start) }), el("span", { text: s.text })])),
            );
          }
        },
      });
      showViewer(t);
    } catch (e) {
      if (e?.code !== "cancelled") onError(e);
      void showList();
    } finally {
      running = null;
      window.onbeforeunload = null;
      await transcription.engine.dispose().catch((e) => console.warn(messageOf(e)));
    }
  }

  return { showList, startFor, isRunning: () => running !== null };
}
