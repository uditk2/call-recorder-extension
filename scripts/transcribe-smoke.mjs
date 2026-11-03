// Runs the Transcribe feature in a real Chromium with the extension loaded: seeds a saved recording, picks an audio file,
// and checks the model download, the transcript, the cache, Stop, and that the page is cross-origin isolated (needed for threads).
// The model comes from a local server so the run does not need the internet; missing model files are fetched once into tests/.models.
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

// ---- the model, from tests/.models (fetched once) ----
const REPO = "onnx-community/whisper-tiny.en";
const FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
const modelsDir = path.resolve("tests/.models");
for (const f of FILES) {
  const target = path.join(modelsDir, REPO, "resolve/main", f);
  if (existsSync(target)) continue;
  mkdirSync(path.dirname(target), { recursive: true });
  console.log(`fetching ${f}`);
  execSync(`curl -sSfL -o "${target}" "https://huggingface.co/${REPO}/resolve/main/${f}"`);
}
let modelRequests = 0;
const modelFilesSeen = new Set();
const modelServer = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  const file = path.join(modelsDir, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(modelsDir) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  if (file.endsWith(".onnx")) { modelRequests++; modelFilesSeen.add(path.basename(file)); }
  res.setHeader("content-length", statSync(file).size);
  res.end(readFileSync(file));
});
await new Promise((r) => modelServer.listen(8792, r));

// ---- audio: the synthetic voice, three times, with long silences between, so there are several windows ----
const work = mkdtempSync(path.join(tmpdir(), "transcribe-smoke-"));
const audio = path.join(work, "call.wav");
execSync(`ffmpeg -v error -y -i tests/fixtures/voice.wav -f lavfi -t 35 -i anullsrc=r=16000:cl=mono -filter_complex "[0:a][1:a][0:a][1:a][0:a]concat=n=5:v=0:a=1" -ar 16000 -ac 1 "${audio}"`);

const ext = mkdtempSync(path.join(tmpdir(), "call-recorder-ext-"));
cpSync("dist-dev", ext, { recursive: true });
let page;
const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "call-recorder-profile-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const id = new URL(worker.url()).host;
  await worker.evaluate(() => chrome.storage.local.set({
    recordings: [{
      id: "t1", status: "saved", startedAt: Date.now() - 600_000, durationMs: 100_000, sizeBytes: 1_000_000,
      siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Test call", tabId: 1,
      stagingName: "x", fileName: "call.mp4", mimeType: "video/mp4", location: { kind: "downloads", downloadId: 1, path: "/tmp/call.mp4" },
    }],
  }));

  page = await context.newPage();
  var problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  await page.goto(`chrome-extension://${id}/library.html`);
  await page.evaluate(() => localStorage.setItem("transcriptionHost", "http://localhost:8792/"));
  await page.reload();

  check("the library page is not cross-origin isolated (isolation breaks tab capture)", await page.evaluate(() => self.crossOriginIsolated === false));
  check("a saved recording has a Transcribe button", (await page.getByRole("button", { name: "Transcribe", exact: true }).count()) === 1);

  // ---- first run: downloads the model ----
  await page.getByRole("button", { name: "Transcribe", exact: true }).click();
  await page.locator("#transcribe-file").waitFor({ timeout: 15_000 });
  check("the Transcripts tab opens with the form", await page.locator("#transcribe-file").isVisible());
  check("the first-time download is explained", (await page.locator("#pane-transcripts").innerText()).includes("downloaded once"));
  check("Start waits for a file", await page.getByRole("button", { name: "Start", exact: true }).isDisabled());
  await page.selectOption("#transcribe-model", "tiny.en");
  check("an English only model fixes the language", (await page.locator("#transcribe-language").isDisabled()) && (await page.locator("#transcribe-language").inputValue()) === "en");
  await page.setInputFiles("#transcribe-file", audio);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const t0 = Date.now();
  await page.locator(".transcript-text .seg").first().waitFor({ timeout: 420_000 });
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);
  await page.getByRole("button", { name: "Copy text" }).waitFor({ timeout: 60_000 });
  const lines = await page.locator(".transcript-text .seg").evaluateAll((n) => n.map((e) => [e.querySelector("time").textContent, e.querySelector("span").textContent]));
  const text = lines.map((l) => l[1]).join(" ").toLowerCase();
  console.log(`      ${lines.length} lines in ${seconds}s`);
  console.log(lines.map((l) => `      ${l[0]}  ${l[1]}`).join("\n"));
  check("the transcript has the spoken words", /hello everyone/.test(text) && /release/.test(text) && /your own computer/.test(text));
  check("the same speech appears three times, at the right places", lines.filter((l) => /hello everyone/i.test(l[1])).length === 3);
  const starts = lines.filter((l) => /hello everyone/i.test(l[1])).map((l) => l[0]);
  check("timestamps follow the recording's clock, not the trimmed audio", starts[0] === "0:00" && starts[1] === "0:51" && starts[2] === "1:42", starts.join(", "));
  check("both model files were downloaded", modelFilesSeen.size === 2, `${modelRequests} requests for ${[...modelFilesSeen].join(", ")}`);
  const requestsAfterFirstRun = modelRequests;
  check("the model is kept in the browser's cache", await page.evaluate(async () => (await (await caches.open("transformers-cache")).keys()).some((r) => r.url.endsWith("decoder_model_merged_quantized.onnx"))));

  // ---- the transcript is saved and can be read again ----
  await page.getByRole("button", { name: "Back" }).click();
  check("the transcript is listed", (await page.locator("#pane-transcripts .card .title").first().innerText()) === "Test call");
  await page.getByRole("button", { name: "Open" }).click();
  check("opening it shows the lines again", (await page.locator(".transcript-text .seg").count()) === lines.length);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save as subtitles" }).click()]);
  check("subtitles download as an .srt file", download.suggestedFilename() === "Test call transcript.srt");
  const srt = readFileSync(await download.path(), "utf8");
  check("the subtitles hold the lines", srt.startsWith("1\n00:00:00,000 -->") && srt.includes("Hello everyone"));

  // ---- second run: the model comes from the cache, and Stop works ----
  await page.getByRole("button", { name: "Transcribe again" }).click();
  await page.locator("#transcribe-file").waitFor({ timeout: 15_000 });
  check("the form says the model is downloaded", (await page.locator('#transcribe-model option[value="tiny.en"]').innerText()).includes("(downloaded)"));
  await page.selectOption("#transcribe-model", "tiny.en");
  await page.setInputFiles("#transcribe-file", audio);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator("progress").waitFor();
  for (let i = 0; i < 60; i++) {
    const seen = await page.locator("#pane-transcripts").innerText();
    if (i % 5 === 0) console.log(`      [${i * 2}s] ${seen.replace(/\s+/g, " ").slice(0, 160)}`);
    if (/part \d+ of/.test(seen)) break;
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
  check("no errors in the page console", problems.length === 0, problems.slice(0, 3).join(" | "));
} catch (e) {
  check("the transcribe test ran to the end", false, String(e).slice(0, 400));
  if (page) console.log("--- page text ---\n" + (await page.locator("#pane-transcripts").innerText().catch(() => "?")) + "\n--- error box ---\n" + (await page.locator("#error").innerText().catch(() => "?")) + "\n--- console ---\n" + (typeof problems !== "undefined" ? problems.join("\n") : ""));
} finally {
  await context.close();
  modelServer.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
