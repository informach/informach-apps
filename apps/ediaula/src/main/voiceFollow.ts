import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import {
  FOLLOW_RATE,
  FollowWindow,
  type HeardWord,
  isWhisperServer,
  lineDoneAt,
  serverWords,
  wavBytes,
} from "../shared/voiceFollow.ts";

/**
 * The teleprompter following the teacher's voice in a "Só voz" take. The microphone's 16 kHz
 * branch fills a rolling window (shared/voiceFollow.ts); whenever the recognizer is free it hears
 * the newest stretch, and when the last words of the line on screen come back (said after the
 * line appeared) the recorder is told to move on, with the moment that last word ended. Nothing
 * here can hold the take back: audio that arrives while the recognizer is busy is skipped, and a
 * machine that cannot keep up turns the following off (the shortcuts still move the lines).
 *
 * The recognizer is the engine's whisper-server, which keeps the model loaded: running
 * whisper-cli for each stretch took 8 to 13 s per stretch here (b5454, CPU), far too slow to
 * follow anyone. The server listens on 127.0.0.1 only, on a port drawn at random, and lives only
 * while a voice take records; its pid is kept so one left behind by a crash is ended at the next
 * start. Its `--request-path` and `--inference-path` options would hide the endpoint, but in
 * b5454 every path answers 404 once either is set (tried on this build), so they are not used.
 */

export type FollowState = "starting" | "listening" | "slow" | "unavailable" | "off";

export interface FollowEngine {
  /** whisper-server.exe of the installed engine (checked with the rest of its folder). */
  server: string;
  model: string;
  /** The CPU build runs without the GPU. */
  cpu: boolean;
}

export interface FollowOptions {
  engine: FollowEngine;
  /** Text of each teleprompter line, by index. */
  lines: readonly string[];
  language: string;
  /** Where the server's pid is kept while it runs. */
  pidFile: string;
  /** The line `index` ended at QPC `at` (the end of its last word). */
  onLineDone: (index: number, at: number) => void;
  onState: (state: FollowState, message: string) => void;
}

/** A stretch that takes longer than this to recognize is late; three in a row is too slow. */
const LATE_MS = 3500;
const LATE_LIMIT = 3;
const IDLE_MS = 250;
/** Ports tried before giving up (one may be taken by another program). */
const PORT_TRIES = 3;

const run = promisify(execFile);

/** Ends a whisper-server a crash left running (only if that pid is still a whisper-server). */
export async function endOrphanServer(pidFile: string): Promise<void> {
  let pid: number;
  try {
    pid = Number((await readFile(pidFile, "utf8")).trim());
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (Number.isInteger(pid) && pid > 0) {
    const { stdout } = await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      windowsHide: true,
    });
    if (/whisper-server\.exe/i.test(stdout))
      try {
        process.kill(pid);
      } catch (error) {
        // Gone in between: nothing left to end.
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
  }
  await rm(pidFile, { force: true });
}

export class VoiceFollower {
  private readonly o: FollowOptions;
  private readonly window = new FollowWindow();
  private current = 0;
  /** When the line on screen appeared (QPC ms): only words said after it count. */
  private lineAt = 0;
  private busy = false;
  private stopped = false;
  private paused = false;
  private late = 0;
  private server: ChildProcess | null = null;
  private port = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The newest sample heard by the last stretch: the next one waits for new sound. */
  private heardUntil = 0;

  constructor(o: FollowOptions) {
    this.o = o;
  }

  /** Starts the recognizer; resolves once it listens. */
  async start(): Promise<void> {
    this.o.onState("starting", "Preparando o teleprompter para acompanhar a voz…");
    await endOrphanServer(this.o.pidFile);
    let failure: unknown;
    for (let i = 0; i < PORT_TRIES && !this.stopped; i++)
      try {
        await this.startServer(randomInt(20000, 60000));
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
        this.killServer();
      }
    if (failure) throw failure;
    if (this.stopped) return;
    this.o.onState("listening", "O teleprompter acompanha a sua voz.");
    this.schedule(0);
  }

