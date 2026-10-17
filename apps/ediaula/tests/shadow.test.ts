import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildAss, DEFAULT_CAPTION_STYLE } from "../src/shared/captions.ts";
import {
  DEFAULT_TRANSFORM,
  type Shadow,
  shadowOffset,
  shadowReach,
} from "../src/shared/compose.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Clip, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

// Sizes are 1080p pixels: on this 360-line frame the shadow moves 60/3 = 20 px (14 px right, 14 down).
const SHADOW: Shadow = { distance: 60, angle: 45, blur: 6, opacity: 1, color: "#000000" };

function project(dir: string, square: Partial<Clip> = {}): Project {
  const white = join(dir, "branco.png");
  const red = join(dir, "vermelho.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=640x360",
    "-frames:v",
    "1",
    "-update",
    "1",
    white,
  ]);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=100x100",
    "-frames:v",
    "1",
    "-update",
    "1",
    red,
  ]);
  const img = (id: string, path: string, w: number, h: number) => ({
    id,
    name: id,
    path,
    kind: "image" as const,
    duration: 0,
    width: w,
    height: h,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none" as const,
  });
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [img("bg", white, 640, 360), img("sq", red, 100, 100)],
    tracks: [
      { id: "top", kind: "video", name: "V2", muted: false, hidden: false, locked: false },
      { id: "low", kind: "video", name: "V1", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "b", assetId: "bg", trackId: "low", start: 0, in: 0, duration: 2, volume: 1 },
      // 100 px square (scale 100/360 of the frame height), centered.
      {
        id: "s",
        assetId: "sq",
        trackId: "top",
        start: 0,
        in: 0,
        duration: 2,
        volume: 1,
        transform: { ...DEFAULT_TRANSFORM, scale: 100 / 360, shadow: SHADOW },
        ...square,
      },
    ],
  };
}

function frameAt(p: Project, dir: string, t: number): (x: number, y: number) => number[] {
  const out = join(dir, `out-${Math.random().toString(36).slice(2)}.mp4`);
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 4000,
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
    FILTER_SCRIPT_OPTION,
    script,
    ...plan.outputArgs,
  ]);
  return (x, y) =>
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
        `crop=2:2:${x}:${y},scale=1:1`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]),
    );
}

test("shadow geometry: offset follows the angle, room covers blur and distance", () => {
  const o = shadowOffset({ ...SHADOW, angle: 90 });
  assert.deepEqual([Math.round(o.dx), o.dy], [0, 60]);
  assert.ok(shadowReach(SHADOW) >= SHADOW.distance + SHADOW.blur);
});

test("export: a picture casts its drop shadow down-right; the picture itself stays in place", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-shadow-"));
  const px = frameAt(project(dir), dir, 1);
  // The square covers 270..370 × 130..230; its shadow covers 284..384 × 144..244.
  assert.ok(px(320, 180)[0] > 200 && px(320, 180)[1] < 60, "square still red in the middle");
  const shade = px(376, 236);
  assert.ok(shade[0] < 120, `shadow under the bottom-right corner (${shade})`);
  const lit = px(262, 120);
  assert.ok(lit[0] > 230 && lit[1] > 230, `no shadow up-left (${lit})`);
  const far = px(420, 280);
  assert.ok(far[0] > 230, `the shadow ends (${far})`);
});

test("export: a popping clip ends up with the same shadow as a still one", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-shadow2-"));
  const still = frameAt(project(dir), dir, 1.5);
  const pop = frameAt(project(dir, { enter: "pop", fadeIn: 0.4 }), dir, 1.5);
  for (const [x, y] of [
    [376, 236],
    [320, 180],
    [262, 120],
    [378, 200],
  ]) {
    const a = still(x, y);
    const b = pop(x, y);
    assert.ok(
      a.every((v, i) => Math.abs(v - b[i]) < 24),
      `(${x},${y}) still ${a} vs pop ${b}`,
    );
  }
});

test("captions use the chosen font", () => {
  const ass = buildAss(
    [{ start: 0, end: 1, lines: [[{ text: "Oi", start: 0, end: 1 }]] }],
    { ...DEFAULT_CAPTION_STYLE, font: "Fredoka" },
    1920,
    1080,
  );
  assert.match(ass, /Style: Cap,Fredoka,/);
  assert.match(buildAss([], DEFAULT_CAPTION_STYLE, 1920, 1080), /Style: Cap,Segoe UI,/);
});
