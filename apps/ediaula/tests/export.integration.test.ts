import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Encoder, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);
const FFPROBE: string = require("@derhuerst/ffprobe-static");

const dir = mkdtempSync(join(tmpdir(), "ediaula-it-"));
const ff = (args: string[]): void => {
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe" });
};

function makeSamples(): { video: string; image: string; music: string } {
  const video = join(dir, "tela 4k.mp4");
  const image = join(dir, "logo.png");
  const music = join(dir, "música.mp3");
  ff([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=3840x2160:r=30:d=6",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=6",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    video,
  ]);
  ff(["-f", "lavfi", "-i", "color=c=0xC8F031:s=400x400", "-frames:v", "1", image]);
  ff(["-f", "lavfi", "-i", "sine=f=220:d=10", "-c:a", "libmp3lame", music]);
  return { video, image, music };
}

function probe(path: string): {
  duration: number;
  streams: { codec_type: string; width?: number; height?: number }[];
} {
  const out = execFileSync(FFPROBE, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]).toString();
  const j = JSON.parse(out);
  return { duration: Number(j.format.duration), streams: j.streams };
}

function nvencWorks(): boolean {
  try {
    ff(["-f", "lavfi", "-i", "color=s=256x256:d=0.2", "-c:v", "h264_nvenc", "-f", "null", "-"]);
    return true;
  } catch {
    return false;
  }
}

test("renders a multi-track project to a valid MP4", { timeout: 180_000 }, () => {
  const s = makeSamples();
  const project: Project = {
    version: 1,
    id: "p",
    name: "Integração",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      {
        id: "v",
        name: "tela",
        path: s.video,
        kind: "video",
        duration: 6,
        width: 3840,
        height: 2160,
        fps: 30,
        hasVideo: true,
        hasAudio: true,
        size: 1,
        proxyStatus: "none",
      },
      {
        id: "i",
        name: "logo",
        path: s.image,
        kind: "image",
        duration: 0,
        width: 400,
        height: 400,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
      },
      {
        id: "m",
        name: "música",
        path: s.music,
        kind: "audio",
        duration: 10,
        width: 0,
        height: 0,
        fps: 0,
        hasVideo: false,
        hasAudio: true,
        size: 1,
        proxyStatus: "none",
      },
    ],
    tracks: [
      { id: "v2", kind: "video", name: "Sobreposição", muted: false, hidden: false, locked: false },
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a1", kind: "audio", name: "Música", muted: false, hidden: false, locked: false },
    ],
    // Two cuts of the same 4K source with a gap, a logo on top and music underneath: 0–8 s.
    clips: [
      { id: "c1", assetId: "v", trackId: "v1", start: 0, in: 1, duration: 2, volume: 1 },
      { id: "c2", assetId: "v", trackId: "v1", start: 3, in: 4, duration: 2, volume: 1 },
      { id: "c3", assetId: "i", trackId: "v2", start: 1, in: 0, duration: 2, volume: 1 },
      { id: "c4", assetId: "m", trackId: "a1", start: 0, in: 0, duration: 8, volume: 0.4 },
    ],
  };
  const encoder: Encoder = nvencWorks() ? "nvenc" : "x264";
  const outPath = join(dir, "aula final.mp4");
  const plan = buildExportPlan(project, {
    outPath,
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 6000,
    normalizeLoudness: true,
    encoder,
  });
  const script = join(dir, "filter.txt");
  writeFileSync(script, plan.filter);
  ff([...plan.inputArgs, FILTER_SCRIPT_OPTION, script, ...plan.outputArgs]);

  assert.ok(existsSync(outPath));
  const info = probe(outPath);
  const v = info.streams.find((x) => x.codec_type === "video");
  assert.ok(v, "has video");
  assert.ok(
    info.streams.some((x) => x.codec_type === "audio"),
    "has audio",
  );
  assert.equal(v!.width, 1920);
  assert.equal(v!.height, 1080);
  assert.ok(Math.abs(info.duration - 8) < 0.2, `duration ${info.duration} ≈ 8`);
  console.log(`  encoder=${encoder} duration=${info.duration.toFixed(2)}s → ${outPath}`);
});
