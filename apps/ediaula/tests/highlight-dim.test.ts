import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import type { Annotation } from "../src/shared/annotation.ts";
import { dimHole, dimMaskSvg, highlightBox, triangleCorners } from "../src/shared/dim.ts";
import { fxGraph } from "../src/shared/export/fx.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Clip, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * "Escurecer o resto" of a Destaque: the tracks below it darken around its box, the ones above
 * it do not, and the box stays clear, in the preview's geometry and in the exported file.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-dim-"));
const ff = (args: string[]): Buffer =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe", maxBuffer: 1 << 26 });

const highlight: Annotation = {
  kind: "highlight",
  color: "#FFD60A",
  boxWidth: 360,
  boxHeight: 200,
  dim: 0.6,
};
// The Destaque's picture at 360p (lib/annotations.ts): 2 picture pixels per frame pixel, the
// box and, on every side, the pad (24) and the default outline (8).
const k = (360 / 1080) * 2;
const picture = { width: Math.ceil(360 * k + 64 * k), height: Math.ceil(200 * k + 64 * k) };
// Shown at its natural size: half the picture.
const scale = 1 / (2 * Math.min(640 / picture.width, 360 / picture.height));

test("the hole is the Destaque's box, where the clip is, turned and flipped with it", () => {
  const box = highlightBox(highlight, picture);
  assert.ok(Math.abs(box.w * picture.width - 360 * k) < 1);
  assert.ok(Math.abs(box.x * picture.width - 32 * k) < 1);
  assert.ok(Math.abs(box.h * picture.height - 200 * k) < 1);
  const frame = { width: 640, height: 360 };
  const at = { x: 0.5, y: 0.5, scale, opacity: 1 };
  const hole = dimHole({ annotation: highlight, transform: at }, picture, frame);
  assert.ok(hole);
  assert.ok(Math.abs(hole.cx - 320) < 0.01 && Math.abs(hole.cy - 180) < 0.01);
  assert.ok(Math.abs(hole.w - 120) < 0.5 && Math.abs(hole.h - 200 / 3) < 0.5);
  assert.ok(Math.abs(hole.radius - 6) < 0.1);
  assert.equal(hole.darkness, 0.6);
  // The clip's own opacity lightens the darkening too.
  const half = dimHole(
    { annotation: highlight, transform: { ...at, opacity: 0.5 } },
    picture,
    frame,
  );
  assert.equal(half?.darkness, 0.3);
  // Without the option, or on another kind, nothing darkens.
  assert.equal(
    dimHole({ annotation: { ...highlight, dim: undefined }, transform: at }, picture, frame),
    null,
  );
  assert.equal(
    dimHole({ annotation: { ...highlight, kind: "panel" }, transform: at }, picture, frame),
    null,
  );
  // A cropped clip turns around its visible part's center: the hole goes around it too.
  const cropped = dimHole(
    {
      annotation: highlight,
      transform: { ...at, rotation: 90, crop: { left: 0.5, right: 0, top: 0, bottom: 0 } },
    },
    picture,
    frame,
  );
  assert.ok(cropped);
  assert.equal(cropped.angle, 90);
  const quarter = picture.width / 2 / 4;
  assert.ok(Math.abs(cropped.cx - (320 + quarter)) < 0.01);
  assert.ok(Math.abs(cropped.cy - (180 - quarter)) < 0.01);
  // A triangle upside down when the clip is flipped.
  const tri = dimHole(
    { annotation: { ...highlight, shape: "triangle" }, transform: { ...at, flipV: true } },
    picture,
    frame,
  );
  assert.ok(tri);
  assert.equal(tri.radius, 0);
  assert.ok((triangleCorners(tri)[0]?.[1] ?? 0) > 0);
  // The preview's mask: white, black where the box is.
  const svg = dimMaskSvg({ ...hole, angle: 15 }, 640, 360);
  assert.match(svg, /<rect width="640" height="360" fill="#fff"\/>/);
  assert.match(svg, /rotate\(15 320 180\)/);
  assert.match(dimMaskSvg({ ...hole, shape: "ellipse" }, 640, 360), /<ellipse cx="320" cy="180"/);
});

test("the option is kept in the project file", () => {
  const parsed = projectSchema.safeParse({
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [],
    tracks: [],
    clips: [
      {
        id: "c",
        assetId: "a",
        trackId: "t",
        start: 0,
        in: 0,
        duration: 1,
        volume: 1,
        annotation: highlight,
      },
    ],
  });
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
  assert.equal(parsed.data.clips[0]?.annotation?.dim, 0.6);
});

