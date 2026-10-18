import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AssistantEvent } from "../shared/types.ts";
import type { Launch } from "./engineArgs.ts";
import { killTree } from "./processTree.ts";

/**
 * One run of Claude Code or Codex for the chat: started without a shell, the message written to
 * its standard input, its JSON lines followed. Whatever happens (the program cannot start,
 * crashes, is stopped by the person or by codexGuard), the turn ends with `done` exactly once
 * and `cleanup` (which revokes the run's token) runs once, as soon as the run is over.
 */
export interface RunSpec {
  conversationId: string;
  launch: Launch;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  /** The message: written to the program's standard input, never into its arguments. */
  prompt: string;
  emit(e: AssistantEvent): void;
  /** One JSON line from the program; `stop` ends the run at once (codexGuard). */
  onLine(json: Record<string, unknown>, stop: () => void): void;
  onExit(code: number | null, stderr: string): void;
  cleanup(): void;
  /** Removes credentials from the program's error output before it is kept. */
  redact?(text: string): string;
}

const running = new Map<string, { stop: () => void }>();

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function startRun(spec: RunSpec, spawn: typeof nodeSpawn = nodeSpawn): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    let cleaned = false;
    let stderr = "";
    let child: ChildProcess | undefined;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      spec.cleanup();
    };
    const finish = (code: number | null): void => {
      if (finished) return;
      finished = true;
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
      const proc = child;
      if (proc)
        void killTree(proc.pid).then((ended) => {
          if (!ended) proc.kill();
        });
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
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(line) as Record<string, unknown>;
        } catch {
          // Clients print progress lines that look like JSON but are not events.
          return;
        }
        spec.onLine(json, stop);
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

/** Stops every run (signing out of the computer). */
export function stopAllRuns(): void {
  for (const run of [...running.values()]) run.stop();
}
