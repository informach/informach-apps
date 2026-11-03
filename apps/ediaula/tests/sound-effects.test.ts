import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { autoSoundTrack, ensureSoundLibrary, writeSoundTrack } from "../src/main/soundTrack.ts";
import { AUTO_SOUND_DEFAULTS, type AutoSounds, autoSoundEvents } from "../src/shared/autoSounds.ts";
import { clickSamples } from "../src/shared/clickSound.ts";
import { DEFAULT_CURSOR_FX } from "../src/shared/cursor.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import {
  fillSounds,
  loudness,
  SOUND_EFFECTS,
  SOUND_LUFS,
  SOUND_PEAK,
  SOUND_RATE,
  soundEffect,
  soundSamples,
  wavFile,
} from "../src/shared/soundEffects.ts";
import type { Clip, Project, Track } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const FFMPEG: string = require("ffmpeg-static");

/** Seconds of the loudest 10 ms of `samples`. */
function loudest(samples: Float32Array, rate = SOUND_RATE): number {
  const win = Math.round(rate * 0.01);
  let best = 0;
  let at = 0;
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let k = i; k < i + win; k++) sum += samples[k] * samples[k];
    if (sum > best) {
      best = sum;
      at = i;
    }
  }
  return (at + win / 2) / rate;
}

test("every sound effect is the same on every run, lasts what it says and peaks where it says", () => {
  for (const effect of SOUND_EFFECTS) {
    const a = soundSamples(effect.id);
    assert.deepEqual(soundSamples(effect.id), a, `${effect.id}: made the same every time`);
    assert.equal(a.length, Math.max(1, Math.round(effect.seconds * SOUND_RATE)), effect.id);
    const peak = Math.max(...a.map(Math.abs));
    assert.ok(peak > 0.1 && peak <= SOUND_PEAK + 1e-6, `${effect.id}: peak ${peak}`);
    // Every sound at about -18 LUFS; one that would peak above -1 dBFS stays under it instead.
    const lufs = loudness(a, SOUND_RATE);
    if (peak < SOUND_PEAK - 1e-3)
      assert.ok(Math.abs(lufs - SOUND_LUFS) < 0.1, `${effect.id}: ${lufs.toFixed(1)} LUFS`);
    else assert.ok(lufs < SOUND_LUFS, `${effect.id}: ${lufs.toFixed(1)} LUFS at the peak limit`);
    assert.ok(a.every(Number.isFinite), `${effect.id}: finite`);
    // No step at the ends (a click of its own).
    assert.ok(Math.abs(a[0]) < 0.05 && Math.abs(a[a.length - 1]) < 0.05, `${effect.id}: edges`);
    // An automatic whoosh lands its loudest moment on the movement's middle.
    if (effect.group === "woosh")
      assert.ok(
        Math.abs(loudest(a) - effect.peak) < 0.09,
        `${effect.id}: loudest at ${loudest(a).toFixed(3)} s, said ${effect.peak} s`,
      );
  }
  // The first click is the click the cursor always had, brought to the level of the others.
  const old = clickSamples();
  const now = soundSamples("clique");
  const gain =
    now[old.findIndex((v) => Math.abs(v) > 0.1)] / old[old.findIndex((v) => Math.abs(v) > 0.1)];
  assert.ok(gain > 0 && gain < 1);
  assert.ok(
    now.every((v, i) => Math.abs(v - old[i] * gain) < 1e-6),
    "the same click, softer",
  );
  // Made at the preview's rate too (a sound card at 44.1 kHz).
  assert.equal(soundSamples("woosh-curto", 44100).length, Math.round(0.45 * 44100));
});

test("sounds written a stretch at a time add up to the sounds written whole", () => {
  const sounds = [
    { at: 0.02, samples: soundSamples("woosh-curto"), volume: 0.5 },
    { at: 0.3, samples: soundSamples("pop"), volume: 1 },
    { at: 0.9, samples: soundSamples("ding"), volume: 0.7 },
  ];
  const total = SOUND_RATE * 3;
  const whole = new Float32Array(total);
  fillSounds(whole, 0, sounds);
  const pieces = new Float32Array(total);
  for (let from = 0; from < total; from += 7001) {
    const chunk = new Float32Array(Math.min(7001, total - from));
    fillSounds(chunk, from, sounds);
    pieces.set(chunk, from);
  }
  assert.deepEqual(pieces, whole);
  assert.ok(whole.every((v) => v >= -1 && v <= 1));
});

