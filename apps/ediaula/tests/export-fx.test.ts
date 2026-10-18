import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectingProvider, FxAssets } from "../src/main/export/fxAssets.ts";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { DEFAULT_SHADOW } from "../src/shared/compose.ts";
import type { FxProvider } from "../src/shared/export/fx.ts";
import type { MediaLookup } from "../src/shared/export/videoPlan.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { Asset, ExportSpec, Project } from "../src/shared/types.ts";

/**
 * Shape, border and shadow are pictures made once: drawn from the PNGs the app caches, the
 * export is the very same as drawn from the same pictures made inside the graph.
 */

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const SCRIPT = await filterScriptOption(FFMPEG);
const dir = mkdtempSync(join(tmpdir(), "ediaula-fx-"));
const ff = (args: string[]): Buffer =>
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe", maxBuffer: 1 << 26 });

const camera = join(dir, "camera.mp4");
ff([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=s=320x180:r=30:d=2",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  camera,
]);
const white = join(dir, "white.png");
ff(["-f", "lavfi", "-i", "color=c=white:s=640x360", "-frames:v", "1", white]);
const media: MediaLookup = (path) =>
  path === camera ? { matrix: "bt709", range: "tv", alpha: false, codec: "h264" } : undefined;

const asset = (id: string, path: string, kind: Asset["kind"]): Asset => ({
  id,
  name: id,
  path,
  kind,
  duration: kind === "image" ? 0 : 2,
  width: 320,
  height: 180,
  fps: kind === "image" ? 0 : 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
});

const project: Project = {
  version: 1,
  id: "p",
  name: "x",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 640, height: 360, fps: 30 },
  assets: [
    { ...asset("bg", white, "image"), width: 640, height: 360 },
    asset("cam", camera, "video"),
  ],
  tracks: [
    { id: "top", kind: "video", name: "Câmera", muted: false, hidden: false, locked: false },
    { id: "bg", kind: "video", name: "Fundo", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "b", assetId: "bg", trackId: "bg", start: 0, in: 0, duration: 1.5, volume: 1 },
    // A still camera circle with a lime ring and a shadow, fading in.
    {
      id: "c",
      assetId: "cam",
      trackId: "top",
      start: 0,
      in: 0,
      duration: 0.8,
      volume: 0,
      fadeIn: 0.2,
      transform: {
        x: 0.3,
        y: 0.45,
        scale: 0.5,
        opacity: 1,
        crop: { left: 0.21875, right: 0.21875, top: 0, bottom: 0 },
        mask: "circle",
        border: "#C8F031",
        shadow: DEFAULT_SHADOW,
      },
    },
    // The same recording with rounded corners and a shadow, popping in (shadow moves with it).
    {
      id: "d",
      assetId: "cam",
      trackId: "top",
      start: 0.8,
      in: 0.8,
      duration: 0.7,
      volume: 0,
      fadeIn: 0.4,
      enter: "pop",
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 0.6,
        opacity: 1,
        mask: "rounded",
        shadow: DEFAULT_SHADOW,
      },
    },
  ],
};
const spec: ExportSpec = {
  outPath: "",
  width: 640,
  height: 360,
  fps: 30,
  videoBitrate: 2000,
  normalizeLoudness: false,
  encoder: "x264",
};

function render(fx: FxProvider | undefined, name: string): string {
  const out = join(dir, `${name}.mp4`);
  const plan = buildExportPlan(project, { ...spec, outPath: out }, fx, media);
  const script = join(dir, `${name}.txt`);
  writeFileSync(script, plan.filter);
  // Lossless picture, so two renders of the same pixels compare equal.
  const options = [...plan.outputArgs];
  const from = options.indexOf("-c:v");
  options.splice(
    from,
    options.indexOf("-pix_fmt") + 2 - from,
    "-c:v",
    "libx264",
    "-qp",
    "0",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
  );
  ff([...plan.inputArgs, SCRIPT, script, ...options]);
  return out;
}
/** Average PSNR of two videos in dB (Infinity when they are identical). */
function psnr(a: string, b: string): number {
  const run = spawnSync(
    FFMPEG,
    ["-hide_banner", "-nostats", "-i", a, "-i", b, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const average = /average:(inf|[\d.]+)/.exec(run.stderr)?.[1];
  if (run.status !== 0 || !average) throw new Error(run.stderr);
  return average === "inf" ? Number.POSITIVE_INFINITY : Number(average);
}
const hashes = (path: string): string[] =>
  ff(["-i", path, "-map", "0:v", "-f", "framemd5", "-"])
    .toString()
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.split(",").at(-1) ?? "").trim());
const rgb = (path: string, t: number, x: number, y: number): number[] =>
  Array.from(
    ff([
      "-ss",
      String(t),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      `crop=2:2:${x}:${y},scale=1:1:in_color_matrix=bt709:in_range=tv,format=rgb24`,
      "-f",
      "rawvideo",
      "-",
    ]),
  );

test("the cached effect pictures draw what the graph would make itself", {
  timeout: 120_000,
}, async () => {
  const inGraph = render(undefined, "graph");
  // What the app does: ask the plan what it needs, make the PNGs, then plan with them.
  const wanted = collectingProvider();
  buildExportPlan(project, { ...spec, outPath: join(dir, "x.mp4") }, wanted.provider, media);
  assert.deepEqual([...new Set(wanted.wanted.map((a) => a.kind))].sort(), [
    "mask",
    "ring",
    "shadow",
  ]);
  const runs: string[][] = [];
  const assets = new FxAssets(join(dir, "fx"), async (args) => {
    runs.push(args);
    return ff(args).toString();
  });
  await assets.ensure(wanted.wanted);
  const cached = render(assets.provider, "cached");
  // The PNGs are inputs now, not graphs.
  assert.match(
    buildExportPlan(
      project,
      { ...spec, outPath: join(dir, "y.mp4") },
      assets.provider,
      media,
    ).inputArgs.join(" "),
    /fx[\\/][0-9a-f]{32}\.png/,
  );
  // The same pictures: PNG frames come tagged full-range RGB and the graph's are untagged, so
  // swscale may round a handful of pixels one level apart; the app always uses the PNGs.
  assert.equal(hashes(cached).length, hashes(inGraph).length);
  const db = psnr(cached, inGraph);
  assert.ok(db >= 60, `PSNR ${db} dB`);
  // Made once: asking again renders nothing.
  const before = runs.length;
  await new FxAssets(join(dir, "fx"), async (args) => {
    runs.push(args);
    return "";
  }).ensure(wanted.wanted);
  assert.equal(runs.length, before);
  // The circle (center 192, 162, radius 90 at 640 × 360) shows the camera inside, white beyond
  // it, a 2 px lime ring at its edge and a shadow down and to the right.
  const corner = rgb(cached, 0.5, 112, 82);
  assert.ok(
    corner.every((v) => v > 225),
    `outside the circle: ${corner}`,
  );
  const ring = rgb(cached, 0.5, 191, 72);
  assert.ok(ring[1] > 180 && ring[2] < 140, `lime ring: ${ring}`);
  const above = rgb(cached, 0.5, 120, 96);
  const below = rgb(cached, 0.5, 258, 228);
  assert.ok(below[0] < above[0] - 10, `shadow below and to the right: ${below} (above: ${above})`);
});
