import assert from "node:assert/strict";
import { test } from "node:test";
import { alignedAt, lapseSpans, sameLapses, videoAt } from "../src/shared/guidedLapse.ts";

/** "Tela sem voz" of a guided take: the video's seconds and the narration's. */

const lapses = [
  { from: 10, to: 20, narration: 2 },
  { from: 4, to: 6, narration: 1 },
];

test("the narration's seconds are the video's without what goes in sped up", () => {
  assert.equal(alignedAt(lapses, 3), 3);
  assert.equal(alignedAt(lapses, 5), 4.5);
  assert.equal(alignedAt(lapses, 8), 7);
  assert.equal(alignedAt(lapses, 15), 10);
  assert.equal(alignedAt(lapses, 25), 16);
  for (const v of [0, 3, 4.5, 6, 9.9, 12, 20, 30])
    assert.ok(Math.abs(videoAt(lapses, alignedAt(lapses, v)) - v) < 1e-9, `at ${v}`);
  assert.equal(videoAt([], 7), 7);
});

test("a stretch of the video is cut where the lapses begin and end", () => {
  assert.deepEqual(lapseSpans(lapses, 0, 25), [
    { from: 0, to: 4 },
    { from: 4, to: 6, speed: 2 },
    { from: 6, to: 10 },
    { from: 10, to: 20, speed: 5 },
    { from: 20, to: 25 },
  ]);
  // A piece that starts inside a lapse keeps its speed.
  assert.deepEqual(lapseSpans(lapses, 15, 22), [
    { from: 15, to: 20, speed: 5 },
    { from: 20, to: 22 },
  ]);
  assert.deepEqual(lapseSpans([], 1, 2), [{ from: 1, to: 2 }]);
});

test("two takes lapse alike within a tenth of a second", () => {
  assert.ok(sameLapses(undefined, []));
  assert.ok(sameLapses(lapses, [...lapses].reverse()));
  assert.ok(!sameLapses(lapses, [lapses[0]]));
  assert.ok(!sameLapses(lapses, [{ ...lapses[0], to: 21 }, lapses[1]]));
});