test("the export darkens the tracks below the Destaque around its box, not the ones above", {
  timeout: 120_000,
}, () => {
  const white = join(dir, "white.png");
  ff(["-f", "lavfi", "-i", "color=c=white:s=640x360", "-frames:v", "1", white]);
  const clear = join(dir, "destaque.png");
  ff([
    "-f",
    "lavfi",
    "-i",
    `color=c=black@0:s=${picture.width}x${picture.height},format=rgba`,
    "-frames:v",
    "1",
    clear,
  ]);
  const image = (id: string, path: string, w: number, h: number): Asset => ({
    id,
    name: id,
    path,
    kind: "image",
    duration: 0,
    width: w,
    height: h,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  });
  const clip = (id: string, assetId: string, trackId: string, extra: Partial<Clip>): Clip => ({
    id,
    assetId,
    trackId,
    start: 0,
    in: 0,
    duration: 1,
    volume: 1,
    ...extra,
  });
  const project: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      image("bg", white, 640, 360),
      image("hl", clear, picture.width, picture.height),
      image("top", white, 640, 360),
    ],
    tracks: [
      { id: "above", kind: "video", name: "Acima", muted: false, hidden: false, locked: false },
      { id: "mark", kind: "video", name: "Destaque", muted: false, hidden: false, locked: false },
      { id: "below", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    ],
    clips: [
      clip("b", "bg", "below", {}),
      clip("h", "hl", "mark", {
        annotation: highlight,
        transform: { x: 0.5, y: 0.5, scale, opacity: 1 },
        fadeIn: 0.2,
        fadeOut: 0.2,
      }),
      // A small white picture on the track above, in the darkened part.
      clip("t", "top", "above", { transform: { x: 0.15, y: 0.15, scale: 0.2, opacity: 1 } }),
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
  const plan = buildExportPlan(project, spec, undefined, () => undefined);
  const script = join(dir, "graph.txt");
  writeFileSync(script, plan.filter);
  const options = [...plan.outputArgs];
  const from = options.indexOf("-c:v");
  options.splice(
    from,
    options.indexOf("-pix_fmt") + 2 - from,
    "-c:v",
    "libx264",
    "-qp",
    "0",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
  );
  ff([...plan.inputArgs, SCRIPT, script, ...options]);
  const gray = (t: number, x: number, y: number): number => {
    const px = Array.from(
      ff([
        "-ss",
        String(t),
        "-i",
        spec.outPath,
        "-frames:v",
        "1",
        "-vf",
        `crop=2:2:${x}:${y},scale=1:1:in_color_matrix=bt709:in_range=tv,format=rgb24`,
        "-f",
        "rawvideo",
        "-",
      ]),
    );
    return (px[0] + px[1] + px[2]) / 3;
  };
  const dark = 255 * (1 - 0.6);
  // Fully in: clear inside the box, dark around it, the track above untouched.
  assert.ok(gray(0.5, 320, 180) > 245, "inside the box");
  assert.ok(Math.abs(gray(0.5, 520, 300) - dark) < 8, "around the box");
  assert.ok(gray(0.5, 96, 54) > 245, "the track above");
  // Fading in with the box.
  const early = gray(0.1, 520, 300);
  assert.ok(early > dark + 30 && early < 245, `half faded: ${early}`);
});

test("every shape's picture is clear in the box and dark around it", { timeout: 60_000 }, () => {
  for (const shape of ["rounded", "rect", "ellipse", "triangle"] as const)
    for (const angle of [0, 30]) {
      const hole = {
        shape,
        cx: 100,
        cy: 60,
        w: 80,
        h: 60,
        radius: shape === "rounded" ? 10 : 0,
        angle,
        flipV: false,
        darkness: 0.5,
      };
      const graph = fxGraph({ kind: "dim", w: 200, h: 120, hole }, "30", "out");
      const alpha = Array.from(
        ff([
          "-filter_complex",
          graph,
          "-map",
          "[out]",
          "-frames:v",
          "1",
          "-pix_fmt",
          "rgba",
          "-f",
          "rawvideo",
          "-",
        ]),
      );
      const at = (x: number, y: number): number => alpha[(y * 200 + x) * 4 + 3] ?? -1;
      // The center (a bit low for the triangle, inside its wide part) and a far corner.
      assert.equal(at(100, shape === "triangle" ? 70 : 60), 0, `${shape} ${angle}° inside`);
      assert.ok(Math.abs(at(5, 5) - 128) <= 1, `${shape} ${angle}° outside: ${at(5, 5)}`);
    }
});
