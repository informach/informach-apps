import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectingProvider } from "../src/main/export/fxAssets.ts";
import {
  type MaskShape,
  maskShape,
  shapeAlpha,
  squareMask,
  type Transform,
} from "../src/shared/compose.ts";
import { fxGraph, fxKey, insideExpr, padGray, shapeExpr } from "../src/shared/export/fx.ts";
import type { MediaLookup } from "../src/shared/export/videoPlan.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { cropToEdges, dragMask, edgesToCrop } from "../src/shared/maskDrag.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, ExportSpec, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const dir = mkdtempSync(join(tmpdir(), "ediaula-mask-"));

const t = (o: Partial<Transform>): Transform => ({ x: 0.5, y: 0.5, scale: 1, opacity: 1, ...o });

test("the mask's shape: an ellipse, corners of any size and a soft edge inward", () => {
  assert.equal(maskShape(t({}), 400, 200, 1080), null);
  assert.deepEqual(maskShape(t({ mask: "ellipse" }), 400, 200, 1080), {
    ellipse: true,
    radius: 0,
    feather: 0,
  });
  // Corners in 1080p pixels, scaled to the export's height; never more than half the short side.
  assert.equal(maskShape(t({ mask: "rounded", corner: 60 }), 400, 300, 540)?.radius, 30);
  assert.equal(maskShape(t({ mask: "rounded", corner: 900 }), 400, 300, 1080)?.radius, 150);
  assert.equal(maskShape(t({ mask: "rounded" }), 400, 300, 1080)?.radius, 28);
  // A soft edge alone still cuts the rectangle (it is not a plain clip).
  assert.deepEqual(maskShape(t({ feather: 20 }), 400, 300, 1080), {
    ellipse: false,
    radius: 0,
    feather: 20,
  });

  const oval: MaskShape = { ellipse: true, radius: 0, feather: 0 };
  assert.equal(shapeAlpha(oval, 400, 200, 200, 100), 1);
  // The box's corner is outside the oval; the middle of its sides is the edge.
  assert.equal(shapeAlpha(oval, 400, 200, 2, 2), 0);
  assert.ok(Math.abs(shapeAlpha(oval, 400, 200, 400, 100) - 0.5) < 0.01);
  const soft: MaskShape = { ellipse: false, radius: 0, feather: 40 };
  assert.equal(shapeAlpha(soft, 400, 200, 200, 100), 1);
  assert.ok(Math.abs(shapeAlpha(soft, 400, 200, 20, 100) - 0.5) < 1e-9);
  assert.equal(shapeAlpha(soft, 400, 200, 0, 100), 0);
});

test("a circle from a mask that was not square keeps its center", () => {
  const c = squareMask({ left: 0.1, right: 0.3, top: 0, bottom: 0 }, 1920, 1080);
  // 60% of 1920 = 1152 wide, 1080 high: the square is 1080, centered on x = 0.4.
  assert.ok(Math.abs(1920 * (1 - c.left - c.right) - 1080) < 1);
  assert.ok(Math.abs((c.left + (1 - c.right)) / 2 - 0.4) < 1e-3);
  assert.equal(c.top, 0);
  assert.equal(c.bottom, 0);
});

test("dragging the mask: moving keeps its size inside the picture, sides and corners resize", () => {
  const start = cropToEdges({ left: 0.25, right: 0.25, top: 0.25, bottom: 0.25 }, 400, 200);
  assert.deepEqual(start, { x0: 100, y0: 50, x1: 300, y1: 150 });
  // Moved past the edge, it stops at it.
  assert.deepEqual(dragMask(start, "move", 500, -80, 400, 200, false), {
    x0: 200,
    y0: 0,
    x1: 400,
    y1: 100,
  });
  // A side moves only that side; it never crosses the opposite one.
  assert.deepEqual(dragMask(start, "e", 50, 0, 400, 200, false), { ...start, x1: 350 });
  assert.equal(dragMask(start, "w", 1000, 0, 400, 200, false).x0, 300 - 0.02 * 400);
  // A corner with the proportion kept: the opposite corner stays still.
  const grown = dragMask(start, "se", 100, 0, 400, 200, true);
  assert.equal(grown.x0, 100);
  assert.equal(grown.y0, 50);
  assert.ok(Math.abs((grown.x1 - grown.x0) / (grown.y1 - grown.y0) - 2) < 1e-9);
  // Kept inside the picture: it grows only as far as there is room.
  assert.ok(grown.y1 <= 200 && grown.x1 <= 400);
  // A side with the proportion kept grows the other way around the middle.
  const side = dragMask(start, "n", 0, -20, 400, 200, true);
  assert.equal(side.y1, 150);
  assert.ok(Math.abs((side.x0 + side.x1) / 2 - 200) < 1e-9);
  // Back to shares of the picture, with the edges exactly at 0.
  assert.deepEqual(edgesToCrop({ x0: 0, y0: 0, x1: 400, y1: 100 }, 400, 200), {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0.5,
  });
});

