import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import type { RunOptions } from "../src/main/export/renderSegments.ts";
import { exportLesson } from "../src/main/export-lesson.ts";
import { ffmpegVersion, filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { concatList } from "../src/shared/export/assemble.ts";
import { exportProject, frameRate, trackTimescale } from "../src/shared/export/frames.ts";
import { buildVideoWindowPlan, type VideoWindow } from "../src/shared/export/videoPlan.ts";
import type { Asset, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * The export by segments draws exactly what one pass over the whole lesson draws: rendered
 * losslessly, every frame is the same, including where a transition, a zoom layer and a
 * keyframed movement cross a segment border.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FFPROBE: string = require("@derhuerst/ffprobe-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-seg-"));
const ff = (args: string[]): string =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], {
    stdio: "pipe",
    maxBuffer: 1 << 26,
  }).toString();

const source = (name: string, lavfi: string): string => {
  const path = join(dir, name);
  ff([
    "-f",
    "lavfi",
    "-i",
    lavfi,
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
const A = source("a.mp4", "testsrc2=s=320x180:r=30:d=8");
const B = source("b.mp4", "testsrc=s=320x180:r=30:d=8");
const SLOW = source("c.mp4", "testsrc2=s=320x180:r=25:d=8");
const LOGO = join(dir, "logo.png");
ff(["-f", "lavfi", "-i", "color=c=0xC8F031:s=80x80", "-frames:v", "1", LOGO]);

const asset = (id: string, path: string, kind: Asset["kind"], fps = 30): Asset => ({
  id,
  name: id,
  path,
  kind,
  duration: kind === "image" ? 0 : 8,
  width: kind === "image" ? 80 : 320,
  height: kind === "image" ? 80 : 180,
  fps: kind === "image" ? 0 : fps,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
});

const r = frameRate(30);
const spec: ExportSpec = {
  outPath: join(dir, "out.mp4"),
  width: 320,
  height: 180,
  fps: 30,
  videoBitrate: 2000,
  normalizeLoudness: false,
  encoder: "x264",
};
const LOSSLESS = ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];

/** Renders windows of the project losslessly and joins them as the export does. */
function render(project: Project, windows: VideoWindow[], name: string): string {
  const derived = exportProject(project, r);
  const files = windows.map((win, i) => {
    const plan = buildVideoWindowPlan(derived, spec, r, win);
    const script = join(dir, `${name}-${i}.txt`);
    writeFileSync(script, plan.filter);
    const out = join(dir, `${name}-${i}.mp4`);
    ff([
      ...plan.inputArgs,
      SCRIPT,
      script,
      "-map",
      "[vout]",
      ...LOSSLESS,
      "-r",
      "30",
      "-frames:v",
      String(win.frames),
      "-video_track_timescale",
      String(trackTimescale(r)),
      "-an",
      out,
    ]);
    return { path: out, frames: win.frames };
  });
  if (files.length === 1) return files[0].path;
  const list = join(dir, `${name}.txt`);
  writeFileSync(list, concatList(files, r));
  const joined = join(dir, `${name}.mp4`);
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  return joined;
}

/** The decoded frames' hashes. */
const frames = (path: string): string[] =>
  ff(["-i", path, "-map", "0:v", "-f", "framemd5", "-"])
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.split(",").at(-1) ?? "").trim());

