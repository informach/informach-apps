import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FollowWindow, lineEndHeard, wavBytes } from "../shared/voiceFollow.ts";

/**
 * The teleprompter following the teacher's voice in a "Só voz" take. The microphone's 16 kHz
 * branch fills a rolling window (shared/voiceFollow.ts); whenever the recognizer is free it hears
 * the newest stretch, and when the last words of the line on screen come back the recorder is
 * told to move on. whisper-server keeps the model loaded between stretches; without it, each
 * stretch runs whisper-cli. Nothing here can hold the take back: audio that arrives while the
 * recognizer is busy is skipped, and a machine that cannot keep up turns the following off (the
 * shortcuts still move the lines).
 */

export type FollowState = "starting" | "listening" | "slow" | "unavailable" | "off";

export interface FollowEngine {
  /** whisper-cli.exe; whisper-server.exe is looked for beside it. */
  cli: string;
  model: string;
  /** The CPU build runs without the GPU flags. */
  cpu: boolean;
}

export interface FollowOptions {
  engine: FollowEngine;
  /** Text of each teleprompter line, by index. */
  lines: readonly string[];
  language: string;
  onLineDone: (index: number) => void;
  onState: (state: FollowState, message: string) => void;
}

/** A stretch that takes longer than this to recognize is late; three in a row is too slow. */
const LATE_MS = 3500;
const LATE_LIMIT = 3;
const IDLE_MS = 250;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export class VoiceFollower {
  private readonly o: FollowOptions;
  private readonly window = new FollowWindow();
  private current = 0;
  private busy = false;
  private stopped = false;
  private paused = false;
  private late = 0;
  private server: ChildProcess | null = null;
  private port = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private temp: string | null = null;
  /** The newest sample heard by the last stretch: the next one waits for new sound. */
  private heardUntil = 0;

  constructor(o: FollowOptions) {
    this.o = o;
  }

  /** Starts the recognizer; resolves once it can listen (or it fell back to the CLI). */
  async start(): Promise<void> {
    this.o.onState("starting", "Preparando o teleprompter para acompanhar a voz…");
    const serverBin = join(dirname(this.o.engine.cli), "whisper-server.exe");
    if (existsSync(serverBin))
      try {
        await this.startServer(serverBin);
      } catch (error) {
        this.server?.kill();
        this.server = null;
        console.warn("[follow] whisper-server indisponível, usando whisper-cli:", error);
      }
    if (this.stopped) return;
    this.temp = await mkdtemp(join(tmpdir(), "ediaula-follow-"));
    this.o.onState("listening", "O teleprompter acompanha a sua voz.");
    this.schedule(0);
  }

  /** The take paused or went on: nothing heard during a pause moves the lines. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

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
    this.window.newLine(at);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.server?.kill();
    this.server = null;
    const temp = this.temp;
    this.temp = null;
    if (temp)
      void rm(temp, { recursive: true, force: true }).catch((error: unknown) =>
        console.warn("[follow] pasta temporária ficou para trás:", error),
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
    const started = Date.now();
    try {
      const text = await this.recognize(stretch.samples);
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
      // Only if the same line is still on screen (the teacher may have moved it meanwhile).
      const lineText = this.o.lines[line];
      if (!this.stopped && this.current === line && lineText && lineEndHeard(lineText, text))
        this.o.onLineDone(line);
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

  private async recognize(samples: Int16Array): Promise<string> {
    const wav = wavBytes(samples);
    if (this.server) {
      const form = new FormData();
      form.append("file", new Blob([wav], { type: "audio/wav" }), "trecho.wav");
      form.append("response_format", "json");
      form.append("temperature", "0");
      const response = await fetch(`http://127.0.0.1:${this.port}/inference`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`whisper-server respondeu ${response.status}`);
      const body = (await response.json()) as { text?: unknown };
      return typeof body.text === "string" ? body.text : "";
    }
    if (!this.temp) throw new Error("teleprompter encerrado");
    const file = join(this.temp, "trecho.wav");
    await writeFile(file, wav);
    return runCli(this.o.engine, file, this.o.language);
  }

  private async startServer(bin: string): Promise<void> {
    this.port = await freePort();
    const args = [
      "-m",
      this.o.engine.model,
      "--host",
      "127.0.0.1",
      "--port",
      String(this.port),
      "-l",
      this.o.language,
      "-t",
      "4",
      "-nt",
      ...(this.o.engine.cpu ? ["-ng"] : []),
    ];
    const child = spawn(bin, args, { windowsHide: true, cwd: dirname(bin) });
    this.server = child;
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
    // The model loads before the server answers.
    const until = Date.now() + 30000;
    let last = "";
    while (Date.now() < until && !this.stopped) {
      if (exit.message) throw new Error(exit.message);
      // Refused until the model is loaded: tried again until it answers or the time is up.
      const answer = await fetch(`http://127.0.0.1:${this.port}/`, {
        signal: AbortSignal.timeout(1000),
      }).then(
        (r) => r.ok,
        (error: unknown) => {
          last = error instanceof Error ? error.message : String(error);
          return false;
        },
      );
      if (answer) return;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`whisper-server não respondeu em 30 s${last ? ` (${last})` : ""}`);
  }
}

/** One stretch through whisper-cli: the text it prints. */
function runCli(engine: FollowEngine, file: string, language: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-m", engine.model, "-f", file, "-l", language, "-nt", "-np", "-t", "4"];
    if (engine.cpu) args.push("-ng");
    const child = spawn(engine.cli, args, { windowsHide: true, cwd: dirname(engine.cli) });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(err.trim().split("\n").at(-1) || `whisper-cli saiu com ${code}`)),
    );
  });
}

/** The fastest model installed for listening live (tiny, base, small), else the chosen one. */
export function liveModel(
  models: readonly { name: string; path: string }[],
  chosen: { path: string } | null,
): string | null {
  for (const size of ["tiny", "base", "small"]) {
    const m = models.find((x) => x.name.toLowerCase().startsWith(size));
    if (m) return m.path;
  }
  return chosen?.path ?? null;
}
