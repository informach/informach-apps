import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLanes,
  type PoolClip,
  pictureTarget,
  planLane,
  servedBy,
  slotOf,
} from "../src/renderer/src/editor/previewPool.ts";

/** A recording cut in 200 places: pieces of 1.5 s, each 0.5 s of the source after the last. */
const pieces: PoolClip[] = Array.from({ length: 200 }, (_, i) => ({
  id: `p${i}`,
  start: i * 1.5,
  end: (i + 1) * 1.5,
  in: i * 2,
  speed: 1,
}));

test("two elements serve a lane of 200 pieces: the one playing and the next one waiting", () => {
  const lanes = buildLanes([...pieces].reverse().map((clip) => ({ lane: "p|t|tela.mp4", clip })));
  const lane = lanes.get("p|t|tela.mp4") ?? [];
  assert.equal(lane[0].id, "p0");
  const seen = new Set<string>();
  let previous = planLane(lane, 0, 4);
  for (let t = 0; t < 300; t += 1 / 30) {
    const plan = planLane(lane, t, 4);
    const playing = plan.filter((p) => p?.play);
    assert.equal(playing.length, 1, `one piece plays at ${t.toFixed(2)} s`);
    for (const p of plan) if (p) seen.add(p.clipId);
    // The element that waited at the start of the next piece is the one that plays it.
    const now = playing[0];
    const before = previous.find((p) => p?.clipId === now?.clipId);
    if (before && !before.play) {
      assert.ok(now);
      assert.equal(before.time, lane.find((c) => c.id === now.clipId)?.in);
      assert.equal(previous.indexOf(before), plan.indexOf(now), "same element");
    }
    previous = plan;
  }
  assert.equal(seen.size, 200);
});

test("the plan at a moment: who plays, who waits, and what each element shows", () => {
  const plan = planLane(pieces, 4.6, 4);
  // 4.6 s is in piece 3 (4.5 to 6): element B plays it from source 6.1, A waits at piece 4.
  const [a, b] = plan;
  assert.deepEqual(a, { clipId: "p4", play: false, time: 8 });
  assert.ok(b && b.clipId === "p3" && b.play && Math.abs(b.time - 6.1) < 1e-9);
  assert.equal(slotOf(3), 1);
  assert.deepEqual(servedBy(new Map([["lane", plan]])).get("p3"), { lane: "lane", slot: 1 });
  // Nothing on screen yet: both wait at the next two pieces within the lookahead.
  const later: PoolClip[] = [
    { id: "x", start: 10, end: 12, in: 0, speed: 1 },
    { id: "y", start: 12, end: 14, in: 5, speed: 1 },
  ];
  assert.deepEqual(planLane(later, 7, 4), [{ clipId: "x", play: false, time: 0 }, null]);
  assert.deepEqual(planLane(later, 9, 4), [
    { clipId: "x", play: false, time: 0 },
    { clipId: "y", play: false, time: 5 },
  ]);
  assert.deepEqual(planLane(later, 20, 4), [null, null]);
});

test("a transition's tail plays on the other element at the same time", () => {
  const tail: PoolClip[] = [
    { id: "a", start: 0, end: 5.5, in: 0, speed: 1 },
    { id: "b", start: 5, end: 9, in: 10, speed: 2 },
  ];
  const [a, b] = planLane(tail, 5.2, 4);
  assert.ok(a && a.clipId === "a" && a.play && Math.abs(a.time - 5.2) < 1e-9);
  assert.ok(b && b.clipId === "b" && b.play && Math.abs(b.time - 10.4) < 1e-9);
});

test("the cut-out avatar's picture follows its voice while the voice plays", () => {
  assert.equal(pictureTarget(3, { time: 3.04, playing: true, seeking: false }), 3.04);
  assert.equal(pictureTarget(3, { time: 3.04, playing: false, seeking: false }), 3);
  assert.equal(pictureTarget(3, { time: 9, playing: true, seeking: true }), 3);
  assert.equal(pictureTarget(3, null), 3);
});
