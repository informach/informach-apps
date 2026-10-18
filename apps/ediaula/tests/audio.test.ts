import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import type { RunOptions } from "../src/main/export/renderSegments.ts";
import { exportLesson } from "../src/main/export-lesson.ts";
import { ffmpegVersion, filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { DUCKING, duckExpr, duckGain, duckingOf, speechSpans } from "../src/shared/audio.ts";
import { buildAudioPlan, MICROFADE, MUSIC_END_FADE, RATE } from "../src/shared/export/audioPlan.ts";
import { buildExportPlan, DENOISE } from "../src/shared/exportPlan.ts";
import type { Project } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");
const FILTER_SCRIPT_OPTION = await filterScriptOption(FFMPEG);

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
    FILTER_SCRIPT_OPTION,
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

test("ducking follows the project's depth, ramp and hold, with the same curve in the export", () => {
  const p: Project = { ...project(), audio: { ducking: { depth: 0.5, ramp: 0.2, hold: 0.1 } } };
  const d = duckingOf(p);
  assert.deepEqual(d, { depth: 0.5, ramp: 0.2, hold: 0.1 });
  assert.deepEqual(duckingOf(project()), DUCKING);
  // A shorter hold lets the music back up between two phrases 0.6 s apart.
  const words = [
    { clipId: "cv", start: 0.2, end: 0.6 },
    { clipId: "cv", start: 1.2, end: 1.6 },
  ];
  assert.equal(speechSpans(p, words, new Set(["voz"]), d.ramp, d.hold).length, 2);
  assert.equal(speechSpans(p, words, new Set(["voz"])).length, 1);
  const spans = speechSpans(p, words, new Set(["voz"]), d.ramp, d.hold);
  const expr = duckExpr(spans, d.depth, d.ramp);
  const clip = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
  const evalExpr = new Function("t", "clip", "min", `return ${expr}`) as (
    t: number,
    c: typeof clip,
    m: typeof Math.min,
  ) => number;
  for (let t = 0; t <= 2.5; t += 0.01)
    assert.ok(
      Math.abs(evalExpr(t, clip, Math.min) - duckGain(spans, t, d.depth, d.ramp)) < 1e-3,
      `t=${t}`,
    );
  // A music track set to stay at its level is mixed without the envelope.
  const flat = buildAudioPlan(
    { ...p, tracks: p.tracks.map((t) => (t.music ? { ...t, duck: false } : t)) },
    {},
  );
  assert.doesNotMatch(flat.filter, /volume='1-/);
  assert.match(buildAudioPlan(p, {}).filter, /volume='1-0\.5\*min\(1,/);
});

test("the leaving clip's sound fades through a transition, and music ending with the lesson fades out", () => {
  const p = project();
  p.clips = [
    { id: "a", assetId: "voz", trackId: "tv", start: 0, in: 0, duration: 1, volume: 1 },
    {
      id: "b",
      assetId: "voz",
      trackId: "tv",
      start: 1,
      in: 1.5,
      duration: 0.5,
      volume: 1,
      transition: { kind: "dissolve", duration: 0.4 },
    },
    { id: "m", assetId: "mus", trackId: "tm", start: 0, in: 0, duration: 1.5, volume: 0.4 },
  ];
  const plan = buildAudioPlan(p, {});
  const fade = (seconds: number): number => Math.round(seconds * RATE);
  assert.match(plan.filter, new RegExp(`afade=t=in:ss=0:ns=${fade(MICROFADE)}`));
  // The dissolve lasts 0.25 s here (at most half of b): A's sound fades out over all of it.
  assert.match(
    plan.filter,
    new RegExp(`afade=t=out:ss=${fade(1) - fade(0.25)}:ns=${fade(0.25)}`),
    "the clip leaving through the dissolve fades out at the cut",
  );
  // The music plays to the end of the lesson (1.5 s): it fades out over as much as it can.
  assert.match(
    plan.filter,
    new RegExp(`ns=${Math.min(fade(1.5) - fade(MICROFADE), fade(MUSIC_END_FADE))}`),
  );
  assert.equal(plan.samples, fade(1.5));
});

/** Renders an audio plan to raw 32-bit float samples, mono. */
function samples(p: Project, dir: string): Float32Array {
  const plan = buildAudioPlan(p, {});
  const script = join(dir, `audio-${Date.now()}.txt`);
  writeFileSync(script, plan.filter);
  const raw = execFileSync(
    FFMPEG,
    [
      "-v",
      "error",
      ...plan.inputArgs,
      FILTER_SCRIPT_OPTION,
      script,
      "-map",
      `[${plan.output}]`,
      "-ac",
      "1",
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

test("PCM: a sine cut in the middle of a cycle has no jump at the splice; a continuation is not faded", {
  timeout: 60_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-splice-"));
  const sine = join(dir, "seno.wav");
  execFileSync(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=5:sample_rate=48000",
    sine,
  ]);
  const p = project(sine);
  p.assets[0].duration = 5;
  p.clips = [
    { id: "a", assetId: "voz", trackId: "tv", start: 0, in: 0, duration: 1, volume: 1 },
    // 0.37 s of the source removed: the wave would jump here.
    { id: "b", assetId: "voz", trackId: "tv", start: 1, in: 1.37, duration: 1, volume: 1 },
    // Goes on exactly where b stopped, in the file and on the timeline: no fade.
    { id: "c", assetId: "voz", trackId: "tv", start: 2, in: 2.37, duration: 1, volume: 1 },
  ];
  const x = samples(p, dir);
  assert.equal(x.length, 3 * RATE);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const natural = peak * 2 * Math.PI * (440 / RATE);
  let worst = 0;
  for (let i = 1; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - x[i - 1]));
  assert.ok(worst < natural * 1.5, `largest step ${worst}, the sine's own ${natural}`);
  // Silent right at the faded splice, at full level across the continuation.
  assert.ok(Math.abs(x[RATE]) < peak * 0.05, `at the cut: ${x[RATE]}`);
  let across = 0;
  for (let i = 2 * RATE - 100; i < 2 * RATE + 100; i++) across = Math.max(across, Math.abs(x[i]));
  assert.ok(across > peak * 0.95, `across the continuation: ${across}`);
});

test("loudness: two voices recorded at different levels are evened out and the lesson ends at −14 LUFS", {
  timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-loud-"));
  try {
    const quiet = join(dir, "microfone.wav");
    const loud = join(dir, "avatar.wav");
    // Speech-like: a tone that comes and goes; the second one 10 dB louder than the first (the
    // levelling corrects up to 12 dB, so a source mostly silent cannot be pushed up without end).
    const voice = (f: number, gain: number, out: string): void => {
      execFileSync(FFMPEG, [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `sine=f=${f}:d=6:sample_rate=48000,volume=${gain}*(0.6+0.4*sin(2*PI*1.7*t)):eval=frame`,
        out,
      ]);
    };
    voice(300, 0.03, quiet);
    voice(520, 0.095, loud);
    const p = project(quiet, loud);
    p.assets = [
      { ...p.assets[0], duration: 6 },
      { ...p.assets[1], id: "ava", duration: 6 },
    ];
    p.tracks = [
      p.tracks[0],
      { id: "tav", kind: "audio", name: "Avatar", muted: false, hidden: false, locked: false },
    ];
    p.clips = [
      { id: "q", assetId: "voz", trackId: "tv", start: 0, in: 0, duration: 4.5, volume: 1 },
      { id: "l", assetId: "ava", trackId: "tav", start: 4.5, in: 0, duration: 4, volume: 1 },
    ];
    const authority = createFileAuthority(["ediaula"]);
    for (const path of [quiet, loud]) await authority.grantRead(path);
    const out = join(dir, "podcast.mp3");
    await authority.grantWrite(out);
    await exportLesson(
      p,
      {
        outPath: out,
        width: 640,
        height: 360,
        fps: 30,
        videoBitrate: 0,
        normalizeLoudness: true,
        encoder: "x264",
        audioOnly: true,
      },
      {
        assertRead: (path) => authority.assertRead(path),
        assertWrite: (path) => authority.assertWrite(path, false),
        assertRelatedExport: (a, b) => authority.assertRelatedExport(a, b),
        fontsDirectory: dir,
        filterScriptOption: FILTER_SCRIPT_OPTION,
        ffmpegVersion: await ffmpegVersion(FFMPEG),
        cacheDirectory: join(dir, "cache"),
        workDirectory: join(dir, "work"),
        check: () => {},
        async run(args: string[], options?: RunOptions) {
          const r = spawnSync(FFMPEG, args, { encoding: "utf8", maxBuffer: 1 << 26 });
          if (r.status !== 0) throw new Error(r.stderr);
          return options?.capture === "stderr" ? r.stderr : r.stdout;
        },
      },
    );
    const integrated = (from: number, to: number): number => {
      const r = spawnSync(
        FFMPEG,
        [
          "-hide_banner",
          "-nostats",
          "-i",
          out,
          "-af",
          `atrim=${from}:${to},ebur128`,
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
      return Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
    };
    const whole = integrated(0, 8.5);
    assert.ok(Math.abs(whole + 14) <= 0.5, `integrated loudness ${whole} LUFS`);
    const first = integrated(0.5, 4);
    const second = integrated(5, 8);
    assert.ok(Math.abs(first - second) < 1.5, `the two voices: ${first} and ${second} LUFS`);
  } finally {
    await rm(dir, { recursive: true });
  }
});
