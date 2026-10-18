import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { JOURNAL_FILE, type JournalLine } from "../../shared/recordingJournal.ts";

/**
 * Writes sessao.jsonl (shared/recordingJournal.ts) as things happen. Lines reach the file at once
 * (writeSync); they reach the disk at pauses, markers, failures and the stop, and every five
 * seconds otherwise, so a crash costs at most five seconds of journal. Writing never throws: a
 * journal that cannot be written (disk full, drive gone) must not stop the take or its stop;
 * the first error is kept and reported once through `onError`.
 */

const SYNC_EVERY_MS = 5000;
/** Lines that go to the disk right away. */
const DURABLE = new Set<JournalLine["k"]>([
  "begin",
  "pause",
  "marker",
  "fail",
  "stop",
  "finalized",
]);

/** Where the lines go; the file by default, something else in tests. */
export interface JournalWriter {
  write(text: string): void;
  sync(): void;
  close(): void;
}

function fileWriter(path: string): JournalWriter {
  const fd = openSync(path, "a");
  return {
    write: (text) => {
      writeSync(fd, text);
    },
    sync: () => fsyncSync(fd),
    close: () => closeSync(fd),
  };
}

export class SessionJournal {
  readonly path: string;
  /** The first write that failed, if any. */
  error: Error | null = null;
  private writer: JournalWriter | null;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly onError: (error: Error) => void;
  private dirty = false;

  constructor(
    dir: string,
    onError: (error: Error) => void = () => undefined,
    writer?: JournalWriter,
  ) {
    this.path = join(dir, JOURNAL_FILE);
    this.onError = onError;
    this.writer = writer ?? fileWriter(this.path);
    this.timer = setInterval(() => this.sync(), SYNC_EVERY_MS);
  }

  write(line: JournalLine): void {
    this.attempt(() => {
      this.writer?.write(`${JSON.stringify(line)}\n`);
      this.dirty = true;
    });
    if (DURABLE.has(line.k)) this.sync();
  }

  sync(): void {
    if (!this.dirty) return;
    this.attempt(() => {
      this.writer?.sync();
      this.dirty = false;
    });
  }

  close(): void {
    clearInterval(this.timer);
    this.sync();
    const writer = this.writer;
    this.writer = null;
    if (writer) this.attempt(() => writer.close());
  }

  /** Runs a write; a failure is kept, reported the first time, and the take goes on. */
  private attempt(work: () => void): void {
    try {
      work();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (this.error) return;
      this.error = error;
      this.onError(error);
    }
  }
}
