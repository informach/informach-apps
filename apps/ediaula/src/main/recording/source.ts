import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Writable } from "node:stream";
import type { MediaSource } from "../../shared/recordingJournal.ts";
import { qpc } from "../nativeHelper.ts";

/**
 * One FFmpeg process recording one source (screen, microphone or camera) into one part file.
 * It reads FFmpeg's progress (frame, out_time_us, speed) to know when the first sample came in:
 * a sample `out_time` into the output was produced `out_time` after the first, so the earliest
 * `qpc - out_time` seen, less what the input itself holds back, is when the first sample was
 * taken. Each restart of a source is a new CaptureProcess and a new part.
 */

export interface CaptureProgress {
  /** Frames written (0 for sound). */
  frame: number;
  /** Seconds of output written. */
  outTime: number;
  /** Encoding speed against real time since the start (FFmpeg's own); 0 until it knows. */
  speed: number;
  /** Frames FFmpeg duplicated or dropped to keep the output's timing. */
  dup: number;
  drop: number;
  /** QPC milliseconds when this was reported. */
  at: number;
}

/** Window of the instantaneous speed. */
const RATE_WINDOW_MS = 1500;

interface CaptureEvents {
  /** The first-sample estimate improved (QPC milliseconds). */
  first: [number];
  progress: [CaptureProgress];
  /** stdout: the level meter's samples. */
  data: [Buffer];
  /** pipe:3, when asked for: the 16 kHz copy the teleprompter follows. */
  follow: [Buffer];
  /** The process ended; `expected` when it was asked to. */
  exit: [{ expected: boolean; message: string }];
}

/** Waiting this long for "q" to be obeyed, then the process is killed. */
export const STOP_TIMEOUT_MS = 8000;
/** A source that has not produced anything after this long is not going to. */
export const START_TIMEOUT_MS = 15000;

export interface CaptureProcessOptions {
  source: MediaSource;
  part: number;
  /** File name inside the take's folder. */
  file: string;
  ffmpeg: string;
  args: string[];
  /** Milliseconds the input holds a sample before FFmpeg gets it. */
  latency?: number;
  /** Open a fourth pipe (FFmpeg's pipe:3) and pass what comes through it as `follow`. */
  followPipe?: boolean;
}

export class CaptureProcess extends EventEmitter<CaptureEvents> {
  readonly source: MediaSource;
  readonly part: number;
  readonly file: string;
  /** Best estimate of the first sample, QPC milliseconds; null before the first report. */
  first: number | null = null;
  last: CaptureProgress | null = null;
  /** Resolves when the process is gone, whatever the reason. */
  readonly done: Promise<void>;
  /** It had to be killed: its file may end in a broken fragment. */
  forced = false;
  private readonly child: ChildProcess;
  private readonly stdin: Writable;
  private readonly latency: number;
  private stopping = false;
  private ended = false;
  private stderr = "";
  private pending = "";
  private block: Partial<CaptureProgress> = {};
  /** Recent reports, for the speed of the last moments. */
  private readonly recent: CaptureProgress[] = [];

