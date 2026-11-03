// The Transcripts tab of the library: make a transcript from a recording, read it, copy it, save it as text or subtitles.
import { formatBytes, formatDuration } from "../shared/format.js";
import { messageOf } from "../domain/errors.js";
import { TRANSCRIPTION_LANGUAGES, TRANSCRIPTION_MODELS, modelById, recommendModel } from "../domain/transcription/models.js";
import { formatClock, toPlainText, toSrt, transcriptFileName } from "../domain/transcription/transcript.js";
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

/**
 * @param {object} deps
 * @param {HTMLElement} deps.container
 * @param {ReturnType<typeof import("../transcription/createLibraryTranscription.js").createLibraryTranscription>} deps.transcription
 * @param {(id: string) => Promise<{ id: string; title: string; fileName?: string; location?: import("../domain/types.js").SavedLocation } | undefined>} deps.findRecord
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
          el("span", { text: modelById(t.model).label }),
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
    const withTimes = toPlainText(t.segments, { timestamps: true });
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
          on: { click: () => downloadText(transcriptFileName(`${t.title} transcript`, "txt"), withTimes, "text/plain") },
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
      el("section", { class: "card transcript-text" }, body),
    );
  }

  /** Opens the form for one recording. */
  async function startFor(record) {
    onClearError();
    const machine = { deviceMemoryGb: navigator.deviceMemory, cores: navigator.hardwareConcurrency };
    const cached = new Set();
    for (const m of TRANSCRIPTION_MODELS) if (await isModelCached(m.repo).catch(() => false)) cached.add(m.id);

    const fileInput = el("input", {
      attrs: { type: "file", id: "transcribe-file", accept: "video/*,audio/*,.mp4,.webm,.m4a,.mp3,.wav,.ogg" },
    });
    const modelSelect = el(
      "select",
      { attrs: { id: "transcribe-model" } },
      TRANSCRIPTION_MODELS.map((m) =>
        el("option", { attrs: { value: m.id }, text: `${m.label} (${cached.has(m.id) ? "downloaded" : `${m.downloadMb} MB download`})` }),
      ),
    );
    modelSelect.value = recommendModel(machine);
    const languageSelect = el(
      "select",
      { attrs: { id: "transcribe-language" } },
      TRANSCRIPTION_LANGUAGES.map((l) => el("option", { attrs: { value: l.code }, text: l.label })),
    );
    const syncLanguage = () => {
      const multilingual = modelById(modelSelect.value).multilingual;
      languageSelect.disabled = !multilingual;
      if (!multilingual) languageSelect.value = "en";
      else if (languageSelect.value === "en" && !running) languageSelect.value = "auto";
      setText(
        downloadNote,
        cached.has(modelSelect.value)
          ? ""
          : `The first time, the model is downloaded once (${modelById(modelSelect.value).downloadMb} MB) from huggingface.co. Only the model is downloaded. Your recording and its text never leave this computer.`,
      );
    };
    const downloadNote = el("p", { class: "faint" });
    modelSelect.addEventListener("change", syncLanguage);

    const progress = el("progress", { attrs: { max: "1", value: "0" } });
    const status = el("p", { class: "muted", attrs: { "aria-live": "polite" } });
    const live = el("div", { class: "transcript-text" });
    const progressBox = el("div", { class: "stack" }, [progress, status, live]);
    progressBox.hidden = true;

    const startButton = el("button", { class: "btn primary", text: "Start", attrs: { disabled: "" } });
    const stopButton = el("button", { class: "btn", text: "Stop" });
    const backButton = el("button", { class: "btn", text: "Back", on: { click: () => void showList() } });
    stopButton.hidden = true;
    fileInput.addEventListener("change", () => (startButton.disabled = !fileInput.files?.length));

    const where = record.location?.kind === "folder" ? `Folder: ${record.location.folderName}` : record.location?.path;
    const form = el("section", { class: "card stack" }, [
      el("div", { class: "title clip", text: `Transcribe: ${record.title}` }),
      el("p", {
        class: "muted",
        text: `Choose the recording file${record.fileName ? ` (${record.fileName})` : ""}.${where ? ` It was saved at ${where}.` : ""} The browser reads it from your computer.`,
      }),
      el("div", { class: "fields" }, [
        el("label", { class: "field" }, [el("span", { text: "Recording file" }), fileInput]),
        el("label", { class: "field" }, [el("span", { text: "Model" }), modelSelect]),
        el("label", { class: "field" }, [el("span", { text: "Language" }), languageSelect]),
      ]),
      downloadNote,
      el("p", { class: "faint", text: "Keep this tab open until it finishes. A long call can take a while." }),
      el("div", { class: "row" }, [startButton, stopButton, backButton]),
      progressBox,
    ]);
    container.replaceChildren(form);
    syncLanguage();

    startButton.addEventListener("click", () => {
      const file = fileInput.files?.[0];
      if (!file || running) return;
      onClearError();
      const controller = new AbortController();
      running = { controller };
      for (const node of [fileInput, modelSelect, languageSelect, startButton, backButton]) node.disabled = true;
      stopButton.hidden = false;
      progressBox.hidden = false;
      window.onbeforeunload = () => true;
      stopButton.onclick = () => {
        controller.abort();
        setText(status, "Stopping after this part...");
      };
      const modelName = modelById(modelSelect.value).label;
      void transcription.service
        .run({
          record,
          file,
          modelId: modelSelect.value,
          language: languageSelect.value,
          signal: controller.signal,
          onProgress: (p) => {
            if (p.phase === "decoding") setText(status, "Reading the recording...");
            if (p.phase === "model") {
              progress.value = p.totalBytes ? p.loadedBytes / p.totalBytes : 0;
              setText(status, `Downloading the model (${formatBytes(p.loadedBytes)} of ${formatBytes(p.totalBytes)})...`);
            }
            if (p.phase === "transcribing") {
              progress.value = p.total ? p.done / p.total : 1;
              setText(status, `${modelName}: part ${p.done} of ${p.total}. ${eta(p.etaMs)}`.trim());
              live.replaceChildren(
                ...p.segments
                  .slice(-4)
                  .map((s) => el("div", { class: "seg" }, [el("time", { text: formatClock(s.start) }), el("span", { text: s.text })])),
              );
            }
          },
        })
        .then((t) => showViewer(t))
        .catch((e) => {
          if (e?.code !== "cancelled") onError(e);
          void showList();
        })
        .finally(async () => {
          running = null;
          window.onbeforeunload = null;
          await transcription.engine.dispose().catch((e) => console.warn(messageOf(e)));
        });
    });
  }

  return { showList, startFor, isRunning: () => running !== null };
}
