const TRANSCRIPTS_KEY = "transcripts";

/** Transcripts in chrome.storage.local, one list, written one change at a time (the same way as the recordings list). */
export class KeyValueTranscriptRepository {
  store;
  queue = Promise.resolve();
  /** @param {import("../domain/ports.js").KeyValueStore} store */
  constructor(store) {
    this.store = store;
  }
  all() {
    return this.enqueue(() => this.load());
  }
  async get(recordId) {
    return (await this.all()).find((t) => t.recordId === recordId);
  }
  save(transcript) {
    return this.enqueue(async () => {
      const list = (await this.load()).filter((t) => t.recordId !== transcript.recordId);
      list.push(transcript);
      await this.store.set(TRANSCRIPTS_KEY, list);
    });
  }
  remove(recordId) {
    return this.enqueue(async () => {
      const list = await this.load();
      await this.store.set(
        TRANSCRIPTS_KEY,
        list.filter((t) => t.recordId !== recordId),
      );
    });
  }
  async load() {
    return (await this.store.get(TRANSCRIPTS_KEY)) ?? [];
  }
  enqueue(job) {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
