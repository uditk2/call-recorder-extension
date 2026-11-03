<p align="center"><img src="static/icons/icon-128.png" width="96" height="96" alt="Call Recorder logo"></p>

# Call Recorder

A free, open source Chrome extension that records web calls (Google Meet and any call in a browser tab) to a file on your own computer. It captures the call, your microphone and the sound of a screen or tab you share. No server, no account, nothing uploaded.

- Clear voice, with noise reduction that runs on your computer.
- Small files, and long calls never fill your memory.
- Recording starts only when you press Start.

## Install

Not on the Chrome Web Store yet. Build it and load it:

```sh
git clone https://github.com/uditk2/call-recorder-extension
cd call-recorder-extension
npm install
npm run build
```

Open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked** and pick the `dist/` folder.

## More

[Design](docs/design.md) · [Implementation plan](docs/implementation-plan.md) · [Development notes](docs/development.md) · [Publishing](store/SUBMIT.md)

## Licence

AGPL-3.0. See `LICENSE`.
