// Runs the Transcribe feature in a real Chromium with the extension loaded: a saved recording in its own folder, access to the
// recordings folder, the one-time model download, the transcript, the files saved next to the recording, the cache, and Stop.
// The model comes from a local server so the run does not need the internet; missing model files are fetched once into tests/.models.
// The recordings folder is a folder in the browser's private file system, because a test cannot click a folder picker.
// Run `npm run build:dev` first.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
const { chromium } = playwright;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`); };

// ---- the model every transcript uses, from tests/.models (fetched once) ----
const REPO = "onnx-community/whisper-base";
const FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
const modelsDir = path.resolve("tests/.models");
for (const f of FILES) {
  const target = path.join(modelsDir, REPO, "resolve/main", f);
  if (existsSync(target)) continue;
  mkdirSync(path.dirname(target), { recursive: true });
  console.log(`fetching ${f}`);
  execSync(`curl -sSfL -o "${target}" "https://huggingface.co/${REPO}/resolve/main/${f}"`);
}

// ---- audio: the synthetic voice, three times, with long silences between, so there are several windows ----
const work = mkdtempSync(path.join(tmpdir(), "transcribe-smoke-"));
const audio = path.join(work, "call.wav");
execSync(`ffmpeg -v error -y -i tests/fixtures/voice.wav -f lavfi -t 35 -i anullsrc=r=16000:cl=mono -filter_complex "[0:a][1:a][0:a][1:a][0:a]concat=n=5:v=0:a=1" -ar 16000 -ac 1 "${audio}"`);

let modelRequests = 0;
const modelFilesSeen = new Set();
const server = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = pathname === "/call.wav" ? audio : path.join(modelsDir, pathname);
  if (!existsSync(file) || (pathname !== "/call.wav" && !file.startsWith(modelsDir))) { res.statusCode = 404; res.end(); return; }
  if (file.endsWith(".onnx")) { modelRequests++; modelFilesSeen.add(path.basename(file)); }
  res.setHeader("content-length", statSync(file).size);
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(8792, r));

const FOLDER = "call-2026-11-03-1000-google-meet";
const ext = mkdtempSync(path.join(tmpdir(), "call-recorder-ext-"));
cpSync("dist-dev", ext, { recursive: true });
let page;
const problems = [];
const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "call-recorder-profile-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const id = new URL(worker.url()).host;
  await worker.evaluate((folder) => chrome.storage.local.set({
    recordings: [{
      id: "t1", status: "saved", startedAt: Date.now() - 600_000, durationMs: 100_000, sizeBytes: 1_000_000,
      siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Test call", tabId: 1,
      stagingName: "x", folder, fileName: "call.wav", mimeType: "video/mp4",
      location: { kind: "downloads", downloadId: 1, path: `/home/me/Downloads/Call Recordings/${folder}/call.wav`, relativePath: [folder, "call.wav"] },
    }],
  }), FOLDER);

  page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  await page.goto(`chrome-extension://${id}/library.html`);
  await page.evaluate(() => localStorage.setItem("transcriptionHost", "http://localhost:8792/"));
  await page.reload();

  // ---- setup page: the optional third step ----
  const setupPage = await context.newPage();
  await setupPage.goto(`chrome-extension://${id}/setup.html`);
  await setupPage.getByRole("button", { name: "Allow reading recordings" }).waitFor({ timeout: 15_000 });
  const setupText = await setupPage.locator("main").innerText();
  check("setup offers transcripts as an optional third step, naming the folder", /Transcripts \(optional\)/.test(setupText) && /Downloads\/Call Recordings/.test(setupText));
  check("setup explains the one-time model download", /downloads a speech model once/.test(setupText));
  check("setup shows transcripts as not allowed yet", /Not allowed yet/.test(await setupPage.locator("#transcripts-status").innerText()));
  await setupPage.close();

  check("a saved recording has a Transcribe button", (await page.getByRole("button", { name: "Transcribe", exact: true }).count()) === 1);

  // ---- before access is allowed: one clear step, no picking ----
  await page.getByRole("button", { name: "Transcribe", exact: true }).click();
  await page.getByRole("button", { name: "Allow access" }).waitFor({ timeout: 15_000 });
  check("the access request is a pop-up over the library", await page.locator("dialog.dialog[open]").isVisible());
  const prompt = await page.locator("dialog.dialog").innerText();
  check("the request is short and names the folder", /Downloads\/Call Recordings/.test(prompt) && /pick the "Call Recordings" folder/.test(prompt) && prompt.length < 260, `${prompt.length} characters`);
  check("there is nothing to choose: no file, model or language fields", (await page.locator("#transcribe-file, #transcribe-model, #transcribe-language").count()) === 0);

  // ---- the person allows the folder (here: a private folder that already holds the recording) ----
  await page.evaluate(async ([folder]) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("Call Recordings", { create: true });
    const dir = await root.getDirectoryHandle(folder, { create: true });
    const handle = await dir.getFileHandle("call.wav", { create: true });
    const writable = await handle.createWritable();
    await writable.write(await (await fetch("http://localhost:8792/call.wav")).arrayBuffer());
    await writable.close();
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("call-recorder", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(root, "recordings-root");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, [FOLDER]);
  await page.getByRole("button", { name: "Cancel" }).click();
  check("the request is a pop-up, and cancelling leaves the library as it was", (await page.locator("dialog[open]").count()) === 0);

  // ---- first transcript: starts by itself, explains the one-time download ----
  await page.getByRole("tab", { name: "Recordings" }).click();
  await page.getByRole("button", { name: "Transcribe", exact: true }).click();
  await page.locator("progress").waitFor({ timeout: 15_000 });
  check("it starts by itself, with no Start button and nothing to choose", (await page.getByRole("button", { name: "Start" }).count()) === 0 && (await page.locator("select, input[type=file]").count()) === 0);
  check("the one-time model download is explained", /One time only/.test(await page.locator("#pane-transcripts").innerText()));
  const t0 = Date.now();
  await page.getByRole("button", { name: "Copy text" }).waitFor({ timeout: 480_000 });
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);
  const lines = await page.locator(".transcript-text .seg").evaluateAll((n) => n.map((e) => [e.querySelector("time").textContent, e.querySelector("span").textContent]));
  const text = lines.map((l) => l[1]).join(" ").toLowerCase();
  console.log(`      ${lines.length} lines in ${seconds}s`);
  console.log(lines.map((l) => `      ${l[0]}  ${l[1]}`).join("\n"));
  check("the transcript has the spoken words", /hello everyone/.test(text) && /release/.test(text) && /your own computer/.test(text));
  check("the same speech appears three times, at the right places", lines.filter((l) => /hello everyone/i.test(l[1])).length === 3);
  const starts = lines.filter((l) => /hello everyone/i.test(l[1])).map((l) => l[0]);
  check("timestamps follow the recording's clock, not the trimmed audio", starts[0] === "0:00" && starts[1] === "0:51" && starts[2] === "1:42", starts.join(", "));
  check("both model files were downloaded", modelFilesSeen.size === 2, `${[...modelFilesSeen].join(", ")}`);
  const requestsAfterFirstRun = modelRequests;
  check("the model is kept in the browser's cache", await page.evaluate(async () => (await (await caches.open("transformers-cache")).keys()).some((r) => r.url.endsWith("decoder_model_merged_quantized.onnx"))));

  // ---- the transcript sits in the recording's own folder ----
  check("the page says where the files were saved", /transcript\.txt and call\.srt/.test(await page.locator("#pane-transcripts").innerText()));
  const saved = await page.evaluate(async (folder) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("Call Recordings")).getDirectoryHandle(folder);
    const out = {};
    for await (const [name, handle] of dir.entries()) out[name] = handle.kind === "file" ? (await (await handle.getFile()).text()).slice(0, 60).replace(/\s+/g, " ") : "";
    return out;
  }, FOLDER);
  check("the folder holds the recording, transcript.txt and subtitles named after it", Object.keys(saved).sort().join(",") === "call.srt,call.wav,transcript.txt", Object.keys(saved).join(","));
  check("transcript.txt starts with a time and the first words", /^\[0:00\] Hello everyone/.test(saved["transcript.txt"] ?? ""), saved["transcript.txt"]);
  check("call.srt is in subtitle format", /^1 00:00:00,\d{3} --> /.test(saved["call.srt"] ?? ""), saved["call.srt"]);

  // ---- saved in the app too, and downloadable ----
  await page.getByRole("button", { name: "Back" }).click();
  check("the transcript is listed", (await page.locator("#pane-transcripts .card .title").first().innerText()) === "Test call");
  await page.getByRole("button", { name: "Open" }).click();
  check("opening it shows the lines again", (await page.locator(".transcript-text .seg").count()) === lines.length);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save as subtitles" }).click()]);
  check("subtitles download as an .srt file", download.suggestedFilename() === "Test call transcript.srt");

  // ---- second run: no download note, nothing fetched, and Stop works ----
  await page.getByRole("button", { name: "Transcribe again" }).click();
  await page.locator("progress").waitFor({ timeout: 15_000 });
  check("the second time there is no download note", !/One time only/.test(await page.locator("#pane-transcripts").innerText()));
  for (let i = 0; i < 90; i++) {
    if (/Part \d+ of/.test(await page.locator("#pane-transcripts").innerText())) break;
    await page.waitForTimeout(2000);
  }
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Open" }).waitFor({ timeout: 120_000 });
  check("no model file was downloaded the second time", modelRequests === requestsAfterFirstRun, `${modelRequests} vs ${requestsAfterFirstRun}`);
  check("Stop returns to the list", (await page.getByRole("button", { name: "Open" }).count()) === 1);

  // ---- delete ----
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByText("No transcripts yet").waitFor();
  check("deleting removes the transcript", true);
  // ---- setup after access is allowed ----
  const setupAgain = await context.newPage();
  await setupAgain.goto(`chrome-extension://${id}/setup.html`);
  await setupAgain.getByText("Allowed", { exact: true }).waitFor({ timeout: 15_000 });
  check("setup shows transcripts as allowed once the folder is kept", true);
  await setupAgain.close();
  check("no errors in the page console", problems.length === 0, problems.slice(0, 3).join(" | "));
} catch (e) {
  check("the transcribe test ran to the end", false, String(e).slice(0, 400));
  if (page) console.log("--- page text ---\n" + (await page.locator("#pane-transcripts").innerText().catch(() => "?")) + "\n--- error box ---\n" + (await page.locator("#error").innerText().catch(() => "?")) + "\n--- console ---\n" + problems.join("\n"));
} finally {
  await context.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