  constructor(o: CaptureProcessOptions) {
    super();
    this.source = o.source;
    this.part = o.part;
    this.file = o.file;
    this.latency = o.latency ?? 0;
    this.child = spawn(o.ffmpeg, o.args, {
      windowsHide: true,
      stdio: o.followPipe ? ["pipe", "pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    const { stdin, stdout, stderr } = this.child;
    const follow = o.followPipe ? this.child.stdio[3] : null;
    if (!stdin || !stdout || !stderr) throw new Error("O FFmpeg abriu sem os canais de saída.");
    this.stdin = stdin;
    stdout.on("data", (chunk: Buffer) => this.emit("data", chunk));
    stderr.on("data", (chunk: Buffer) => this.read(chunk.toString()));
    // A process that died fails its stdin before "close"; the close handler reports it.
    stdin.on("error", (error) => {
      this.stderr = `${this.stderr}\n${error.message}`.slice(-8000);
    });
    if (follow) {
      follow.on("data", (chunk: Buffer) => this.emit("follow", chunk));
      // A broken follow pipe only ends the following; the error joins what FFmpeg said.
      follow.on("error", (error: Error) => {
        this.stderr = `${this.stderr}\n${error.message}`.slice(-8000);
      });
    }
    this.done = new Promise((resolve) => {
      let reported = false;
      const end = (message: string): void => {
        if (reported) return;
        reported = true;
        this.ended = true;
        // Whatever a listener does, whoever waits for the process is released.
        try {
          this.emit("exit", { expected: this.stopping, message });
        } finally {
          resolve();
        }
      };
      this.child.once("error", (error) => end(error.message));
      this.child.once("close", (code, signal) =>
        end(this.errorText() || `o FFmpeg saiu (${code ?? signal})`),
      );
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get running(): boolean {
    return !this.ended;
  }

  /**
   * Resolves at the first progress report with output; rejects if the process ends before, or
   * if nothing comes within `timeout` (a device that hangs while opening), killing it then.
   */
  started(timeout = START_TIMEOUT_MS): Promise<void> {
    if (this.first !== null) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("first", onFirst);
        this.off("exit", onExit);
        void this.kill();
        reject(new Error(`não começou a gravar em ${Math.round(timeout / 1000)} s`));
      }, timeout);
      const onFirst = (): void => {
        clearTimeout(timer);
        this.off("exit", onExit);
        resolve();
      };
      const onExit = ({ message }: { message: string }): void => {
        clearTimeout(timer);
        this.off("first", onFirst);
        reject(new Error(message));
      };
      this.once("first", onFirst);
      this.once("exit", onExit);
    });
  }

  /** Asks FFmpeg to finish the file ("q"); kills it if it has not ended after the timeout. */
  async stop(timeout = STOP_TIMEOUT_MS): Promise<void> {
    if (this.ended) return;
    this.stopping = true;
    if (this.stdin.writable) this.stdin.write("q");
    const timer = setTimeout(() => {
      this.forced = true;
      this.child.kill("SIGKILL");
    }, timeout);
    await this.done;
    clearTimeout(timer);
  }

  /** Ends the process at once (the file keeps what its fragments already hold). */
  async kill(): Promise<void> {
    if (this.ended) return;
    this.stopping = true;
    this.forced = true;
    this.child.kill("SIGKILL");
    await this.done;
  }

  /**
   * Output seconds per second over the last moments (FFmpeg's own speed averages the whole run
   * and hides a recent slowdown); null until there are two reports far enough apart.
   */
  instantSpeed(): number | null {
    const last = this.recent.at(-1);
    const first = this.recent[0];
    if (!last || !first || last.at - first.at < RATE_WINDOW_MS / 2) return null;
    return ((last.outTime - first.outTime) * 1000) / (last.at - first.at);
  }

  /** The last lines FFmpeg wrote that are not progress. */
  private errorText(): string {
    return this.stderr
      .split(/\r?\n/)
      .filter((line) => line.trim() && !/^\w+=/.test(line))
      .slice(-4)
      .join("\n");
  }

  private read(text: string): void {
    this.stderr = (this.stderr + text).slice(-8000);
    this.pending += text;
    const lines = this.pending.split(/\r?\n/);
    this.pending = lines.pop() ?? "";
    for (const line of lines) {
      const m = /^(\w+)=\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const [, key, value] = m;
      if (key === "frame") this.block.frame = Number(value) || 0;
      else if (key === "out_time_us") this.block.outTime = Number(value) / 1e6 || 0;
      else if (key === "speed") this.block.speed = Number.parseFloat(value) || 0;
      else if (key === "dup_frames") this.block.dup = Number(value) || 0;
      else if (key === "drop_frames") this.block.drop = Number(value) || 0;
      else if (key === "progress") this.report();
    }
  }

  private report(): void {
    const at = qpc();
    const progress: CaptureProgress = {
      frame: this.block.frame ?? 0,
      outTime: this.block.outTime ?? 0,
      speed: this.block.speed ?? 0,
      dup: this.block.dup ?? 0,
      drop: this.block.drop ?? 0,
      at,
    };
    this.block = {};
    this.last = progress;
    this.recent.push(progress);
    while (this.recent.length > 2 && at - this.recent[0].at > RATE_WINDOW_MS) this.recent.shift();
    if (progress.outTime > 0) {
      // Delays only make this later, so the earliest one is the closest.
      const estimate = at - progress.outTime * 1000 - this.latency;
      if (this.first === null || estimate < this.first - 0.5) {
        this.first = estimate;
        this.emit("first", estimate);
      }
    }
    this.emit("progress", progress);
  }
}
