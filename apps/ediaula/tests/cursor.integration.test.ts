import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildTrack, DEFAULT_CURSOR_FX, spritePositions } from "../src/shared/cursor.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

test("export draws the moving pointer sprite and zooms the recording like the preview", {
  timeout: 120_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-cursor-"));
  const screen = join(dir, "tela.mp4");
  // A gray "screen" so the red pointer is easy to find.
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x808080:s=640x360:r=30:d=3",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    screen,
  ]);

  // Sprite: 40×40 transparent with a 20×20 red square in the middle, 90 frames.
  const S = 40;
  const frame = new Uint8Array(S * S * 4);
  for (let y = 10; y < 30; y++)
    for (let x = 10; x < 30; x++) frame.set([255, 0, 0, 255], (y * S + x) * 4);
  const sprite = join(dir, "cursor.webm");
  const enc = spawnSync(
    FFMPEG,
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${S}x${S}`,
      "-r",
      "30",
      "-i",
      "-",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      sprite,
    ],
    {
      input: Buffer.concat(Array.from({ length: 90 }, () => Buffer.from(frame))),
    },
  );
  assert.equal(enc.status, 0, enc.stderr?.toString());
  // Pointer at (100,100) for the first second, then at (400,250).
  const cursorFx = {
    ...DEFAULT_CURSOR_FX,
    path: [
      { t: 0, x: 100, y: 100 },
      { t: 0.9, x: 100, y: 100, outHandle: { x: 0, y: 100 } },
      { t: 1.1, x: 400, y: 250, inHandle: { x: 0, y: 100 } },
      { t: 3, x: 400, y: 250 },
    ],
  };
  const track = buildTrack(
    {
      version: 1,
      width: 640,
      height: 360,
      moves: [[0, 10, 10, 0]],
      clicks: [],
      wheel: [],
      markers: [],
    },
    cursorFx,
    3,
  );
  const positions = Array.from(spritePositions(track, 30, 3, S));

  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      {
        id: "a",
        name: "tela",
        path: screen,
        kind: "video",
        duration: 3,
        width: 640,
        height: 360,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
        cursor: join(dir, "cursor.json"),
      },
    ],
    tracks: [{ id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    // From 2 s on, 2× zoom centered where the pointer is.
    clips: [
      {
        id: "c",
        assetId: "a",
        trackId: "v",
        start: 0,
        in: 0,
        duration: 3,
        volume: 1,
        zooms: [
          {
            id: "z",
            start: 1.6,
            end: 6,
            scale: 2,
            focus: [{ t: 1.6, x: 400 / 640, y: 250 / 360 }],
          },
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
    videoBitrate: 3000,
    normalizeLoudness: false,
    encoder: "x264",
    cursors: { a: { sprite, size: S, fps: 30, positions } },
  });
  const script = join(dir, "filter.txt");
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
  const red = (c: number[]): boolean => c[0] > 180 && c[1] < 80 && c[2] < 80;
  assert.ok(
    red(px(0.5, 100, 100)),
    `pointer at (100,100) in the first second: ${px(0.5, 100, 100)}`,
  );
  assert.ok(!red(px(0.5, 400, 250)), "not yet at its second spot");
  assert.ok(red(px(1.3, 400, 250)), `moved by the sendcmd script: ${px(1.3, 400, 250)}`);
  assert.ok(
    red(px(1, 250, 250)),
    "Bezier handles curve the exported cursor away from the straight segment",
  );
  // Fully zoomed (after 1.6 + 0.7 s): 2x around the pointer, which lands in the middle of the frame
  // (view x 240..560, y 160..340: (400-240)*2 = 320, (250-160)*2 = 180), twice as big.
  assert.ok(red(px(2.6, 320, 180)), "zoomed pointer at the center: " + px(2.6, 320, 180));
  assert.ok(
    red(px(2.6, 306, 166)) && red(px(2.6, 334, 194)) && !red(px(2.6, 346, 206)),
    "and twice as big",
  );
});
