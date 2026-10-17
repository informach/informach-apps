import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DUCKING, duckExpr, duckGain, speechSpans } from "../src/shared/audio.ts";
import { buildExportPlan, DENOISE } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");

const asset = (id: string, path = `${id}.wav`, duration = 10) => ({
  id,
  name: id,
  path,
  kind: "audio" as const,
  duration,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none" as const,
});

function project(voicePath = "voz.wav", musicPath = "musica.wav"): Project {
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 640, height: 360, fps: 30 },
    assets: [asset("voz", voicePath, 2), asset("mus", musicPath, 6)],
    tracks: [
      { id: "tv", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
      {
        id: "tm",
        kind: "audio",
        name: "Música",
        muted: false,
        hidden: false,
        locked: false,
        music: true,
      },
    ],
    clips: [
      { id: "cv", assetId: "voz", trackId: "tv", start: 0, in: 0, duration: 2, volume: 1 },
      { id: "cm", assetId: "mus", trackId: "tm", start: 0, in: 0, duration: 6, volume: 1 },
    ],
  };
}

test("speech spans: words of transcribed clips, whole clips otherwise, close ones merged, music ignored", () => {
  const p = project();
  assert.deepEqual(speechSpans(p), [[0, 2]]);
  const words = [
    { clipId: "cv", start: 0.2, end: 0.5 },
    { clipId: "cv", start: 0.9, end: 1.1 },
    { clipId: "cv", start: 5, end: 5.4 },
  ];
  // Short pauses keep the music down; a long one lets it back up.
  assert.deepEqual(speechSpans(p, words, new Set(["voz"])), [
    [0.2, 1.1],
    [5, 5.4],
  ]);
  assert.deepEqual(
    speechSpans({ ...p, tracks: p.tracks.map((t) => ({ ...t, muted: t.id === "tv" })) }),
    [],
  );
});

test("ducking envelope: down while speaking, ramps around it, and the ffmpeg expression is the same curve", () => {
  const spans: [number, number][] = [
    [1, 2],
    [5, 6],
  ];
  assert.equal(duckGain(spans, 0), 1);
  assert.equal(duckGain(spans, 1.5), DUCKING.depth);
  assert.equal(duckGain(spans, 3), 1);
  const mid = duckGain(spans, 1 - DUCKING.ramp / 2);
  assert.ok(mid > DUCKING.depth && mid < 1);
  const expr = duckExpr(spans);
  const clip = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
  const evalExpr = new Function("t", "clip", "min", `return ${expr}`) as (
    t: number,
    c: typeof clip,
    m: typeof Math.min,
  ) => number;
  for (let t = 0; t <= 7; t += 0.05)
    assert.ok(Math.abs(evalExpr(t, clip, Math.min) - duckGain(spans, t)) < 1e-3, `t=${t}`);
  assert.equal(duckExpr([]), "1");
});

test("export: music on a music track is lowered while the voice plays, denoise goes in the voice chain", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-audio-"));
  const voice = join(dir, "voz.wav");
  const music = join(dir, "musica.wav");
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=300:d=2", voice]);
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=1200:d=6", music]);
  const p = project(voice, music);
  p.clips[0].denoise = true;
  const out = join(dir, "aula.mp3");
  const plan = buildExportPlan(p, {
    outPath: out,
    width: 640,
    height: 360,
    fps: 30,
    videoBitrate: 1000,
    normalizeLoudness: false,
    encoder: "x264",
    audioOnly: true,
  });
  assert.ok(plan.filter.includes(DENOISE));
  assert.match(plan.filter, /volume='1-0\.75\*min\(1,clip/);
  const script = join(dir, "f.txt");
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
  const db = (from: number, to: number): number => {
    const r = spawnSync(
      FFMPEG,
      [
        "-hide_banner",
        "-i",
        out,
        "-af",
        `atrim=${from}:${to},bandpass=f=1200:width_type=q:w=20,bandpass=f=1200:width_type=q:w=20,volumedetect`,
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    return Number(/mean_volume: (-?[\d.]+)/.exec(r.stderr)?.[1]);
  };
  const during = db(0.5, 1.5);
  const after = db(3.5, 5.5);
  assert.ok(
    Math.abs(after - during - 12) < 2,
    `music should drop about 12 dB under the voice (during ${during}, after ${after})`,
  );
});
