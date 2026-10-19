import { type ChildProcess, execFile, spawn as nodeSpawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Launch } from "./ai-launch.ts";

/**
 * Running the person's Claude Code or Codex: started without a shell, the message written to its
 * standard input, its JSON lines followed, and the whole process tree ended when it stops.
 */

/** What a turn of the assistant tells the panel. Applications may show more kinds of their own. */
export type EngineEvent =
  | { type: "text"; delta: string }
  | {
      type: "tool";
      id: string;
      name: string;
      title: string;
      status: "running" | "done" | "error";
      summary?: string;
    }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "quota"; level: "ok" | "warn" | "blocked"; text: string }
  /** What the turn used: US$ from the API prices, estimated by Claude Code, unknown for Codex. */
  | { type: "usage"; tokens: number; usd?: number; estimated?: boolean };

/**
 * Ends a process and every process it started. The npm and bun launchers of Claude Code and
 * Codex start the real program as a child of their own, so killing only the launcher would leave
 * the program running. On Windows this is `taskkill /T /F`, run without a shell. Resolves true
 * when the process tree was ended (or was already gone).
 */
export function killTree(pid: number | undefined): Promise<boolean> {
  if (!pid) return Promise.resolve(true);
  if (process.platform !== "win32")
    return Promise.resolve(
      (() => {
        try {
          process.kill(pid, "SIGKILL");
          return true;
        } catch (error) {
          return error instanceof Error && "code" in error && error.code === "ESRCH";
        }
      })(),
    );
  return new Promise((resolve) => {
    execFile(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true, timeout: 15_000 },
      (error) => {
        // 128: no such process, it has already exited.
        const code: unknown = error ? Reflect.get(error, "code") : undefined;
        resolve(!error || code === 128);
      },
    );
  });
}

/** Ends the tree of `child`, falling back to the child alone when taskkill could not. */
export const endChild = (child: ChildProcess): void => {
  void killTree(child.pid).then((ended) => {
    if (!ended) child.kill();
  });
};

/**
 * One run of Claude Code or Codex for the chat. Whatever happens (the program cannot start,
 * crashes, is stopped by the person, by the guard or by the time limit), the turn ends with
 * `done` exactly once and `cleanup` (which revokes the run's token) runs once, as soon as the
 * run is over.
 */
export interface RunSpec {
  conversationId: string;
  launch: Launch;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  /** The message: written to the program's standard input, never into its arguments. */
  prompt: string;
  emit(e: EngineEvent): void;
  /** One JSON line from the program; `stop` ends the run at once (codexGuard). */
  onLine(json: Record<string, unknown>, stop: () => void): void;
  onExit(code: number | null, stderr: string): void;
  cleanup(): void;
  /** Removes credentials from the program's error output before it is kept. */
  redact?(text: string): string;
  /** Ends the run with `timeoutMessage` after this long. */
  timeoutMs?: number;
  timeoutMessage?: string;
}

const running = new Map<string, { stop: () => void }>();

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function startRun(spec: RunSpec, spawn: typeof nodeSpawn = nodeSpawn): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    let cleaned = false;
    let stderr = "";
    let child: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      spec.cleanup();
    };
    const finish = (code: number | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (running.get(spec.conversationId)?.stop === stop) running.delete(spec.conversationId);
      cleanup();
      try {
        spec.onExit(code, stderr);
      } finally {
        spec.emit({ type: "done" });
        resolve();
      }
    };
    /** Ends the run now: the token goes first, then the whole process tree. */
    const stop = (): void => {
      if (finished) return;
      cleanup();
      if (child) endChild(child);
      finish(null);
    };
    try {
      child = spawn(spec.launch.command, [...spec.launch.args, ...spec.args], {
        cwd: spec.cwd,
        env: spec.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      spec.emit({ type: "error", message: `Não foi possível iniciar: ${errorText(err)}` });
      finish(null);
      return;
    }
    const proc = child;
    running.get(spec.conversationId)?.stop();
    running.set(spec.conversationId, { stop });
    if (spec.timeoutMs)
      timer = setTimeout(() => {
        spec.emit({
          type: "error",
          message: spec.timeoutMessage ?? "A IA demorou demais para responder.",
        });
        stop();
      }, spec.timeoutMs);
    proc.on("error", (err) => {
      spec.emit({ type: "error", message: `Não foi possível iniciar: ${errorText(err)}` });
      // A program that never started has no "close" to wait for.
      if (proc.pid === undefined) finish(null);
    });
    proc.on("close", (code) => finish(code));
    proc.stderr?.on("data", (d: Buffer) => {
      const text = stderr + d.toString();
      stderr = (spec.redact ? spec.redact(text) : text).slice(-6000);
    });
    if (proc.stdout)
      createInterface({ input: proc.stdout }).on("line", (line) => {
        if (finished || !line.startsWith("{")) return;
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          // Clients print progress lines that look like JSON but are not events.
          return;
        }
        if (json && typeof json === "object" && !Array.isArray(json))
          spec.onLine(json as Record<string, unknown>, stop);
      });
    // A program that exits before reading its input closes the pipe; its exit says why.
    proc.stdin?.on("error", (err) => {
      stderr = `${stderr}\n${errorText(err)}`.slice(-6000);
    });
    proc.stdin?.end(spec.prompt, "utf8");
  });
}

/** Stops the run of a conversation (the Stop button). Returns whether one was running. */
export function stopRun(conversationId: string): boolean {
  const run = running.get(conversationId);
  run?.stop();
  return !!run;
}

/** Whether a conversation has a run going. */
export const isRunning = (conversationId: string): boolean => running.has(conversationId);

/** Stops every run (signing out of the computer). */
export function stopAllRuns(): void {
  for (const run of [...running.values()]) run.stop();
}

/**
 * One answer of a client with no tools, as text: the prompt on standard input, the whole
 * standard output back. Ends the process tree on `signal`, on `timeoutMs` and when `onLine`
 * calls `stop` (rejecting with its reason).
 */
export function runToText(options: {
  launch: Launch;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  onLine?: (line: string, stop: (reason: string) => void) => void;
  spawn?: typeof nodeSpawn;
}): Promise<string> {
  const spawn = options.spawn ?? nodeSpawn;
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(options.launch.command, [...options.launch.args, ...options.args], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      reject(new Error(`Não foi possível iniciar: ${errorText(e)}`));
      return;
    }
    let out = "";
    let err = "";
    let refused: string | null = null;
    const stop = (reason: string): void => {
      refused ??= reason;
      endChild(child);
    };
    const timer = setTimeout(() => stop("A IA demorou demais para responder."), options.timeoutMs);
    const abort = (): void => stop("Cancelado");
    if (options.signal.aborted) abort();
    else options.signal.addEventListener("abort", abort, { once: true });
    if (child.stdout)
      createInterface({ input: child.stdout }).on("line", (line) => {
        out += `${line}\n`;
        options.onLine?.(line, stop);
      });
    child.stderr?.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
      reject(new Error(`Não foi possível iniciar: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
      if (refused) reject(new Error(refused));
      else if (code) reject(new Error(err.trim().split(/\r?\n/).at(-1) || `encerrou com ${code}`));
      else resolve(out);
    });
    child.stdin?.on("error", (e) => {
      err = `${err}\n${e.message}`;
    });
    child.stdin?.end(options.prompt, "utf8");
  });
}
