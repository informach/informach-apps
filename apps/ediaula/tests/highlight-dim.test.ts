import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import type { Annotation } from "../src/shared/annotation.ts";
import {
  dimHole,
  dimMaskSvg,
  drawnHighlight,
  highlightBox,
  highlightPolygonOnFrame,
  triangleCorners,
} from "../src/shared/dim.ts";
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

/** An arrow-like concave polygon, as fractions of its box. */
const ARROW: [number, number][] = [
  [0, 0.3],
  [0.6, 0.3],
  [0.6, 0],
  [1, 0.5],
  [0.6, 1],
  [0.6, 0.7],
  [0, 0.7],
];

test("a Destaque drawn as a polygon: its hole is the polygon, mirrored with the clip", () => {
  const frame = { width: 640, height: 360 };
  const at = { x: 0.5, y: 0.5, scale, opacity: 1 };
  const drawn: Annotation = { ...highlight, shape: "polygon", polygon: [ARROW] };
  const hole = dimHole({ annotation: drawn, transform: at }, picture, frame);
  assert.ok(hole?.polygon);
  assert.deepEqual(hole.polygon, [ARROW]);
  const flipped = dimHole({ annotation: drawn, transform: { ...at, flipH: true } }, picture, frame);
  assert.deepEqual(flipped?.polygon?.[0]?.[3], [0, 0.5], "the tip points left");
  // Not drawn yet: the rounded box, as its picture.
  const empty = dimHole(
    { annotation: { ...highlight, shape: "polygon" }, transform: at },
    picture,
    frame,
  );
  assert.equal(empty?.shape, "rounded");
  assert.equal(empty?.polygon, undefined);
  assert.match(
    dimMaskSvg(hole, 640, 360),
    /<path fill-rule="evenodd" transform="translate\(259\.93 146\.6\d\)" d="M0 20\.\d+L72/,
  );
  const annotationSchema = projectSchema.shape.clips.element.shape.annotation.unwrap();
  assert.ok(annotationSchema.safeParse(drawn).success);
  // A polygon saved with one list of corners (before it could have several) reads as one outline.
  const old = annotationSchema.parse({ ...highlight, shape: "polygon", polygon: ARROW });
  assert.deepEqual(old.polygon, [ARROW]);
  assert.equal(
    annotationSchema.safeParse({ ...highlight, polygon: Array(9).fill(ARROW.slice(0, 3)) }).success,
    false,
    "eight outlines at most",
  );
});

