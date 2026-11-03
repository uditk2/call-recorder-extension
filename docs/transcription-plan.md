# Plan: free transcripts, on the user's own computer

Status: built on the `transcription` branch (version 0.2.0), tested, not merged and not published. We wait until the first store version (Call Recorder for Google Meet 0.1.0) is approved and live, then release 0.2 from that branch. See "What was built" below.

## Goal

After a recording is saved, the user presses **Transcribe** in the library and gets the text of the call. It runs in the browser, on their machine. Nothing is uploaded and it costs nothing.

## What we decided

- **Engine:** Whisper, run through whisper.cpp compiled to WebAssembly. Same model as faster-whisper, so the accuracy is the same. faster-whisper itself is Python and does not run in a browser.
- **Where it shows:** each recording in the library gets a **Transcribe** button and a **Transcript** tab. The tab shows the text with timestamps, a copy button and a download as a text file.
- **First version stays simple.** One model, one pass, a progress bar and an honest note that it can take a while. The product is free, so patience is acceptable. Our rough guess is about 80 minutes for one hour of call on an ordinary laptop. This is an estimate and must be measured.
- **Skip silence first.** Split the audio into chunks, measure the volume of each, and do not send silent chunks to Whisper. Our recorder already measures levels. This also stops Whisper inventing words on silence.
- **No small language model in the first version.** Using one to judge disputed text is possible later, and only if testing shows it helps.
- **Pick the model by the machine.** A smaller model on a weak or 8 GB machine, a bigger one when there is room.

## Later steps, in this order

1. **Chunks with overlap.** Chunks of 30 seconds to a few minutes with 10 to 15 seconds of overlap. This gives a progress bar and lets a crash resume. It does not make the job faster by itself.
2. **Merge the overlaps by words, not only by time.** Whisper's timestamps are approximate. Find the text both chunks share and cut inside the overlap. Where the two versions disagree, either keep the text from the middle of each chunk, or re-run only that stretch and keep the version it matches.
3. **Two or three parallel workers**, each with its own copy of the model. Expect about two times faster, not three. The number of workers depends on memory.
4. **Hint Whisper with the previous chunk's text and a list of names.** This fixes many errors without another model.
5. **Optional small language model** to choose between two candidate versions of a stretch. It would never write new text. It is an optional download of a gigabyte or more, and weak on less common languages.
6. **Skipping repeated chunks** (for example hold music). Low priority, real calls rarely repeat exactly.

## Languages

Whisper's multilingual models detect the language on their own, so the user does not have to pick one. English-only models cannot detect anything. The multilingual tiny and base models are less accurate than the English-only ones, and Hindi and other languages with less training data need a small model or larger. Open decision: ship a multilingual model by default, or English-only by default with a multilingual download on request. Keep language on automatic with a manual override.

## Modular design

Same shape as the rest of the code: a port, and an adapter behind it, so each piece can be swapped without touching the others.

- `TranscriptionEngine` (port): takes audio, returns text segments with times. `WhisperCppEngine` is the first adapter. Another engine, for example WebGPU based, can replace it later.
- `ModelStore`: downloads a model once, keeps it in the browser's own storage, asks Chrome to keep it, and reports progress.
- `SilenceSplitter`: turns audio into chunks and marks the silent ones. Pure functions, easy to test.
- `TranscriptMerger`: joins chunk results (arrives with the overlap step).
- `TranscriptStore`: saves the transcript next to the recording's entry, so reopening is instant.
- Library UI: the button, progress and the Transcript tab. It only talks to the port.
- The engine runs in the offscreen document, like the recorder, and the library talks to it through the existing typed RPC.

## Privacy and store changes (before shipping)

This is the first time the extension would make a network request, if the model is downloaded on first use. So, in the same change:

- Update `docs/privacy.html` (from `store/privacy-policy.md`): say what is downloaded, from where, and that no audio, text or recording ever leaves the computer.
- Update the store disclosures and the listing description.
- Decide between two ways to get the model:
  1. **Download on first use.** Smaller package, but needs a network permission for the model's host, so the install warning and the review may change. The model is data, not code, so "remote code" stays No.
  2. **Bundle the model in the package.** No network request and no new permission, but a larger package (tens of megabytes for tiny).
- Add whisper.cpp and the model to `THIRD_PARTY_NOTICES.txt` with their licences.
- Confirm the manifest needs no new permission for running the WebAssembly. The content security policy already allows it for noise reduction.

## Things to verify before promising anything

