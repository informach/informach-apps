import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { CLICK_RATE, clickSamples, fillClicks } from "../src/shared/clickSound.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import type { CursorSprite, Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

/**
 * The cursor effects the export draws around the pointer sprite (src/shared/export/videoPlan.ts),
 * through FFmpeg: the magnifier enlarges what is under the pointer, the spotlight darkens the rest
 * of the screen, and the click sound comes in at the press, while the clip itself is silent.
 */
test("export: magnifier, spotlight and click sound around the pointer", {
  timeout: 180_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-cursor-fx-"));
  const W = 640;
  const H = 360;
  // A dark gray screen with a small white square under the pointer, at (300, 180).
  const screen = join(dir, "tela.mp4");
  execFileSync(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi", "-i"],
    `color=c=0x404040:s=${W}x${H}:r=30:d=3,drawbox=x=297:y=177:w=6:h=6:color=white:t=fill`,
    ...["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", screen],
  ]);
  // An empty sprite: only the effects show.
  const S = 96;
  const sprite = join(dir, "cursor.webm");
  const empty = spawnSync(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${S}x${S}`, "-r", "30"],
      ...["-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", sprite],
    ],
    { input: Buffer.alloc(S * S * 4 * 90) },
  );
  assert.equal(empty.status, 0, empty.stderr?.toString());
  // The spotlight's picture as the editor draws it: the recording's size, the lit circle (half
  // of a 100 px radius) in its middle, the rest at 60%.
  const spot = join(dir, "holofote.png");
  execFileSync(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}`, "-vf"],
    `format=rgba,geq=r=0:g=0:b=0:a='if(lt(hypot(X-${W / 2},Y-${H / 2}),50),0,153)'`,
    ...["-frames:v", "1", spot],
  ]);
  // The click sound, a press at 1 s of the recording, written as the app writes it.
  const clicks = join(dir, "cliques.flac");
  const samples = new Float32Array(CLICK_RATE * 3);
  fillClicks(samples, 0, [1], 0.8, clickSamples());
  const flac = spawnSync(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-f", "f32le", "-ar", String(CLICK_RATE), "-ac", "1"],
      ...["-i", "-", "-c:a", "flac", clicks],
    ],
    { input: Buffer.from(samples.buffer) },
  );
  assert.equal(flac.status, 0, flac.stderr?.toString());

  const positions = new Int32Array(90 * 2);
  for (let i = 0; i < 90; i++) positions.set([300 - S / 2, 180 - S / 2], i * 2);
  const cursor = (effects: Partial<CursorSprite>): CursorSprite => ({
    sprite,
    size: S,
    fps: 30,
    positions,
    ...effects,
  });
  const project: Project = {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: W, height: H, fps: 30 },
    assets: [
      {
        id: "a",
        name: "tela",
        path: screen,
        kind: "video",
        duration: 3,
        width: W,
        height: H,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
        cursor: join(dir, "cursor.json"),
      },
    ],
    tracks: [{ id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "a", trackId: "v", start: 0, in: 0, duration: 3, volume: 1 }],
  };
  const render = (name: string, sprite: CursorSprite): string => {
    const out = join(dir, `${name}.mp4`);
    const plan = buildExportPlan(project, {
      outPath: out,
      width: W,
      height: H,
      fps: 30,
      videoBitrate: 3000,
      normalizeLoudness: false,
      encoder: "x264",
      cursors: { a: sprite },
    });
    const script = join(dir, `${name}.txt`);
    writeFileSync(script, plan.filter);
    execFileSync(FFMPEG, [
      ...["-y", "-v", "error", ...plan.inputArgs, FILTER_SCRIPT_OPTION, script],
      ...plan.outputArgs,
    ]);
    return out;
  };
  const gray = (video: string, t: number, x: number, y: number): number =>
    execFileSync(FFMPEG, [
      ...["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf"],
      `crop=2:2:${x - 1}:${y - 1},scale=1:1`,
      ...["-f", "rawvideo", "-pix_fmt", "gray", "-"],
    ])[0];

  const plain = render("sem-efeitos", cursor({}));
  const lens = render("lupa", cursor({ magnifier: { radius: 40, side: 40, on: [[0, 2]] } }));
  const lit = render(
    "holofote",
    cursor({ spotlight: { picture: spot, width: W, height: H, on: [[0, 3]] }, clicks }),
  );

  // Twice as large around the pointer: a point 3 px off the square's corner is white now.
  assert.ok(gray(plain, 1, 304, 184) < 100, `without the magnifier: ${gray(plain, 1, 304, 184)}`);
  assert.ok(gray(lens, 1, 304, 184) > 200, `under the magnifier: ${gray(lens, 1, 304, 184)}`);
  // Only while it is on (0 to 2 s).
  assert.ok(gray(lens, 2.5, 304, 184) < 100, `after the magnifier: ${gray(lens, 2.5, 304, 184)}`);
  // The spotlight: the rest of the screen 60% darker, the circle around the pointer as it was.
  const far = gray(lit, 1, 60, 60);
  const near = gray(lit, 1, 360, 180);
  const before = gray(plain, 1, 60, 60);
  assert.ok(far < before * 0.55, `outside the light: ${far} (was ${before})`);
  assert.ok(Math.abs(near - gray(plain, 1, 360, 180)) < 6, `inside the light: ${near}`);

  // The click at 1 s, nothing around it.
  const level = (from: number, length: number): number => {
    const { stderr } = spawnSync(
      FFMPEG,
      [
        ...["-hide_banner", "-ss", String(from), "-t", String(length), "-i", lit],
        ...["-af", "volumedetect", "-vn", "-f", "null", "-"],
      ],
      { encoding: "utf8" },
    );
    const max = /max_volume: (-?[\d.]+|-inf) dB/.exec(stderr)?.[1];
    assert.ok(max, stderr);
    return max === "-inf" ? Number.NEGATIVE_INFINITY : Number(max);
  };
  assert.ok(level(0.95, 0.1) > -12, `the click: ${level(0.95, 0.1)} dB`);
  assert.ok(level(1.5, 1) < -60, `silence after it: ${level(1.5, 1)} dB`);
});
