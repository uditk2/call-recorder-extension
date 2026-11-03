<p align="center"><img src="static/icons/icon-128.png" width="96" height="96" alt="Call Recorder logo"></p>

# Call Recorder

A free, open source Chrome extension that records web calls (Google Meet and any call in a browser tab) to a file on your own computer. It captures the call, your microphone and the sound of a screen or tab you share. No server, no account, nothing uploaded.

- Clear voice, with noise reduction that runs on your computer.
- Small files, and long calls never fill your memory.
- Recording starts only when you press Start.

## Install

**From the Chrome Web Store:** coming soon.

**From source:**

```sh
git clone https://github.com/uditk2/call-recorder-extension
cd call-recorder-extension
npm install
npm run build
```

Open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked** and pick the `dist/` folder.

## Commands

```sh
npm install
npm run check         # unit tests, store build, store validation
npm run build         # the extension, in dist/
npm run build:dev     # dist-dev/, also trusts http://localhost:8790. Load this one while developing
npm run smoke         # loads dist-dev/ into a real Chromium and runs the whole engine with synthetic inputs
npm run package       # store zip in store/package/ (builds, validates, zips)
npm run store:assets  # screenshots, promo tile and privacy-policy.html in store/
```

## FAQ

**Can I record a Google Meet call in Chrome?** Yes. Open the call tab, click the extension, confirm you told everyone, and press Start. On Meet, the sound of a screen or tab you share is recorded too, while it is shared.

**Does it upload my recordings?** No. There is no server. Files go to `Downloads/Call Recordings`, or to a folder you choose.

**Does it work for Zoom, Teams or Slack calls?** Only the web versions in a Chrome tab. Desktop apps are not recorded.

**Is it legal to record a call?** In many places you need everyone's consent. The extension asks you to confirm that you told everyone, but the responsibility is yours.

**Does it record my voice clearly?** Yes. Your microphone is cleaned with RNNoise, a small noise model that runs on your computer, and the audio is encoded at a bitrate that keeps speech clear.
