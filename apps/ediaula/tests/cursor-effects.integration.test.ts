import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
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

// The editor's own drawing of the spotlight (lib/cursorDraw.ts), outside the browser.
const src = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@shared/"))
      return { url: new URL(`shared/${specifier.slice(8)}.ts`, src).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
Object.assign(globalThis, { Path2D: class {} });
const { paintSpotlightPicture, spotlightPictureSize } = await import(
  "../src/renderer/src/lib/cursorDraw.ts"
);
hooks.deregister();

/**
 * The little of a 2D canvas the spotlight uses (a radial gradient filling the picture), drawn
 * into RGBA bytes: each pixel takes the gradient's alpha at its distance, interpolated between
 * the color stops as a canvas does.
 */
class GradientRaster {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  fillStyle: unknown = null;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }
  save(): void {}
  restore(): void {}
  createRadialGradient(_x0: number, _y0: number, _r0: number, x: number, y: number, r: number) {
    const stops: [number, number][] = [];
    return {
      x,
      y,
      r,
      stops,
      addColorStop(offset: number, color: string): void {
        const alpha = Number(/,\s*([\d.]+)\)\s*$/.exec(color)?.[1] ?? 1);
        stops.push([offset, alpha]);
      },
    };
  }
  fillRect(): void {
    const g = this.fillStyle as { x: number; y: number; r: number; stops: [number, number][] };
    for (let py = 0; py < this.height; py++)
      for (let px = 0; px < this.width; px++) {
        const t = Math.min(1, Math.hypot(px + 0.5 - g.x, py + 0.5 - g.y) / g.r);
        let alpha = g.stops.at(-1)?.[1] ?? 0;
        for (let i = 1; i < g.stops.length; i++) {
          const [a, va] = g.stops[i - 1];
          const [b, vb] = g.stops[i];
          if (t <= b) {
            alpha = b > a ? va + ((t - a) / (b - a)) * (vb - va) : vb;
            break;
          }
        }
        this.data[(py * this.width + px) * 4 + 3] = Math.round(alpha * 255);
      }
  }
}

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
  // The spotlight's picture drawn by the editor's own code (lib/cursorDraw.ts, as
  // lib/cursorRender.ts makes it): half the recording's size, a 100 px light around the pointer,
  // the rest 60% darker.
  const data = { width: W, height: H };
  const size = spotlightPictureSize(data);
  const spotlightOf = (name: string, radius: number): string => {
    const out = join(dir, `${name}.png`);
    const raster = new GradientRaster(size.width, size.height);
    paintSpotlightPicture(raster, data, {
      spotlight: true,
      spotlightRadius: radius / H,
      spotlightDim: 0.6,
    });
    const png = spawnSync(
      FFMPEG,
      [
        ...["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba"],
        ...["-s", `${size.width}x${size.height}`, "-i", "-", "-frames:v", "1", out],
      ],
      { input: Buffer.from(raster.data) },
    );
    assert.equal(png.status, 0, png.stderr?.toString());
    return out;
  };
  const spot = spotlightOf("holofote", 100);
  // A light smaller than the magnifier: what the magnifier shows around it is not darkened.
  const narrow = spotlightOf("holofote-estreito", 10);
  // The click sound, a press at 1 s of the recording, written as the app writes it.
  const clicks = join(dir, "cliques.flac");
  const samples = new Float32Array(CLICK_RATE * 3);
  fillClicks(samples, 0, [1], 0.8, clickSamples());
  const flac = spawnSync(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-f", "f32le", "-ar", String(CLICK_RATE), "-ac", "1"],
      ...["-i", "-", "-af", "pan=stereo|c0=c0|c1=c0", "-c:a", "flac", clicks],
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

  const both = render(
    "lupa-e-holofote",
    cursor({
      magnifier: { radius: 40, side: 40, on: [[0, 3]] },
      spotlight: { picture: narrow, width: W, height: H, on: [[0, 3]] },
    }),
  );
  // The magnifier goes over the spotlight and enlarges the recording itself, as in the preview:
  // 30 px right of the pointer it shows the screen 15 px away, outside the narrow light, at its
  // own gray (64), not darkened.
  assert.ok(
    gray(both, 1, 330, 180) > 52,
    `the magnifier over the spotlight: ${gray(both, 1, 330, 180)}`,
  );
  // Outside the magnifier the spotlight still darkens.
  assert.ok(gray(both, 1, 60, 60) < 40, `outside both: ${gray(both, 1, 60, 60)}`);

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
  // At its full level (0.8 of a peak of 0.9 is -2.9 dB): no 3 dB lost to a mono upmix.
  assert.ok(level(0.95, 0.1) > -3.5, `the click: ${level(0.95, 0.1)} dB`);
  assert.ok(level(1.5, 1) < -60, `silence after it: ${level(1.5, 1)} dB`);
});
