import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { animAt, isMoving, type Motion, motionExprs } from "../src/shared/compose.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

/** Evaluates the ffmpeg expressions used by motionExprs, with t = timeline seconds. */
function evalFf(expr: string, t: number): number {
  const fns: Record<string, (...a: number[]) => number> = {
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
    pow: Math.pow,
  };
  return new Function(...Object.keys(fns), "t", "return " + expr)(
    ...Object.values(fns),
    t,
  ) as number;
}

test("entrance and exit: the export curves match the preview, frame by frame", () => {
  const motions: Motion[] = ["pop", "grow", "slide-up", "slide-down", "slide-left", "slide-right"];
  for (const enter of motions)
    for (const exit of ["fade", "pop", "slide-left"] as Motion[]) {
      const clip = { start: 10, duration: 3, fadeIn: 0.4, fadeOut: 0.3, enter, exit };
      const e = motionExprs(clip);
      for (let t = 9.9; t <= 13.1; t += 0.05) {
        const a = animAt(clip, t);
        assert.ok(Math.abs(evalFf(e.scale, t) - a.scale) < 1e-4, `${enter}/${exit} scale at ${t}`);
        assert.ok(Math.abs(evalFf(e.dx, t) - a.dx) < 1e-4, `${enter}/${exit} dx at ${t}`);
        assert.ok(Math.abs(evalFf(e.dy, t) - a.dy) < 1e-4, `${enter}/${exit} dy at ${t}`);
      }
    }
});

test("pop overshoots a little, fades in over its first third, and plain fades stay cheap", () => {
  const clip = { start: 0, duration: 3, fadeIn: 0.6, fadeOut: 0.3, enter: "pop" as Motion };
  const peak = Math.max(...Array.from({ length: 60 }, (_, i) => animAt(clip, i * 0.01).scale));
  assert.ok(peak > 1.05 && peak < 1.15, `overshoot ${peak}`);
  assert.equal(animAt(clip, 0.2).opacity, 1);
  assert.equal(animAt(clip, 1.5).scale, 1);
  const fade = motionExprs(clip).fades[0];
  assert.ok(fade.kind === "in" && fade.start === 0 && Math.abs(fade.duration - 0.2) < 1e-9);
  assert.ok(isMoving(clip));
  assert.ok(
    !isMoving({ start: 0, duration: 3, fadeIn: 0.3, fadeOut: 0.3 }),
    "a dissolve is not movement",
  );
});

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

test("export: a picture popping in grows around its own center", { timeout: 60_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-motion-"));
  const img = join(dir, "balao.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=200x100",
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
        name: "balão",
        path: img,
        kind: "image",
        duration: 0,
        width: 200,
        height: 100,
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
    // Natural size (scale 200/640) centered at (400, 120).
    clips: [
      {
        id: "c",
        assetId: "i",
        trackId: "v",
        start: 0.5,
        in: 0,
        duration: 2,
        volume: 1,
        transform: { x: 400 / 640, y: 120 / 360, scale: 200 / 640, opacity: 1 },
        fadeIn: 0.6,
        enter: "pop",
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
    FILTER_SCRIPT_OPTION,
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
  // Early in the pop: small (center red, edge not yet); later: full size (200×100 → 300..500 × 70..170).
  assert.ok(red(px(0.62, 400, 120)), "center appears first");
  assert.ok(!red(px(0.62, 310, 120)), "still small");
  assert.ok(red(px(1.5, 310, 120)) && red(px(1.5, 490, 160)), "full size after the pop");
  assert.ok(!red(px(1.5, 290, 120)), "and not bigger than its natural size");
});
