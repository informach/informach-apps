import assert from "node:assert/strict";
import { test } from "node:test";
import { audibleClips, timelineSilences, timelineWords } from "../src/shared/cleanup.ts";
import { buildSnapIndex, SNAP_KINDS, shownSnap, snapTo } from "../src/shared/snap.ts";
import type { Asset, Clip, Project, Transcript } from "../src/shared/types.ts";

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
  for (const t of [0, 1, 2, 3.21, 3.62, 5, 6, 8.8, 10, 12.1, 13.4, 15])
    assert.ok(times.includes(t), `${t} is a target`);
  const kind = (t: number): string => SNAP_KINDS[index.kinds[times.indexOf(t)]];
  assert.equal(kind(3.21), "word");
  assert.equal(kind(12.1), "silence");
  assert.equal(kind(8.8), "marker");
  assert.equal(kind(1), "interval");
  // The playhead moves with every gesture: the search looks at it, the index is kept.
  assert.deepEqual(snapTo(index, 7.45, 0.1, 30, { playhead: 7.5 }), {
    time: 7.5,
    kind: "playhead",
  });
  assert.deepEqual(snapTo(index, 10.02, 0.1, 30, { playhead: 10 }), { time: 10, kind: "edge" });
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
  // One index for every drag: the clips dragged are left out by the search.
  const index = buildSnapIndex({ clips });
  const gesture = { exclude: new Set(["moving"]) };
  assert.equal(snapTo(index, 20.01, 0.1, undefined, gesture).kind, undefined);
  assert.equal(snapTo(index, 24.02, 0.1, undefined, gesture).kind, undefined);
  assert.deepEqual(snapTo(index, 29.95, 0.1, undefined, gesture), { time: 30, kind: "edge" });
  assert.deepEqual(snapTo(index, 20.01, 0.1), { time: 20, kind: "edge" });
  // Another clip's edge at the same time as an excluded one is still a target.
  const touching = buildSnapIndex({ clips: [...clips, clip("before", 16, 4)] });
  assert.deepEqual(snapTo(touching, 20.01, 0.1, undefined, gesture), { time: 20, kind: "edge" });
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

test("the magnet of a 25-minute lesson is made once, and only of what is heard", () => {
  const LESSON = 1500;
  const media = (id: string, kind: Asset["kind"]): Asset => ({
    id,
    name: id,
    path: `C:/${id}`,
    kind,
    duration: LESSON,
    width: kind === "audio" ? 0 : 1920,
    height: kind === "audio" ? 0 : 1080,
    fps: 30,
    hasVideo: kind !== "audio",
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
    transcript: `C:/${id}.json`,
  });
  const assets = [media("screen", "video"), media("mic", "audio"), media("cam", "video")];
  const tracks = ["v", "a", "c"].map((id, i) => ({
    id,
    kind: i === 1 ? ("audio" as const) : ("video" as const),
    name: id,
    muted: id === "c",
    hidden: false,
    locked: false,
  }));
  const clips: Clip[] = [];
  for (let i = 0; i < 500; i++)
    for (const [t, a] of [
      ["v", "screen"],
      ["a", "mic"],
      ["c", "cam"],
    ])
      clips.push({ ...clip(`${t}${i}`, i * 2.8, 2.8), assetId: a, trackId: t, in: i * 3 });
  const transcript = {
    words: Array.from({ length: 5000 }, (_, i) => ({
      text: "w",
      start: i * 0.3,
      end: i * 0.3 + 0.2,
    })),
    silences: Array.from({ length: 400 }, (_, i): [number, number] => [i * 3.7, i * 3.7 + 0.5]),
  } as unknown as Transcript;
  const transcripts = new Map(assets.map((a) => [a.id, transcript]));
  const project: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets,
    tracks,
    clips,
  };
  const started = performance.now();
  const heard = { ...project, clips: audibleClips(project) };
  const words = timelineWords(heard, transcripts).filter((w) => !w.silent);
  const index = buildSnapIndex({ clips, words, silences: timelineSilences(heard, transcripts) });
  assert.ok(performance.now() - started < 1000, "made in well under a second");
  // The muted camera's words are not targets: the same words of the microphone are, once each.
  assert.ok(words.every((w) => w.clipId.startsWith("a") || w.clipId.startsWith("v")));
  assert.ok(index.times.length < 3 * 2 * 5000);
});