test("a library WAV is plain 16-bit mono PCM", () => {
  const samples = soundSamples("clique-mouse");
  const wav = wavFile(samples);
  const view = new DataView(wav.buffer);
  const text = (at: number, n: number): string => String.fromCharCode(...wav.slice(at, at + n));
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), SOUND_RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
});

const track = (id: string, more: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...more,
});
const clip = (id: string, more: Partial<Clip> = {}): Clip => ({
  id,
  assetId: "tela",
  trackId: "v",
  start: 0,
  in: 0,
  duration: 10,
  volume: 1,
  ...more,
});

function lesson(autoSounds: AutoSounds | undefined, clips: Clip[], tracks?: Track[]): Project {
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    ...(autoSounds ? { autoSounds } : {}),
    assets: [
      {
        id: "tela",
        name: "Tela",
        path: "C:/aula/tela.mp4",
        kind: "video",
        duration: 60,
        width: 1920,
        height: 1080,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
        zooms: [
          // Source 5 to 9, eased over 0.7 s: in centered at 5.35, out centered at 8.65.
          { id: "z1", start: 5, end: 9, scale: 1.8, focus: [{ t: 5, x: 0.5, y: 0.5 }] },
          { id: "z2", start: 30, end: 33, scale: 2, focus: [{ t: 30, x: 0.2, y: 0.2 }] },
        ],
      },
    ],
    tracks: tracks ?? [track("z"), track("v")],
    clips,
  };
}

const centers = (p: Project): [string, number][] =>
  autoSoundEvents(p).map((e) => [
    e.sound,
    Math.round((e.at + soundEffect(e.sound).peak) * 1000) / 1000,
  ]);

test("a whoosh goes with each zoom of a recording, on the clip that shows it", () => {
  // The clip shows source 4 to 14 from timeline 2, at double speed (it lasts 5 s).
  const p = lesson({ zooms: true }, [clip("c", { start: 2, in: 4, duration: 5, speed: 2 })]);
  assert.deepEqual(centers(p), [
    ["swoosh-entrada", 2.675],
    ["swoosh-saida", 4.325],
  ]);
  assert.equal(autoSoundEvents(p)[0].volume, AUTO_SOUND_DEFAULTS.volume);
  // A zoom that began before the clip makes no sound where the clip starts in the middle of it.
  assert.deepEqual(centers(lesson({ zooms: true }, [clip("c", { in: 6, duration: 2 })])), []);
  // One whoosh for both ways when one is chosen.
  assert.deepEqual(
    centers(lesson({ zooms: true, zoomSound: "woosh-curto" }, [clip("c", { in: 4, duration: 6 })])),
    [
      ["woosh-curto", 1.35],
      ["woosh-curto", 4.65],
    ],
  );
});

test("a zoom layer whooshes going in and coming out, and a pan to the next spot once", () => {
  const layer = (id: string, start: number, duration: number, more = {}): Clip =>
    clip(id, {
      assetId: "",
      trackId: "z",
      start,
      duration,
      zoomLayer: { scale: 1.6, x: 0.3, y: 0.4, easeIn: 0.6, easeOut: 0.6, ...more },
    });
  const base = clip("c", { duration: 60 });
  const one = lesson({ zooms: true }, [base, layer("l", 20, 4)]);
  assert.deepEqual(centers(one).slice(2, 4), [
    ["swoosh-entrada", 20.3],
    ["swoosh-saida", 23.7],
  ]);
  // Staying zoomed into the next layer: no way out here, the next one pans from this view.
  const chain = lesson({ zooms: true }, [
    base,
    layer("a", 20, 4, { zoomOut: false }),
    layer("b", 24, 3, { x: 0.7 }),
  ]);
  assert.deepEqual(
    centers(chain).filter(([, t]) => t >= 20 && t < 28),
    [
      ["swoosh-entrada", 20.3],
      ["swoosh-entrada", 24.3],
      ["swoosh-saida", 26.7],
    ],
  );
  // A layer at 1× from normal does not move: nothing to hear.
  assert.deepEqual(
    centers(lesson({ zooms: true }, [layer("n", 20, 4, { scale: 1, x: 0.5, y: 0.5 })])),
    [],
  );
});

