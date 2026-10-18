import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { constants } from "node:os";
import { test } from "node:test";
import { Scheduler } from "../src/main/scheduler.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const LOW = constants.priority.PRIORITY_LOW;
const NORMAL = constants.priority.PRIORITY_NORMAL;

/** Work that runs until released. */
function work(log: string[], name: string) {
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release(),
    run: async () => {
      log.push(`start ${name}`);
      await done;
      log.push(`end ${name}`);
      return name;
    },
  };
}

test("each kind of work has its slots, and a slot is never given to two waiters", async () => {
  const scheduler = new Scheduler({ slots: { proxy: 1 } });
  const log: string[] = [];
  const a = work(log, "a");
  const b = work(log, "b");
  const c = work(log, "c");
  const ra = scheduler.run("proxy", a.run);
  const rb = scheduler.run("proxy", b.run);
  const rc = scheduler.run("proxy", c.run);
  await tick();
  assert.deepEqual(log, ["start a"]);
  assert.equal(scheduler.state().waiting, 2);
  a.release();
  await ra;
  await tick();
  assert.deepEqual(log, ["start a", "end a", "start b"]);
  b.release();
  c.release();
  assert.deepEqual(await Promise.all([rb, rc]), ["b", "c"]);
  assert.equal(scheduler.state().running.proxy, 0);
  // Other kinds are not held by it.
  const k = work(log, "k");
  const rk = scheduler.run("keying", k.run);
  await tick();
  assert.ok(log.includes("start k"));
  k.release();
  await rk;
});

test("hardware encoder sessions are shared by proxies and export segments", async () => {
  const scheduler = new Scheduler({ slots: { proxy: 2, segment: 3, encoder: 2 } });
  const log: string[] = [];
  const proxy = work(log, "proxy");
  const s1 = work(log, "s1");
  const s2 = work(log, "s2");
  const cpu = work(log, "x264");
  const rp = scheduler.run(["proxy", "encoder"], proxy.run);
  const r1 = scheduler.run(["segment", "encoder"], s1.run);
  const r2 = scheduler.run(["segment", "encoder"], s2.run);
  // A segment on the CPU needs no session.
  const rc = scheduler.run("segment", cpu.run);
  await tick();
  assert.deepEqual(log, ["start proxy", "start s1", "start x264"]);
  assert.deepEqual(scheduler.state().running, {
    proxy: 1,
    keying: 0,
    transcription: 0,
    export: 0,
    segment: 2,
    voice: 0,
    motion: 0,
    filmstrip: 0,
    encoder: 2,
  });
  proxy.release();
  await rp;
  await tick();
  assert.ok(log.includes("start s2"), log.join(", "));
  for (const w of [s1, s2, cpu]) w.release();
  await Promise.all([r1, r2, rc]);
  assert.equal(scheduler.state().running.encoder, 0);
});

test("a take holds new work back until it ends, unless the teacher turned that off", async () => {
  const scheduler = new Scheduler();
  const log: string[] = [];
  scheduler.setRecording(true);
  assert.equal(scheduler.state().holding, true);
  const idle = scheduler.waitUntilIdle().then(() => log.push("idle"));
  const t = work(log, "t");
  const rt = scheduler.run("transcription", t.run);
  await tick();
  assert.deepEqual(log, []);
  scheduler.setRecording(false);
  await idle;
  await tick();
  assert.deepEqual([...log].sort(), ["idle", "start t"]);
  t.release();
  await rt;
  // Not held: it starts during the take (at low priority).
  scheduler.setRecording(true, { hold: false });
  const e = work(log, "e");
  const re = scheduler.run("export", e.run);
  await tick();
  assert.ok(log.includes("start e"));
  e.release();
  await re;
  scheduler.setRecording(false);
});

test("waiting work can be cancelled and leaves no slot taken", async () => {
  const scheduler = new Scheduler({ slots: { proxy: 1 } });
  scheduler.setRecording(true);
  const controller = new AbortController();
  const waiting = scheduler.run("proxy", async () => "ran", controller.signal);
  await tick();
  controller.abort(new Error("Cancelado"));
  await assert.rejects(waiting, /Cancelado/);
  scheduler.setRecording(false);
  assert.equal(await scheduler.run("proxy", async () => "next"), "next");
  assert.equal(scheduler.state().waiting, 0);
});

test("children of background work drop to low priority during a take and come back after", () => {
  const calls: [number, number][] = [];
  const scheduler = new Scheduler({ setPriority: (pid, p) => calls.push([pid, p]) });
  const child = (pid: number) => Object.assign(new EventEmitter(), { pid });
  const running = child(101);
  scheduler.track(running);
  assert.deepEqual(calls, []);
  scheduler.setRecording(true);
  assert.deepEqual(calls, [[101, LOW]]);
  // Started during the take: low at once.
  scheduler.track(child(102));
  assert.deepEqual(calls.at(-1), [102, LOW]);
  running.emit("exit");
  scheduler.setRecording(false);
  assert.deepEqual(calls.slice(-1), [[102, NORMAL]]);
  // A process that already ended is reported, not thrown.
  const errors: number[] = [];
  const failing = new Scheduler({
    setPriority: () => {
      throw new Error("ESRCH");
    },
    onPriorityError: (pid) => errors.push(pid),
  });
  failing.track(child(7));
  failing.setRecording(true);
  assert.deepEqual(errors, [7]);
});
