import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import {
  adjacency,
  clipEnd,
  clipIndex,
  clipsBetween,
  closeGaps,
  defaultTracks,
  overwriteRange,
  pasteClips,
  placeClips,
  projectDuration,
  rippleDelete,
  rippleMoveFrom,
  snapTime,
  splitAt,
  splitClip,
  trackAccepts,
  trackLabels,
  trimClip,
} from "../src/shared/timeline.ts";
import { previousClip } from "../src/shared/transitions.ts";
import type { Asset, Clip } from "../src/shared/types.ts";

const clip = (id: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  assetId: "a1",
  trackId: "t1",
  start,
  in: 0,
  duration,
  volume: 1,
  ...extra,
});

const asset = (duration: number, kind: Asset["kind"] = "video"): Asset => ({
  id: "a1",
  name: "x",
  path: "x.mp4",
  kind,
  duration,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
});

const near = (a: number, b: number): void => {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
};

test("Shift playhead drag moves all unlocked right-side clips preserving source and spacing", () => {
  const tracks = defaultTracks();
  const a = tracks[0].id;
  const b = tracks[1].id;
  const clips = [
    clip("left", 0, 3, { trackId: a }),
    clip("one", 5, 2, { trackId: a, in: 7, speed: 2 }),
    clip("two", 9, 1, { trackId: a }),
    clip("audio", 6, 4, { trackId: b }),
  ];
  const result = rippleMoveFrom(clips, tracks, 5, 4);
  assert.equal(result.delta, 4);
  assert.deepEqual(
    result.clips.map((c) => c.start),
    [0, 9, 13, 10],
  );
  assert.equal(result.clips[0], clips[0]);
  assert.deepEqual(result.clips[1], { ...clips[1], start: 9 });
  assert.equal(clips[1].start, 5);
});

test("ripple drag clamps the whole block at the nearest stationary clip", () => {
  const tracks = defaultTracks();
  const clips = [
    clip("left", 0, 4, { trackId: tracks[0].id }),
    clip("one", 6, 2, { trackId: tracks[0].id }),
    clip("two", 8, 2, { trackId: tracks[1].id }),
  ];
  const result = rippleMoveFrom(clips, tracks, 5, -20);
  assert.equal(result.delta, -2);
  assert.deepEqual(
    result.clips.map((c) => c.start),
    [0, 4, 6],
  );
});

test("ripple drag leaves crossing clips and locked tracks untouched", () => {
  const tracks = defaultTracks().map((t, i) => ({ ...t, locked: i === 1 }));
  const clips = [
    clip("cross", 2, 5, { trackId: tracks[0].id }),
    clip("right", 8, 2, { trackId: tracks[0].id }),
    clip("locked", 5, 2, { trackId: tracks[1].id }),
  ];
  const result = rippleMoveFrom(clips, tracks, 5, 3);
  assert.deepEqual(
    result.clips.map((c) => c.start),
    [2, 11, 5],
  );
  assert.equal(result.clips[0], clips[0]);
  assert.equal(result.clips[2], clips[2]);
  assert.equal(rippleMoveFrom(clips, tracks, 20, 3).clips, clips);
  assert.equal(rippleMoveFrom(clips, tracks, 5, NaN).clips, clips);
});

test("ripple drag cannot move the playhead or clips before zero", () => {
  const tracks = defaultTracks();
  const clips = [clip("right", 5, 2, { trackId: tracks[0].id })];
  const result = rippleMoveFrom(clips, tracks, 2, -10);
  assert.equal(result.delta, -2);
  assert.equal(result.clips[0].start, 3);
});

test("splitClip divides a clip and keeps source continuity", () => {
  const [l, r] = splitClip(clip("c", 10, 20, { in: 5 }), 15)!;
  assert.equal(l.id, "c");
  near(l.duration, 5);
  near(r.start, 15);
  near(r.in, 10);
  near(r.duration, 15);
  assert.notEqual(r.id, "c");
});

test("splitClip refuses cuts on the edges", () => {
  assert.equal(splitClip(clip("c", 10, 20), 10), null);
  assert.equal(splitClip(clip("c", 10, 20), 30), null);
});

test("splitAt with empty selection cuts every clip under the playhead, skipping locked tracks", () => {
  const clips = [clip("a", 0, 10), clip("b", 0, 10, { trackId: "t2" }), clip("c", 20, 5)];
  const out = splitAt(clips, 5, new Set(), new Set(["t2"]));
  assert.equal(out.length, 4);
  assert.equal(out.filter((c) => c.trackId === "t2").length, 1);
});

test("overwriteRange trims, splits and removes overlapped clips", () => {
  const clips = [
    clip("a", 0, 10),
    clip("b", 10, 10),
    clip("c", 20, 10),
    clip("z", 0, 30, { trackId: "t2" }),
  ];
  const out = overwriteRange(clips, "t1", 5, 25);
  const a = out.find((c) => c.id === "a")!;
  near(a.duration, 5);
  assert.equal(
    out.find((c) => c.id === "b"),
    undefined,
  );
  const c = out.find((c) => c.id === "c")!;
  near(c.start, 25);
  near(c.in, 5);
  near(c.duration, 5);
  assert.ok(
    out.find((c) => c.id === "z"),
    "other tracks are untouched",
  );
});

