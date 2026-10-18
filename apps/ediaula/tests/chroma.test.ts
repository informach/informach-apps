import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import {
  DEFAULT_KEY,
  detectScreen,
  keyFrame,
  keyId,
  keySize,
  keyUsable,
} from "../src/shared/chroma.ts";
import { clipLayout, fadeAt, placementTransform } from "../src/shared/compose.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { makeClip, splitClip } from "../src/shared/timeline.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const SCREEN: [number, number, number] = [9, 112, 246];
const NAVY: [number, number, number] = [30, 36, 65];
const SKIN: [number, number, number] = [240, 183, 160];
const HAIR: [number, number, number] = [40, 20, 16];
const key = { color: "#0970F6", ...DEFAULT_KEY };

/** A 120×200 "avatar": navy body, skin head, a hair edge blended 50% with the screen. */
function avatarFrame(): { data: Uint8Array; w: number; h: number } {
  const w = 120;
  const h = 200;
  const data = new Uint8Array(w * h * 3);
  const put = (x: number, y: number, c: number[]): void => {
    data.set(c.map(Math.round), (y * w + x) * 3);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const head = (x - 60) ** 2 + (y - 50) ** 2 < 30 ** 2;
      const body = x >= 30 && x < 90 && y >= 85;
      put(x, y, head ? SKIN : body ? NAVY : SCREEN);
    }
  // A soft hair edge: a column where hair covers half of each pixel.
  for (let y = 85; y < 150; y++)
    put(
      29,
      y,
      HAIR.map((v, i) => v * 0.5 + SCREEN[i] * 0.5),
    );
  return { data, w, h };
}

const at = (out: Uint8ClampedArray, w: number, x: number, y: number): number[] =>
  Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

test("the screen turns transparent while navy clothes and skin stay opaque", () => {
  const { data, w, h } = avatarFrame();
  const out = keyFrame(data, 3, w, h, key);
  assert.equal(at(out, w, 5, 5)[3], 0, "screen");
  assert.deepEqual(at(out, w, 60, 150), [...NAVY, 255], "navy body untouched");
  assert.deepEqual(at(out, w, 60, 50), [...SKIN, 255], "skin untouched");
});

test("a pixel mixed with the screen gets its real alpha and loses the screen color", () => {
  const { data, w, h } = avatarFrame();
  const out = keyFrame(data, 3, w, h, key);
  const [r, g, b, a] = at(out, w, 29, 120);
  assert.ok(a > 90 && a < 170, `alpha ${a} ≈ 128`);
  assert.ok(b <= Math.max(r, g) + 30, `no blue fringe (${r},${g},${b})`);
});

test("screen detection finds the blue and ignores a regular picture", () => {
  const { data, w, h } = avatarFrame();
  assert.equal(detectScreen(data, 3, w, h), "#0970F6");
  const gray = new Uint8Array(w * h * 3).map((_, i) => (i * 37) % 255);
  assert.equal(detectScreen(gray, 3, w, h), null);
  assert.ok(keyUsable("#00B140"));
  assert.ok(!keyUsable("#808080"));
});

test("key ids and cache sizes are stable", () => {
  assert.equal(keyId(key), keyId({ ...key }));
  assert.notEqual(keyId(key), keyId({ ...key, threshold: 0.35 }));
  assert.deepEqual(keySize(2160, 3840), { width: 1080, height: 1920 });
  assert.deepEqual(keySize(1280, 720), { width: 1280, height: 720 });
});

const avatar: Asset = {
  id: "av",
  name: "Debinha",
  path: "C:/m/avatar.mp4",
  kind: "video",
  duration: 10,
  width: 2160,
  height: 3840,
  fps: 25,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  screen: "#0970F6",
  key,
  keyed: "C:/cache/key.webm",
  keyStatus: "ready",
};

test("layout: default fits the frame; avatar placements stand on the side", () => {
  const frame = { width: 1920, height: 1080 };
  const fit = clipLayout({}, { width: 3840, height: 2160 }, frame);
  assert.deepEqual(fit.visible, { x: 0, y: 0, w: 1920, h: 1080 });
  const right = clipLayout({ transform: placementTransform("right") }, avatar, frame);
  assert.ok(right.visible.x > 1920 / 2, "on the right half");
  assert.ok(right.visible.x + right.visible.w <= 1920 + 1, "inside the frame");
  const cropped = clipLayout(
    {
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 1,
        opacity: 1,
        crop: { left: 0.25, top: 0, right: 0.25, bottom: 0.5 },
      },
    },
    { width: 1920, height: 1080 },
    frame,
  );
  assert.deepEqual(cropped.visible, { x: 480, y: 0, w: 960, h: 540 });
});

