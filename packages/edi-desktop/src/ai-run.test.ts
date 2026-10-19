import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type EngineEvent, runToText, startRun, stopRun } from "./ai-run.ts";

const child = join(import.meta.dirname, "..", "fixtures", "ai", "engine-child", "child.mjs");
const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const launch = { command: process.execPath, args: [child], env: {} };

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function gone(pid: number, ms = 10_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !alive(pid);
}

interface Probe {
  argv: string[];
  input: string;
  grandchild: number;
}
const probeOf = (json: Record<string, unknown>): Probe => ({
  argv: Array.isArray(json.argv) ? json.argv.map(String) : [],
  input: String(json.input),
  grandchild: Number(json.grandchild),
});

// The process tree is ended the Windows way (taskkill /T), the only system the suite runs on.
const notWindows = process.platform !== "win32";

describe("a run of a client", () => {
  it.skipIf(notWindows)(
    "sends the message on standard input, never on the command line",
    async () => {
      const prompt = 'corte & del /q C:\\* | calc > x %PATH%\n-x --dangerously-skip-permissions "';
      const events: EngineEvent[] = [];
      let probe: Probe | undefined;
      let cleaned = 0;
      await startRun({
        conversationId: "c-stdin",
        launch,
        args: ["-p", "--output-format", "stream-json"],
        env,
        cwd: import.meta.dirname,
        prompt,
        emit: (e) => events.push(e),
        onLine: (json, stop) => {
          probe = probeOf(json);
          stop();
        },
        onExit: () => {},
        cleanup: () => {
          cleaned++;
        },
      });
      expect(probe?.input).toBe(prompt);
      expect(probe?.argv).toEqual(["-p", "--output-format", "stream-json"]);
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
      expect(cleaned).toBe(1);
      expect(await gone(probe?.grandchild ?? 0), "the grandchild ended with the run").toBe(true);
    },
  );

  it.skipIf(notWindows)(
    "stops at once: token revoked, whole tree ended, turn done once",
    async () => {
      const events: EngineEvent[] = [];
      let cleaned = 0;
      let grandchild = 0;
      let started: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const run = startRun({
        conversationId: "c-stop",
        launch,
        args: [],
        env,
        cwd: import.meta.dirname,
        prompt: "oi",
        emit: (e) => events.push(e),
        onLine: (json) => {
          grandchild = probeOf(json).grandchild;
          started();
        },
        onExit: () => {},
        cleanup: () => {
          cleaned++;
        },
      });
      await ready;
      expect(stopRun("c-stop")).toBe(true);
      // The token is gone and the turn is done before the processes even finish exiting.
      expect(cleaned).toBe(1);
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
      await run;
      expect(await gone(grandchild), "the grandchild did not survive the stop").toBe(true);
      expect(stopRun("c-stop"), "nothing left to stop").toBe(false);
      expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    },
  );

  it.skipIf(notWindows)("ends a run that goes past its time limit", async () => {
    const events: EngineEvent[] = [];
    let cleaned = 0;
    let grandchild = 0;
    await startRun({
      conversationId: "c-timeout",
      launch,
      args: [],
      env,
      cwd: import.meta.dirname,
      prompt: "oi",
      emit: (e) => events.push(e),
      onLine: (json) => {
        grandchild = probeOf(json).grandchild;
      },
      onExit: () => {},
      cleanup: () => {
        cleaned++;
      },
      timeoutMs: 1500,
      timeoutMessage: "Tempo limite atingido.",
    });
    expect(events).toContainEqual({ type: "error", message: "Tempo limite atingido." });
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    expect(cleaned).toBe(1);
    expect(await gone(grandchild)).toBe(true);
  });

  it("ends the turn once, with an error, when the program cannot start", async () => {
    const events: EngineEvent[] = [];
    let cleaned = 0;
    await startRun({
      conversationId: "c-missing",
      launch: { command: join(import.meta.dirname, "no-such-program.exe"), args: [], env: {} },
      args: [],
      env,
      cwd: import.meta.dirname,
      prompt: "oi",
      emit: (e) => events.push(e),
      onLine: () => {},
      onExit: () => {},
      cleanup: () => {
        cleaned++;
      },
    });
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    expect(cleaned).toBe(1);
  });
});

describe("a one-shot answer", () => {
  const echo = {
    command: process.execPath,
    args: [
      "-e",
      "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.stringify({got:s}))})",
    ],
    env: {},
  };

  it("reads the prompt from standard input and returns the whole output", async () => {
    const out = await runToText({
      launch: echo,
      args: [],
      env,
      cwd: import.meta.dirname,
      prompt: "a & b | c",
      signal: new AbortController().signal,
      timeoutMs: 30_000,
    });
    expect(JSON.parse(out)).toEqual({ got: "a & b | c" });
  });

  it("is refused with the reason given by the line check, and by cancelling", async () => {
    const wait = { ...echo, args: ["-e", "console.log('{}');setInterval(()=>{},1000)"] };
    await expect(
      runToText({
        launch: wait,
        args: [],
        env,
        cwd: import.meta.dirname,
        prompt: "",
        signal: new AbortController().signal,
        timeoutMs: 30_000,
        onLine: (_line, stop) => stop("agiu fora"),
      }),
    ).rejects.toThrow("agiu fora");
    const cancel = new AbortController();
    cancel.abort();
    await expect(
      runToText({
        launch: wait,
        args: [],
        env,
        cwd: import.meta.dirname,
        prompt: "",
        signal: cancel.signal,
        timeoutMs: 30_000,
      }),
    ).rejects.toThrow("Cancelado");
  });
});