- Model sizes (the tiny English model is roughly 40 to 75 MB depending on the build). Check the exact files.
- Real speed on a normal laptop, with the real recordings. Time one recording and scale up.
- Whether WebAssembly threads and shared memory work in an extension page, which needs the right page isolation settings.
- Whether WebGPU is worth adding as a fallback-first speed boost. It can be several times faster in Chrome, but drivers vary.
- The quality of the multilingual models on Hindi, using our own recordings.

## Not doing

- Compiling faster-whisper's engine (CTranslate2) to WebAssembly. It is a research project and whisper.cpp already gives the same models in the browser.
- Hand-writing the engine in WebAssembly. Only a measured hot spot, such as the big matrix multiplications, would be worth hand-tuning, and only after measuring.
- Any cloud service. Nothing is uploaded.

## What was built (branch `transcription`)

- **Engine changed from whisper.cpp to Transformers.js.** Both run the same Whisper model in the browser. We timed both in the same real Chromium extension page on the same 14 second clip with the tiny English model: whisper.cpp WebAssembly took about 28 seconds, Transformers.js (ONNX Runtime Web, 8 bit) about 4. Engines stay swappable behind `TranscriptionEngine`, so whisper.cpp can come back if it gets faster.
- **Model** (8 bit ONNX, from huggingface.co, downloaded once and kept in the browser's cache): base multilingual (77 MB), for everyone. The tiny English (41 MB) and small multilingual (249 MB) entries stay in the catalog so the choice can change in one place.
- **Silence is skipped.** `speechPlanner` measures the loudness of the audio, finds speech, and packs it into windows of at most 28 seconds, cut at pauses. Each window is sent to Whisper alone, and times are put back on the recording's own clock. This replaced chunks with overlap, because windows cut at pauses need no merging.
- **Progress, a time estimate and Stop** work window by window.
- **Library:** a Transcribe button on saved recordings, and a Transcripts tab with Open, copy, save as text, save as subtitles (.srt), transcribe again and delete. Transcripts live in `chrome.storage.local`.
- **Nothing to choose.** One model for everyone (multilingual base, 77 MB) that detects the language by itself. Pressing Transcribe starts at once. A page cannot read Downloads by itself, so Chrome has to be told once which folder it may read. The setup page has an optional third step, "Transcripts", that asks for it up front (the "Call Recordings" folder in Downloads, or the output folder already chosen), and pressing Transcribe without it shows the same request, naming the folder, as a pop-up over the library. The setup page is now called Settings, so the folder can be changed later. Recordings saved to a chosen output folder use that folder's access.
- **A folder for each recording.** New recordings are saved as `Call Recordings/call-.../call-....mp4`, and the transcript is saved in the same folder as `transcript.txt`, with subtitles named after the video (`call-....srt`) so players like VLC load them by themselves. Older recordings stay where they are and get `<name>-transcript.txt` beside them.
- **The one-time download is explained** on the page when it happens: the model is needed so the recording can be turned into text on the computer instead of being uploaded.
- **Runs in the library page, not the offscreen document.** The model runs in ONNX Runtime's own worker, so the page stays responsive, but the tab has to stay open until it finishes.
- **No new permission, and no manifest changes.** Hugging Face allows downloads from other origins, so no host permission is needed.
- **The model runs on one thread.** Extra threads need the extension's pages to be cross-origin isolated (`cross_origin_embedder_policy` and `cross_origin_opener_policy` in the manifest). We tried it, and with those keys Chrome fails to start tab capture ("Error starting tab capture"). The keys apply to every extension page, including the recorder's offscreen document, so they are not allowed. `scripts/validate.mjs` now fails the build if they come back. Model speed on one thread is still fine (see below).
- **Package size.** The package grows from under 1 MB to about 28 MB, mostly the ONNX Runtime WebAssembly file. The models are not in the package.

Measured on a small two core test machine, one model thread, tiny English: a 63 second Meet recording took 23 seconds in total, and 100 seconds of speech with long silences took 16 seconds. The base model took 36 seconds on the same recording and got the names and the sentence about the video right. Your own computer will differ, so measure on it.

## Still to do

- Run in the background so the library tab can be closed.
- Try WebGPU as a faster path with WebAssembly as the fallback.
- Very long calls: decoding a whole file at once uses memory. Decode in pieces for calls of several hours.
- Hint Whisper with names, and test the multilingual models on Hindi with our own recordings.
- Optional later: a small language model to judge doubtful stretches.
