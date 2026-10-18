import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { concatList } from "../src/shared/export/assemble.ts";
import {
  exportProject,
  frameRate,
  type Rate,
  trackTimescale,
} from "../src/shared/export/frames.ts";
import { buildVideoWindowPlan, type VideoWindow } from "../src/shared/export/videoPlan.ts";
import { cutFxFilter } from "../src/shared/exportPlan.ts";
import type { Asset, Clip, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * What every exported frame shows, read back exactly: the sources are lossless and carry their own
 * frame number and an id in each pixel (Y = 16 + frame mod 200, Cb = 16 + 8 × (frame div 200),
 * Cr = the source id), so each output frame says which frame of which source it is; the canvas
 * (black, Cr 128) says it is a gap.
 */

const require = createRequire(import.meta.url);
// EDIAULA_TEST_FFMPEG runs the same checks with another build (the app bundles FFmpeg 9).
const FFMPEG: string = process.env.EDIAULA_TEST_FFMPEG ?? require("ffmpeg-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-frames-"));
const ff = (args: string[]): Buffer =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe", maxBuffer: 1 << 28 });

const IDS = { a: 60, b: 200 } as const;
/** A numbered source of `frames` frames at `rate`, or with the given timestamps (seconds). */
function numbered(name: keyof typeof IDS, rate: string, frames: number, times?: number[]): string {
  const path = join(
    dir,
    `${name}-${rate.replace("/", "_")}-${frames}-${times?.join("_") ?? "cfr"}.mp4`,
  );
  const pts = times
    ? `,setpts='${times.reduceRight((rest, t, i) => `if(eq(N,${i}),${t}/TB,${rest})`, "0")}'`
    : "";
  ff([
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=32x16:r=${rate},trim=end_frame=${frames},geq=lum='16+mod(N,200)':cb='16+8*floor(N/200)':cr=${IDS[name]}${pts}`,
    ...(times ? ["-fps_mode", "vfr"] : ["-r", rate]),
    "-c:v",
    "libx264",
    "-qp",
    "0",
    "-preset",
    "ultrafast",
    "-g",
    "12",
    "-pix_fmt",
    "yuv444p",
    path,
  ]);
  return path;
}

const video = (id: string, path: string, duration: number, fps: number): Asset => ({
  id,
  name: id,
  path,
  kind: "video",
  duration,
  width: 32,
  height: 16,
  fps,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
});
const lesson = (fps: number, assets: Asset[], clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "x",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 32, height: 16, fps },
  assets,
  tracks: [{ id: "main", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips,
});
const specOf = (fps: number): ExportSpec => ({
  outPath: "x.mp4",
  width: 32,
  height: 16,
  fps,
  videoBitrate: 1000,
  normalizeLoudness: false,
  encoder: "x264",
});

/** Renders the windows losslessly, joins them as the export does, and reads every frame back. */
function frames(project: Project, r: Rate, windows: VideoWindow[], name: string): string[] {
  const derived = exportProject(project, r);
  const files = windows.map((win, i) => {
    const plan = buildVideoWindowPlan(derived, specOf(project.settings.fps), r, win);
    const script = join(dir, `${name}-${i}.txt`);
    writeFileSync(script, plan.filter);
    const out = join(dir, `${name}-${i}.mp4`);
    ff([
      ...plan.inputArgs,
      SCRIPT,
      script,
      "-map",
      `[${plan.output}]`,
      "-c:v",
      "libx264",
      "-qp",
      "0",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv444p",
      "-r",
      r.text,
      "-frames:v",
      String(win.frames),
      "-video_track_timescale",
      String(trackTimescale(r)),
      "-an",
      out,
    ]);
    return { path: out, frames: win.frames };
  });
  let out = files[0].path;
  if (files.length > 1) {
    const list = join(dir, `${name}.txt`);
    writeFileSync(list, concatList(files, r));
    out = join(dir, `${name}.mp4`);
    ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  }
  // The middle pixel of each frame (the picture fills the frame, all pixels alike).
  const raw = ff([
    "-i",
    out,
    "-vf",
    "crop=2:2:15:7,scale=1:1:flags=neighbor,format=yuv444p",
    "-f",
    "rawvideo",
    "-",
  ]);
  const out2: string[] = [];
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const [y, u, v] = [raw[i], raw[i + 1], raw[i + 2]];
    const id = Object.entries(IDS).find(([, value]) => Math.abs(v - value) <= 1)?.[0];
    out2.push(id ? `${id}${y - 16 + 200 * Math.round((u - 16) / 8)}` : "black");
  }
  return out2;
}

const expect = (n: number, at: (f: number) => string): string[] =>
  Array.from({ length: n }, (_, f) => at(f));

for (const fps of [25, 30000 / 1001, 30, 60]) {
  test(`every frame is the right source frame at ${fps.toFixed(2)} fps: a clip from frame 31, a border at 123`, {
    timeout: 120_000,
  }, () => {
    const r = frameRate(fps);
    const f = r.num / r.den;
    const a = numbered("a", r.text, 300);
    const b = numbered("b", r.text, 300);
    // B starts at output frame 31 showing its frame 10 (its in-point is 10 frames into it).
    const project = lesson(
      fps,
      [video("a", a, 300 / f, f), video("b", b, 300 / f, f)],
      [
        { id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 31 / f, volume: 1 },
        {
          id: "B",
          assetId: "b",
          trackId: "main",
          start: 31 / f,
          in: 10 / f,
          duration: 169 / f,
          volume: 1,
        },
      ],
    );
    const want = expect(200, (k) => (k < 31 ? `a${k}` : `b${10 + k - 31}`));
    assert.deepEqual(frames(project, r, [{ from: 0, frames: 200 }], `one-${r.num}`), want);
    assert.deepEqual(
      frames(
        project,
        r,
        [
          { from: 0, frames: 123 },
          { from: 123, frames: 77 },
        ],
        `two-${r.num}`,
      ),
      want,
    );
  });
}

test("a still screen in a variable frame rate recording stays on screen across a border", {
  timeout: 120_000,
}, () => {
  const r = frameRate(30);
  // Three frames only: at 0 s, at 5 s and at 7 s (the screen did not change in between).
  const still = numbered("a", "30", 3, [0, 5, 7]);
  const project = lesson(
    30,
    [video("a", still, 8, 30)],
    [{ id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 7.5, volume: 1 }],
  );
  const want = expect(225, (k) => (k < 150 ? "a0" : k < 210 ? "a1" : "a2"));
  assert.deepEqual(frames(project, r, [{ from: 0, frames: 225 }], "vfr-one"), want);
  assert.deepEqual(
    frames(
      project,
      r,
      [
        { from: 0, frames: 60 },
        { from: 60, frames: 165 },
      ],
      "vfr-two",
    ),
    want,
  );
});

test("a clip longer than its file holds the last frame, also in the segment after the end", {
  timeout: 120_000,
}, () => {
  const r = frameRate(30);
  const short = numbered("a", "30", 90);
  const project = lesson(
    30,
    [video("a", short, 3, 30)],
    [{ id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 5, volume: 1 }],
  );
  const want = expect(150, (k) => `a${Math.min(k, 89)}`);
  assert.deepEqual(frames(project, r, [{ from: 0, frames: 150 }], "hold-one"), want);
  assert.deepEqual(
    frames(
      project,
      r,
      [
        { from: 0, frames: 105 },
        { from: 105, frames: 45 },
      ],
      "hold-two",
    ),
    want,
  );
});

test("pieces of one recording read as one stream show the right frames on both sides of a border", {
  timeout: 120_000,
}, () => {
  const r = frameRate(30);
  const take = numbered("a", "30", 400);
  // A recording cut twice by the cleanup: pieces back to back on the timeline, jumping in it.
  const project = lesson(
    30,
    [video("a", take, 400 / 30, 30)],
    [
      { id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 40 / 30, volume: 1 },
      {
        id: "B",
        assetId: "a",
        trackId: "main",
        start: 40 / 30,
        in: 60 / 30,
        duration: 60 / 30,
        volume: 1,
      },
      {
        id: "C",
        assetId: "a",
        trackId: "main",
        start: 100 / 30,
        in: 200 / 30,
        duration: 50 / 30,
        volume: 1,
      },
    ],
  );
  const want = expect(150, (k) =>
    k < 40 ? `a${k}` : k < 100 ? `a${60 + k - 40}` : `a${200 + k - 100}`,
  );
  const whole = buildVideoWindowPlan(exportProject(project, r), specOf(30), r, {
    from: 0,
    frames: 150,
  });
  assert.equal(
    whole.inputArgs.filter((a) => a === "-i").length,
    1,
    "one input for the three pieces",
  );
  assert.deepEqual(frames(project, r, [{ from: 0, frames: 150 }], "run-one"), want);
  assert.deepEqual(
    frames(
      project,
      r,
      [
        { from: 0, frames: 70 },
        { from: 70, frames: 80 },
      ],
      "run-two",
    ),
    want,
  );
});

test("a clip snapped to the frame grid never shows a frame the cut removed", {
  timeout: 120_000,
}, () => {
  const r = frameRate(30);
  const take = numbered("a", "30", 300);
  // A's cut is [60.6, 89.62) frames of the take: frames 61 to 89. On the grid it starts half a
  // frame early and ends half a frame late, 30 ticks for 29.02 frames of footage: the tick that
  // would show frame 90 (cut away) holds 89, and frame 60 (before the cut) never shows.
  const project = lesson(
    30,
    [video("a", take, 10, 30)],
    [
      {
        id: "A",
        assetId: "a",
        trackId: "main",
        start: 0.49 / 30,
        in: 60.6 / 30,
        duration: 29.02 / 30,
        volume: 1,
      },
      {
        id: "B",
        assetId: "a",
        trackId: "main",
        start: 29.51 / 30,
        in: 6,
        duration: 20 / 30,
        volume: 1,
      },
    ],
  );
  const want = expect(50, (k) => (k < 29 ? `a${61 + k}` : k === 29 ? "a89" : `a${180 + k - 30}`));
  assert.deepEqual(frames(project, r, [{ from: 0, frames: 50 }], "snap-one"), want);
  assert.deepEqual(
    frames(
      project,
      r,
      [
        { from: 0, frames: 20 },
        { from: 20, frames: 30 },
      ],
      "snap-two",
    ),
    want,
  );
});

/** Frames of the glitch around a cut placed `shift` frames later, as hashes. */
function glitch(shift: number): string[] {
  const at = (40 + shift) / 30;
  const fx = cutFxFilter({ kind: "glitch", at, duration: 0.7, colors: [] }, 64, 36);
  const out = ff([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=64x36:r=30:d=4",
    "-vf",
    // Shifted inside the graph (FFmpeg starts every input at zero).
    `settb=1/30,setpts=PTS+${shift},${fx},setpts=PTS-STARTPTS`,
    "-frames:v",
    "80",
    "-f",
    "framemd5",
    "-",
  ]).toString();
  return out
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(",").at(-1)?.trim() ?? "");
}

test("the same glitch renders the same frames wherever its cut is", { timeout: 60_000 }, () => {
  const a = glitch(0);
  for (const shift of [7, 131]) {
    const b = glitch(shift);
    // The pattern under it moved with the cut (each frame keeps its place relative to the cut).
    assert.deepEqual(b, a, `shifted by ${shift} frames`);
  }
});

test("memory: pieces read as one stream stay close to separate inputs", {
  timeout: 180_000,
}, (t) => {
  const r = frameRate(30);
  const take = join(dir, "big.mp4");
  ff([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=1280x720:r=30:d=24",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "60",
    take,
  ]);
  const asset = { ...video("a", take, 24, 30), width: 1280, height: 720 };
  const spec = { ...specOf(30), width: 1280, height: 720 };
  const peak = (clips: Clip[]): number => {
    const project = {
      ...lesson(30, [asset], clips),
      settings: { width: 1280, height: 720, fps: 30 },
    };
    const plan = buildVideoWindowPlan(exportProject(project, r), spec, r, { from: 0, frames: 600 });
    const script = join(dir, `mem-${clips[0].in}.txt`);
    writeFileSync(script, plan.filter);
    const run = spawnSync(
      FFMPEG,
      [
        "-hide_banner",
        "-benchmark",
        ...plan.inputArgs,
        SCRIPT,
        script,
        "-map",
        "[vout]",
        "-frames:v",
        "600",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    // "kB" in FFmpeg 6, "KiB" in 9.
    const kb = /maxrss=(\d+)(?:KiB|kB)/.exec(run.stderr)?.[1];
    if (run.status !== 0 || !kb) throw new Error(run.stderr.slice(-1500));
    return Number(kb) / 1024;
  };
  // Forward in the source: one input for both. Backward: one input each.
  const shared = peak([
    { id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 10, volume: 1 },
    { id: "B", assetId: "a", trackId: "main", start: 10, in: 11, duration: 10, volume: 1 },
  ]);
  const separate = peak([
    { id: "A", assetId: "a", trackId: "main", start: 0, in: 11, duration: 10, volume: 1 },
    { id: "B", assetId: "a", trackId: "main", start: 10, in: 0, duration: 10, volume: 1 },
  ]);
  t.diagnostic(`peak ${shared.toFixed(0)} MB shared, ${separate.toFixed(0)} MB separate`);
  assert.ok(
    shared < separate * 1.25 + 30,
    `peak ${shared.toFixed(0)} MB shared, ${separate.toFixed(0)} MB separate`,
  );
});

test("a clip that starts in the middle of a still frame of a variable frame rate file shows it", {
  timeout: 120_000,
}, () => {
  const r = frameRate(30);
  const still = numbered("a", "30", 3, [0, 5, 7]);
  const project = lesson(
    30,
    [video("a", still, 8, 30)],
    [{ id: "A", assetId: "a", trackId: "main", start: 0, in: 2, duration: 5.5, volume: 1 }],
  );
  const want = expect(165, (k) => (k < 90 ? "a0" : k < 150 ? "a1" : "a2"));
  assert.deepEqual(frames(project, r, [{ from: 0, frames: 165 }], "vfr-mid"), want);
});