  /** The take paused or went on: nothing heard during a pause moves the lines. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** 16-bit samples of the branch; `at` is the QPC moment of the last one. */
  feed(chunk: Buffer, at: number): void {
    if (this.stopped) return;
    // A copy aligned for 16-bit samples (a Buffer may start at an odd offset).
    const samples = new Int16Array(Math.floor(chunk.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = chunk.readInt16LE(i * 2);
    this.window.push(samples, at);
  }

  /** The teleprompter is on `index` since `at` (QPC ms). */
  setLine(index: number, at: number): void {
    this.current = index;
    this.lineAt = at;
    this.window.newLine(at);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.killServer();
  }

  private killServer(): void {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.kill();
    void rm(this.o.pidFile, { force: true }).catch((error: unknown) =>
      console.warn("[follow] o pid do servidor ficou para trás:", error),
    );
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => void this.pump(), ms);
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.busy) return;
    const stretch = this.paused ? null : this.window.take();
    if (!stretch || stretch.end <= this.heardUntil) {
      this.schedule(IDLE_MS);
      return;
    }
    this.busy = true;
    const line = this.current;
    const lineAt = this.lineAt;
    const started = Date.now();
    try {
      const words = await this.recognize(stretch.samples);
      this.heardUntil = stretch.end;
      const took = Date.now() - started;
      this.late = took > LATE_MS ? this.late + 1 : 0;
      if (this.late >= LATE_LIMIT) {
        this.o.onState(
          "slow",
          "A transcrição ao vivo não acompanha nesta máquina: o teleprompter segue pelo atalho.",
        );
        this.stop();
        return;
      }
      // Only if the same line is still on screen.
      const lineText = this.o.lines[line];
      const at = lineText ? lineDoneAt(lineText, words, stretch.start, lineAt) : null;
      if (!this.stopped && this.current === line && at !== null) this.o.onLineDone(line, at);
    } catch (error) {
      if (this.stopped) return;
      this.o.onState(
        "unavailable",
        `A transcrição ao vivo parou (${error instanceof Error ? error.message : String(error)}): o teleprompter segue pelo atalho.`,
      );
      this.stop();
      return;
    } finally {
      this.busy = false;
    }
    this.schedule(0);
  }

  private async recognize(samples: Int16Array): Promise<HeardWord[]> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([wavBytes(samples, FOLLOW_RATE)], { type: "audio/wav" }),
      "trecho.wav",
    );
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    const response = await fetch(`http://127.0.0.1:${this.port}/inference`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`whisper-server respondeu ${response.status}`);
    return serverWords(await response.json());
  }

  private async startServer(port: number): Promise<void> {
    this.port = port;
    const bin = this.o.engine.server;
    const args = [
      "-m",
      this.o.engine.model,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "-l",
      this.o.language,
      "-t",
      "4",
      ...(this.o.engine.cpu ? ["-ng"] : []),
    ];
    const child = spawn(bin, args, { windowsHide: true, cwd: dirname(bin) });
    this.server = child;
    if (child.pid) {
      await mkdir(dirname(this.o.pidFile), { recursive: true });
      await writeFile(this.o.pidFile, String(child.pid));
    }
    const exit: { message?: string } = {};
    child.stdout?.resume();
    let tail = "";
    child.stderr?.on("data", (d: Buffer) => {
      tail = (tail + d.toString()).slice(-2000);
    });
    child.on("exit", (code) => {
      exit.message = tail.trim().split("\n").at(-1) || `código ${code}`;
      if (this.server === child && !this.stopped) {
        this.server = null;
        this.o.onState(
          "unavailable",
          "A transcrição ao vivo parou: o teleprompter segue pelo atalho.",
        );
        this.stop();
      }
    });
    // The model loads before the server answers its routes.
    const until = Date.now() + 30000;
    let last = "";
    while (Date.now() < until && !this.stopped) {
      if (exit.message) throw new Error(exit.message);
      // Refused until the server listens: tried again until it answers or the time is up. Only
      // our own server counts: the one this process started, still running, answering as
      // whisper.cpp (another program on the port would otherwise be sent the microphone).
      const answer = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      }).then(
        async (response) =>
          response.ok && isWhisperServer(response.headers.get("server"), await response.text()),
        (error: unknown) => {
          last = error instanceof Error ? error.message : String(error);
          return false;
        },
      );
      if (answer && this.server === child && child.exitCode === null) return;
      if (answer === false && !last) last = "outro programa respondeu nesta porta";
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`whisper-server não respondeu em 30 s${last ? ` (${last})` : ""}`);
  }
}

/**
 * The lightest checked model installed for listening live (the published "small"), else the
 * one chosen for transcription. Models of C:\whisper-cpp are only offered when the person chose
 * to list them (main/whisper.ts), and are never picked here on their own.
 */
export function liveModel<M extends { name: string; path: string; unchecked?: boolean }>(
  models: readonly M[],
  chosen: M | null,
): M | null {
  for (const size of ["tiny", "base", "small"]) {
    const m = models.find((x) => x.name.toLowerCase().startsWith(size) && !x.unchecked);
    if (m) return m;
  }
  return chosen;
}
