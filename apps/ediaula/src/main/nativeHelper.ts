import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { release, uptime } from "node:os";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { HelperCommands } from "../shared/guidedNative.ts";
import {
  type DisplayList,
  type HookCommand,
  type HookEvent,
  type HookReady,
  type InputReply,
  inputReplySchema,
  type LoopbackEvent,
  listSchema,
  parseHookLine,
  parseLoopbackLine,
} from "../shared/helperProtocol.ts";
import { PROCESS_LOOPBACK_BUILD, windowsBuild } from "../shared/systemAudio.ts";
import { nativeResourcePath } from "./native-resources.ts";

/**
 * The native helper (resources/native/ediaula-helper.exe, sources in native/helper): monitor
 * listing, the cursor and key hook of the recorder, and the guided recording's input driver.
 */

export const helperPath = (): string => nativeResourcePath("native/ediaula-helper.exe");

/** Same clock as the helper: QueryPerformanceCounter, in milliseconds. */
export const qpc = (): number => Number(process.hrtime.bigint()) / 1e6;

export function listDisplays(executable = helperPath()): Promise<DisplayList> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      ["list"],
      { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 ** 2 },
      (error, stdout) => {
        if (error) {
          reject(new Error("Não consegui listar as telas.", { cause: error }));
          return;
        }
        try {
          resolve(listSchema.parse(JSON.parse(stdout)));
        } catch (cause) {
          reject(new Error("A lista de telas veio fora do formato esperado.", { cause }));
        }
      },
    );
  });
}

