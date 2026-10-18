import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapIndex, SNAP_KINDS, shownSnap, snapTo } from "../src/shared/snap.ts";
import type { Clip } from "../src/shared/types.ts";

const clip = (id: string, start: number, duration: number): Clip => ({
  id,
  assetId: "a",
  trackId: "t",
  start,
  in: 0,
  duration,
  volume: 1,
});

test("the magnet keeps every target sorted, words by their start and their end", () => {
  const index = buildSnapIndex({
    clips: [clip("b", 10, 5), clip("a", 2, 3)],
    playhead: 7.5,
    words: [{ start: 3.21, end: 3.62 }],
    silences: [[12.1, 13.4]],
    markers: [8.8],
    interval: { start: 1, end: 6 },
  });
  const times = [...index.times];
  assert.deepEqual(
    times,
    [...times].sort((x, y) => x - y),
  );
  for (const t of [0, 1, 2, 3.21, 3.62, 5, 6, 7.5, 8.8, 10, 12.1, 13.4, 15])
    assert.ok(times.includes(t), `${t} is a target`);
  const kind = (t: number): string => SNAP_KINDS[index.kinds[times.indexOf(t)]];
  assert.equal(kind(3.21), "word");
  assert.equal(kind(12.1), "silence");
  assert.equal(kind(8.8), "marker");
  assert.equal(kind(7.5), "playhead");
  assert.equal(kind(1), "interval");
});

test("a cut lands on the start or the end of the nearest word", () => {
  const index = buildSnapIndex({
    clips: [clip("v", 0, 60)],
    words: [
      { start: 4.3, end: 4.71 },
      { start: 4.92, end: 5.38 },
    ],
  });
  const threshold = 0.15;
  assert.deepEqual(snapTo(index, 4.66, threshold), { time: 4.71, kind: "word" });
  assert.deepEqual(snapTo(index, 4.85, threshold), { time: 4.92, kind: "word" });
  assert.deepEqual(snapTo(index, 5.3, threshold), { time: 5.38, kind: "word" });
});

test("only targets within the threshold count; without one the time goes to the frame grid", () => {
  const index = buildSnapIndex({ clips: [clip("v", 10, 5)] });
  assert.deepEqual(snapTo(index, 10.04, 0.05), { time: 10, kind: "edge" });
  const free = snapTo(index, 12.3456, 0.05, 30);
  assert.equal(free.kind, "frame");
  assert.ok(Math.abs(free.time * 30 - Math.round(free.time * 30)) < 1e-9);
  assert.equal(shownSnap(free), false);
  assert.deepEqual(snapTo(index, 12.3456, 0.05), { time: 12.3456 });
});

test("the clips being dragged are not targets of themselves", () => {
  const clips = [clip("moving", 20, 4), clip("other", 30, 2)];
  const index = buildSnapIndex({ clips, exclude: new Set(["moving"]) });
  assert.ok(![...index.times].includes(20) && ![...index.times].includes(24));
  assert.equal(snapTo(index, 20.01, 0.1).kind, undefined);
  assert.deepEqual(snapTo(index, 29.95, 0.1), { time: 30, kind: "edge" });
});

test("between two targets at the same distance an edge wins over a word", () => {
  const index = buildSnapIndex({ clips: [clip("v", 5, 1)], words: [{ start: 4, end: 4.5 }] });
  // 4.5 (word end) and 5 (edge) are both 0.25 away from 4.75.
  assert.deepEqual(snapTo(index, 4.75, 0.5), { time: 5, kind: "edge" });
});

test("thousands of clips and words are looked up by binary search", () => {
  const clips = Array.from({ length: 3000 }, (_, i) => clip(`c${i}`, i * 0.8, 0.7));
  const words = Array.from({ length: 20000 }, (_, i) => ({
    start: i * 0.12,
    end: i * 0.12 + 0.09,
  }));
  const index = buildSnapIndex({ clips, words });
  const started = performance.now();
  for (let i = 0; i < 10000; i++) snapTo(index, (i * 0.237) % 2400, 0.05, 30);
  assert.ok(performance.now() - started < 400, "10 000 lookups in well under half a second");
});
