import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import {
  type Keyframe,
  keyframeAt,
  keyframeExprs,
  upsertKeyframe,
} from "../src/shared/keyframes.ts";
import type { Project } from "../src/shared/types.ts";

function evalFf(expr: string, t: number): number {
  const fns: Record<string, (...a: number[]) => number> = {
    iff: (c, a, b) => (c ? a : b),
    lt: (a, b) => (a < b ? 1 : 0),
    lte: (a, b) => (a <= b ? 1 : 0),
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
  };
  return new Function(...Object.keys(fns), "t", "return " + expr.split("if(").join("iff("))(
    ...Object.values(fns),
    t,
  ) as number;
}

const kfs: Keyframe[] = [
  { t: 0, x: 0.2, y: 0.5, scale: 0.2 },
  { t: 1, x: 0.8, y: 0.5, scale: 0.4 },
  { t: 2.5, x: 0.5, y: 0.2, scale: 0.3 },
];

test("keyframes: smooth travel between positions, the export curve matches the preview", () => {
  assert.deepEqual(keyframeAt(kfs, -1), kfs[0]);
  assert.deepEqual(keyframeAt(kfs, 9), kfs[2]);
  const mid = keyframeAt(kfs, 0.5);
  assert.ok(
    Math.abs(mid.x - 0.5) < 1e-9 && Math.abs(mid.scale - 0.3) < 1e-9,
    "halfway in space at halfway in time",
  );
  assert.ok(keyframeAt(kfs, 0.1).x - 0.2 < 0.6 * 0.1, "eases out of the first position");
  const e = keyframeExprs(kfs, "(t-3)");
  for (let t = 2.8; t < 6; t += 0.05) {
    const v = keyframeAt(kfs, t - 3);
    assert.ok(
      Math.abs(evalFf(e.x, t) - v.x) < 1e-4 &&
        Math.abs(evalFf(e.y, t) - v.y) < 1e-4 &&
        Math.abs(evalFf(e.scale, t) - v.scale) < 1e-4,
      `at ${t}`,
    );
  }
  const up = upsertKeyframe(kfs, { t: 1.02, x: 0, y: 0, scale: 1 });
  assert.equal(up.length, 3, "marking at (almost) the same moment replaces it");
  assert.equal(up[1].x, 0);
});

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");

test("export: a keyframed picture travels and grows like in the preview", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-kf-"));
  const img = join(dir, "red.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=200x200",
    "-frames:v",
    "1",
    img,
  ]);
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      {
        id: "i",
        name: "i",
        path: img,
        kind: "image",
        duration: 0,
        width: 200,
        height: 200,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
      },
    ],
    tracks: [
      { id: "v", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    ],
    // From the left at 0.2 (72 px square) to the right at 0.8 (144 px square) between 0.5 s and 1.5 s.
    clips: [
      {
        id: "c",
        assetId: "i",
        trackId: "v",
        start: 0,
        in: 0,
        duration: 2.5,
        volume: 1,
        keyframes: [
          { t: 0.5, x: 0.2, y: 0.5, scale: 0.2 },
          { t: 1.5, x: 0.8, y: 0.5, scale: 0.4 },
        ],
      },
    ],
  };
  const out = join(dir, "out.mp4");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 2000,
    normalizeLoudness: false,
    encoder: "x264",
  });
  const script = join(dir, "f.txt");
  writeFileSync(script, plan.filter);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    ...plan.inputArgs,
    "-filter_complex_script",
    script,
    ...plan.outputArgs,
  ]);
  const px = (t: number, x: number, y: number): number[] =>
    Array.from(
      execFileSync(FFMPEG, [
        "-v",
        "error",
        "-ss",
        String(t),
        "-i",
        out,
        "-frames:v",
        "1",
        "-vf",
        `crop=4:4:${x - 2}:${y - 2},scale=1:1`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]),
    );
  const red = (c: number[]): boolean => c[0] > 150 && c[1] < 90;
  assert.ok(red(px(0.2, 128, 180)) && !red(px(0.2, 512, 180)), "starts on the left");
  assert.ok(red(px(1, 320, 180)), "passes the middle halfway");
  assert.ok(red(px(2, 512, 180)) && !red(px(2, 128, 180)), "ends on the right");
  assert.ok(red(px(2, 512 - 65, 180)) && !red(px(0.2, 128 + 45, 180)), "twice as big at the end");
});