/** Resolves when the process has exited, or after `timeout` ms if it does not. */
function exited(child: ChildProcessWithoutNullStreams, timeout: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export interface HookOptions {
  /** Also log shortcut and navigation keys (never plain typing). */
  keys?: boolean;
  /** Log the moments something is typed ("ty"): never the key, at most one every half second. */
  typing?: boolean;
  /** Directory for cursor.jsonl and the cursor images; restarts append to the same file. */
  journal?: string;
  /** Keys typed while this process owns the foreground window are not logged. */
  uiPid?: number;
  caret?: boolean;
  /** Start outside a recorded segment: no clicks, wheel or keys until "resume". */
  paused?: boolean;
  executable?: string;
  /** Automated tests only: events carrying this mark are recorded and withheld from other apps. */
  testTag?: number;
  /**
   * Where the windows raised above the others are noted while they are (in the app's profile):
   * if the app and the helper both go down, the next start puts them back (restoreRaisedWindows).
   */
  raisedFile?: string;
}

/** The windows a helper raised, as noted in the profile, and when. */
interface RaisedNote {
  at: number;
  windows: string[];
}

/**
 * Puts back the windows noted in `file` by a run that went down before it could (the app and its
 * helper killed together). Only a note from since the computer started counts: after a restart
 * the handles mean other windows. The note goes either way.
 */
export async function restoreRaisedWindows(
  file: string,
  executable = helperPath(),
  now = Date.now(),
  bootedAt = now - uptime() * 1000,
): Promise<string[]> {
  let note: RaisedNote;
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    note = raisedNoteSchema.parse(value);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    rmSync(file, { force: true });
    return [];
  }
  rmSync(file, { force: true });
  if (note.at < bootedAt || !note.windows.length) return [];
  return new Promise<string[]>((resolve, reject) =>
    execFile(
      executable,
      ["unfront", ...note.windows],
      { windowsHide: true, timeout: 10000 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Não consegui devolver janelas à ordem normal: ${error.message}`));
          return;
        }
        const line = /\{"e":"unfront".*\}/.exec(stdout)?.[0];
        resolve(line ? unfrontLineSchema.parse(JSON.parse(line)).hwnds : []);
      },
    ),
  );
}

const raisedNoteSchema = z.strictObject({
  at: z.number().finite(),
  windows: z.array(z.string().regex(/^-?\d{1,20}$/)).max(64),
});
const unfrontLineSchema = z.strictObject({ e: z.literal("unfront"), hwnds: z.array(z.string()) });

interface HookClientEvents {
  event: [HookEvent];
  restart: [{ reason: string; count: number }];
  failure: [Error];
  protocolError: [string];
  warning: [string];
}

const HEARTBEAT_TIMEOUT = 2000;
const RESTART_WINDOW = 60000;
const MAX_RESTARTS = 3;
/**
 * Startup and pipe latency stay far below this; only another clock (not QueryPerformanceCounter)
 * would be off by more.
 */
const CLOCK_TOLERANCE = 5000;
const EXIT_WAIT = 2000;

/**
 * Runs the hook mode and keeps it alive: validates every line, restarts the helper (at most three
 * times a minute) when it exits or its heartbeat is late by more than 2 s, and sends the current
 * filters again after each start. Lines of a helper being replaced still count until it closes.
 * Windows a dead helper raised above the others are put back. A permanent failure is reported
 * through "failure".
 */
export class HookClient extends EventEmitter<HookClientEvents> {
  private child: ChildProcessWithoutNullStreams | undefined;
  /** Helpers being stopped or replaced: their last lines still count. */
  private readonly draining = new Set<ChildProcessWithoutNullStreams>();
  /** Windows the helpers raised and have not put back yet. */
  private readonly raised = new Set<string>();
  private alive = false;
  private paused: boolean;
  private lastBeat = 0;
  private lastCheck = 0;
  private monitor: ReturnType<typeof setInterval> | undefined;
  private restarts: number[] = [];
  private stopping = false;
  private stderr = "";
  private readonly commands = new Map<string, HookCommand>();
  private readonly options: HookOptions;
  invalidLines = 0;
  failure: Error | undefined;

  constructor(options: HookOptions = {}) {
    super();
    this.options = options;
    this.paused = !!options.paused;
  }

  get restartCount(): number {
    return this.restarts.length;
  }

  /** Starts the helper and resolves with its READY line. */
  async start(): Promise<HookReady> {
    const ready = await this.launch();
    this.lastCheck = qpc();
    this.monitor = setInterval(() => this.checkHeartbeat(), 500);
    return ready;
  }

  /** Sends a command now and again after any restart; "front" is kept per window. */
  send(command: HookCommand): void {
    const key =
      command.cmd === "front"
        ? `front:${command.hwnd}`
        : command.cmd === "pause" || command.cmd === "resume"
          ? "segment"
          : command.cmd;
    if (command.cmd === "pause" || command.cmd === "resume") this.paused = command.cmd === "pause";
    if (command.cmd === "front" && !command.on) this.commands.delete(key);
    else this.commands.set(key, command);
    this.write(command);
  }

  /** Closes stdin so the helper writes what is left, then waits for it to exit. */
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.monitor);
    const child = this.child;
    this.child = undefined;
    this.alive = false;
    if (child && child.exitCode === null && child.signalCode === null) {
      this.draining.add(child);
      const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      await closed;
      clearTimeout(timer);
    }
    // A helper that had to be killed could not put its windows back.
    await this.unfront();
  }

  /** Ends the helper without waiting for its last lines; resolves once the process is gone. */
  async kill(): Promise<void> {
    this.stopping = true;
    clearInterval(this.monitor);
    this.alive = false;
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
      child.kill();
      await closed;
    }
    await this.unfront();
  }

  private write(command: HookCommand): void {
    if (this.child && this.alive) this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  /** Notes the raised windows in the profile, or takes the note away when there are none. */
  private noteRaised(): void {
    const file = this.options.raisedFile;
    if (!file) return;
    try {
      if (this.raised.size) {
        const note: RaisedNote = { at: Date.now(), windows: [...this.raised] };
        writeFileSync(file, JSON.stringify(note));
      } else rmSync(file, { force: true });
    } catch (error) {
      this.emit(
        "warning",
        `Não consegui anotar as janelas na frente: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Puts back the windows a helper raised and can no longer restore itself. */
  private async unfront(): Promise<void> {
    if (!this.raised.size) return;
    const windows = [...this.raised];
    this.raised.clear();
    this.noteRaised();
    await new Promise<void>((resolve) =>
      execFile(
        this.options.executable ?? helperPath(),
        ["unfront", ...windows],
        { windowsHide: true, timeout: 10000 },
        (error) => {
          if (error)
            this.emit("warning", `Não consegui devolver janelas à ordem normal: ${error.message}`);
          resolve();
        },
      ),
    );
  }

  private launch(): Promise<HookReady> {
    const o = this.options;
    const args = [
      "hook",
      ...(o.keys ? ["--keys"] : []),
      ...(o.typing ? ["--typing"] : []),
      ...(o.caret ? ["--caret"] : []),
      ...(this.paused ? ["--paused"] : []),
      ...(o.journal ? ["--journal", o.journal] : []),
      ...(o.uiPid ? ["--ui-pid", String(o.uiPid)] : []),
      ...(o.testTag ? ["--test-tag", String(o.testTag)] : []),
    ];
    const child = spawn(o.executable ?? helperPath(), args, { windowsHide: true });
    this.child = child;
    this.alive = false;
    this.stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    // A dead helper fails the pipe before "close" arrives; the close handler restarts it.
    child.stdin.on("error", (error) => {
      this.stderr = `${this.stderr}\n${error.message}`.slice(-4000);
    });
    const lines = createInterface({ input: child.stdout });
    return new Promise<HookReady>((resolve, reject) => {
      let started = false;
      const fail = (error: Error): void => {
        if (started) return;
        started = true;
        clearTimeout(timer);
        // Whoever called launch decides what comes next; this process no longer counts.
        if (this.child === child) {
          this.child = undefined;
          this.alive = false;
        }
        child.kill();
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error("O capturador de cursor não iniciou.")), 8000);
      lines.on("line", (line) => {
        if (this.child !== child && !this.draining.has(child)) return;
        const event = parseHookLine(line);
        if (!event) {
          this.invalidLines++;
          this.emit("protocolError", line);
          return;
        }
        if (event.e === "ready") {
          if (Math.abs(event.t - qpc()) > CLOCK_TOLERANCE) {
            fail(new Error("O relógio do capturador de cursor não confere com o da gravação."));
            return;
          }
          started = true;
          clearTimeout(timer);
          this.alive = true;
          this.lastBeat = qpc();
          for (const command of this.commands.values()) this.write(command);
          resolve(event);
        } else if (event.e === "hb") this.lastBeat = qpc();
        else if (event.e === "front") {
          if (event.on) this.raised.add(event.hwnd);
          else this.raised.delete(event.hwnd);
          this.noteRaised();
        }
        this.emit("event", event);
      });
      child.once("error", (error) =>
        fail(new Error("O capturador de cursor não pôde ser aberto.", { cause: error })),
      );
      child.once("close", (code, signal) => {
        this.draining.delete(child);
        const reason = `o capturador de cursor foi encerrado (${code ?? signal})${this.stderr ? `: ${this.stderr.trim()}` : ""}`;
        if (!started) fail(new Error(`O capturador de cursor não iniciou: ${reason}.`));
        else if (this.child === child) this.recover(reason);
      });
    });
  }

  private checkHeartbeat(): void {
    const now = qpc();
    // If our own event loop was blocked, let the pending lines through before judging the helper.
    const stalled = now - this.lastCheck > 1500;
    this.lastCheck = now;
    if (stalled || !this.alive || this.stopping) return;
    if (now - this.lastBeat > HEARTBEAT_TIMEOUT)
      this.recover("o capturador de cursor parou de responder por mais de 2 s");
  }

  private recover(reason: string): void {
    if (this.stopping || this.failure) return;
    const previous = this.child;
    this.child = undefined;
    this.alive = false;
    const now = qpc();
    this.restarts = this.restarts.filter((at) => now - at < RESTART_WINDOW);
    if (this.restarts.length >= MAX_RESTARTS) {
      this.failure = new Error(`O capturador de cursor parou: ${reason}.`);
      clearInterval(this.monitor);
      this.emit("failure", this.failure);
      void this.retire(previous).then(() => this.unfront());
      return;
    }
    this.restarts.push(now);
    this.emit("restart", { reason, count: this.restarts.length });
    void this.relaunch(previous);
  }

  /** Ends a helper being replaced, keeping its last lines until it closes. */
  private async retire(previous: ChildProcessWithoutNullStreams | undefined): Promise<void> {
    if (!previous) return;
    this.draining.add(previous);
    previous.kill();
    await exited(previous, EXIT_WAIT);
  }

  /**
   * The old process must be gone before the new one opens the same journal, and the windows it
   * raised go back before the new one raises them again.
   */
  private async relaunch(previous: ChildProcessWithoutNullStreams | undefined): Promise<void> {
    await this.retire(previous);
    await this.unfront();
    if (this.stopping || this.failure) return;
    try {
      await this.launch();
    } catch (error) {
      this.recover(error instanceof Error ? error.message : String(error));
    }
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The input mode, driving the guided recording. One instance per guided session. */
export class InputClient implements HelperCommands {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private readonly ready: Promise<void>;
  private serial = 0;
  private dead = false;

  constructor(executable = helperPath(), testTag?: number) {
    this.child = spawn(executable, ["input", ...(testTag ? ["--test-tag", String(testTag)] : [])], {
      windowsHide: true,
    });
    const lines = createInterface({ input: this.child.stdout });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("O controle do mouse não respondeu."));
        this.close();
      }, 5000);
      lines.on("line", (line) => {
        let reply: InputReply;
        try {
          reply = inputReplySchema.parse(JSON.parse(line));
        } catch {
          this.close(new Error("O controle do mouse respondeu fora do protocolo."));
          return;
        }
        if ("ready" in reply) {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (typeof reply.id !== "number") return;
        const p = this.pending.get(reply.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(reply.id);
        if (reply.ok) p.resolve(reply.result);
        else p.reject(new Error(reply.error));
      });
      const fail = (): void => {
        clearTimeout(timer);
        reject(new Error("Controle do mouse encerrado."));
        this.close();
      };
      this.child.on("error", fail);
      this.child.on("exit", fail);
    });
    // command() rethrows a failed start; this only keeps an unused client from an unhandled rejection.
    void this.ready.catch(() => {});
    this.child.stderr.resume();
    this.child.stdin.on("error", () => this.close());
  }

  async command<T = void>(data: Record<string, unknown>): Promise<T> {
    await this.ready;
    if (this.dead) throw new Error("Automação interrompida.");
    const id = ++this.serial;
    // A glide answers when the movement ends; everything else is immediate.
    const timeout =
      data.op === "glide" && typeof data.duration === "number"
        ? data.duration * (1 - (typeof data.at === "number" ? data.at : 0)) * 1000 + 3000
        : 3000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("O controle do mouse não respondeu."));
        this.close();
      }, timeout);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.child.stdin.write(`${JSON.stringify({ ...data, id })}\n`);
    });
  }

  close(error = new Error("Automação interrompida.")): void {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    // Ending the input lets the helper halt its glide and let go of any button or key it holds;
    // only one that does not exit soon is killed.
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const kill = setTimeout(() => this.child.kill(), 1500);
    this.child.once("exit", () => clearTimeout(kill));
    this.child.stdin.end();
  }
}

