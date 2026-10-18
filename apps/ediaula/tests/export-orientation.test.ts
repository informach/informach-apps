import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Clip, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * Turning and mirroring a picture (Propriedades › Posição e tamanho): the export draws what the
 * preview shows, the visible part mirrored and then turned around its center, by the real
 * FFmpeg of the tests.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-orientation-"));
const ff = (args: string[]): Buffer =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe", maxBuffer: 1 << 26 });

// Left half red, right half blue: which side is where tells mirrored from turned.
const halves = join(dir, "halves.png");
ff([
  ...["-f", "lavfi", "-i", "color=c=red:s=160x180", "-f", "lavfi", "-i", "color=c=blue:s=160x180"],
  ...["-filter_complex", "[0:v][1:v]hstack", "-frames:v", "1", halves],
]);

const picture: Asset = {
  id: "img",
  name: "img",
  path: halves,
  kind: "image",
  duration: 0,
  width: 320,
  height: 180,
  fps: 0,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
};
const at = (id: string, start: number, transform: Clip["transform"]): Clip => ({
  id,
  assetId: "img",
  trackId: "t",
  start,
  in: 0,
  duration: 1,
  volume: 0,
  transform,
});
const project: Project = {
  version: 1,
  id: "p",
  name: "x",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 640, height: 360, fps: 30 },
  assets: [picture],
  tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
  clips: [
    at("mirrored", 0, { x: 0.5, y: 0.5, scale: 0.5, opacity: 1, flipH: true }),
    at("turned", 1, { x: 0.5, y: 0.5, scale: 0.5, opacity: 1, rotation: 90 }),
    at("upside", 2, { x: 0.5, y: 0.5, scale: 0.5, opacity: 1, flipV: true, rotation: 45 }),
  ],
};
const spec: ExportSpec = {
  outPath: join(dir, "out.mp4"),
  width: 640,
  height: 360,
  fps: 30,
  videoBitrate: 2000,
  normalizeLoudness: false,
  encoder: "x264",
};

const rgb = (path: string, t: number, x: number, y: number): number[] =>
  Array.from(
    ff([
      ...["-ss", String(t), "-i", path, "-frames:v", "1", "-vf"],
      `crop=2:2:${x}:${y},scale=1:1:in_color_matrix=bt709:in_range=tv,format=rgb24`,
      ...["-f", "rawvideo", "-"],
    ]),
  );
const red = ([r, g, b]: number[]): boolean => r > 180 && g < 70 && b < 70;
const blue = ([r, g, b]: number[]): boolean => b > 180 && r < 70 && g < 70;
const black = ([r, g, b]: number[]): boolean => r < 40 && g < 40 && b < 40;

test("a mirrored and a turned picture come out as the preview shows them", {
  timeout: 120_000,
}, () => {
  assert.ok(projectSchema.safeParse(project).success);
  const plan = buildExportPlan(project, spec);
  assert.match(plan.filter, /hflip/);
  assert.match(plan.filter, /vflip/);
  assert.match(plan.filter, /rotate=a=1\.571:ow=180:oh=320:c=none/);
  const script = join(dir, "graph.txt");
  writeFileSync(script, plan.filter);
  const options = [...plan.outputArgs];
  const from = options.indexOf("-c:v");
  options.splice(
    from,
    options.indexOf("-pix_fmt") + 2 - from,
    ...["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p"],
  );
  ff([...plan.inputArgs, SCRIPT, script, ...options]);
  const out = spec.outPath;
  // Mirrored: the box is 160..480 × 90..270, blue now on its left and red on its right.
  assert.ok(blue(rgb(out, 0.5, 200, 180)), "blue on the left");
  assert.ok(red(rgb(out, 0.5, 440, 180)), "red on the right");
  // Turned 90° clockwise: 180 × 320 around the center, the left half (red) on top.
  assert.ok(red(rgb(out, 1.5, 320, 60)), "red on top");
  assert.ok(blue(rgb(out, 1.5, 320, 300)), "blue at the bottom");
  assert.ok(black(rgb(out, 1.5, 180, 180)), "nothing where the unturned box was");
  // Turned 45° from mirrored top to bottom: the corners of the frame stay empty.
  assert.ok(black(rgb(out, 2.5, 165, 95)), "the corner of the box turned away");
  assert.ok(!black(rgb(out, 2.5, 320, 180)), "the middle is still the picture");
});

