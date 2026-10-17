import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import {
  colorFxShapes,
  exprFn,
  foldGeometry,
  maskCss,
  pageCorners,
  quadMatrix3d,
  shapeExpr,
  type TransitionKind,
  tailProgress,
  withTransitions,
} from "../src/shared/transitions.ts";
import type { Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

const dir = mkdtempSync(join(tmpdir(), "ediaula-tfx-"));
const clipFile = (name: string, color: string): string => {
  const path = join(dir, `${name}.mp4`);
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x180:r=30:d=2`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    path,
  ]);
  return path;
};
const RED = clipFile("a", "red");
const BLUE = clipFile("b", "blue");

function project(kind: TransitionKind, duration = 1): Project {
  const asset = (id: string, path: string) => ({
    id,
    name: id,
    path,
    kind: "video" as const,
    duration: 2,
    width: 320,
    height: 180,
    fps: 30,
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
    settings: { width: 320, height: 180, fps: 30 },
    assets: [asset("a", RED), asset("b", BLUE)],
    tracks: [{ id: "t", kind: "video", name: "F1", muted: false, hidden: false, locked: false }],
    // A ends at 2 s, where its source ends too: its tail holds the last frame.
    clips: [
      { id: "A", assetId: "a", trackId: "t", start: 0, in: 0, duration: 2, volume: 1 },
      {
        id: "B",
        assetId: "b",
        trackId: "t",
        start: 2,
        in: 0,
        duration: 2,
        volume: 1,
        transition: { kind, duration },
      },
    ],
  };
}

/** Renders the project and reads pixels of the frame at `t` ('r' = red-ish, 'b' = blue-ish). */
function frame(p: Project, t: number): (x: number, y: number) => string {
  const out = join(
    dir,
    `${p.clips[1].transition!.kind}-${Math.random().toString(36).slice(2)}.mp4`,
  );
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 320,
    height: 180,
    fps: 30,
    videoBitrate: 3000,
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
  return (x, y) => {
    const [r, g, b] = Array.from(
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
    return r > 150 && b < 100 ? "r" : b > 150 && r < 100 ? "b" : `?${r},${g},${b}`;
  };
}

// Halfway through a 1 s transition at the 2 s cut (eased progress 0.5).
const MID = 2.5;

for (const [kind, expect] of [
  ["wipe-right", { left: "b", right: "r" }],
  ["wipe-left", { left: "r", right: "b" }],
  ["slide", { left: "r", right: "b" }],
  ["page", { left: "r", right: "b" }],
  ["clock", { left: "r", right: "b" }],
] as [TransitionKind, { left: string; right: string }][]) {
  test(`export: ${kind} halfway shows the outgoing and incoming scenes on the expected sides`, {
    timeout: 60_000,
  }, () => {
    const px = frame(project(kind), MID);
    assert.equal(px(30, 88), expect.left, "left side");
    assert.equal(px(286, 88), expect.right, "right side");
  });
}

test("export: circles open in the middle and close toward it", { timeout: 60_000 }, () => {
  const open = frame(project("circle-open"), MID);
  assert.equal(open(158, 88), "b");
  assert.equal(open(2, 2), "r");
  const close = frame(project("circle-close"), MID);
  assert.equal(close(158, 88), "r");
  assert.equal(close(2, 2), "b");
});

test("export: transition tails hold the source end at slower and faster playback speeds", {
  timeout: 60_000,
}, () => {
  for (const speed of [0.5, 2]) {
    const duration = Math.min(1, 1 / speed);
    const p = project("wipe-right", duration);
    p.clips[0].speed = speed;
    p.clips[0].duration = 2 / speed;
    p.clips[1].start = p.clips[0].duration;
    const px = frame(p, p.clips[1].start + duration / 2);
    assert.equal(px(30, 88), "b", `incoming scene at speed ${speed}`);
    assert.equal(px(286, 88), "r", `held outgoing scene at speed ${speed}`);
  }
});

const rgb = (v: string): number[] =>
  v.startsWith("?") ? v.slice(1).split(",").map(Number) : v === "r" ? [255, 0, 0] : [0, 0, 255];

for (const kind of [
  "colorwipe",
  "colorbars",
  "colorcircles",
  "colorpanels",
  "colorsplit",
] as TransitionKind[]) {
  test(`export: ${kind} covers the cut with its front color (colors chosen by the user)`, {
    timeout: 60_000,
  }, () => {
    const p = project(kind, 1);
    p.clips[1].transition!.colors = ["#00FF00", "#FF00FF", "#FFFF00"];
    const px = frame(p, 2);
    // colorsplit: the top half is the front color; colorbars: the fourth bar (index 3) repeats the first color.
    const [x, y] = kind === "colorsplit" ? [158, 40] : kind === "colorbars" ? [184, 88] : [158, 88];
    const [r, g, b] = rgb(px(x, y));
    assert.ok(g > 200 && r < 80 && b < 80, `front color (green) over the cut: ${r},${g},${b}`);
    // Well before and after, the scenes themselves.
    assert.equal(frame(p, 1.2)(158, 88), "r");
    assert.equal(frame(p, 2.9)(158, 88), "b");
  });
}

test("export: paper fold peels from the bottom-right corner, flap shows the back of the paper", {
  timeout: 60_000,
}, () => {
  const early = frame(project("fold"), 2.2);
  assert.equal(early(4, 4), "r", "top-left still the page");
  assert.equal(early(312, 172), "b", "bottom-right peeled: next scene");
  const px = frame(project("fold"), MID);
  // Somewhere along the diagonal the flap is light paper (not red, not blue).
  const along = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55].map((f) =>
    rgb(px(Math.round(320 * f), Math.round(180 * f))),
  );
  assert.ok(
    along.some(([r, g, b]) => r > 180 && g > 170 && b > 150),
    `paper on the diagonal: ${JSON.stringify(along)}`,
  );
});

test("export: glitch breaks the frame around the cut and leaves the scenes intact outside it", {
  timeout: 60_000,
}, () => {
  const p = project("glitch", 0.6);
  assert.equal(frame(p, 1.5)(158, 88), "r", "before the glitch");
  assert.equal(frame(p, 2.6)(158, 88), "b", "after the glitch");
  const tail = withTransitions(p).clips[0];
  assert.equal(tail.tailFx, "glitch", "blocks of the outgoing scene linger after the cut");
});

test("preview curves: masks, page turn and color bands match the export geometry", () => {
  const tail = withTransitions(project("wipe-right")).clips[0];
  assert.equal(tail.tail, 1);
  assert.equal(tailProgress(tail, 2.5), 0.5);
  assert.deepEqual(maskCss("wipe-right", 0.5, 320, 180), { clipPath: "inset(0 0 0 50.000%)" });
  // matrix3d maps the box corners onto the page corners.
  const q = pageCorners(0.5, 320, 180);
  const m = quadMatrix3d(320, 180, q).slice(9, -1).split(",").map(Number);
  const map = (x: number, y: number): [number, number] => {
    const w = m[3] * x + m[7] * y + m[15];
    return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
  };
  for (const [i, [x, y]] of (
    [
      [0, 0],
      [320, 0],
      [320, 180],
      [0, 180],
    ] as [number, number][]
  ).entries()) {
    const [X, Y] = map(x, y);
    assert.ok(Math.abs(X - q[i][0]) < 1e-6 && Math.abs(Y - q[i][1]) < 1e-6, `corner ${i}`);
  }
  // The preview evaluates the export's own shape expressions: same numbers.
  const shapes = colorFxShapes(
    { kind: "colorcircles", at: 2, duration: 1, colors: ["#000000", "#111111"] },
    320,
    180,
  );
  const ring = shapes[0] as Extract<(typeof shapes)[number], { type: "ring" }>;
  assert.ok(exprFn(ring.rOut)(2) > 180, "front ring fills the frame at the cut");
  assert.equal(exprFn(ring.rIn)(2), 0);
  assert.equal(exprFn(shapeExpr(ring, "160", "90"))(2), 1);
  // Paper fold geometry: the page and the flap meet at the fold line.
  const g = foldGeometry(0.5, 320, 180);
  assert.ok(g.page.length >= 3 && g.flap.length >= 3);
});

test("the preview reads every color-transition expression without eval, with the same values", () => {
  for (const kind of [
    "colorwipe",
    "colorbars",
    "colorcircles",
    "colorpanels",
    "colorsplit",
  ] as const) {
    for (const s of colorFxShapes(
      { kind, at: 2, duration: 1, colors: ["#000000", "#111111", "#222222"] },
      320,
      180,
    )) {
      for (const [k, v] of Object.entries(s)) {
        if (k === "type" || k === "color") continue;
        for (const T of [1.4, 1.9, 2, 2.3])
          assert.ok(Number.isFinite(exprFn(v as string)(T)), `${kind}.${k} at ${T}`);
      }
    }
  }
  assert.equal(exprFn("if(gt(T,1),2*PI,-3+mod(7,4))")(2), 2 * Math.PI);
  assert.equal(exprFn("if(gt(T,1),2*PI,-3+mod(7,4))")(0), 0);
  assert.equal(exprFn("clip((T-1.5)/0.5,0,1)*between(T,0,10)")(1.75), 0.5);
});
