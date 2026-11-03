import { messageOf } from "../domain/errors.js";
import { toPlainText, toSrt } from "../domain/transcription/transcript.js";

/**
 * Saves a transcript as text and subtitles next to its recording. The subtitles are named after the video (call-x.mp4 and call-x.srt),
 * because players such as VLC load a subtitle file only when it has the video's name. The text is transcript.txt in the recording's own
 * folder, or named after the video for an older recording that sits straight in the recordings folder.
 * @implements {import("../domain/transcription/ports.js").TranscriptFiles}
 */
export class RecordingFolderFiles {
  access;
  constructor(access) {
    this.access = access;
  }
  async save(record, transcript) {
    const root = await this.access.ready(record);
    if (!root) throw new Error("The recordings folder is not available.");
    const { name, inRoot } = await this.access.locate(root, record);
    const stem = name.replace(/\.[^.]+$/, "");
    const names = [inRoot ? `${stem}-transcript.txt` : "transcript.txt", `${stem}.srt`];
    try {
      await this.access.writeNextTo(root, record, names[0], toPlainText(transcript.segments, { timestamps: true }));
      await this.access.writeNextTo(root, record, names[1], toSrt(transcript.segments));
    } catch (e) {
      throw new Error(`The transcript files could not be saved: ${messageOf(e)}`);
    }
    return names;
  }
}
