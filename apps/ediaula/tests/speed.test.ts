import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineWords } from "../src/shared/cleanup.ts";
import { atempo, buildExportPlan } from "../src/shared/exportPlan.ts";
import {
  setClipSpeed,
  sourceAt,
  sourceEnd,
  splitClip,
  timelineAt,
  trimClip,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Transcript } from "../src/shared/types.ts";

const clip = (o: Partial<Clip> = {}): Clip => ({
  id: "c",
  assetId: "v",
  trackId: "t",
  start: 10,
  in: 4,
  duration: 6,
  volume: 1,
  ...o,
});
const video: Asset = {
  id: "v",
  name: "tela",
  path: "C:/m/tela.mp4",
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
};

test("source and timeline times follow the speed", () => {
  const c = clip({ speed: 2 });
  assert.equal(sourceAt(c, 13), 10);
  assert.equal(timelineAt(c, 10), 13);
  assert.equal(sourceEnd(c), 16);
  assert.equal(sourceEnd(clip()), 10);
});

test("setClipSpeed keeps the same stretch of the source and moves what follows", () => {
  const next = clip({ id: "n", start: 16, in: 30, duration: 10 });
  const other = clip({ id: "o", trackId: "u", start: 16 });
  const out = setClipSpeed([clip(), next, other], "c", 2, true);
  const c = out.find((x) => x.id === "c")!;
  assert.equal(c.duration, 3);
  assert.equal(c.speed, 2);
  assert.equal(sourceEnd(c), 10);
  assert.equal(out.find((x) => x.id === "n")!.start, 13, "next clip on the track pulled back");
  assert.equal(out.find((x) => x.id === "o")!.start, 16, "other tracks untouched");

  // Back to normal: the field goes away and the length comes back.
  const back = setClipSpeed(out, "c", 1, true).find((x) => x.id === "c")!;
  assert.equal(back.duration, 6);
  assert.equal("speed" in back, false);

  // Slower without ripple covers what follows instead of moving it.
  const slow = setClipSpeed([clip(), next], "c", 0.5, false);
  assert.equal(slow.find((x) => x.id === "c")!.duration, 12);
  const n = slow.find((x) => x.id === "n")!;
  assert.equal(n.start, 22);
  assert.equal(n.in, 36);
});

test("split and trim honour the speed", () => {
  const [l, r] = splitClip(clip({ speed: 2 }), 12)!;
  assert.equal(sourceEnd(l), 8);
  assert.equal(r.in, 8);
  assert.equal(sourceEnd(r), 16);
  // The source has 60 s: from in=4 at 2× there are 28 s of timeline left.
  assert.equal(trimClip(clip({ speed: 2 }), "end", 100, video).duration, 28);
  const t = trimClip(clip({ speed: 2 }), "start", 11, video);
  assert.equal(t.in, 6);
  assert.equal(t.duration, 5);
});

test("transcript words land where the sped-up clip shows them", () => {
  const p: Project = {
    version: 1,
    id: "p",
    name: "T",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [video],
    tracks: [{ id: "t", kind: "video", name: "F1", muted: false, hidden: false, locked: false }],
    clips: [clip({ speed: 2 })],
  };
  const tr = new Map<string, Transcript>([
    [
      "v",
      {
        version: 1,
        model: "m",
        language: "pt",
        duration: 60,
        words: [{ text: "oi", start: 8, end: 9, p: 1 }],
        silences: [],
      },
    ],
  ]);
  const [w] = timelineWords(p, tr);
  assert.equal(w.start, 12);
  assert.equal(w.end, 12.5);
});

test("atempo chains beyond its 0.5–2 range", () => {
  assert.equal(atempo(1), "");
  assert.equal(atempo(1.5), "atempo=1.5,");
  assert.equal(atempo(4), "atempo=2,atempo=2,");
  assert.equal(atempo(0.25), "atempo=0.5,atempo=0.5,");
});

test("export reads duration × speed of the source and retimes picture and sound", () => {
  const p: Project = {
    version: 1,
    id: "p",
    name: "T",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [video],
    tracks: [{ id: "t", kind: "video", name: "F1", muted: false, hidden: false, locked: false }],
    clips: [clip({ start: 0, speed: 2 })],
  };
  const plan = buildExportPlan(p, {
    outPath: "C:/o.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8000,
    normalizeLoudness: false,
    encoder: "nvenc",
  });
  const i = plan.inputArgs.indexOf("C:/m/tela.mp4");
  const read = plan.inputArgs.slice(i - 5, i + 1);
  assert.deepEqual([read[0], read[2], read[4]], ["-ss", "-t", "-i"]);
  // From a source frame before the in-point (4 s) to the end of the 12 s it covers at 2×.
  const seek = Number(read[1]);
  assert.ok(seek < 4 && seek > 4 - 1 / 30 - 0.01, `seek ${read[1]}`);
  assert.ok(Math.abs(seek + Number(read[3]) - 16) < 0.01, `length ${read[3]}`);
  assert.match(plan.filter, /setpts=\(PTS-[\d.]+\/TB\)\/2,fps=30:start_time=0/);
  assert.match(plan.filter, /atempo=2,volume=1/);
  assert.equal(plan.duration, 6);
});
