import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import {
  clipEnd,
  clipsFrom,
  clipsInSpan,
  extendFrameAll,
  insertClips,
  moveTrack,
  parseTimecode,
  placeClips,
  rippleTrim,
  splitAt,
  toFrame,
  trimClip,
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
});

test("splitting, trimming and moving at frame times leave every edge on a frame", () => {
  let clips = [clip("a", "t", 0, 10), clip("b", "t", 10, 10)];
  const at = (t: number): number => toFrame(t, FPS);
  clips = splitAt(clips, at(4.321), new Set());
  clips = clips.map((c) => (c.id === "b" ? trimClip(c, "end", at(17.77), video) : c));
  const first = byId(clips, "a");
  clips = placeClips(clips, [{ ...first, start: at(first.start + 0.4567) }]);
  clips = rippleTrim(clips, [track("t")], "b", "start", at(12.345), video);
  for (const c of clips) {
    assert.ok(onFrame(c.start), `${c.id} starts on a frame (${c.start})`);
    assert.ok(onFrame(clipEnd(c)), `${c.id} ends on a frame (${clipEnd(c)})`);
  }
});

test("a ripple trim of the end moves what follows on every unlocked track, keeping the gaps", () => {
  const tracks = [track("v"), track("voz"), track("fixa", { locked: true })];
  const clips = [
    clip("tela", "v", 0, 10),
    clip("depois", "v", 10, 5),
    clip("fala", "voz", 12, 3),
    clip("fixo", "fixa", 20, 2),
  ];
  const out = rippleTrim(clips, tracks, "tela", "end", 8, video);
  assert.equal(byId(out, "tela").duration, 8);
  assert.equal(byId(out, "depois").start, 8);
  assert.equal(byId(out, "fala").start, 10);
  assert.equal(byId(out, "fixo").start, 20, "locked tracks never move");
  const longer = rippleTrim(clips, tracks, "tela", "end", 13, video);
  assert.equal(byId(longer, "depois").start, 13);
  assert.equal(byId(longer, "fala").start, 15);
});

test("a ripple trim of the head keeps the clip in place and takes footage off its start", () => {
  const clips = [clip("tela", "v", 5, 10, { in: 20 }), clip("depois", "v", 15, 5)];
  const out = rippleTrim(clips, [track("v")], "tela", "start", 7, video);
  const trimmed = byId(out, "tela");
  assert.equal(trimmed.start, 5);
  assert.equal(trimmed.in, 22);
  assert.equal(trimmed.duration, 8);
  assert.equal(byId(out, "depois").start, 13);
});

test("a ripple trim stops where another track would be covered", () => {
  const tracks = [track("v"), track("voz")];
  const clips = [
    clip("tela", "v", 0, 10),
    clip("depois", "v", 10, 5),
    // On the other track something ends at 9.5 and something starts at 10: they may close up to it.
    clip("antes", "voz", 0, 9.5),
    clip("fala", "voz", 10, 3),
  ];
  const out = rippleTrim(clips, tracks, "tela", "end", 6, video);
  assert.equal(byId(out, "tela").duration, 9.5);
  assert.equal(byId(out, "depois").start, 9.5);
  assert.equal(byId(out, "fala").start, 9.5);
});

