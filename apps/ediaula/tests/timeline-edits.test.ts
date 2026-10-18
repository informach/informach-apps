import assert from "node:assert/strict";
import { test } from "node:test";
import { rippleTrim } from "../src/shared/ripple.ts";
import {
  clipEnd,
  clipsFrom,
  clipsInSpan,
  moveTrack,
  parseTimecode,
  placeClips,
  splitAt,
  toFrame,
  trimClip,
  videoTrackSlot,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, Track } from "../src/shared/types.ts";

const FPS = 30;
const onFrame = (t: number, fps = FPS): boolean => Math.abs(t * fps - Math.round(t * fps)) < 1e-6;

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (
  id: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({
  id,
  assetId: "v",
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
  ...extra,
});
const video: Asset = {
  id: "v",
  name: "v",
  path: "C:/v.mp4",
  kind: "video",
  duration: 600,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
};
const byId = (clips: Clip[], id: string): Clip => {
  const c = clips.find((x) => x.id === id);
  assert.ok(c, `clip ${id}`);
  return c;
};

test("times go to the frame grid, and timecodes with frames are read back", () => {
  assert.equal(toFrame(1.017, 30), 1.0333333333333334);
  assert.equal(toFrame(-0.01, 30), 0);
  assert.equal(toFrame(2.5, 0), 2.5);
  for (const t of [0.1, 3.3333, 59.99, 1234.5678]) assert.ok(onFrame(toFrame(t, 25), 25));
  assert.equal(parseTimecode("00:00:05:12", 30), 5.4);
  assert.equal(parseTimecode("00:01:00:00", 30), 60);
  assert.equal(parseTimecode("1:30,5", 30), 90.5);
  assert.equal(parseTimecode("0", 30), 0);
  for (const bad of ["00:00:05:30", "00:61:00:00", "abc", ""])
    assert.equal(parseTimecode(bad, 30), null, bad);
  // 29,97 fps: 30 frames to a labelled second, each 1/29,97 s long; 1 s lands on frame 30.
  assert.equal(parseTimecode("00:00:01:29", 29.97), 1 + 29 / 29.97);
  assert.equal(parseTimecode("00:00:01:30", 29.97), null);
  assert.equal(toFrame(1, 29.97), 30 / 29.97);
});

test("splitting, trimming and moving at frame times leave every edge on a frame", () => {
  let clips = [clip("a", "t", 0, 10), clip("b", "t", 10, 10)];
  const at = (t: number): number => toFrame(t, FPS);
  clips = splitAt(clips, at(4.321), new Set());
  clips = clips.map((c) => (c.id === "b" ? trimClip(c, "end", at(17.77), video) : c));
  const first = byId(clips, "a");
  clips = placeClips(clips, [{ ...first, start: at(first.start + 0.4567) }]);
  const lesson = { clips, tracks: [track("t")], assets: [video] };
  clips = rippleTrim(lesson, new Set(["t"]), "b", "start", at(12.345)).clips;
  for (const c of clips) {
    assert.ok(onFrame(c.start), `${c.id} starts on a frame (${c.start})`);
    assert.ok(onFrame(clipEnd(c)), `${c.id} ends on a frame (${clipEnd(c)})`);
  }
});

test("tracks move to any place of the stack", () => {
  const tracks = ["a", "b", "c", "d"].map((id) => track(id));
  assert.deepEqual(
    moveTrack(tracks, "d", 0).map((t) => t.id),
    ["d", "a", "b", "c"],
  );
  assert.deepEqual(
    moveTrack(tracks, "a", 3).map((t) => t.id),
    ["b", "c", "d", "a"],
  );
  assert.deepEqual(
    moveTrack(tracks, "b", 2).map((t) => t.id),
    ["a", "c", "b", "d"],
  );
  assert.equal(moveTrack(tracks, "b", 1), tracks);
  assert.equal(moveTrack(tracks, "nope", 0), tracks);
  assert.deepEqual(
    moveTrack(tracks, "a", 99).map((t) => t.id),
    ["b", "c", "d", "a"],
  );
  // A locked track stays where it is, and the others go around it.
  const locked = tracks.map((t) => (t.id === "b" ? { ...t, locked: true } : t));
  assert.equal(moveTrack(locked, "b", 3), locked);
  assert.deepEqual(
    moveTrack(locked, "a", 2).map((t) => t.id),
    ["b", "c", "a", "d"],
  );
});

test("a new picture track goes right after the last video track, wherever sound was moved", () => {
  const audio = (id: string): Track => track(id, { kind: "audio" });
  assert.equal(videoTrackSlot([track("a"), track("b"), audio("s")]), 2);
  // A sound track moved above the pictures: the new one still goes under the last picture.
  assert.equal(videoTrackSlot([audio("s"), track("a"), track("b"), audio("m")]), 3);
  assert.equal(videoTrackSlot([audio("s"), audio("m")]), 0);
  assert.equal(videoTrackSlot([]), 0);
});

test("selection by rectangle and from the playhead", () => {
  const clips = [
    clip("a", "t1", 0, 5),
    clip("b", "t1", 6, 5),
    clip("c", "t2", 3, 5),
    clip("d", "t2", 20, 5),
  ];
  assert.deepEqual(
    clipsInSpan(clips, new Set(["t1", "t2"]), 4, 7).map((c) => c.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    clipsInSpan(clips, new Set(["t2"]), 7, 4).map((c) => c.id),
    ["c"],
  );
  assert.deepEqual(
    clipsFrom(clips, 6).map((c) => c.id),
    ["b", "d"],
  );
  assert.deepEqual(
    clipsFrom(clips, 6, "t2").map((c) => c.id),
    ["d"],
  );
});