test("overwriteRange splits a clip that spans the whole range into two", () => {
  const out = overwriteRange([clip("a", 0, 30)], "t1", 10, 20);
  assert.equal(out.length, 2);
  const [left, right] = out.sort((x, y) => x.start - y.start);
  near(left.duration, 10);
  near(right.start, 20);
  near(right.in, 20);
  near(right.duration, 10);
});

test("placeClips overwrites what is underneath a moved clip", () => {
  const moved = clip("m", 5, 10);
  const out = placeClips([clip("a", 0, 10), moved, clip("b", 12, 10)], [moved]);
  near(out.find((c) => c.id === "a")!.duration, 5);
  near(out.find((c) => c.id === "b")!.start, 15);
  assert.equal(out.length, 3);
});

test("rippleDelete closes the gap on the same track only", () => {
  const clips = [
    clip("a", 0, 10),
    clip("b", 10, 5),
    clip("c", 15, 10),
    clip("x", 20, 5, { trackId: "t2" }),
  ];
  const out = rippleDelete(clips, new Set(["b"]));
  near(out.find((c) => c.id === "c")!.start, 10);
  near(out.find((c) => c.id === "x")!.start, 20);
});

test("rippleDelete with several clips shifts by the total removed", () => {
  const clips = [clip("a", 0, 10), clip("b", 10, 5), clip("c", 15, 5), clip("d", 20, 5)];
  const out = rippleDelete(clips, new Set(["a", "c"]));
  near(out.find((c) => c.id === "b")!.start, 0);
  near(out.find((c) => c.id === "d")!.start, 5);
});

test("closeGaps packs one track back to back from its first clip, not from 0:00", () => {
  const out = closeGaps(
    [clip("a", 3, 5), clip("b", 12, 5), clip("x", 20, 1, { trackId: "t2" })],
    "t1",
  );
  const start = (id: string): number => out.find((c) => c.id === id)?.start ?? Number.NaN;
  near(start("a"), 3);
  near(start("b"), 8);
  near(start("x"), 20);
});

test("trimClip respects source bounds", () => {
  const src = asset(30);
  const c = clip("c", 10, 10, { in: 5 });
  const extendedLeft = trimClip(c, "start", 0, src);
  near(extendedLeft.start, 5);
  near(extendedLeft.in, 0);
  near(extendedLeft.duration, 15);
  const extendedRight = trimClip(c, "end", 100, src);
  near(extendedRight.duration, 25);
  const images = trimClip(c, "end", 100, asset(0, "image"));
  near(images.duration, 90);
});

test("snapTime picks the closest candidate within threshold", () => {
  assert.deepEqual(snapTime(10.1, [0, 10, 10.3], 0.25), { time: 10, snapped: true });
  assert.deepEqual(snapTime(11, [0, 10], 0.25), { time: 11, snapped: false });
});

test("projectDuration and track labels", () => {
  assert.equal(projectDuration({ clips: [clip("a", 0, 10), clip("b", 15, 5)] }), 20);
  const tracks = defaultTracks();
  const labels = trackLabels(tracks);
  assert.deepEqual(
    tracks.map((t) => labels.get(t.id)),
    ["F4", "F3", "F2", "F1"],
  );
});

test("any track takes any clip, and a picture shows (with its sound) whatever track it is on", () => {
  const video = {
    id: "v",
    name: "avatar",
    path: "avatar.mp4",
    kind: "video" as const,
    duration: 4,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "none" as const,
  };
  const soundTrack = {
    id: "a",
    kind: "audio" as const,
    name: "Faixa 1",
    muted: false,
    hidden: false,
    locked: false,
  };
  assert.equal(trackAccepts(soundTrack, video), true);
  assert.equal(trackAccepts({ ...soundTrack, locked: true }, video), false);
  const plan = buildExportPlan(
    {
      version: 1,
      id: "p",
      name: "x",
      createdAt: 0,
      updatedAt: 0,
      settings: { width: 640, height: 360, fps: 30 },
      assets: [video],
      tracks: [soundTrack],
      clips: [{ id: "c", assetId: "v", trackId: "a", start: 0, in: 0, duration: 4, volume: 1 }],
    },
    {
      outPath: "x.mp4",
      width: 640,
      height: 360,
      fps: 30,
      videoBitrate: 1000,
      normalizeLoudness: false,
      encoder: "x264",
    },
  );
  assert.match(plan.filter, /overlay=/);
  // The picture is read by the video plan, the sound by the audio plan (its own input).
  assert.match(plan.filter, /\[0:v\]/);
  assert.match(plan.filter, /\[1:a\]aresample/);
});

