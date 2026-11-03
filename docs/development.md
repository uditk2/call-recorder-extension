# Development notes

The details that used to be in the README.

## Commands

```sh
npm install
npm run check         # unit tests, store build, store validation
npm run build:dev     # dist-dev/, also trusts http://localhost:8790. Load this one while developing
npm run smoke         # loads dist-dev/ into a real Chromium and runs the whole engine with synthetic inputs
npm run package       # store zip in store/package/ (builds, validates, zips)
npm run store:assets  # screenshots, promo tile and privacy-policy.html in store/
```

To try it: open `chrome://extensions`, switch on Developer mode, choose **Load unpacked** and pick `dist-dev/` (or `dist/`).

## How the code is organised

```
src/domain/       rules with no browser code: types, ports (interfaces), codec choice, file names, site adapters
src/application/  the use cases: RecordingController, ExportService, repositories, output writers
src/recorder/     the engine that runs in the offscreen document: RecordingSession and its Web Audio, MediaRecorder and OPFS parts
src/infra/        Chrome adapters that implement the ports (tabs, downloads, offscreen, storage)
src/background/   service worker: the composition root, no decisions
src/ui/           popup, setup and library pages
src/content/      the Konvene bridge content script
src/shared/       typed messaging, formatting, the folder handle store
```

How the principles show up:

- **Single responsibility.** `CodecSelector` only chooses a codec. `RecordingSession` only orders the steps. `ExportService` only copies a finished file out. Each Chrome API has one small adapter.
- **Open for extension.** A new site is one adapter added to `domain/sites/defaultSites.js`. A new codec is one line in `CANDIDATES`. A new destination is a new `OutputWriter`. The recording code does not change for any of them.
- **Liskov.** Every `OutputWriter` and `SiteAdapter` can stand in for another. `FallbackOutputWriter` and `ConfiguredOutputWriter` are built from writers and are writers themselves.
- **Interface segregation.** Ports are small: `ChunkSink`, `Encoder`, `MixBuilder`, `TabMessenger`, `SavedFileGateway`. Nothing depends on methods it does not use.
- **Dependency inversion.** The controller and the session depend on interfaces. Only `background/serviceWorker.js` and `recorder/offscreenMain.js` name real classes.
- **DRY.** One message contract (`shared/api.js`), one config (`config.js`), one origin list shared by code and manifest, one export path used by Stop and by recovery, one site registry that the popup, the controller and the badge all use.

## What is tested

- 80 unit tests on the domain, application and recorder logic, with fakes for every port.
- `npm run smoke` in a real Chromium, including a human-like voice played in as the microphone with noise reduction on: the service worker answers, pages render in the brand fonts and colours, the Konvene bridge confirms (and refuses when the page stays silent), the offscreen engine starts, and the full engine records five seconds of synthetic video and sound to disk, reads it back mid-recording, and plays it.

## Lessons that are now tests

- A recording with video and no voice: RNNoise could not start inside the extension because Chrome's default policy blocks WebAssembly, and it fails silently. The manifest now allows `wasm-unsafe-eval` (the validator insists on it), and the smoke test records a voice. Tones had hidden the problem.
- A saved file named `.txt`: a file read from private storage has no type, and Chrome saves an untyped file as plain text. Files are now typed when handed over, and the smoke test checks it.
- Recordings that sounded swishy and not clear: the recording was AAC at 32 kbps (blocky holes above 3 kHz, nothing above about 9 kHz), and Chrome's own noise suppression ran on top of RNNoise, so speech was cleaned twice. AAC now gets 96 kbps and Opus 48 kbps, the browser's suppression is off whenever RNNoise is on, and the two compressors (which add automatic gain) are replaced by a fixed +3 dB and a soft clip that only touches peaks. Measured with `scripts/audio-quality.py` (PESQ and STOI against the clean voice).
- `npm run probe:audio` (with `SPEECH_WAV=tests/fixtures/voice.wav`) records the same voice several ways and prints how loud each second is, for the next time a recording sounds wrong.

## Not verified yet (needs a person with the real extension)

These cannot be driven by a script, because Chrome only allows them after a real click on the extension icon or with real hardware:

1. Real tab capture on a live call, including that the call stays audible to the user while recording.
2. Sharing a real screen and a real tab in real Google Meet: that the page hook sees the share, that `displaySurface` is reported, and that Meet's own page does not interfere. The smoke test covers the same path with a stand-in call page.
3. Real microphone and echo on speakers (browser echo cancellation should remove the other side from the mic).
4. The H.264 hardware path and AAC audio inside MP4, and that a crash still leaves a playable MP4. The test machine had no hardware H.264, so only the WebM path ran.
5. A chosen output folder: Chrome may ask to allow it again in a new browser session. The code falls back to Downloads, but the prompt flow is untested.
6. A very long recording (an hour) while the service worker saves it. A keep-alive is in place, but it is untested at that length.
7. The Konvene badge inside Konvene's own end-to-end test. The bridge is tested against a stand-in page.

## The Konvene side

The Konvene side of this (the page shows the named recording badge and confirms it before the extension records) lives in Konvene itself: `src/main.js`, `public/privacy.html`, `CHANGELOG.md`.
Without it the extension refuses to record on Konvene.

## Known limits

- Only Konvene's public address is trusted by the bridge. A self-hosted Konvene needs its address added to `src/domain/sites/konveneOrigins.json`.
- One recording at a time.
- Per-voice channels are not built, by decision.
- Licensed under AGPL-3.0, like Konvene. Fonts and RNNoise notices are in `THIRD_PARTY_NOTICES.txt`.

See `store/SUBMIT.md` for putting it on the Chrome Web Store.