/** Average PSNR of two videos in dB (Infinity when they are identical). */
function psnr(a: string, b: string): number {
  const run = spawnSync(
    FFMPEG,
    ["-hide_banner", "-nostats", "-i", a, "-i", b, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (run.status !== 0) throw new Error(run.stderr);
  const average = /average:(inf|[\d.]+)/.exec(run.stderr)?.[1];
  if (!average) throw new Error(`no PSNR in: ${run.stderr.slice(-500)}`);
  return average === "inf" ? Number.POSITIVE_INFINITY : Number(average);
}

test("segments render the same frames as one pass where a transition, a zoom layer and keyframes cross the borders", {
  timeout: 180_000,
}, () => {
  const project: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 320, height: 180, fps: 30 },
    assets: [
      asset("a", A, "video"),
      asset("b", B, "video"),
      asset("logo", LOGO, "image"),
      {
        ...asset("zl", LOGO, "image"),
        generated: "effect",
      },
    ],
    tracks: [
      { id: "top", kind: "video", name: "Logo", muted: false, hidden: false, locked: false },
      { id: "zoom", kind: "video", name: "Zoom", muted: false, hidden: false, locked: false },
      { id: "main", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "A", assetId: "a", trackId: "main", start: 0, in: 0.5, duration: 4.5, volume: 1 },
      {
        id: "B",
        assetId: "b",
        trackId: "main",
        start: 4.5,
        in: 1,
        duration: 5.5,
        volume: 1,
        // A's picture runs on over B until 5.5 s: the border at 5 s cuts it in two.
        transition: { kind: "wipe-right", duration: 1 },
      },
      {
        id: "Z",
        assetId: "zl",
        trackId: "zoom",
        start: 6,
        in: 0,
        duration: 2,
        volume: 0,
        zoomLayer: { scale: 1.8, x: 0.3, y: 0.4, easeIn: 0.5, easeOut: 0.5 },
      },
      {
        id: "L",
        assetId: "logo",
        trackId: "top",
        start: 1,
        in: 0,
        duration: 2.5,
        volume: 0,
        transform: { x: 0.2, y: 0.3, scale: 0.4, opacity: 1, mask: "circle", border: "#3D6BFF" },
        keyframes: [
          { t: 0, x: 0.2, y: 0.3, scale: 0.4 },
          { t: 2.5, x: 0.8, y: 0.7, scale: 0.7 },
        ],
      },
    ],
  };
  const whole = render(project, [{ from: 0, frames: 300 }], "whole");
  const parts = render(
    project,
    [
      { from: 0, frames: 60 },
      { from: 60, frames: 90 },
      { from: 150, frames: 60 },
      { from: 210, frames: 90 },
    ],
    "parts",
  );
  const a = frames(whole);
  const b = frames(parts);
  assert.equal(a.length, 300);
  assert.equal(b.length, 300, "exact frame count after joining");
  const different = a.flatMap((h, i) => (h === b[i] ? [] : [i]));
  assert.deepEqual(different, [], `frames that differ: ${different.slice(0, 20).join(", ")}`);
});

test("a source at another frame rate and speed, retimed by a stateful filter, stays within 50 dB", {
  timeout: 180_000,
}, () => {
  const project: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 320, height: 180, fps: 30 },
    assets: [asset("c", SLOW, "video", 25)],
    tracks: [
      { id: "main", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    ],
    clips: [
      {
        id: "C",
        assetId: "c",
        trackId: "main",
        start: 0,
        in: 0.3,
        duration: 5,
        volume: 1,
        speed: 1.3,
      },
    ],
  };
  const whole = render(project, [{ from: 0, frames: 150 }], "slow-whole");
  const parts = render(
    project,
    [
      { from: 0, frames: 47 },
      { from: 47, frames: 61 },
      { from: 108, frames: 42 },
    ],
    "slow-parts",
  );
  assert.equal(frames(parts).length, 150);
  const db = psnr(whole, parts);
  assert.ok(db >= 50, `PSNR ${db} dB`);
});

