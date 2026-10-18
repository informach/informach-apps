import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { JOURNAL_FILE, type JournalLine } from "../../shared/recordingJournal.ts";

/**
 * Writes sessao.jsonl (shared/recordingJournal.ts) as things happen. Lines reach the file at once
 * (writeSync); they reach the disk at pauses, markers, failures and the stop, and every five
 * seconds otherwise, so a crash costs at most five seconds of journal.
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

export class SessionJournal {
  readonly path: string;
  private fd: number | null;
  private readonly timer: ReturnType<typeof setInterval>;
  private dirty = false;

  constructor(dir: string) {
    this.path = join(dir, JOURNAL_FILE);
    this.fd = openSync(this.path, "a");
    this.timer = setInterval(() => this.sync(), SYNC_EVERY_MS);
  }

  write(line: JournalLine): void {
    if (this.fd === null) return;
    writeSync(this.fd, `${JSON.stringify(line)}\n`);
    this.dirty = true;
    if (DURABLE.has(line.k)) this.sync();
  }

  sync(): void {
    if (this.fd === null || !this.dirty) return;
    fsyncSync(this.fd);
    this.dirty = false;
  }

  close(): void {
    clearInterval(this.timer);
    if (this.fd === null) return;
    this.sync();
    closeSync(this.fd);
    this.fd = null;
  }
}
