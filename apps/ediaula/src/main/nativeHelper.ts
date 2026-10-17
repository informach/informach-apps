import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { GuidedDriver } from "../shared/guidedRunner.ts";
import {
  type DisplayList,
  type HookCommand,
  type HookEvent,
  type HookReady,
  type InputReply,
  inputReplySchema,
  listSchema,
  parseHookLine,
} from "../shared/helperProtocol.ts";
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
        if (error) reject(new Error("Não consegui listar as telas.", { cause: error }));
        else resolve(listSchema.parse(JSON.parse(stdout)));
      },
    );
  });
}

export interface HookOptions {
  /** Also log shortcut and navigation keys (never plain typing). */
  keys?: boolean;
  /** Directory for cursor.jsonl and the cursor images; restarts append to the same file. */
  journal?: string;
  /** Keys typed while this process owns the foreground window are not logged. */
  uiPid?: number;
  caret?: boolean;
  executable?: string;
  /** Automated tests only: events carrying this mark are recorded and withheld from other apps. */
  testTag?: number;
}

interface HookClientEvents {
  event: [HookEvent];
  restart: [{ reason: string; count: number }];
  failure: [Error];
  protocolError: [string];
}

const HEARTBEAT_TIMEOUT = 2000;
const RESTART_WINDOW = 60000;
const MAX_RESTARTS = 3;
const CLOCK_TOLERANCE = 500;

/**
 * Runs the hook mode and keeps it alive: validates every line, restarts the helper (at most three
 * times a minute) when it exits or its heartbeat is late by more than 2 s, and sends the current
 * filters again after each start. A permanent failure is reported through "failure".
 */
export class HookClient extends EventEmitter<HookClientEvents> {
  private child: ChildProcessWithoutNullStreams | undefined;
  /** The helper being stopped: its last lines still count. */
  private draining: ChildProcessWithoutNullStreams | undefined;
  private alive = false;
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
    const key = command.cmd === "front" ? `front:${command.hwnd}` : command.cmd;
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
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    this.draining = child;
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000);
    await closed;
    clearTimeout(timer);
  }

  /** Ends the helper without waiting for its last lines; resolves once the process is gone. */
  async kill(): Promise<void> {
    this.stopping = true;
    clearInterval(this.monitor);
    this.alive = false;
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.kill();
    await closed;
  }

  private write(command: HookCommand): void {
    if (this.child && this.alive) this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  private launch(): Promise<HookReady> {
    const o = this.options;
    const args = [
      "hook",
      ...(o.keys ? ["--keys"] : []),
      ...(o.caret ? ["--caret"] : []),
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
        if (this.child === child || this.draining === child) this.emit("event", event);
      });
      child.once("error", (error) =>
        fail(new Error("O capturador de cursor não pôde ser aberto.", { cause: error })),
      );
      child.once("close", (code, signal) => {
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
    previous?.kill();
    const now = qpc();
    this.restarts = this.restarts.filter((at) => now - at < RESTART_WINDOW);
    if (this.restarts.length >= MAX_RESTARTS) {
      this.failure = new Error(`O capturador de cursor parou: ${reason}.`);
      clearInterval(this.monitor);
      this.emit("failure", this.failure);
      return;
    }
    this.restarts.push(now);
    this.emit("restart", { reason, count: this.restarts.length });
    this.launch().catch((error: Error) => this.recover(error.message));
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The input mode, driving the guided recording. One instance per guided session. */
export class InputClient implements GuidedDriver {
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
    this.child.kill();
  }
}
