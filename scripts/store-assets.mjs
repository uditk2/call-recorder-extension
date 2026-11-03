// Makes the Chrome Web Store graphics and the privacy policy page.
// The screenshots are the real extension pages from dist/, filled with sample data, framed in dark green.
// Run `npm run build` first. Output goes to store/screenshots, store/promo and store/privacy-policy.html.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
const { chromium } = playwright;

const DIST = path.resolve("dist");
const OUT = { shots: "store/screenshots", promo: "store/promo", tmp: "store/.tmp" };
for (const d of Object.values(OUT)) mkdirSync(d, { recursive: true });
const fontUrl = (f) => pathToFileURL(path.join(DIST, "fonts", f)).href;
const logoPng = `data:image/png;base64,${readFileSync("static/icons/icon-128.png").toString("base64")}`;

// ---------- sample data ----------
const at = (day, h, m) => Date.UTC(2026, 10, day, h, m);
const rec = (o) => ({ tabId: 1, stagingName: "x", mimeType: "video/mp4", status: "saved", ...o });
const LIBRARY = [
  rec({ id: "5", startedAt: at(2, 5, 35), durationMs: 2530_000, sizeBytes: 86_400_000, siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Design review", fileName: "a.mp4", location: { kind: "downloads", downloadId: 5, path: "/Users/you/Downloads/Call Recordings/call-2026-11-02-1105-google-meet.mp4" } }),
  rec({ id: "4", startedAt: at(1, 9, 0), durationMs: 3725_000, sizeBytes: 131_000_000, siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Weekly planning", fileName: "b.mp4", location: { kind: "downloads", downloadId: 4, path: "/Users/you/Downloads/Call Recordings/call-2026-11-01-1430-google-meet.mp4" } }),
  rec({ id: "3", startedAt: at(1, 4, 0), durationMs: 912_000, sizeBytes: 31_000_000, siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Customer call", fileName: "c.mp4", status: "unfinished", error: "This recording was cut short." }),
  rec({ id: "2", startedAt: at(0, 8, 45), durationMs: 1210_000, sizeBytes: 44_000_000, siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Interview with Priya", fileName: "d.webm", mimeType: "video/webm", location: { kind: "folder", folderName: "Calls" } }),
];
const MEET = { siteId: "google-meet", siteName: "Google Meet", host: "meet.google.com", tabTitle: "Weekly planning", consent: "recorder-confirms" };

// ---------- the real pages, with a stand-in for the chrome.* APIs ----------
function stubChrome(data) {
  const reply = (type) => {
    const v = data.replies[type];
    if (v && v.startedAgoMs) return { ...v, startedAt: Date.now() - v.startedAgoMs };
    return v === undefined ? {} : JSON.parse(JSON.stringify(v));
  };
  window.chrome = {
    runtime: { sendMessage: async (m) => ({ ok: true, data: reply(m.type) }), onMessage: { addListener() {} }, getURL: (p) => p },
    tabs: { query: async () => [{ id: 1 }] },
    storage: { local: { get: async (k) => ({ [k]: data.storage[k] }), set: async () => {} } },
  };
}

async function capture(browser, spec) {
  const context = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: 2, locale: "en-US", timezoneId: "Asia/Kolkata" });
  const page = await context.newPage();
  await page.addInitScript(stubChrome, { replies: spec.replies, storage: { settings: spec.settings ?? { folderName: null, setupDone: true } } });
  await page.goto(pathToFileURL(path.join(DIST, spec.page)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  if (spec.before) await spec.before(page);
  const file = path.join(OUT.tmp, `${spec.name}.png`);
  await page.locator(spec.element).screenshot({ path: file });
  await context.close();
  return file;
}

// ---------- the frames ----------
const css = `
@font-face{font-family:"Instrument Sans";src:url("${fontUrl("instrument-sans-latin-wdth-normal.woff2")}");font-weight:400 700;font-stretch:75% 100%}
@font-face{font-family:"Bricolage Grotesque";src:url("${fontUrl("bricolage-grotesque-latin-opsz-normal.woff2")}");font-weight:200 800}
*{box-sizing:border-box;margin:0}
body{background:#10261f;color:#f3f3ef;font-family:"Instrument Sans",system-ui,sans-serif;overflow:hidden}
h1{font-family:"Bricolage Grotesque";font-weight:700;letter-spacing:-.035em;line-height:1.05}
.sub{color:rgba(243,243,239,.74)}
.bar{height:6px;width:72px;border-radius:3px;background:#e0a93c;margin-bottom:28px}
img.ui{border-radius:20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.55);display:block}
`;
const frame = (inner) => `<!doctype html><meta charset="utf-8"><style>${css}</style>${inner}`;

const side = (title, sub, img, imgHeight) => frame(`
<div style="position:relative;width:1280px;height:800px">
  <div style="position:absolute;left:84px;top:210px;width:510px"><div class="bar"></div>
    <h1 style="font-size:58px">${title}</h1><p class="sub" style="font-size:24px;margin-top:22px;line-height:1.4">${sub}</p></div>
  <img class="ui" src="${img}" style="position:absolute;right:110px;top:${(800 - imgHeight) / 2}px;height:${imgHeight}px">
</div>`);

const wide = (title, sub, img, imgWidth) => frame(`
<div style="position:relative;width:1280px;height:800px">
  <div style="position:absolute;left:84px;top:56px;width:1100px"><div class="bar" style="margin-bottom:20px"></div>
    <h1 style="font-size:50px">${title}</h1><p class="sub" style="font-size:22px;margin-top:14px">${sub}</p></div>
  <img class="ui" src="${img}" style="position:absolute;left:${(1280 - imgWidth) / 2}px;top:236px;width:${imgWidth}px;border-bottom-left-radius:0;border-bottom-right-radius:0">
</div>`);

const toDataUri = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

async function render(browser, html, size, outFile) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  // Loaded from a file, not setContent, so the font files next to it are allowed to load.
  const htmlFile = path.resolve(OUT.tmp, "frame.html");
  writeFileSync(htmlFile, html);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const tmp = path.join(OUT.tmp, "frame.png");
  await page.screenshot({ path: tmp });
  await page.close();
  // The store wants 24-bit PNG without transparency.
  execSync(`convert "${tmp}" -background "#10261f" -alpha remove -alpha off PNG24:"${outFile}"`);
}

// ---------- privacy policy page ----------
function markdownToHtml(md) {
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const out = [];
  let list = false;
  for (const line of md.split("\n")) {
    const li = line.match(/^- (.*)/);
    if (list && !li) { out.push("</ul>"); list = false; }
    if (li) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(li[1])}</li>`); }
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}
const policy = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Call Recorder for Google Meet privacy policy</title>
<link rel="icon" href="logo.png">
<style>
@font-face{font-family:"Instrument Sans";src:url("fonts/instrument-sans-latin-wdth-normal.woff2") format("woff2");font-weight:400 700;font-stretch:75% 100%;font-display:swap}
@font-face{font-family:"Bricolage Grotesque";src:url("fonts/bricolage-grotesque-latin-opsz-normal.woff2") format("woff2");font-weight:200 800;font-display:swap}
body{font:17px/1.65 "Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#f3f3ef;background:#10261f;margin:0}
main{max-width:740px;margin:0 auto;padding:3rem 1.5rem 5rem}
h1,h2{font-family:"Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.03em;line-height:1.1}
h1{font-size:2.3rem;margin:1.4rem 0 .6rem}h2{font-size:1.35rem;margin-top:2.2rem}
.top{display:flex;align-items:center;gap:12px;font-weight:600}.top img{width:40px;height:40px;border-radius:9px}
.top a{color:#f3f3ef;text-decoration:none;display:flex;align-items:center;gap:12px}
a{color:#e0a93c}strong{color:#fff}
code{background:#14523d;padding:.1em .35em;border-radius:6px}li{margin:.35rem 0}
p,li{color:rgba(243,243,239,.86)}
</style>
<main><div class="top"><a href="./"><img src="logo.png" alt="">Call Recorder for Google Meet</a></div>${markdownToHtml(readFileSync("store/privacy-policy.md", "utf8"))}</main></html>`;
writeFileSync("store/privacy-policy.html", policy);
writeFileSync("docs/privacy.html", policy); // served by GitHub Pages, and the address the store listing links to

// ---------- go ----------
const browser = await chromium.launch();
try {
  const popup = { page: "popup.html", viewport: { width: 340, height: 520 }, element: "body" };
  const shots = [
    {
      name: "popup-meet", ...popup,
      replies: { "recording/status": { phase: "idle" }, "site/describe": MEET },
      before: (p) => p.check("#consent"),
      html: (img) => side("Record Google Meet calls", "Your voice and everyone else's, in one file on your computer. No bot, no account.", img, 500),
    },
    {
      name: "popup-shared", ...popup,
      replies: {
        "recording/status": { phase: "recording", recordId: "1", startedAgoMs: 1_325_000, siteName: "Google Meet", tabTitle: "Weekly planning" },
        "recording/levels": { levels: { micIn: 0.12, mic: 0.09, tab: 0.045, shared: 0.08, sharedActive: true, noiseReductionBypassed: false } },
      },
      html: (img) => side("Records the sound you share", "Share a tab or screen in the call and its sound goes into the recording while you share it.", img, 560),
    },
    {
      name: "popup-recording", ...popup,
      replies: {
        "recording/status": { phase: "recording", recordId: "1", startedAgoMs: 754_000, siteName: "Google Meet", tabTitle: "Weekly planning" },
        "recording/levels": { levels: { micIn: 0.12, mic: 0.09, tab: 0.045, noiseReductionBypassed: false } },
      },
      html: (img) => side("See that your voice is being recorded", "Live meters for you and the call. The recording keeps going when you close the popup.", img, 560),
    },
    {
      name: "library", page: "library.html", viewport: { width: 760, height: 640 }, element: "main",
      replies: { "recording/list": LIBRARY },
      html: (img) => wide("Find every recording in one place", "Time, length, size and the tab title. Unfinished recordings can be saved later.", img, 820),
    },
    {
      name: "setup", page: "setup.html", viewport: { width: 760, height: 700 }, element: "main",
      replies: {}, settings: { folderName: null, setupDone: false },
      html: (img) => wide("Set up in two steps", "Allow your microphone, and pick a folder if you do not want Downloads. Nothing is uploaded.", img, 820),
    },
  ];
  let n = 1;
  for (const s of shots) {
    const ui = await capture(browser, s);
    await render(browser, s.html(toDataUri(ui)), { width: 1280, height: 800 }, `${OUT.shots}/${String(n++).padStart(2, "0")}-${s.name}-1280x800.png`);
  }

  const promo = frame(`
<div style="width:440px;height:280px;position:relative;background:#14523d">
  <div style="position:absolute;left:34px;top:44px;width:64px;height:64px"><img src="${logoPng}" width="64" height="64" alt=""></div>
  <div style="position:absolute;left:34px;top:136px;width:380px"><div class="bar" style="height:5px;width:48px;margin-bottom:14px"></div>
    <h1 style="font-size:31px">Call Recorder for Google Meet</h1><p class="sub" style="font-size:17px;margin-top:8px">Record Meet calls on your own device.</p></div>
</div>`);
  await render(browser, promo, { width: 440, height: 280 }, `${OUT.promo}/small-tile-440x280.png`);

  // The marquee tile (1400 x 560): the name and promise on the left, the popup recording a shared sound on the right.
  const popupShared = await capture(browser, shots.find((x) => x.name === "popup-shared"));
  const marquee = frame(`
<div style="width:1400px;height:560px;position:relative;background:#14523d;overflow:hidden">
  <img src="${logoPng}" width="84" height="84" alt="" style="position:absolute;left:90px;top:96px">
  <div style="position:absolute;left:90px;top:214px;width:780px"><div class="bar" style="height:6px;width:64px;margin-bottom:22px"></div>
    <h1 style="font-size:68px">Call Recorder<br>for Google Meet</h1>
    <p class="sub" style="font-size:28px;margin-top:20px;line-height:1.35">Records the call, your mic and the sound you share. On your computer. Nothing is uploaded.</p></div>
  <img class="ui" src="${toDataUri(popupShared)}" style="position:absolute;right:110px;top:50px;height:460px">
</div>`);
  await render(browser, marquee, { width: 1400, height: 560 }, `${OUT.promo}/marquee-tile-1400x560.png`);
} finally {
  await browser.close();
  rmSync(OUT.tmp, { recursive: true, force: true });
}
console.log("Store graphics written to store/screenshots and store/promo, and store/privacy-policy.html");