/** Renders `p` with the plan's own filter graph and lossless output, as the test above. */
function render(p: Project, name: string): string {
  const out = join(dir, `${name}.mp4`);
  const plan = buildExportPlan(p, { ...spec, outPath: out });
  const script = join(dir, `${name}.txt`);
  writeFileSync(script, plan.filter);
  const options = [...plan.outputArgs];
  const from = options.indexOf("-c:v");
  options.splice(
    from,
    options.indexOf("-pix_fmt") + 2 - from,
    ...["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p"],
  );
  ff([...plan.inputArgs, SCRIPT, script, ...options]);
  return out;
}

const grayPath = join(dir, "gray.png");
ff(["-f", "lavfi", "-i", "color=c=gray:s=640x360", "-frames:v", "1", grayPath]);
const gray: Asset = { ...picture, id: "gray", path: grayPath, width: 640, height: 360 };
const grayish = ([r, g, b]: number[]): boolean =>
  Math.abs(r - 128) < 30 && Math.abs(g - 128) < 30 && Math.abs(b - 128) < 30;

test("a turned picture is wiped and shadowed on itself, as the preview turns them", {
  timeout: 120_000,
}, () => {
  const turned = { x: 0.5, y: 0.5, scale: 0.5, opacity: 1, rotation: 90 };
  const p: Project = {
    ...project,
    assets: [picture, gray],
    tracks: [
      { id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false },
      { id: "fundo", kind: "video", name: "fundo", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { ...at("fundo", 0, undefined), assetId: "gray", trackId: "fundo", duration: 6 },
      { ...at("wiped", 0, turned), duration: 2 },
      {
        ...at("next", 2, { x: 0.1, y: 0.1, scale: 0.1, opacity: 1 }),
        transition: { kind: "wipe-right", duration: 1 },
      },
      {
        ...at("moving", 4, {
          ...turned,
          shadow: { distance: 30, angle: 0, blur: 0, opacity: 1, color: "#000000" },
        }),
        keyframes: [
          { t: 0, x: 0.3, y: 0.5, scale: 0.5 },
          { t: 1, x: 0.7, y: 0.5, scale: 0.5 },
        ],
      },
    ],
  };
  assert.ok(projectSchema.safeParse(p).success);
  const out = render(p, "turned-fx");
  // A little into the wipe the left half of the picture is gone: turned, that is its top
  // (the red half), while the bottom (blue) is still there on both sides of the middle.
  assert.ok(grayish(rgb(out, 2.2, 380, 60)), "the top of the turned picture is wiped");
  assert.ok(blue(rgb(out, 2.2, 260, 300)), "the bottom stays, left of the middle");
  assert.ok(blue(rgb(out, 2.2, 380, 300)), "and right of the middle");
  // Keyframed and turned: red on top where the movement starts, then where it ends.
  assert.ok(red(rgb(out, 4.05, 194, 60)), "turned at the start of the movement");
  assert.ok(grayish(rgb(out, 4.05, 446, 60)), "not yet at the end");
  assert.ok(red(rgb(out, 4.95, 446, 60)), "turned at the end of the movement");
  // The shadow to the right of the picture turned with it: now under it.
  assert.ok(black(rgb(out, 4.05, 194, 341)), "the shadow under the turned picture");
  assert.ok(grayish(rgb(out, 4.05, 194, 352)), "and only as far as its distance");
  assert.ok(grayish(rgb(out, 4.05, 287, 180)), "not to its right");
});