test("the project file keeps the oval, the corners and the soft edge", () => {
  const project = {
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
        transform: t({ mask: "ellipse", corner: 40, feather: 12 }),
      },
    ],
  };
  assert.ok(projectSchema.safeParse(project).success);
  const bad = structuredClone(project);
  (bad.clips[0].transform as Transform & { feather: number }).feather = -1;
  assert.equal(projectSchema.safeParse(bad).success, false);
});

test("shapes made before keep their export pictures; the new ones get their own", () => {
  assert.equal(shapeExpr(28), insideExpr(28));
  assert.equal(fxKey({ kind: "mask", w: 10, h: 10, radius: 3 }), "mask:10x10:r3");
  assert.equal(
    fxKey({ kind: "mask", w: 10, h: 10, radius: 0, ellipse: true, feather: 2.5 }),
    "mask:10x10:r0:e:f2.5",
  );
});

/** The export's mask picture, made by FFmpeg from fxGraph, as gray bytes. */
function exported(shape: MaskShape, w: number, h: number): Buffer {
  const graph = fxGraph(
    {
      kind: "mask",
      w,
      h,
      radius: shape.radius,
      ...(shape.ellipse ? { ellipse: true } : {}),
      ...(shape.feather ? { feather: shape.feather } : {}),
    },
    "30",
    "out",
  );
  return execFileSync(
    FFMPEG,
    [
      "-v",
      "error",
      "-filter_complex",
      graph,
      "-map",
      "[out]",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 24 },
  );
}

test("the export cuts the same pixels the preview shows", { timeout: 60_000 }, () => {
  const shapes: [MaskShape, number, number][] = [
    [{ ellipse: true, radius: 0, feather: 0 }, 160, 90],
    [{ ellipse: true, radius: 0, feather: 18 }, 160, 90],
    [{ ellipse: false, radius: 24, feather: 10 }, 160, 90],
    [{ ellipse: false, radius: 0, feather: 12 }, 120, 120],
  ];
  for (const [shape, w, h] of shapes) {
    const gray = exported(shape, w, h);
    assert.equal(gray.length, w * h);
    let worst = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const want = 255 * shapeAlpha(shape, w, h, x + 0.5, y + 0.5);
        worst = Math.max(worst, Math.abs(gray[y * w + x] - want));
      }
    // Rounding to 8 bits only.
    assert.ok(worst <= 1.5, `${JSON.stringify(shape)}: off by ${worst}`);
  }
});

test("an oval or a soft edge alone goes through the shape in the export", () => {
  const media: MediaLookup = () => ({ matrix: "bt709", range: "tv", alpha: false, codec: "h264" });
  const video = join(dir, "v.mp4");
  writeFileSync(video, "");
  const asset: Asset = {
    id: "a",
    name: "a",
    path: video,
    kind: "video",
    duration: 2,
    width: 320,
    height: 180,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  };
  const project = (transform: Transform): Project => ({
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [asset],
    tracks: [{ id: "t", kind: "video", name: "V", muted: false, hidden: false, locked: false }],
    clips: [
      { id: "c", assetId: "a", trackId: "t", start: 0, in: 0, duration: 1, volume: 0, transform },
    ],
  });
  const spec: ExportSpec = {
    outPath: join(dir, "o.mp4"),
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 2000,
    normalizeLoudness: false,
    encoder: "x264",
  };
  const masks = (transform: Transform): string[] => {
    const wanted = collectingProvider();
    buildExportPlan(project(transform), spec, wanted.provider, media);
    return wanted.wanted.filter((a) => a.kind === "mask").map(fxKey);
  };
  const crop = { left: 0.2, right: 0.2, top: 0.1, bottom: 0.1 };
  assert.deepEqual(masks(t({ scale: 0.8, crop, mask: "ellipse" })), ["mask:307x230:r0:e"]);
  assert.deepEqual(masks(t({ scale: 0.8, crop, feather: 30 })), ["mask:307x230:r0:f10"]);
  assert.deepEqual(masks(t({ scale: 0.8, crop })), []);
});

test("a shadow's gray picture is padded with zeros, not video black", { timeout: 30_000 }, () => {
  const graph = `color=c=black:s=4x2:r=30,trim=end_frame=1,format=gray,geq=lum='200',${padGray(8, 2, 2, 0, 4, 2)}[out]`;
  const gray = execFileSync(
    FFMPEG,
    ["-v", "error", "-filter_complex", graph, "-map", "[out]", "-frames:v", "1"].concat([
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ]),
  );
  assert.deepEqual([...gray], [0, 0, 200, 200, 200, 200, 0, 0, 0, 0, 200, 200, 200, 200, 0, 0]);
  // The cached shadows made with the faint box are not reused.
  assert.match(
    fxKey({
      kind: "shadow",
      w: 4,
      h: 4,
      radius: 0,
      margin: 2,
      dx: 0,
      dy: 0,
      sigma: 1,
      opacity: 1,
      color: "#000000",
    }),
    /:z$/,
  );
});