test("the export clears the polygon, turned, and darkens around it and in its notch", {
  timeout: 60_000,
}, () => {
  for (const angle of [0, 90]) {
    const hole = {
      shape: "polygon" as const,
      cx: 100,
      cy: 60,
      w: 100,
      h: 60,
      radius: 0,
      angle,
      flipV: false,
      polygon: [ARROW],
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
    // The shaft's middle, then the notch beside the shaft (outside the polygon, inside its box).
    const [sx, sy, nx, ny] = angle ? [100, 45, 123, 40] : [85, 60, 70, 36];
    assert.equal(at(sx, sy), 0, `${angle}° inside`);
    assert.ok(Math.abs(at(nx, ny) - 128) <= 1, `${angle}° notch: ${at(nx, ny)}`);
    assert.ok(Math.abs(at(5, 5) - 128) <= 1, `${angle}° outside`);
  }
});

test("a polygon drawn over the frame becomes the Destaque's box, where it was drawn", () => {
  const frame = { width: 640, height: 360 };
  const at = { x: 0.5, y: 0.5, scale, opacity: 1 };
  const clip = { annotation: highlight, transform: at };
  // Drawn at the left of the frame: 64 × 36 frame pixels, a triangle.
  const points: [number, number][] = [
    [0.1, 0.1],
    [0.2, 0.2],
    [0.1, 0.2],
  ];
  const d = drawnHighlight([points], clip, picture, frame);
  assert.ok(d);
  // 360 boxWidth shows 120 frame pixels now: 1080p pixels are three frame pixels.
  assert.equal(d.boxWidth, 192);
  assert.equal(d.boxHeight, 108);
  assert.deepEqual(d.polygon, [
    [
      [0, 0],
      [1, 1],
      [0, 1],
    ],
  ]);
  // The box's center goes from the frame's middle to the drawing's.
  assert.ok(Math.abs(d.dx - (0.15 - 0.5)) < 1e-9 && Math.abs(d.dy - (0.15 - 0.5)) < 1e-9);
  // On a flipped clip the corners are kept as the picture has them (mirrored back).
  const flipped = drawnHighlight(
    [points],
    { ...clip, transform: { ...at, flipH: true } },
    picture,
    frame,
  );
  assert.deepEqual(flipped?.polygon[0]?.[0], [1, 0]);
  // On a turned clip the box is in its own directions: a quarter turn swaps width and height.
  const turned = drawnHighlight(
    [points],
    { ...clip, transform: { ...at, rotation: 90 } },
    picture,
    frame,
  );
  assert.equal(turned?.boxWidth, 108);
  assert.equal(turned?.boxHeight, 192);
  assert.equal(drawnHighlight([points.slice(0, 2)], clip, picture, frame), null);
  // Two rectangles drawn apart: one box around both, each one a fraction of it.
  const two = drawnHighlight(
    [
      [
        [0.1, 0.1],
        [0.2, 0.1],
        [0.2, 0.2],
        [0.1, 0.2],
      ],
      [
        [0.3, 0.1],
        [0.4, 0.1],
        [0.4, 0.2],
        [0.3, 0.2],
      ],
    ],
    clip,
    picture,
    frame,
  );
  // Three times the 0.3 of the frame's width they span (within the picture's rounding).
  assert.ok(Math.abs((two?.boxWidth ?? 0) - 576) <= 1, `${two?.boxWidth}`);
  assert.equal(two?.polygon.length, 2);
  assert.ok(Math.abs((two?.polygon[1]?.[0]?.[0] ?? 0) - 2 / 3) < 1e-4);
});

test("two rectangles in one Destaque: both clear, the rest dark, in the export", {
  timeout: 60_000,
}, () => {
  const hole = {
    shape: "polygon" as const,
    cx: 100,
    cy: 60,
    w: 160,
    h: 80,
    radius: 0,
    angle: 0,
    flipV: false,
    polygon: [
      [
        [0, 0],
        [0.3, 0],
        [0.3, 1],
        [0, 1],
      ],
      [
        [0.7, 0.25],
        [1, 0.25],
        [1, 0.75],
        [0.7, 0.75],
      ],
    ] as [number, number][][],
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
  // The box goes from x 20 to 180 and y 20 to 100: the left rectangle to x 68, the right one
  // from x 132 and y 40 to 80.
  assert.equal(at(40, 60), 0, "left rectangle");
  assert.equal(at(150, 60), 0, "right rectangle");
  assert.ok(Math.abs(at(100, 60) - 128) <= 1, `between them: ${at(100, 60)}`);
  assert.ok(Math.abs(at(150, 30) - 128) <= 1, `above the right one: ${at(150, 30)}`);
  assert.ok(Math.abs(at(5, 5) - 128) <= 1, "outside");
  // The preview's mask has both, in one even-odd path.
  assert.match(
    dimMaskSvg(hole, 200, 120),
    /d="M0 0L48 0L48 80L0 80ZM112 20L160 20L160 60L112 60Z"/,
  );
});

test("the pen opens with the Destaque's shapes where they are, so drawing again adds to them", () => {
  const frame = { width: 640, height: 360 };
  const shapes: [number, number][][] = [
    [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
      [0.1, 0.2],
    ],
    [
      [0.3, 0.15],
      [0.4, 0.15],
      [0.35, 0.25],
    ],
  ];
  for (const transform of [
    { x: 0.5, y: 0.5, scale, opacity: 1 },
    { x: 0.4, y: 0.6, scale, opacity: 1, rotation: 30, flipH: true },
  ]) {
    const clip = { annotation: highlight, transform };
    const d = drawnHighlight(shapes, clip, picture, frame);
    assert.ok(d);
    // The Destaque made from them, where it lands.
    const placed = {
      annotation: {
        ...highlight,
        shape: "polygon" as const,
        polygon: d.polygon,
        boxWidth: d.boxWidth,
        boxHeight: d.boxHeight,
      },
      transform: { ...transform, x: transform.x + d.dx, y: transform.y + d.dy },
    };
    // Its picture is redrawn at the same size per pixel: the box's share of the picture changes.
    const k = (360 / 1080) * 2;
    const redrawn = {
      width: Math.ceil(d.boxWidth * k + 64 * k),
      height: Math.ceil(d.boxHeight * k + 64 * k),
    };
    const sized = {
      ...placed,
      // Same frame pixels per picture pixel: scale 1 fits the picture in the frame.
      transform: {
        ...placed.transform,
        scale:
          (scale * Math.min(640 / picture.width, 360 / picture.height)) /
          Math.min(640 / redrawn.width, 360 / redrawn.height),
      },
    };
    const back = highlightPolygonOnFrame(sized, redrawn, frame);
    assert.ok(back);
    for (const [s, outline] of shapes.entries())
      for (const [i, [x, y]] of outline.entries()) {
        const [bx, by] = back[s]?.[i] ?? [Number.NaN, Number.NaN];
        // Within a pixel of the frame (the box is kept in whole 1080p pixels).
        assert.ok(
          Math.abs(bx - x) * 640 < 1.5 && Math.abs(by - y) * 360 < 1.5,
          `${s}:${i} ${bx},${by}`,
        );
      }
  }
  assert.equal(
    highlightPolygonOnFrame(
      { annotation: highlight, transform: { x: 0.5, y: 0.5, scale, opacity: 1 } },
      picture,
      frame,
    ),
    undefined,
  );
});
