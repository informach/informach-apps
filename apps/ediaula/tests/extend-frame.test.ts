import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { transformAt } from "../src/shared/keyframes.ts";
import {
  extendFrame,
  parseDuration,
  setClipSpeed,
  sourceEnd,
  speedForDuration,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const clip: Clip = {
  id: "c",
  assetId: "v",
  trackId: "t",
  start: 0,
  in: 2,
  duration: 4,
  speed: 2,
  volume: 1,
};

test("duration input accepts clock times and decimal comma, rejecting malformed and invalid values", () => {
  for (const [text, seconds] of [
    ["90", 90],
    ["1:30,5", 90.5],
    ["01:02:03.125", 3723.125],
  ] as const)
    assert.equal(parseDuration(text), seconds);
  for (const text of ["", "0", "-5", "1:60", "1:2:3:4", "NaN", "Infinity", "5abc"])
    assert.equal(parseDuration(text), null);
});

test("target duration preserves the source even very close to normal speed", () => {
  const speed = speedForDuration([clip], 7.999)!;
  const out = setClipSpeed([clip], "c", speed, true)[0];
  assert.ok(Math.abs(out.duration - 7.999) < 1e-10);
  assert.ok(Math.abs(sourceEnd(out) - sourceEnd(clip)) < 1e-10);
  assert.equal(speedForDuration([clip], 100), null);
  assert.equal(speedForDuration([clip], 0), null);
  assert.equal(speedForDuration([clip], NaN), null);
  assert.equal(speedForDuration([clip, { ...clip, duration: 2, speed: 1 }], 5), 2);
});

test("extend frame preserves footage, inserts silence and ripples only its track", () => {
  const next = { ...clip, id: "next", start: 4 };
  const other = { ...clip, id: "other", trackId: "music", start: 4 };
  const { clips, stillId } = extendFrame([clip, next, other], "c", 1.5, 3, "still");
  const still = clips.find((c) => c.id === stillId)!;
  const right = clips.find((c) => c.assetId === "v" && c.start === 4.5)!;
  assert.equal(still.duration, 3);
  assert.equal(still.volume, 0);
  assert.equal(still.assetId, "still");
  assert.equal(sourceEnd(clips.find((c) => c.id === "c")!), right.in);
  assert.equal(sourceEnd(right), sourceEnd(clip));
  assert.equal(right.speed, 2);
  assert.equal(clips.find((c) => c.id === "next")!.start, 7);
  assert.equal(
    clips.find((c) => c.id === "other"),
    other,
  );
  assert.equal(clip.duration, 4);
});

test("extension at either edge creates no empty segment; movement resumes continuously", () => {
  for (const at of [0, 4]) {
    const out = extendFrame([clip], "c", at, 2, "still").clips;
    assert.equal(out.length, 2);
    assert.ok(out.every((c) => c.duration > 0));
    assert.equal(out.find((c) => c.assetId === "v")!.duration, 4);
  }
  const moving = {
    ...clip,
    keyframes: [
      { t: 0, x: 0.1, y: 0.2, scale: 1 },
      { t: 4, x: 0.9, y: 0.8, scale: 2 },
    ],
  };
  const { clips, stillId } = extendFrame([moving], "c", 2, 3, "still");
  const right = clips.find((c) => c.start === 5)!;
  assert.deepEqual(clips.find((c) => c.id === stillId)!.transform, transformAt(moving, 2));
  for (const delta of [0, 0.5, 1])
    assert.deepEqual(transformAt(right, 5 + delta), transformAt(moving, 2 + delta));
  assert.throws(() => extendFrame([clip], "c", 5, 3, "still"));
  assert.throws(() => extendFrame([clip], "c", 2, NaN, "still"));
});

test("export holds the chosen picture and resumes the video with silence only during the extension", {
  timeout: 60000,
}, () => {
  const ffmpeg: string = createRequire(import.meta.url)("ffmpeg-static");
  const dir = mkdtempSync(join(tmpdir(), "ediaula-extend-"));
  const source = join(dir, "source.mp4"),
    still = join(dir, "still.png"),
    out = join(dir, "out.mp4");
  execFileSync(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=red:s=160x90:r=30:d=1",
    "-f",
    "lavfi",
    "-i",
    "color=blue:s=160x90:r=30:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=duration=2",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map",
    "[v]",
    "-map",
    "2:a",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  execFileSync(ffmpeg, ["-y", "-v", "error", "-ss", "0.5", "-i", source, "-frames:v", "1", still]);
  const video: Asset = {
    id: "v",
    name: "video",
    path: source,
    kind: "video",
    duration: 2,
    width: 160,
    height: 90,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
  };
  const p: Project = {
    version: 1,
    id: "p",
    name: "test",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 160, height: 90, fps: 30 },
    tracks: [{ id: "t", kind: "video", name: "Video", locked: false, hidden: false, muted: false }],
    assets: [
      video,
      { ...video, id: "still", kind: "image", path: still, duration: 0, hasAudio: false },
    ],
    clips: extendFrame([{ ...clip, in: 0, speed: 1, duration: 2 }], "c", 0.5, 1, "still").clips,
  };
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 160,
    height: 90,
    fps: 30,
    videoBitrate: 1000,
    normalizeLoudness: false,
    encoder: "x264",
  });
  const filter = join(dir, "filter.txt");
  writeFileSync(filter, plan.filter);
  execFileSync(ffmpeg, [
    "-y",
    "-v",
    "error",
    ...plan.inputArgs,
    "-filter_complex_script",
    filter,
    ...plan.outputArgs,
  ]);
  const pixel = (t: number) =>
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      out,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);
  assert.ok(pixel(1.25)[0] > 200, "held red frame");
  assert.ok(pixel(2.5)[2] > 200, "resumed blue footage");
  const rms = (t: number) => {
    const bytes = execFileSync(ffmpeg, [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      out,
      "-t",
      "0.15",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "-",
    ]);
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) sum += bytes.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (bytes.length / 4));
  };
  assert.ok(rms(0.2) > 0.01);
  assert.ok(rms(1) < 0.001);
  assert.ok(rms(2.5) > 0.01);
});
