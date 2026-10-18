import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { startRun, stopRun } from "../src/main/engineRun.ts";
import type { AssistantEvent } from "../src/shared/types.ts";

const child = join(import.meta.dirname, "fixtures", "engine-child", "child.mjs");

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

test("the message goes on standard input, never on the command line", async () => {
  const prompt = 'corte & del /q C:\\* | calc > x %PATH%\n-x --dangerously-skip-permissions "';
  const events: AssistantEvent[] = [];
  let probe: { argv: string[]; input: string; grandchild: number } | undefined;
  let cleaned = 0;
  const run = startRun({
    conversationId: "c-stdin",
    launch: { command: process.execPath, args: [child], env: {} },
    args: ["-p", "--output-format", "stream-json"],
    env: { ...process.env } as Record<string, string>,
    cwd: import.meta.dirname,
    prompt,
    emit: (e) => events.push(e),
    onLine: (json, stop) => {
      probe = json as unknown as typeof probe;
      stop();
    },
    onExit: () => {},
    cleanup: () => {
      cleaned++;
    },
  });
  await run;
  assert.ok(probe);
  assert.equal(probe.input, prompt);
  assert.deepEqual(probe.argv, ["-p", "--output-format", "stream-json"]);
  assert.ok(!probe.argv.some((arg) => arg.includes("calc") || arg.startsWith("-x")));
  assert.equal(events.filter((e) => e.type === "done").length, 1);
  assert.equal(cleaned, 1);
  assert.ok(await gone(probe.grandchild), "the grandchild ended with the run");
});

test("Stop revokes at once, ends the whole process tree and finishes the turn", async () => {
  const events: AssistantEvent[] = [];
  let cleaned = 0;
  let pids: number[] = [];
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const run = startRun({
    conversationId: "c-stop",
    launch: { command: process.execPath, args: [child], env: {} },
    args: [],
    env: { ...process.env } as Record<string, string>,
    cwd: import.meta.dirname,
    prompt: "oi",
    emit: (e) => events.push(e),
    onLine: (json) => {
      pids = [Number((json as { grandchild: number }).grandchild)];
      started();
    },
    onExit: () => {},
    cleanup: () => {
      cleaned++;
    },
  });
  await ready;
  assert.equal(stopRun("c-stop"), true);
  // The token is gone and the turn is done before the processes even finish exiting.
  assert.equal(cleaned, 1);
  assert.equal(events.filter((e) => e.type === "done").length, 1);
  await run;
  assert.ok(await gone(pids[0]), "the grandchild did not survive the stop");
  assert.equal(stopRun("c-stop"), false, "nothing left to stop");
  assert.equal(events.filter((e) => e.type === "done").length, 1, "done only once");
});

test("a program that cannot start still ends the turn once, with an error", async () => {
  const events: AssistantEvent[] = [];
  let cleaned = 0;
  await startRun({
    conversationId: "c-missing",
    launch: { command: join(import.meta.dirname, "no-such-program.exe"), args: [], env: {} },
    args: [],
    env: { ...process.env } as Record<string, string>,
    cwd: import.meta.dirname,
    prompt: "oi",
    emit: (e) => events.push(e),
    onLine: () => {},
    onExit: () => {},
    cleanup: () => {
      cleaned++;
    },
  });
  assert.ok(events.some((e) => e.type === "error"));
  assert.equal(events.filter((e) => e.type === "done").length, 1);
  assert.equal(cleaned, 1);
});