test("a whoosh goes with each transition, in the middle of what it shows", () => {
  const cut = (kind: NonNullable<Clip["transition"]>["kind"]): Project =>
    lesson({ transitions: true }, [
      clip("a", { duration: 10 }),
      clip("b", { start: 10, in: 40, duration: 10, transition: { kind, duration: 0.8 } }),
    ]);
  // The outgoing picture goes away over the incoming one, after the cut.
  assert.deepEqual(centers(cut("dissolve")), [["woosh-curto", 10.4]]);
  // Through black and the effects over the frame are centered on the cut.
  assert.deepEqual(centers(cut("black")), [["woosh-curto", 10]]);
  assert.deepEqual(centers(cut("glitch")), [["woosh-curto", 10]]);
  assert.deepEqual(centers(cut("colorwipe")), [["woosh-curto", 10]]);
  // Off, or on a hidden track: silent.
  assert.deepEqual(autoSoundEvents({ ...cut("dissolve"), autoSounds: { transitions: false } }), []);
  const hidden = cut("dissolve");
  hidden.tracks = [track("z"), track("v", { hidden: true })];
  assert.deepEqual(autoSoundEvents(hidden), []);
  assert.deepEqual(
    autoSoundEvents({ ...cut("dissolve"), autoSounds: { transitions: true, volume: 0 } }),
    [],
  );
});

test("the automatic whoosh and the chosen click are saved with the lesson", () => {
  const p = lesson(
    {
      zooms: true,
      transitions: true,
      volume: 0.35,
      zoomSound: "par",
      transitionSound: "woosh-longo",
    },
    [clip("c")],
  );
  p.assets[0].cursorFx = { ...DEFAULT_CURSOR_FX, clickSound: true, clickSoundKind: "pop" };
  const parsed = projectSchema.parse(p);
  assert.deepEqual(parsed.autoSounds, p.autoSounds);
  assert.equal(parsed.assets[0].cursorFx?.clickSoundKind, "pop");
  const bad = structuredClone(p);
  bad.autoSounds = { transitions: true, transitionSound: "trovão" as never };
  assert.equal(projectSchema.safeParse(bad).success, false);
});

test("the export mixes the whoosh track with the voices, the whole lesson long", () => {
  const p = lesson({ transitions: true }, [clip("c")]);
  const plan = buildAudioPlan(p, { effects: "C:/cache/sounds/auto-x.flac" });
  assert.deepEqual(plan.inputArgs, ["-i", "C:/cache/sounds/auto-x.flac"]);
  assert.ok(plan.media.includes("C:/cache/sounds/auto-x.flac"));
  assert.match(
    plan.filter,
    /\[0:a\]aresample=48000.*apad=whole_len=480000,atrim=end_sample=480000\[effects\]/,
  );
  assert.match(plan.filter, /\[effects\]anull\[voice\]/);
  assert.equal(buildAudioPlan(p, {}).inputArgs.length, 0);
});

test("the whoosh track and the library files are written as the app writes them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-sons-"));
  try {
    // Two whooshes; the track is read back and the sound is where it was placed.
    const events = [
      { at: 0.5, sound: "woosh-curto" as const, volume: 0.8 },
      { at: 2, sound: "swoosh-saida" as const, volume: 0.8 },
    ];
    const first = await autoSoundTrack(FFMPEG, dir, events, 3);
    assert.equal(await autoSoundTrack(FFMPEG, dir, [...events].reverse(), 3), first);
    const pcm = spawnSync(FFMPEG, ["-v", "error", "-i", first, "-ac", "1", "-f", "f32le", "-"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(pcm.status, 0, pcm.stderr?.toString());
    const out = new Float32Array(new Uint8Array(pcm.stdout).buffer);
    assert.equal(out.length, 3 * SOUND_RATE);
    const at = loudest(out.subarray(0, SOUND_RATE * 1.5));
    assert.ok(Math.abs(at - (0.5 + soundEffect("woosh-curto").peak)) < 0.09, `at ${at}`);
    assert.ok(Math.max(...out.subarray(0, SOUND_RATE * 0.4).map(Math.abs)) < 1e-3);

    const clicks = join(dir, "cliques.flac");
    await writeSoundTrack(FFMPEG, clicks, [{ at: 1, samples: clickSamples(), volume: 1 }], 2);
    assert.ok(statSync(clicks).size > 0);

    const library = join(dir, "Efeitos sonoros");
    const files = await ensureSoundLibrary(library);
    assert.equal(files.length, SOUND_EFFECTS.length);
    const ding = files.find((f) => f.id === "ding");
    assert.ok(ding);
    assert.ok(ding.path.endsWith("Ding de acerto.wav"));
    assert.deepEqual(new Uint8Array(readFileSync(ding.path)), wavFile(soundSamples("ding")));
    // Listed again, nothing is written over.
    const before = statSync(ding.path).mtimeMs;
    await ensureSoundLibrary(library);
    assert.equal(statSync(ding.path).mtimeMs, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
