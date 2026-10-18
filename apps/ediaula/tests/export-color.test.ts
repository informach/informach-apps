import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { exportLesson } from "../src/main/export-lesson.ts";
import { ffmpegVersion, filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { sourceMatrix, sourceRange, yuv709 } from "../src/shared/export/color.ts";
import { hasAlpha, type MediaFacts } from "../src/shared/export/videoPlan.ts";
import type { Asset, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * Colours of the export: the composite is BT.709 and the file says so, so a player reading it as
 * BT.709 (browsers, YouTube) shows the colours of the lesson. And a picture with its own
 * transparency keeps it.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FFPROBE: string = require("@derhuerst/ffprobe-static");
const ff = (args: string[]): Buffer =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe", maxBuffer: 1 << 26 });
const LIME = [200, 240, 49];

/** What the app probes of a file (main/ffmpeg.ts mediaFacts), from FFprobe. */
function probe(path: string): MediaFacts {
  const { streams } = JSON.parse(
    execFileSync(FFPROBE, ["-v", "error", "-show_streams", "-of", "json", path]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name?: string;
      pix_fmt?: string;
      color_space?: string;
      color_range?: string;
      tags?: Record<string, string>;
    }[];
  };
  const v = streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${path} has no picture`);
  return {
    matrix: sourceMatrix(v.color_space),
    range: sourceRange(v.color_range, v.pix_fmt),
    alpha: hasAlpha(v.pix_fmt, v.tags),
    codec: v.codec_name,
  };
}

const still = (id: string, path: string, w: number, h: number): Asset => ({
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
const video = (id: string, path: string, w: number, h: number): Asset => ({
  ...still(id, path, w, h),
  kind: "video",
  duration: 2,
  fps: 30,
});

/** Exports through the app's pipeline (segments, sound, assembly) with real FFmpeg. */
async function exportThrough(project: Project, dir: string, name: string): Promise<string> {
  const authority = createFileAuthority(["ediaula"]);
  for (const a of project.assets) await authority.grantRead(a.path);
  const out = join(dir, `${name}.mp4`);
  await authority.grantWrite(out);
  const spec: ExportSpec = {
    outPath: out,
    width: project.settings.width,
    height: project.settings.height,
    fps: 30,
    videoBitrate: 6000,
    normalizeLoudness: false,
    encoder: "x264",
  };
  await exportLesson(project, spec, {
    assertRead: (p) => authority.assertRead(p),
    assertWrite: (p) => authority.assertWrite(p, false),
    assertRelatedExport: (p, q) => authority.assertRelatedExport(p, q),
    fontsDirectory: dir,
    filterScriptOption: await filterScriptOption(FFMPEG),
    ffmpegVersion: await ffmpegVersion(FFMPEG),
    cacheDirectory: join(dir, `${name}-cache`),
    workDirectory: join(dir, `${name}-work`),
    probe: async (path) => probe(path),
    check: () => {},
    async run(args) {
      return ff(args).toString();
    },
  });
  return out;
}

/** The colour at (x, y) of the frame at 0.5 s, read as BT.709 limited range like a browser does. */
const rgbAt = (path: string, x: number, y: number): number[] =>
  Array.from(
    ff([
      "-ss",
      "0.5",
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      `crop=8:8:${x}:${y},scale=1:1:in_color_matrix=bt709:in_range=tv:flags=area,format=rgb24`,
      "-f",
      "rawvideo",
      "-",
    ]),
  );

const near = (got: number[], want: number[], by: number): boolean =>
  got.every((v, i) => Math.abs(v - want[i]) <= by);

const project = (assets: Asset[], clips: Project["clips"], w = 320, h = 180): Project => ({
  version: 1,
  id: "p",
  name: "Cor",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: w, height: h, fps: 30 },
  assets,
  tracks: [
    { id: "top", kind: "video", name: "Cima", muted: false, hidden: false, locked: false },
    { id: "bg", kind: "video", name: "Fundo", muted: false, hidden: false, locked: false },
  ],
  clips,
});

test("BT.709 numbers: lime #C8F031 in limited range", () => {
  // Y = 16 + 219 × (0.2126 R + 0.7152 G + 0.0722 B), Cb and Cr scaled by 224 around 128.
  assert.deepEqual(yuv709("#C8F031"), [203, 48, 118]);
  assert.deepEqual(yuv709("#000000"), [16, 128, 128]);
  assert.deepEqual(yuv709("#FFFFFF"), [235, 128, 128]);
});

test("a lime PNG comes back as lime, and the file is tagged BT.709 limited range", {
  timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-color-"));
  try {
    const png = join(dir, "lima.png");
    ff(["-f", "lavfi", "-i", "color=c=0xC8F031:s=320x180", "-frames:v", "1", png]);
    const out = await exportThrough(
      project(
        [still("lime", png, 320, 180)],
        [{ id: "c", assetId: "lime", trackId: "bg", start: 0, in: 0, duration: 1, volume: 1 }],
      ),
      dir,
      "lima",
    );
    const color = rgbAt(out, 156, 86);
    assert.ok(near(color, LIME, 2), `lime came back as ${color}`);
    const { streams } = JSON.parse(
      execFileSync(FFPROBE, ["-v", "error", "-show_streams", "-of", "json", out]).toString(),
    ) as { streams: Record<string, string>[] };
    const v = streams.find((s) => s.codec_type === "video");
    assert.ok(v);
    assert.deepEqual(
      [v.color_space, v.color_primaries, v.color_transfer, v.color_range],
      ["bt709", "bt709", "bt709", "tv"],
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("an SD source tagged BT.601 and an untagged HD one both keep their colour", {
  timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-color-"));
  try {
    const sd = join(dir, "sd.mp4");
    // Lime written in BT.601 and tagged so (SMPTE 170M), like an SD camera or the recorder's
    // measured NVENC path.
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=c=0xC8F031:s=640x480:r=30:d=2,format=rgb24",
      "-vf",
      "scale=out_color_matrix=bt601:out_range=tv,format=yuv420p",
      "-c:v",
      "libx264",
      "-qp",
      "0",
      "-colorspace",
      "smpte170m",
      "-color_primaries",
      "smpte170m",
      "-color_trc",
      "smpte170m",
      "-color_range",
      "tv",
      sd,
    ]);
    const hd = join(dir, "hd.mp4");
    // Lime written in BT.709 without any tag, like most screen recordings.
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=c=0xC8F031:s=1280x720:r=30:d=2,format=rgb24",
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v",
      "libx264",
      "-qp",
      "0",
      hd,
    ]);
    assert.equal(probe(sd).matrix, "bt601");
    assert.equal(probe(hd).matrix, "bt709");
    const out = await exportThrough(
      project(
        [video("sd", sd, 640, 480), video("hd", hd, 1280, 720)],
        [
          { id: "h", assetId: "hd", trackId: "bg", start: 0, in: 0, duration: 1, volume: 1 },
          {
            id: "s",
            assetId: "sd",
            trackId: "top",
            start: 0,
            in: 0,
            duration: 1,
            volume: 1,
            transform: { x: 0.25, y: 0.5, scale: 0.4, opacity: 1 },
          },
        ],
      ),
      dir,
      "fontes",
    );
    const sdColor = rgbAt(out, 76, 86);
    const hdColor = rgbAt(out, 250, 86);
    assert.ok(near(sdColor, LIME, 3), `BT.601 source came back as ${sdColor}`);
    assert.ok(near(hdColor, LIME, 3), `untagged HD source came back as ${hdColor}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("a transparent VP9 over a red background leaves the red visible where it is clear", {
  timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-alpha-"));
  try {
    const red = join(dir, "red.png");
    ff(["-f", "lavfi", "-i", "color=c=red:s=320x180", "-frames:v", "1", red]);
    const clear = join(dir, "avatar.webm");
    // Blue on the right half, fully transparent on the left half.
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=30:d=2,format=rgba,geq=r=0:g=0:b=255:a='if(lt(X,W/2),0,255)'",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-b:v",
      "1M",
      clear,
    ]);
    assert.deepEqual([probe(clear).alpha, probe(clear).codec], [true, "vp9"]);
    const out = await exportThrough(
      project(
        [still("red", red, 320, 180), { ...video("avatar", clear, 320, 180), alpha: true }],
        [
          { id: "r", assetId: "red", trackId: "bg", start: 0, in: 0, duration: 1, volume: 1 },
          { id: "a", assetId: "avatar", trackId: "top", start: 0, in: 0, duration: 1, volume: 1 },
        ],
      ),
      dir,
      "alfa",
    );
    const left = rgbAt(out, 40, 86);
    const right = rgbAt(out, 260, 86);
    assert.ok(left[0] > 200 && left[1] < 60 && left[2] < 60, `red shows through: ${left}`);
    assert.ok(right[2] > 200 && right[0] < 60, `the opaque half stays blue: ${right}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});
