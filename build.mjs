// Bundles each extension entry point with esbuild and copies static files into dist/.
// One entry list, one place to add a page. No other build logic.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// `node build.mjs` makes the store version in dist/. `node build.mjs --dev` makes dist-dev/, which also trusts localhost.
const DEV = process.argv.includes("--dev");
// The store version leaves Konvene out. `--konvene` (and the dev build) add the Konvene recording badge back.
const KONVENE = DEV || process.argv.includes("--konvene");
const OUT = DEV ? "dist-dev" : "dist";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const entries = {
  background: "src/background/serviceWorker.js",
  offscreen: "src/recorder/offscreenMain.js",
  opfsWriter: "src/recorder/opfsWriter.worker.js",
  popup: "src/ui/popup.js",
  setup: "src/ui/setup.js",
  library: "src/ui/library.js",
  ...(KONVENE ? { konveneBridge: "src/content/konveneBridge.js" } : {}),
  shareRelay: "src/content/shareRelay.js",
  sharePage: "src/content/sharePage.js",
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: entries,
  outdir: OUT,
  bundle: true,
  format: "iife",
  target: "chrome116",
  sourcemap: false,
  minify: false,
  define: { __DEV_BUILD__: String(DEV), __KONVENE_BUILD__: String(KONVENE) },
  logLevel: "info",
});

// Transcription: the engine is a separate file, read only when someone presses Transcribe. It is an ES module because the
// libraries inside it use import.meta. The ONNX Runtime files it needs are copied next to it, so nothing is fetched at run time.
await build({
  entryPoints: { engine: "src/transcription/transformersEngine.js" },
  outdir: `${OUT}/transcribe`,
  bundle: true,
  format: "esm",
  target: "chrome116",
  define: { __DEV_BUILD__: String(DEV) },
  logLevel: "info",
});
mkdirSync(`${OUT}/transcribe/ort`, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `${OUT}/transcribe/ort/${f}`);
}

cpSync("static", OUT, { recursive: true });

// The manifest takes its version from package.json and its Konvene match patterns from the same
// origin list the code uses (src/domain/sites/konveneOrigins.json), so neither is written down twice.
const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8"));
manifest.version = pkg.version;
const origins = KONVENE ? JSON.parse(readFileSync("src/domain/sites/konveneOrigins.json", "utf8")) : [];
const devOrigins = DEV ? JSON.parse(readFileSync("src/domain/sites/konveneDevOrigins.json", "utf8")) : [];
const shareOrigins = JSON.parse(readFileSync("src/domain/sites/callSites.json", "utf8"))
  // Only the sites whose shared sound has been tried on a real call get the page scripts (see callSites.json).
  .filter((site) => site.shareSound)
  .flatMap((site) => site.origins);
const matchesOf = (list) => list.map((o) => `${o}/*`);
// The Konvene badge bridge runs on Konvene only. Share watching also runs on the other call sites we know.
if (KONVENE) manifest.content_scripts[0].matches = matchesOf([...origins, ...devOrigins]);
else manifest.content_scripts = manifest.content_scripts.filter((script) => !script.js.includes("konveneBridge.js"));
for (const script of manifest.content_scripts.filter((s) => !s.js.includes("konveneBridge.js")))
  script.matches = matchesOf([...origins, ...shareOrigins, ...devOrigins]);
if (DEV) manifest.name += " (dev)";
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

// RNNoise runs in an AudioWorklet and needs its wasm and worklet files served from the extension
const wns = "node_modules/@sapphi-red/web-noise-suppressor/dist";
mkdirSync(`${OUT}/vendor/rnnoise`, { recursive: true });
cpSync(`${wns}/rnnoise/workletProcessor.js`, `${OUT}/vendor/rnnoise/rnnoiseWorklet.js`);
for (const f of ["rnnoise.wasm", "rnnoise_simd.wasm"]) cpSync(`${wns}/${f}`, `${OUT}/vendor/rnnoise/${f}`);

// Konvene's brand fonts, served from the extension itself (nothing is fetched from the web)
const fonts = "node_modules/@fontsource-variable";
mkdirSync(`${OUT}/fonts`, { recursive: true });
cpSync(`${fonts}/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2`, `${OUT}/fonts/instrument-sans-latin-wdth-normal.woff2`);
cpSync(
  `${fonts}/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2`,
  `${OUT}/fonts/bricolage-grotesque-latin-opsz-normal.woff2`,
);
cpSync("THIRD_PARTY_NOTICES.txt", `${OUT}/THIRD_PARTY_NOTICES.txt`);

console.log(`Built ${pkg.name} ${pkg.version} into ${OUT}/`);
