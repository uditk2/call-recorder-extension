# Call Recorder for Google Meet privacy policy

Last updated: 3 November 2026 (release 0.2 draft)

Call Recorder for Google Meet is a Chrome extension that records a browser tab and your microphone to a file on your own computer.
This policy says what it handles and where that data goes. The short version: **it stays on your computer.**

## Who is responsible

Udit Khandelwal. Contact: https://github.com/uditk2/call-recorder-extension/issues

## What the extension handles

- **The recording itself.** When you press Start, the extension captures the video and sound of the tab you chose and the sound from your microphone. If you share a screen or a tab in the call, the sound of what you share is recorded too, and only while you share it. This can include other people's voices and anything shown in the call.
- **Details about each recording.** The time, length, file size, the name of the site (for example "Google Meet"), the tab's title and the file name.
- **Your settings.** Whether setup is done, and the name of the output folder if you chose one.
- **Transcripts.** If you press Transcribe, the text of that recording, made on your computer, is kept in Chrome's local extension storage until you delete it.

## Where it goes

Nowhere outside your computer. The extension has no server and contains no analytics, advertising or tracking. It makes one kind of network request: the first time you press Transcribe, it downloads the speech model you chose (41 to 249 MB) from huggingface.co, and keeps it on your computer. That request is a normal download, so Hugging Face sees your IP address and which model you asked for. No recording, no sound and no text is ever sent. After the download, transcribing works offline. The recording is written to your browser's private storage while it runs, then saved to your Downloads folder (in a "Call Recordings" folder) or to a folder you chose. The details and settings are kept in Chrome's local extension storage.

We do not collect, see, sell or share any of it. Transcripts are made by the model on your computer, not by a service.

## How long it is kept

Until you delete it. You can remove a recording from the library page, delete its file, or delete the file yourself. Uninstalling the extension removes the library, transcripts, downloaded models and settings. Files you saved stay where you saved them until you delete them.

## What each permission is for

- **Tab capture and offscreen document:** to record the tab you chose and keep recording when the popup closes.
- **Active tab:** to read the title and address of the tab you clicked the extension on, and only that tab.
- **Downloads:** to save the recording to your Downloads folder and to show or delete it from the library.
- **Storage:** to keep the library, transcripts and settings on your computer.
- **Page scripts on Google Meet pages only:** when you share a screen or a tab in the call, a small script notices the share and passes its sound to the recorder inside your browser, and only while a recording is running. It does not read the page's text, forms, accounts or messages, and it sends nothing over the network.

## Recording other people

In many places you need everyone's consent to record a call. On Google Meet and other sites the extension asks you to confirm that you have told everyone before it starts. You are responsible for following the law that applies to you.

## Children

The extension is not directed at children and does not knowingly collect anything from them.

## Changes

If this policy changes, the date above changes, and the new version is published at the same address.