// ---- the computer's sound without the app (loopback mode) ----------------------------------

/** The probe worked once in this run: the answer stays. */
let loopbackWorks = false;
/** A probe under way, shared by whoever asks meanwhile. */
let probing: Promise<boolean> | null = null;

/**
 * Whether the helper can capture the computer's sound without the app's own process tree: a
 * Windows with process loopback, and an activation that really works. A yes is kept for the
 * run; a no is asked again next time (the audio service may have been restarting, a device
 * changing), so a passing failure does not cost the native route for the rest of the run.
 */
export function processLoopbackAvailable(executable = helperPath()): Promise<boolean> {
  if (process.platform !== "win32" || windowsBuild(release()) < PROCESS_LOOPBACK_BUILD)
    return Promise.resolve(false);
  if (loopbackWorks) return Promise.resolve(true);
  probing ??= new Promise<boolean>((resolve) => {
    execFile(
      executable,
      ["loopback", "--probe"],
      { windowsHide: true, timeout: 10000 },
      (error, stdout) => resolve(!error && stdout.includes('"aprobe"')),
    );
  }).then((ok) => {
    probing = null;
    if (ok) loopbackWorks = true;
    return ok;
  });
  return probing;
}

interface LoopbackClientEvents {
  /** The file's first sample, QPC ms. */
  first: [number];
  /** Every 500 ms while it records: frames written so far. */
  beat: [Extract<LoopbackEvent, { e: "ahb" }>];
  /** The end of the last sample, QPC ms, after a clean stop. */
  end: [number];
  /** The capture stopped on its own (the reason, in Portuguese). */
  failure: [Error];
}

