# Release 0.2: transcripts (draft, not published)

Do not paste any of this into the store until the transcription branch is merged and 0.1.0 is live.

## What changes in the store

- **New package:** `npm run package` on the branch. About 28 MB unzipped, because it carries the ONNX Runtime WebAssembly file. The Whisper models are not in the package.
- **Permissions:** none added. `tabCapture`, `offscreen`, `activeTab`, `downloads`, `storage` stay as they are. Host access stays on `meet.google.com`.
- **Manifest:** no new keys. Do not add `cross_origin_embedder_policy` or `cross_origin_opener_policy`: they stop tab capture from starting. The build check blocks them.
- **Remote code:** still No. The model files are data (weights), not code. All code and WebAssembly are in the package.
- **Network:** new. On the first Transcribe the library page downloads the chosen model from huggingface.co. Say so in the listing and in the privacy policy (the policy text is already updated in `store/privacy-policy.md`).
- **Data usage:** unchanged. Nothing about the user is sent. A model download reveals the IP address to Hugging Face, like any download.

## Single purpose (still true)

Record the tab you choose, plus your microphone and any screen or tab you share in the call, into a video file saved on your own computer. Transcribing that recording on the same computer is part of the same purpose.

## Lines to add to the listing description

Add under "What you get":

- Transcripts on your own computer. Press Transcribe on a recording and get the text with timestamps. The speech model is downloaded once, then it works offline. Copy it, or save it as text or subtitles. Nothing is uploaded.

## Reviewer notes, added

Transcribe: open the library page from the extension popup, press Transcribe on a saved recording, choose the recording file, and press Start. The first time, the model downloads from huggingface.co. The speech model runs in the page. No audio or text is sent anywhere.

## Before release

- Merge `transcription` into `main` only after 0.1.0 is approved.
- Run `npm run check`, `npm run smoke` and `npm run smoke:transcribe`.
- Run `npm run store:assets` so `docs/privacy.html` carries the new policy.
- Take a new library screenshot that shows the Transcripts tab.