test("the app's export joins its segments with the exact frame count, the sound to the frame, title and chapters", {
  timeout: 180_000,
}, async () => {
  const side = await mkdtemp(join(tmpdir(), "ediaula-seg-side-"));
  try {
    const long = source("long.mp4", "testsrc2=s=320x180:r=30:d=30");
    const voice = join(dir, "voz.wav");
    ff(["-f", "lavfi", "-i", "sine=f=330:d=30", voice]);
    const authority = createFileAuthority(["ediaula"]);
    for (const path of [long, voice]) await authority.grantRead(path);
    const out = join(dir, "app.mp4");
    await authority.grantWrite(out);
    const project: Project = {
      version: 1,
      id: "p",
      name: "x",
      createdAt: 0,
      updatedAt: 0,
      publish: {
        title: "Frações: aula 3",
        chapters: [
          { time: 0, title: "Abertura" },
          { time: 12.2, title: "Exercícios" },
        ],
      },
      settings: { width: 320, height: 180, fps: 30 },
      assets: [
        { ...asset("a", long, "video"), duration: 30 },
        {
          ...asset("v", voice, "audio"),
          kind: "audio",
          duration: 30,
          hasVideo: false,
          hasAudio: true,
          width: 0,
          height: 0,
          fps: 0,
        },
      ],
      tracks: [
        { id: "main", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
        { id: "mic", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
      ],
      // Longer than one segment, and ending between two frames: 24.51 s is 735.3 frames.
      clips: [
        { id: "A", assetId: "a", trackId: "main", start: 0, in: 0, duration: 12.2, volume: 1 },
        {
          id: "A2",
          assetId: "a",
          trackId: "main",
          start: 12.2,
          in: 13,
          duration: 12.31,
          volume: 1,
        },
        { id: "V", assetId: "v", trackId: "mic", start: 0.1, in: 0, duration: 24.41, volume: 1 },
      ],
    };
    // With loudness normalisation: loudnorm pads its output to 100 ms, the assembly must not.
    await exportLesson(
      project,
      { ...spec, outPath: out, normalizeLoudness: true },
      {
        assertRead: (p) => authority.assertRead(p),
        assertWrite: (p) => authority.assertWrite(p, false),
        assertRelatedExport: (p, q) => authority.assertRelatedExport(p, q),
        fontsDirectory: dir,
        filterScriptOption: SCRIPT,
        ffmpegVersion: await ffmpegVersion(FFMPEG),
        cacheDirectory: join(side, "cache"),
        workDirectory: join(side, "work"),
        check: () => {},
        async run(args: string[], options?: RunOptions) {
          const result = spawnSync(FFMPEG, args, { encoding: "utf8", maxBuffer: 1 << 26 });
          if (result.status !== 0) throw new Error(result.stderr);
          return options?.capture === "stderr" ? result.stderr : result.stdout;
        },
      },
    );
    const info = JSON.parse(
      execFileSync(FFPROBE, [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,nb_read_frames,duration",
        "-of",
        "json",
        out,
      ]).toString(),
    ) as { streams: { codec_type: string; nb_read_frames?: string; duration: string }[] };
    const video = info.streams.find((s) => s.codec_type === "video");
    const sound = info.streams.find((s) => s.codec_type === "audio");
    assert.ok(video && sound);
    assert.equal(Number(video.nb_read_frames), Math.round(24.51 * 30));
    assert.ok(
      Math.abs(Number(sound.duration) - Number(video.duration)) < 1 / 30,
      `sound ${sound.duration} s, picture ${video.duration} s`,
    );
    assert.ok(
      (await readdir(join(side, "cache", "segments"))).filter((f) => f.endsWith(".mp4")).length >=
        2,
      "made of more than one segment",
    );
    const meta = JSON.parse(
      execFileSync(FFPROBE, [
        "-v",
        "error",
        "-show_chapters",
        "-show_entries",
        "format_tags=title",
        "-of",
        "json",
        out,
      ]).toString(),
    ) as {
      chapters: { start_time: string; tags: { title: string } }[];
      format: { tags: { title: string } };
    };
    assert.equal(meta.format.tags.title, "Frações: aula 3");
    assert.deepEqual(
      meta.chapters.map((c) => [Number(c.start_time), c.tags.title]),
      [
        [0, "Abertura"],
        [12.2, "Exercícios"],
      ],
    );
  } finally {
    await rm(side, { recursive: true });
  }
});
