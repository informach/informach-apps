import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { exprFn } from "../src/shared/transitions.ts";
import type { Clip, Project } from "../src/shared/types.ts";
import {
  entryView,
  layerViewAt,
  layerViewExprs,
  zoomAffine,
  zoomsOver,
} from "../src/shared/zoomLayer.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

function project(dir: string): Project {
  // Background: red, green / blue, yellow quadrants. On top of the zoom layer: a white square.
  const bg = join(dir, "quad.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=160x90",
    "-f",
    "lavfi",
    "-i",
    "color=lime:s=160x90",
    "-f",
    "lavfi",
    "-i",
    "color=blue:s=160x90",
    "-f",
    "lavfi",
    "-i",
    "color=yellow:s=160x90",
    "-filter_complex",
    "[0][1]hstack[t];[2][3]hstack[b];[t][b]vstack",
    "-frames:v",
    "1",
    "-update",
    "1",
    bg,
  ]);
  const sq = join(dir, "sq.png");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=white:s=40x40",
    "-frames:v",
    "1",
    "-update",
    "1",
    sq,
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
  const track = (id: string) => ({
    id,
    kind: "video" as const,
    name: id,
    muted: false,
    hidden: false,
    locked: false,
  });
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 320, height: 180, fps: 30 },
    assets: [
      img("bg", bg, 320, 180),
      img("sq", sq, 40, 40),
      { ...img("fx", sq, 1, 1), generated: "effect" },
    ],
    tracks: [track("top"), track("zoom"), track("base")],
    clips: [
      { id: "b", assetId: "bg", trackId: "base", start: 0, in: 0, duration: 3, volume: 1 },
      {
        id: "z",
        assetId: "fx",
        trackId: "zoom",
        start: 0.5,
        in: 0,
        duration: 2,
        volume: 1,
        zoomLayer: { scale: 2, x: 0.25, y: 0.25, ease: 0.2 },
      },
      {
        id: "s",
        assetId: "sq",
        trackId: "top",
        start: 0,
        in: 0,
        duration: 3,
        volume: 1,
        transform: { x: 0.5, y: 0.5, scale: 40 / 180, opacity: 1 },
      },
    ],
  };
}

test("zoom layer: the tracks below are zoomed while it lasts, the ones above are not", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-zl-"));
  const p = project(dir);
  const out = join(dir, "out.mp4");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 320,
    height: 180,
    fps: 30,
    videoBitrate: 3000,
    normalizeLoudness: false,
    encoder: "x264",
  });
  writeFileSync(join(dir, "f.txt"), plan.filter);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    ...plan.inputArgs,
    FILTER_SCRIPT_OPTION,
    join(dir, "f.txt"),
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
        `crop=4:4:${x}:${y},scale=1:1`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]),
    );
  const yellow = (c: number[]): boolean => c[0] > 200 && c[1] > 200 && c[2] < 80;
  const red = (c: number[]): boolean => c[0] > 200 && c[1] < 80 && c[2] < 80;
  const white = (c: number[]): boolean => c.every((v) => v > 200);
  // Before the zoom: the bottom-right quadrant is yellow. During it the red quadrant fills the frame.
  assert.ok(yellow(px(0.2, 290, 160)), "yellow before");
  assert.ok(red(px(1.5, 290, 160)), "zoomed into the red quadrant");
  assert.ok(yellow(px(2.9, 290, 160)), "back after");
  // The square above the zoom layer keeps its size: 40 px wide around the center, not 80.
  assert.ok(white(px(1.5, 158, 88)), "square still there");
  assert.ok(!white(px(1.5, 194, 88)), "square not zoomed");
});

test("preview: the same view maps the center of the zoom to the middle of the frame", () => {
  const p = project(mkdtempSync(join(tmpdir(), "ediaula-zl2-")));
  // A layer on the base track (index 2) is under the zoom; the top track (index 0) is not.
  assert.equal(zoomsOver(p, 0, 1.5).length, 0);
  const views = zoomsOver(p, 2, 1.5);
  assert.equal(views.length, 1);
  const a = zoomAffine(views, 320, 180);
  assert.equal(a.s, 2);
  // The point (80, 45) — the zoom center — lands in the middle of the frame.
  assert.deepEqual([a.s * 80 + a.tx, a.s * 45 + a.ty], [160, 90]);
});

test("zoom in and out are each optional, and a layer can continue from the previous one", () => {
  const layer = (
    id: string,
    start: number,
    duration: number,
    z: Partial<NonNullable<Clip["zoomLayer"]>>,
  ): Clip => ({
    id,
    assetId: "fx",
    trackId: "zoom",
    start,
    in: 0,
    duration,
    volume: 1,
    zoomLayer: { scale: 2, x: 0.25, y: 0.25, easeIn: 0.5, easeOut: 0.5, ...z },
  });
  // No way in: already at 2× right after the start. No way out: still 2× right before the end.
  const hard = layer("h", 0, 4, { zoomIn: false, zoomOut: false });
  assert.equal(layerViewAt(hard, 0.01).scale, 2);
  assert.equal(layerViewAt(hard, 3.99).scale, 2);
  const soft = layer("s", 0, 4, {});
  assert.ok(layerViewAt(soft, 0.1).scale < 1.2);
  assert.ok(layerViewAt(soft, 3.9).scale < 1.2);
  // Pan: the second layer starts where the first (staying zoomed) ends, at the first one's view.
  const a = layer("a", 0, 2, { zoomOut: false });
  const b = layer("b", 2, 2, { x: 0.75, y: 0.75 });
  const p = {
    clips: [a, b],
    tracks: [
      { id: "zoom", kind: "video" as const, name: "z", muted: false, hidden: false, locked: false },
    ],
  };
  const from = entryView(p, b);
  assert.deepEqual(from, { scale: 2, cx: 0.25, cy: 0.25 });
  const start = layerViewAt(b, 2.001, from);
  assert.ok(Math.abs(start.cx - 0.25) < 0.01 && start.scale === 2, "no jump back to 1×");
  assert.ok(Math.abs(layerViewAt(b, 2.6, from).cx - 0.75) < 1e-9, "arrives at the new spot");
  // A 1× layer after a held zoom is the "restore".
  const restore = layer("r", 2, 1, { scale: 1, x: 0.5, y: 0.5, zoomOut: false });
  assert.equal(layerViewAt(restore, 2.99, entryView({ clips: [a, restore] }, restore)).scale, 1);
  // The export's expression is the same curve, everywhere along the layer.
  for (const c of [hard, soft, b]) {
    const f = entryView(p, c);
    const e = layerViewExprs(c, f, "T");
    for (let t = c.start; t < c.start + c.duration; t += 0.05) {
      const v = layerViewAt(c, t, f);
      assert.ok(
        Math.abs(exprFn(e.scale)(t) - v.scale) < 1e-3 &&
          Math.abs(exprFn(e.cx)(t) - v.cx) < 1e-3 &&
          Math.abs(exprFn(e.cy)(t) - v.cy) < 1e-3,
        `${c.id} at ${t}`,
      );
    }
  }
});
