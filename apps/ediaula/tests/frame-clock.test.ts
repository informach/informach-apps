import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameClock } from "../src/shared/frameClock.ts";

/** A clock on a simulated wall clock, writing every frame tick() asks for. */
function simulated(fps: number) {
  let now = 1000;
  const clock = new FrameClock(fps, () => now);
  const written: number[] = [];
  const run = (ms: number, step = 5) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      const n = clock.tick();
      for (let i = 0; i < n; i++) written.push(clock.frame());
    }
  };
  return {
    clock,
    written,
    run,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("frames come at a constant rate and the video's time is the frame count", () => {
  const s = simulated(30);
  s.clock.start();
  assert.equal(s.clock.tick(), 1, "frame 0 is due at once");
  s.written.push(s.clock.frame());
  s.run(1000);
  assert.equal(s.written.length, 31);
  assert.equal(s.clock.time(), 31 / 30);
  for (const [i, t] of s.written.entries()) assert.equal(t, i / 30);
  // A stalled event loop is caught up frame by frame (the last picture is repeated).
  s.advance(200);
  assert.equal(s.clock.tick(), 6);
});

test("a barrier holds the video, records the wall time and never bursts after the release", () => {
  const s = simulated(30);
  s.clock.start();
  s.clock.step = 2;
  s.clock.limit(1, "locate");
  s.run(1500);
  // Frames before second 1 went out; the frame of second 1 waits.
  assert.equal(s.clock.frames, 30);
  assert.equal(s.clock.time(), 1);
  assert.equal(s.clock.holdingFor, "locate");
  s.clock.release();
  assert.equal(s.clock.holds.length, 1);
  const [hold] = s.clock.holds;
  assert.equal(hold.at, 1);
  assert.equal(hold.reason, "locate");
  assert.equal(hold.step, 2);
  // It held from when the frame of second 1 fell due (wall 1000 ms after start) to the release.
  assert.ok(Math.abs(hold.duration - 0.5) < 0.011, `held ${hold.duration}`);
  assert.ok(s.clock.tick() <= 1, "no burst after the hold");
  const before = s.clock.frames;
  s.run(1000);
  assert.ok(Math.abs(s.clock.frames - before - 30) <= 1);
  // A barrier lifted before the video reaches it costs nothing.
  s.clock.limit(s.clock.time() + 5, "wait");
  s.run(100);
  s.clock.release();
  assert.equal(s.clock.holds.length, 1);
});

test("a pause holds without frames and waits resolve only once it resumes", async () => {
  const s = simulated(60);
  s.clock.start();
  s.run(500);
  const at = s.clock.time();
  let woke = false;
  const waiting = s.clock.wait(at).then(() => {
    woke = true;
  });
  s.clock.hold("pause");
  // A wait for a moment already reached still waits while paused.
  const paused = s.clock.wait(at - 0.1).then(() => "resolved");
  s.run(2000);
  assert.equal(s.clock.time(), at);
  await Promise.resolve();
  s.clock.resume("pause");
  await waiting;
  assert.equal(await paused, "resolved");
  assert.ok(woke);
  assert.equal(s.clock.holds.at(-1)?.reason, "pause");
  assert.ok(Math.abs((s.clock.holds.at(-1)?.duration ?? 0) - 2) < 0.011);
  // The encoder falling behind holds the same way.
  s.clock.hold("encoder");
  assert.equal(s.clock.tick(), 0);
  s.clock.resume("encoder");
});

test("waits resolve at the exact frame; listeners place each frame before it is counted", async () => {
  const s = simulated(30);
  const seen: number[] = [];
  const off = s.clock.onFrame((t) => {
    seen.push(t);
    return undefined;
  });
  s.clock.start();
  let resolved = false;
  const done = s.clock.wait(0.5).then(() => {
    resolved = true;
  });
  while (!resolved) {
    s.run(5);
    await Promise.resolve();
    await Promise.resolve();
  }
  await done;
  assert.equal(s.clock.frames, 15);
  // The frame that woke the wait says so: the writer stops there and lets the run act.
  assert.equal(s.clock.woke, true);
  s.run(40);
  assert.equal(s.clock.woke, false);
  // So does a frame where a movement ended.
  const ends = s.clock.onFrame(() => true);
  s.advance(40);
  s.clock.tick();
  s.clock.frame();
  assert.equal(s.clock.woke, true);
  ends();
  assert.deepEqual(seen.slice(0, 3), [0, 1 / 30, 2 / 30]);
  off();
  const failed = s.clock.wait(100);
  s.clock.fail(new Error("Automação interrompida."));
  await assert.rejects(failed, /interrompida/);
  await assert.rejects(s.clock.wait(200), /interrompida/);
  assert.equal(s.clock.tick(), 0);
});