test("inserting pushes everything after on every unlocked track and splits the clip under it", () => {
  const tracks = [track("v"), track("voz"), track("fixa", { locked: true })];
  const clips = [clip("tela", "v", 0, 20), clip("fala", "voz", 12, 3), clip("fixo", "fixa", 15, 2)];
  const inserted = clip("novo", "v", 8, 4, { assetId: "img" });
  const out = insertClips(clips, tracks, [inserted], 8);
  const screen = out
    .filter((c) => c.assetId === "v" && c.trackId === "v")
    .sort((a, b) => a.start - b.start);
  assert.deepEqual(
    screen.map((c) => [c.start, c.duration, c.in]),
    [
      [0, 8, 0],
      [12, 12, 8],
    ],
  );
  assert.equal(byId(out, "novo").start, 8);
  assert.equal(byId(out, "fala").start, 16);
  assert.equal(byId(out, "fixo").start, 15);
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

test("removing an interval keeps the tracks in sync and the music playing to the end", () => {
  const clips = [
    clip("tela", "v", 0, 30),
    clip("voz", "a", 0, 30, { assetId: "w" }),
    clip("musica", "m", 0, 30, { assetId: "song" }),
  ];
  const out = applyCuts(clips, [[10, 14]], new Set(["v", "a"]));
  const on = (t: string): Clip[] =>
    out.filter((c) => c.trackId === t).sort((x, y) => x.start - y.start);
  assert.deepEqual(
    on("v").map((c) => [c.start, c.duration, c.in]),
    [
      [0, 10, 0],
      [10, 16, 14],
    ],
  );
  assert.deepEqual(
    on("a").map((c) => [c.start, c.duration, c.in]),
    [
      [0, 10, 0],
      [10, 16, 14],
    ],
  );
  assert.deepEqual(
    on("m").map((c) => [c.start, c.duration]),
    [[0, 26]],
  );
});

test("extend frame on every track keeps what comes after at the same distance", () => {
  const assets = new Map<string, Asset>([
    ["v", video],
    ["voice", { ...video, id: "voice", kind: "audio", hasVideo: false, width: 0, height: 0 }],
    ["note", { ...video, id: "note", kind: "image", duration: 0, generated: "annotation" }],
  ]);
  const clips = [
    clip("tela", "v", 0, 20),
    clip("fala", "voz", 2, 12, { assetId: "voice", in: 1 }),
    clip("depois", "voz", 16, 3, { assetId: "voice" }),
    clip("balao", "notas", 8, 6, {
      assetId: "note",
      annotation: { kind: "balloon", text: "Oi", color: "#3D6BFF" },
      keyframes: [
        { t: 0, x: 0.2, y: 0.2, scale: 1 },
        { t: 5, x: 0.8, y: 0.2, scale: 1 },
      ],
    }),
    clip("musica", "m", 0, 30, { assetId: "voice" }),
  ];
  const targets = new Set(["v", "voz", "notas"]);
  const { clips: out, stillId } = extendFrameAll(clips, assets, "tela", 10, 4, "still", targets);
  const still = byId(out, stillId);
  assert.deepEqual([still.start, still.duration], [10, 4]);
  const tela = out
    .filter((c) => c.trackId === "v" && c.assetId === "v")
    .sort((a, b) => a.start - b.start);
  assert.deepEqual(
    tela.map((c) => [c.start, c.duration, c.in]),
    [
      [0, 10, 0],
      [14, 10, 10],
    ],
  );
  // The voice under the point is cut there and its second part waits for the held frame.
  const fala = out
    .filter((c) => c.trackId === "voz" && c.start < 16)
    .sort((a, b) => a.start - b.start);
  assert.deepEqual(
    fala.map((c) => [c.start, c.duration, c.in]),
    [
      [2, 8, 1],
      [14, 4, 9],
    ],
  );
  assert.equal(byId(out, "depois").start, 20, "4 s later, the same 2 s after the voice");
  // The balloon across the point lasts 4 s more; its movement after the point waits too.
  const balao = byId(out, "balao");
  assert.equal(balao.start, 8);
  assert.equal(balao.duration, 10);
  assert.deepEqual(
    balao.keyframes?.map((k) => k.t),
    [0, 9],
  );
  assert.deepEqual([byId(out, "musica").start, byId(out, "musica").duration], [0, 30]);
  // Distances between everything after the point are what they were.
  const after = (list: Clip[]): number[] =>
    list
      .filter((c) => c.start >= 10 && targets.has(c.trackId) && c.id !== stillId)
      .map((c) => c.start)
      .sort((a, b) => a - b);
  const before = after(clips).map((t) => t + 4);
  for (const t of before) assert.ok(after(out).includes(t), `${t - 4} moved to ${t}`);
});