export interface LoopbackOptions {
  /** The process whose whole tree is left out (the app's main process). */
  excludePid: number;
  /** WAV file the helper writes. */
  file: string;
  executable?: string;
}

/**
 * The loopback mode as one source of a take: started, then stopped by closing its stdin (the
 * helper drains its packets, fills the file up to that moment and writes its real header).
 * Lines that do not parse are ignored; an exit nobody asked for is a "failure".
 */
export class LoopbackClient extends EventEmitter<LoopbackClientEvents> {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stopping = false;
  private stderr = "";
  private closed: Promise<void> = Promise.resolve();
  private readonly options: LoopbackOptions;
  /** Frames the helper wrote, from its last line. */
  frames = 0;

  constructor(options: LoopbackOptions) {
    super();
    this.options = options;
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null && this.child.signalCode === null;
  }

  /** Starts the helper and resolves once the capture runs. */
  start(): Promise<void> {
    const o = this.options;
    const child = spawn(
      o.executable ?? helperPath(),
      ["loopback", "--exclude-pid", String(o.excludePid), "--out", o.file],
      { windowsHide: true },
    );
    this.child = child;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    child.stdin.on("error", () => undefined);
    this.closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const lines = createInterface({ input: child.stdout });
    return new Promise<void>((resolve, reject) => {
      let started = false;
      let failed: string | undefined;
      const timer = setTimeout(() => {
        if (started) return;
        started = true;
        child.kill();
        reject(new Error("A captura do áudio do PC não iniciou."));
      }, 8000);
      lines.on("line", (line) => {
        const event = parseLoopbackLine(line);
        if (!event) return;
        if (event.e === "aready") {
          started = true;
          clearTimeout(timer);
          resolve();
        } else if (event.e === "afirst") this.emit("first", event.t);
        else if (event.e === "ahb") {
          this.frames = event.n;
          this.emit("beat", event);
        } else if (event.e === "aend") {
          this.frames = event.n;
          this.emit("end", event.t);
        } else failed = event.msg;
      });
      child.once("error", (error) => {
        if (started) return;
        started = true;
        clearTimeout(timer);
        reject(new Error("O auxiliar de áudio não pôde ser aberto.", { cause: error }));
      });
      child.once("close", (code, signal) => {
        const reason = failed ?? (this.stderr.trim() || `código ${code ?? signal}`);
        if (!started) {
          started = true;
          clearTimeout(timer);
          reject(new Error(`A captura do áudio do PC não iniciou: ${reason}`));
        } else if (!this.stopping) this.emit("failure", new Error(reason));
      });
    });
  }

  /** Ends the capture at this moment and waits for the file to be complete. */
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || !this.running) return this.closed;
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000);
    await this.closed;
    clearTimeout(timer);
  }

  /** Ends it without waiting for the rest of the file (the take is thrown away). */
  async kill(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (child && this.running) child.kill();
    await this.closed;
  }
}
