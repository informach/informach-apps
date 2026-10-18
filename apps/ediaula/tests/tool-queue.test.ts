import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolQueue } from "../src/shared/toolQueue.ts";

/** A task that runs until `release()` is called, recording when it starts and ends. */
function gate(log: string[], name: string) {
  let release = (): void => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    task: async (): Promise<string> => {
      log.push(`${name}+`);
      await done;
      log.push(`${name}-`);
      return name;
    },
    release: () => release(),
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("writes and proposals run one at a time, in the order they came", async () => {
  const queue = createToolQueue();
  const log: string[] = [];
  const a = gate(log, "w1");
  const b = gate(log, "w2");
  const first = queue.run("write", a.task);
  const second = queue.run("write", b.task);
  await tick();
  assert.deepEqual(log, ["w1+"], "the second write waits");
  a.release();
  await first;
  await tick();
  assert.deepEqual(log, ["w1+", "w1-", "w2+"]);
  b.release();
  assert.equal(await second, "w2");
});

test("reads run side by side but wait for the write in progress", async () => {
  const queue = createToolQueue();
  const log: string[] = [];
  const r1 = gate(log, "r1");
  const r2 = gate(log, "r2");
  const reads = [queue.run("read", r1.task), queue.run("read", r2.task)];
  await tick();
  assert.deepEqual(log, ["r1+", "r2+"], "two reads at once");
  const w = gate(log, "w");
  const write = queue.run("write", w.task);
  const r3 = gate(log, "r3");
  const late = queue.run("read", r3.task);
  await tick();
  assert.ok(!log.includes("w+"), "a write waits for the reads already running");
  r1.release();
  r2.release();
  await Promise.all(reads);
  await tick();
  assert.ok(log.includes("w+"));
  assert.ok(!log.includes("r3+"), "a read after the write waits for it");
  w.release();
  await write;
  await tick();
  assert.ok(log.includes("r3+"));
  r3.release();
  await late;
});

test("a failing call does not hold the queue", async () => {
  const queue = createToolQueue();
  await assert.rejects(
    queue.run("write", async () => {
      throw new Error("falhou");
    }),
    /falhou/,
  );
  assert.equal(await queue.run("write", async () => "depois"), "depois");
  assert.equal(await queue.run("read", async () => "leitura"), "leitura");
});
