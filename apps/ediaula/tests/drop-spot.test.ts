import assert from "node:assert/strict";
import { test } from "node:test";
import { dropSpot, MIN_GAP } from "../src/shared/dropSpot.ts";
import type { Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (id: string, trackId: string, start: number, duration: number): Clip => ({
  id,
  assetId: "a",
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
});
const lesson = (tracks: Track[], clips: Clip[]): Pick<Project, "tracks" | "clips"> => ({
  tracks,
  clips,
});

test("an annotation dropped on a free spot stays on that track, at that time", () => {
  const p = lesson([track("top"), track("f4"), track("tela")], [clip("t", "tela", 0, 100)]);
  // The tela track is busy, yet the drop on f4 (free) stays there: no new track on top.
  const spot = dropSpot(p, "f4", 10, 3);
  assert.equal(spot?.track.id, "f4");
  assert.equal(spot?.duration, 3);
  assert.equal(spot?.made, false);
  assert.equal(spot?.tracks, p.tracks, "the tracks are the same list");
});

test("a clip later on the track shortens it to the gap; under MIN_GAP it goes above", () => {
  const p = lesson([track("cima"), track("f4")], [clip("x", "f4", 12, 5)]);
  const fits = dropSpot(p, "f4", 10, 3);
  assert.equal(fits?.track.id, "f4");
  assert.equal(fits?.duration, 2);
  const tight = dropSpot(p, "f4", 12 - MIN_GAP / 2, 3);
  assert.equal(tight?.track.id, "cima", "too little room: the free track above");
  assert.equal(tight?.duration, 3);
});

test("dropped over a clip: the nearest free track above, else a new one right above", () => {
  const p = lesson(
    [track("a"), track("b", { locked: true }), track("f4")],
    [clip("x", "f4", 0, 20), clip("y", "a", 5, 2)],
  );
  // b is locked, a is busy at 5–7: a new track right above f4.
  const made = dropSpot(p, "f4", 5, 2);
  assert.equal(made?.made, true);
  assert.deepEqual(
    made?.tracks.map((t) => t.id),
    ["a", "b", made?.track.id, "f4"],
  );
  // At 10 the track a is free: it goes there.
  assert.equal(dropSpot(p, "f4", 10, 2)?.track.id, "a");
  // A locked track refuses the drop.
  assert.equal(dropSpot(p, "b", 30, 2), null);
});

test("dropped on the voice lane, it goes in front of the screen, never behind it", () => {
  // Faixa 4 and 3 are video (the screen on 3), Faixa 2 and 1 sound (the voice on 1).
  const p = lesson(
    [track("f4"), track("f3"), track("f2", { kind: "audio" }), track("f1", { kind: "audio" })],
    [clip("tela", "f3", 0, 100), clip("voz", "f1", 0, 100)],
  );
  // Over the voice, and on the empty sound track f2 too: f4, above the screen.
  assert.equal(dropSpot(p, "f1", 10, 3)?.track.id, "f4");
  assert.equal(dropSpot(p, "f2", 10, 3)?.track.id, "f4");
  // f4 busy then: a new track right above the screen, in front of it.
  const busy = lesson(p.tracks, [...p.clips, clip("cam", "f4", 0, 100)]);
  const made = dropSpot(busy, "f1", 10, 3);
  assert.equal(made?.made, true);
  assert.deepEqual(
    made?.tracks.map((t) => t.id),
    [made?.track.id, "f4", "f3", "f2", "f1"],
  );
});

test("a magnetic track never takes the drop: it would pack it away from the time dropped", () => {
  const p = lesson([track("cima"), track("m", { magnetic: true })], [clip("x", "m", 0, 5)]);
  const spot = dropSpot(p, "m", 20, 3);
  assert.equal(spot?.track.id, "cima");
  assert.equal(spot?.duration, 3);
});
