import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FFPROBE: string = require("ffprobe-static").path;

function lesson(dir: string): Project {
  const video = join(dir, "aula.mp4");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=30:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=2",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    video,
  ]);
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      {
        id: "v",
        name: "aula",
        path: video,
        kind: "video",
        duration: 2,
        width: 640,
        height: 360,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        size: 1,
        proxyStatus: "none",
      },
    ],
    tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "v", trackId: "t", start: 0, in: 0, duration: 2, volume: 1 }],
  };
}

function render(p: Project, spec: ExportSpec, dir: string): void {
  const plan = buildExportPlan(p, spec);
  const script = join(dir, `f-${Date.now()}.txt`);
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
}

const probe = (
  path: string,
): { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] } =>
  JSON.parse(
    execFileSync(FFPROBE, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      path,
    ]).toString(),
  );

test("Reels/Shorts: a tall video with the whole lesson in the middle over a blurred copy", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-fmt-"));
  const p = lesson(dir);
  const out = join(dir, "reels.mp4");
  render(
    p,
    {
      outPath: out,
      width: 360,
      height: 640,
      fps: 30,
      videoBitrate: 2000,
      normalizeLoudness: false,
      encoder: "x264",
      vertical: "blur",
    },
    dir,
  );
  const v = probe(out).streams.find((s) => s.codec_type === "video")!;
  assert.deepEqual([v.width, v.height], [360, 640]);
  // The lesson (testsrc2 color bars) sits in the middle third; above it is the darkened blur.
  const px = (x: number, y: number): number[] =>
    Array.from(
      execFileSync(FFMPEG, [
        "-v",
        "error",
        "-ss",
        "1",
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
  const top = px(178, 40);
  const middle = px(178, 320);
  assert.ok(
    Math.max(...middle) - Math.min(...middle) > 60 || Math.max(...middle) > 150,
    `sharp lesson in the middle: ${middle}`,
  );
  assert.ok(Math.max(...top) < 200, `blurred, darker background above: ${top}`);
  const crop = join(dir, "crop.mp4");
  render(
    p,
    {
      outPath: crop,
      width: 360,
      height: 640,
      fps: 30,
      videoBitrate: 2000,
      normalizeLoudness: false,
      encoder: "x264",
      vertical: "crop",
    },
    dir,
  );
  const c = probe(crop).streams.find((s) => s.codec_type === "video")!;
  assert.deepEqual([c.width, c.height], [360, 640]);
});

test("Podcast: only the mixed sound, as MP3, without drawing any video", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-fmt-"));
  const p = lesson(dir);
  const out = join(dir, "aula.mp3");
  const spec: ExportSpec = {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 0,
    normalizeLoudness: true,
    encoder: "x264",
    audioOnly: true,
  };
  assert.doesNotMatch(buildExportPlan(p, spec).filter, /overlay|color=c=black/);
  render(p, spec, dir);
  const s = probe(out).streams;
  assert.equal(s.length, 1);
  assert.equal(s[0].codec_name, "mp3");
});

test("circle mask with a border: transparent corners, picture inside, colored ring at the edge", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-fmt-"));
  const white = join(dir, "white.png");
  const red = join(dir, "red.png");
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
    white,
  ]);
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
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [img("w", white, 640, 360), img("r", red, 200, 200)],
    tracks: [
      { id: "top", kind: "video", name: "Câmera", muted: false, hidden: false, locked: false },
      { id: "bg", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "b", assetId: "w", trackId: "bg", start: 0, in: 0, duration: 1, volume: 1 },
      // 200×200 circle centered at (320,180), lime border.
      {
        id: "c",
        assetId: "r",
        trackId: "top",
        start: 0,
        in: 0,
        duration: 1,
        volume: 1,
        transform: {
          x: 0.5,
          y: 0.5,
          scale: 200 / 360,
          opacity: 1,
          mask: "circle",
          border: "#C8F031",
        },
      },
    ],
  };
  const out = join(dir, "mask.mp4");
  render(
    p,
    {
      outPath: out,
      width: 640,
      height: 360,
      fps: 30,
      videoBitrate: 3000,
      normalizeLoudness: false,
      encoder: "x264",
    },
    dir,
  );
  const px = (x: number, y: number): number[] =>
    Array.from(
      execFileSync(FFMPEG, [
        "-v",
        "error",
        "-ss",
        "0.5",
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
  const center = px(319, 179);
  const corner = px(226, 86);
  const ring = px(319, 80);
  assert.ok(center[0] > 200 && center[1] < 80, `red inside: ${center}`);
  assert.ok(
    corner.every((v) => v > 220),
    `corner of the square is transparent (white behind): ${corner}`,
  );
  assert.ok(ring[1] > 150 && ring[2] < 140, `lime ring at the top edge: ${ring}`);
});