test("pasteClips: back on its own track when free, otherwise above, never covering", () => {
  const tr = (id: string) => ({
    id,
    kind: "video" as const,
    name: id,
    muted: false,
    hidden: false,
    locked: false,
  });
  const tracks = [tr("top"), tr("mid"), tr("low")];
  const clip = (id: string, trackId: string, start: number, duration: number) => ({
    id,
    assetId: "a",
    trackId,
    start,
    in: 0,
    duration,
    volume: 1,
  });
  const balloon = clip("b", "mid", 10, 3);
  const lesson = clip("l", "low", 0, 60);
  const clips = [balloon, lesson];

  // Free stretch: same track, at the playhead, new id; the original stays.
  const a = pasteClips(tracks, clips, [balloon], 20);
  assert.equal(a.clips.length, 3);
  const pa = a.clips.find((c) => c.id === a.ids[0])!;
  assert.deepEqual([pa.trackId, pa.start, pa.duration], ["mid", 20, 3]);
  assert.notEqual(pa.id, "b");
  assert.equal(a.tracks.length, 3);

  // Pasting over itself: the next free track above.
  const b = pasteClips(tracks, clips, [balloon], 11);
  assert.equal(b.clips.find((c) => c.id === b.ids[0])!.trackId, "top");

  // Nothing free above: a new track right above the original.
  const busy = [...clips, clip("t", "top", 0, 60)];
  const c = pasteClips(tracks, busy, [lesson], 5);
  const pc = c.clips.find((x) => x.id === c.ids[0])!;
  assert.equal(c.tracks.length, 4);
  assert.equal(
    c.tracks.findIndex((t) => t.id === pc.trackId),
    2,
  );
  assert.equal(c.clips.filter((x) => x.id === "l")[0].duration, 60);

  // Several clips keep their spacing.
  const d = pasteClips(tracks, clips, [balloon, clip("x", "mid", 14, 1)], 30);
  assert.deepEqual(
    d.ids.map((id) => d.clips.find((x) => x.id === id)!.start),
    [30, 34],
  );
});

/** Clips of a cleaned-up lesson: mostly back to back, sometimes a gap, sometimes a hair apart. */
function lessonClips(perTrack: number, seed: number): Clip[] {
  const clips: Clip[] = [];
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (const trackId of ["t1", "t2", "t3"]) {
    let at = 0;
    for (let i = 0; i < perTrack; i++) {
      const duration = 0.5 + rnd() * 3;
      const gap = rnd() < 0.7 ? 0 : rnd() < 0.5 ? 0.01 : 0.5 + rnd();
      at += gap;
      clips.push(clip(`${trackId}-${i}`, at, duration, { trackId }));
      at += duration;
    }
  }
  return clips.sort(() => rnd() - 0.5);
}

/** How many clip fields adjacency() reads: a scan of every clip per clip would grow as n². */
function readsOf(clips: Clip[]): number {
  let reads = 0;
  const watched = clips.map(
    (c) =>
      new Proxy(c, {
        get(target, key, receiver) {
          reads++;
          return Reflect.get(target, key, receiver);
        },
      }),
  );
  adjacency(watched);
  return reads;
}

test("adjacency finds the same cuts as previousClip for 1,500 clips, reading each clip a few times", () => {
  const clips = lessonClips(500, 7);
  const pairs = adjacency(clips);
  for (const c of clips) assert.equal(pairs.get(c.id), previousClip(clips, c), c.id);
  assert.ok(pairs.size > 900, `${pairs.size} cuts`);
  const small = readsOf(lessonClips(250, 3));
  const large = readsOf(lessonClips(1000, 3));
  assert.ok(large / 3000 < 30, `${(large / 3000).toFixed(1)} reads per clip`);
  // Four times the clips, about four times the reads (a quadratic search would read 16 times more).
  assert.ok(large / small < 4.5, `${small} → ${large} reads`);
});

test("clipsBetween returns exactly the clips of a track inside a time window", () => {
  const clips = [
    clip("a", 0, 10),
    clip("long", 2, 50),
    clip("b", 12, 3),
    clip("c", 20, 3),
    clip("d", 40, 3),
    clip("x", 21, 3, { trackId: "t2" }),
  ];
  const track = clipIndex(clips).get("t1");
  assert.ok(track);
  const ids = (from: number, to: number): string[] =>
    clipsBetween(track, from, to)
      .map((c) => c.id)
      .sort();
  assert.deepEqual(ids(16, 19), ["long"]);
  assert.deepEqual(ids(14, 21), ["b", "c", "long"]);
  assert.deepEqual(ids(60, 70), []);
  for (let from = 0; from < 60; from += 2.5)
    assert.deepEqual(
      ids(from, from + 4),
      clips
        .filter((c) => c.trackId === "t1" && clipEnd(c) >= from && c.start <= from + 4)
        .map((c) => c.id)
        .sort(),
    );
});