test("fades ramp opacity at both ends and split clips keep one fade each", () => {
  const c = { start: 10, duration: 4, fadeIn: 0.5, fadeOut: 1 };
  assert.equal(fadeAt(c, 10), 0);
  assert.equal(fadeAt(c, 10.25), 0.5);
  assert.equal(fadeAt(c, 12), 1);
  assert.equal(fadeAt(c, 13.5), 0.5);
  const clip = makeClip(avatar, "t", 0, { width: 1920, height: 1080 });
  assert.ok(clip.transform && clip.fadeIn && clip.fadeOut, "avatars come placed with a dissolve");
  const [a, b] = splitClip(clip, 5)!;
  assert.ok(a.fadeIn && !a.fadeOut && !b.fadeIn && b.fadeOut);
});

test("export reads keyed avatars from the transparent video and their sound from the original", () => {
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [avatar],
    tracks: [
      { id: "v2", kind: "video", name: "Sobreposição", muted: false, hidden: false, locked: false },
    ],
    clips: [{ ...makeClip(avatar, "v2", 2, { width: 1920, height: 1080 }), in: 1, duration: 3 }],
  };
  const plan = buildExportPlan(p, {
    outPath: "o.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8000,
    normalizeLoudness: false,
    encoder: "x264",
  });
  const keyed = plan.inputArgs.indexOf("C:/cache/key.webm");
  const read = plan.inputArgs.slice(keyed - 6, keyed);
  assert.deepEqual(
    [read[0], read[1], read[2], read[3], read[5]],
    ["-c:v", "libvpx-vp9", "-noaccurate_seek", "-ss", "-i"],
  );
  // Read from a source frame before the clip's in-point; the picture stops at the end of its
  // three seconds, exactly 90 frames.
  const seek = Number(read[4]);
  assert.ok(seek < 1 && seek > 1 - 1 / avatar.fps - 0.02, `seek ${read[4]}`);
  assert.ok(plan.inputArgs.includes("C:/m/avatar.mp4"));
  assert.match(
    plan.filter,
    /\[0:v\]setpts=round\(\(PTS[-+][\d.]+\/TB\)\),setpts='max\(PTS,-[\d.]+\/TB\)',trim=start=-[\d.]+:end=2\.99\d*,fps=30,tpad=stop_mode=clone:stop=-1,fps=30:start_time=0,trim=end_frame=90\[src0\]/,
  );
  // The cut-out avatar keeps its alpha: BT.601 (as the app wrote it) to the composite's BT.709.
  assert.match(
    plan.filter,
    /\[src0\]scale=\d+:\d+:in_color_matrix=bt601:in_range=tv:out_color_matrix=bt709:out_range=tv:flags=bicubic\+accurate_rnd\+full_chroma_int,setsar=1,format=yuva420p\[p0\]/,
  );
  assert.match(
    plan.filter,
    /\[p0\]setpts=PTS\+60,fade=t=in:st=2:d=0\.3:alpha=1,fade=t=out:st=4\.7:d=0\.3:alpha=1/,
  );
  assert.match(plan.filter, /\[1:a\]aresample/);
});

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

test("end to end: keyed avatar video composites with transparency over the lesson", {
  timeout: 120_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-key-"));
  const { data, w, h } = avatarFrame();
  const keyedFrame = Buffer.from(keyFrame(data, 3, w, h, key));
  const frames = Buffer.concat(Array.from({ length: 25 }, () => keyedFrame));
  const keyed = join(dir, "key.webm");
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
      `${w}x${h}`,
      "-r",
      "25",
      "-i",
      "-",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-deadline",
      "realtime",
      "-auto-alt-ref",
      "0",
      keyed,
    ],
    { input: frames },
  );
  assert.equal(enc.status, 0, enc.stderr?.toString());
  const lesson = join(dir, "lesson.png");
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
    lesson,
  ]);

  const a: Asset = { ...avatar, path: keyed, width: w, height: h, hasAudio: false, keyed };
  const bg: Asset = {
    id: "bg",
    name: "aula",
    path: lesson,
    kind: "image",
    duration: 0,
    width: 640,
    height: 360,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  };
  const p: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 25 },
    assets: [a, bg],
    tracks: [
      { id: "v2", kind: "video", name: "Sobreposição", muted: false, hidden: false, locked: false },
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "c1", assetId: "bg", trackId: "v1", start: 0, in: 0, duration: 1, volume: 1 },
      { id: "c2", assetId: "av", trackId: "v2", start: 0, in: 0, duration: 1, volume: 1 },
    ],
  };
  const out = join(dir, "out.mp4");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 25,
    videoBitrate: 2000,
    normalizeLoudness: false,
    encoder: "x264",
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

  // Sample the exported frame: beside the avatar must be the white lesson, not the blue screen.
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
        `crop=4:4:${x}:${y},scale=1:1`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]),
    );
  const beside = px(200, 20);
  assert.ok(
    beside.every((v) => v > 230),
    `white beside the avatar, got ${beside}`,
  );
  const body = px(318, 300);
  assert.ok(body[2] < 110 && body[0] < 70, `navy body visible, got ${body}`);
});
