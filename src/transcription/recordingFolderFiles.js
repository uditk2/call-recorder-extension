import { messageOf } from "../domain/errors.js";
import { toPlainText, toSrt } from "../domain/transcription/transcript.js";

/**
 * Saves a transcript as text and subtitles next to its recording. A recording in a folder of its own gets transcript.txt and
 * transcript.srt. An older recording that sits straight in the recordings folder gets files named after it.
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
    const names = inRoot ? [`${stem}-transcript.txt`, `${stem}-transcript.srt`] : ["transcript.txt", "transcript.srt"];
    try {
      await this.access.writeNextTo(root, record, names[0], toPlainText(transcript.segments, { timestamps: true }));
      await this.access.writeNextTo(root, record, names[1], toSrt(transcript.segments));
    } catch (e) {
      throw new Error(`The transcript files could not be saved: ${messageOf(e)}`);
    }
    return names;
  }
}
