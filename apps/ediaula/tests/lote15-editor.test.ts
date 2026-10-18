import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FxAssets } from "../src/main/export/fxAssets.ts";
import { thumbnailSecond } from "../src/main/export/pipeline.ts";
import { renderSegments, type SegmentJob, segmentKeys } from "../src/main/export/renderSegments.ts";
import { SegmentCache } from "../src/main/export/segmentCache.ts";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { lessonFile } from "../src/main/lessonFile.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { windowSignature } from "../src/shared/export/fingerprint.ts";
import { exportProject, frameRate } from "../src/shared/export/frames.ts";
import { isBorder, planSegments } from "../src/shared/export/segments.ts";
import { buildVideoWindowPlan, eqLut } from "../src/shared/export/videoPlan.ts";
import { detachAudio } from "../src/shared/groups.ts";
import { restoreSnapshot } from "../src/shared/history.ts";
import { type Keyframe, keyframeAt, keyframeExprs } from "../src/shared/keyframes.ts";
import { colorSvg } from "../src/shared/look.ts";
import { magneticSlot } from "../src/shared/magnetic.ts";
import { normalizeProject } from "../src/shared/project-normalize.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import {
  drawingPoints,
  fitDrawing,
  NEAR_LIMIT,
  nearSaveLimit,
  PROJECT_DRAWING_POINTS,
  PROJECT_LIMIT_BYTES,
} from "../src/shared/projectSize.ts";
import { followSpans, regionRectAt } from "../src/shared/regionFollow.ts";
import { replaceAsset } from "../src/shared/replaceAsset.ts";
import { revealAt, revealSpan, revealTimes } from "../src/shared/reveal.ts";
import { settle } from "../src/shared/settle.ts";
import { splitAt } from "../src/shared/timeline.ts";
import type { Asset, Clip, ExportSpec, Project, Track } from "../src/shared/types.ts";
import { type Zoom, zoomAt, zoomExprs } from "../src/shared/zoom.ts";

/** Probes of the general review of the editor and the export (scratchpad l15/editor), as tests. */

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.mp4`,
  kind,
  duration: kind === "image" ? 0 : 600,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (
  id: string,
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({ id, assetId, trackId, start, in: 0, duration, volume: 1, ...extra });
const project = (
  assets: Asset[],
  tracks: Track[],
  clips: Clip[],
  extra: Partial<Project> = {},
): Project => ({
  version: 1,
  id: "p",
  name: "p",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks,
  clips,
  ...extra,
});
const spec: ExportSpec = {
  outPath: "C:/out/aula.mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: 8000,
  normalizeLoudness: false,
  encoder: "x264",
};
const r = frameRate(30);
const key = (p: Project, win: { from: number; frames: number }): string =>
  JSON.stringify(windowSignature(exportProject(p, r), win, spec, r, []).key);

const FFMPEG: string = createRequire(import.meta.url)("ffmpeg-static");

// ---- 1. Seguir a gravação: the target at each moment ----

test("a following region follows the webcam while it is there and the screen after it", () => {
  const fx = {
    kind: "blur" as const,
    rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
    feather: 0,
    strength: 0.6,
    follow: true,
  };
  const tracks = [track("fx", "video"), track("cam", "video"), track("scr", "video")];
  const base = [clip("r1", "scr", "fx", 0, 60, { regionFx: fx }), clip("s1", "scr", "scr", 0, 60)];
  const assets = [asset("scr", "video"), asset("webcam", "video")];
  const webcam = clip("w1", "webcam", "cam", 0, 10, {
    transform: { x: 0.85, y: 0.85, scale: 0.25, opacity: 1 },
  });
  const withCam = project(assets, tracks, [...base, webcam]);
  const noCam = project(assets, tracks, base);
  const spans = followSpans(withCam, base[0]);
  assert.deepEqual(
    spans.map((s) => [s.clip.id, s.start, s.end]),
    [
      ["w1", 0, 10],
      ["s1", 10, 60],
    ],
  );
  // The preview places it on the screen once the webcam is gone.
  assert.equal(regionRectAt(withCam, base[0], 5)?.clip.id, "w1");
  assert.equal(regionRectAt(withCam, base[0], 30)?.clip.id, "s1");
  // The export blurs the screen from 40 to 60 s, with or without the webcam at the start.
  const late = { from: 1200, frames: 600 };
  for (const p of [withCam, noCam]) {
    const plan = buildVideoWindowPlan(exportProject(p, r), spec, r, late);
    assert.ok(plan.filter.includes("boxblur"), "blur on the screen at 40-60 s");
  }
  // From 0 to 20 s: on the webcam until 10 s, then on the screen from 10 s of its clock.
  const early = { from: 0, frames: 600 };
  const plan = buildVideoWindowPlan(exportProject(withCam, r), spec, r, early);
  assert.equal((plan.filter.match(/boxblur/g) ?? []).length, 2);
  assert.match(plan.filter, /enable='between\(t,9\.98333\d*,59\.98333\d*\)'/);
  // What it follows is in the key: deleting the webcam renders the segment showing it again.
  assert.notEqual(key(withCam, early), key(noCam, early));
  const signature = windowSignature(exportProject(withCam, r), early, spec, r, []).key;
  assert.match(JSON.stringify(signature), /"follow":\[\{"asset":"webcam"/);
});

// ---- 2. Windows with the same key share one render ----

async function segmentsSetup(p: Project, paths: Record<string, string>) {
  const side = await mkdtemp(join(tmpdir(), "ediaula-dupes-"));
  for (const name of Object.values(paths)) await writeFile(join(side, name), "media");
  const local: Project = {
    ...p,
    assets: p.assets.map((a) => (paths[a.id] ? { ...a, path: join(side, paths[a.id]) } : a)),
  };
  const cache = new SegmentCache(join(side, "segments"));
  const rendered: string[] = [];
  const run = async (args: string[]): Promise<string> => {
    const out = args.at(-1);
    if (!out) throw new Error("no output");
    if (args.includes("-an")) rendered.push(out);
    // Two renders into the same .part at once would show here.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(out, "segment");
    return "";
  };
  const derived = exportProject(local, r);
  const job: SegmentJob = {
    project: derived,
    spec,
    rate: r,
    windows: planSegments(derived, spec),
    encoder: "x264",
    concurrency: 3,
    threads: 4,
    cache,
    fx: new FxAssets(join(side, "fx"), run),
    work: side,
    media: () => undefined,
    filterScriptOption: "-/filter_complex",
    ffmpegVersion: "ffmpeg version test",
    run,
    slot: (work) => work(),
    checkInputs: async (plan) => plan.inputArgs,
    check: () => {},
    progress: () => {},
    signal: new AbortController().signal,
  };
  return { side, cache, rendered, job };
}

test("segments with the same key are rendered once and share the file (3 slots)", async () => {
  // Narration over a gradient background with one picture at the start: long stretches of the
  // same background; and a vignette used twice between two screen pieces.
  const narration = project(
    [asset("img", "image"), asset("voz", "audio", { duration: 90 })],
    [track("v1", "video"), track("a1", "audio")],
    [clip("i1", "img", "v1", 0, 5), clip("n1", "voz", "a1", 0, 90)],
    { background: { kind: "gradient", from: "#000000", to: "#203040", angle: 90 } },
  );
  let id = "vinheta";
  for (let k = 0; !isBorder(id, 0); k++) id = `vinheta${k}`;
  const borders: number[] = [];
  for (let j = 1; borders.length < 2; j++) if (isBorder("scr", j * 30)) borders.push(j);
  const vignette = project(
    [asset(id, "video", { duration: 6 }), asset("scr", "video")],
    [track("v1", "video")],
    [
      clip("i1", id, "v1", 0, 6),
      clip("s1", "scr", "v1", 6, 10, { in: borders[0] }),
      clip("i2", id, "v1", 16, 6),
      clip("s2", "scr", "v1", 22, 10, { in: borders[1] }),
    ],
  );
  for (const [p, paths] of [
    [narration, { img: "img.png", voz: "voz.wav" }],
    [vignette, { [id]: "vinheta.mp4", scr: "tela.mp4" }],
  ] as const) {
    const s = await segmentsSetup(p, paths);
    try {
      const keys = await segmentKeys(s.job);
      const unique = new Set(keys).size;
      assert.ok(unique < keys.length, `repeated keys: ${keys.length} windows, ${unique} keys`);
      const files = await renderSegments(s.job);
      assert.equal(s.rendered.length, unique, "each key rendered once");
      assert.equal(files.length, keys.length);
      keys.forEach((k, i) => {
        assert.equal(files[i], files[keys.indexOf(k)], `window ${i} takes the file of its key`);
      });
      // Every read is held on its own: releasing them all lets the cache clear everything.
      s.cache.release(files);
      await s.cache.clear();
      assert.equal(s.cache.size, 0);
      // A second export reads them all from the cache.
      s.rendered.length = 0;
      s.cache.release(await renderSegments(s.job));
      assert.equal(s.rendered.length, unique);
    } finally {
      await rm(s.side, { recursive: true });
    }
  }
});

// ---- 3. Separar áudio: the sound clip is sound only ----

test("the sound taken out of a video is not drawn and does not click again", () => {
  const cam = asset("cam", "video", { cursor: "C:/aulas/cam.cursor.json" });
  let p = project(
    [cam],
    [track("v1", "video"), track("a1", "audio")],
    [clip("c1", "cam", "v1", 0, 10, { transform: { x: 0.8, y: 0.8, scale: 0.3, opacity: 1 } })],
  );
  const d = detachAudio(p, "c1");
  assert.ok(d);
  p = { ...p, clips: d.clips, tracks: d.tracks };
  const sound = p.clips.find((c) => c.id === d.audioId);
  assert.equal(sound?.soundOnly, true);
  const plan = buildVideoWindowPlan(exportProject(p, r), spec, r, { from: 0, frames: 300 });
  assert.equal(plan.inputArgs.filter((a) => a === "-i").length, 1, "the video read once");
  assert.equal((plan.filter.match(/overlay=/g) ?? []).length, 1, "drawn once");
  const cursors = {
    cam: {
      sprite: "s.webm",
      size: 64,
      fps: 30,
      positions: new Int32Array(2),
      clicks: "C:/cache/clicks.flac",
    },
  };
  const audio = buildAudioPlan(p, { cursors });
  assert.equal(audio.inputArgs.filter((a) => a === "C:/cache/clicks.flac").length, 1);
  // A lesson saved before the mark: its separated sound is recognized when it opens.
  const old = structuredClone(p);
  for (const c of old.clips) delete c.soundOnly;
  const opened = normalizeProject(projectSchema.parse(old));
  assert.deepEqual(
    opened.clips.map((c) => [c.id, !!c.soundOnly]),
    [
      ["c1", false],
      [d.audioId, true],
    ],
  );
});

test("the clicks follow their track as in the preview: hidden, highlighted", () => {
  const scr = asset("scr", "video", { cursor: "C:/aulas/scr.cursor.json" });
  const cursors = {
    scr: {
      sprite: "s.webm",
      size: 64,
      fps: 30,
      positions: new Int32Array(2),
      clicks: "C:/cache/clicks.flac",
    },
  };
  const lesson = (extra: Partial<Track>): Project =>
    project(
      [scr, asset("voz", "audio")],
      [track("v1", "video", extra), track("a1", "audio")],
      [clip("s1", "scr", "v1", 0, 10), clip("n1", "voz", "a1", 0, 10)],
    );
  const hidden = buildAudioPlan(lesson({ hidden: true }), { cursors });
  assert.ok(!hidden.inputArgs.includes("C:/cache/clicks.flac"), "a hidden track does not click");
  // Its own track highlighted: the narration steps aside, the clicks do not (lane 0 is theirs,
  // lane 1 the screen's own sound, lane 2 the narration).
  const lit = buildAudioPlan(lesson({ spotlight: true }), { cursors });
  const laneLine = (name: string): string | undefined =>
    lit.filter.split(";\n").find((l) => l.endsWith(`[${name}]`));
  assert.ok(lit.inputArgs.includes("C:/cache/clicks.flac"));
  assert.match(laneLine("lane2") ?? "", /volume=/, "the narration steps aside");
  assert.doesNotMatch(laneLine("lane0") ?? "missing", /volume=|missing/, "the clicks do not");
});

// ---- 4. Magnetic track with a cut group ----

test("on a magnetic track each piece of a cut video keeps its own sound beside it", () => {
  let p = project(
    [asset("cam", "video"), asset("img", "image")],
    [track("v1", "video", { magnetic: true }), track("a1", "audio")],
    [clip("c1", "cam", "v1", 0, 20)],
  );
  const d = detachAudio(p, "c1");
  assert.ok(d);
  p = { ...p, clips: d.clips, tracks: d.tracks };
  p = settle(p, { ...p, clips: splitAt(p.clips, 10, new Set(p.clips.map((c) => c.id))) });
  const at = magneticSlot(p.clips, "v1", 10);
  const next = settle(p, { ...p, clips: [...p.clips, clip("pic", "img", "v1", at, 3)] });
  const video = next.clips.filter((c) => c.trackId === "v1" && c.assetId === "cam");
  const sound = next.clips.filter((c) => c.trackId !== "v1");
  assert.equal(video.length, 2);
  assert.equal(sound.length, 2);
  for (const v of video) {
    const beside = sound.find((s) => Math.abs(s.in - v.in) < 1e-6);
    assert.ok(beside, `sound of the piece at in=${v.in}`);
    assert.ok(Math.abs(beside.start - v.start) < 1e-6, `${beside.start} beside ${v.start}`);
  }
  assert.ok(
    video.some((v) => Math.abs(v.start) < 1e-6),
    "the first half stays at 0:00",
  );
});

// ---- 5. Zoom and keyframe expressions without nesting ----

/** Evaluates an expression of `T` in JS (the functions the expressions use). */
function evalFf(expr: string, T: number): number {
  const fns: Record<string, (...a: number[]) => number> = {
    iff: (c, a, b) => (c ? a : b),
    between: (x, a, b) => (x >= a && x <= b ? 1 : 0),
    lt: (a, b) => (a < b ? 1 : 0),
    lte: (a, b) => (a <= b ? 1 : 0),
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
    min: Math.min,
  };
  const js = expr.split("if(").join("iff(");
  return new Function(...Object.keys(fns), "T", `return ${js}`)(...Object.values(fns), T) as number;
}

/** The values an expression of `T` takes on each frame of FFmpeg (gray levels 16 + 200 v). */
async function ffmpegValues(expr: string, seconds: number, fps: number): Promise<number[]> {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-expr-"));
  try {
    const script = join(dir, "graph.txt");
    writeFileSync(
      script,
      `color=c=black:s=4x4:r=${fps}:d=${seconds},format=gray,geq=lum='16+200*(${expr})'[out]`,
    );
    const out = execFileSync(
      FFMPEG,
      [
        "-v",
        "error",
        await filterScriptOption(FFMPEG),
        script,
        "-map",
        "[out]",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
      ],
      { maxBuffer: 1 << 26 },
    );
    const values: number[] = [];
    for (let i = 0; i < out.length; i += 16) values.push((out[i] - 16) / 200);
    return values;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("300 focus points and 300 keyframes: FFmpeg takes the expressions, the same curve as the preview", {
  timeout: 120_000,
}, async () => {
  const fps = 10;
  const seconds = 32;
  const focus = Array.from({ length: 300 }, (_, i) => ({
    t: 0.5 + i * 0.1,
    x: ((i * 37) % 100) / 100,
    y: ((i * 53) % 100) / 100,
  }));
  const zooms: Zoom[] = [{ id: "z", start: 0, end: 31, scale: 1.8, focus }];
  const e = zoomExprs(zooms, "T");
  assert.ok(!/if\(lt/.test(e.cx), "no nested choice per point");
  const kfs: Keyframe[] = Array.from({ length: 300 }, (_, i) => ({
    t: i * 0.1,
    x: ((i * 41) % 100) / 100,
    y: 0.5,
    scale: 0.2 + ((i * 7) % 10) / 20,
  }));
  const k = keyframeExprs(kfs, "T");
  // In JS, the expressions give the preview's numbers.
  for (let t = 0; t < 31; t += 0.037) {
    const v = zoomAt(zooms, t);
    assert.ok(Math.abs(evalFf(e.cx, t) - v.cx) < 1e-3, `cx at ${t}`);
    assert.ok(Math.abs(evalFf(e.scale, t) - v.scale) < 1e-3, `scale at ${t}`);
    const kv = keyframeAt(kfs, t);
    assert.ok(Math.abs(evalFf(k.x, t) - kv.x) < 1e-4, `x at ${t}`);
    assert.ok(Math.abs(evalFf(k.scale, t) - kv.scale) < 1e-4, `keyframed scale at ${t}`);
  }
  // A stretch of it reads only the points around it, with the same values there.
  const part = zoomExprs(zooms, "T", [10, 12]);
  // 22 of the 300 points shape it there.
  assert.ok(part.cx.length < e.cx.length / 5, `${part.cx.length} of ${e.cx.length}`);
  const kpart = keyframeExprs(kfs, "T", [10, 12]);
  for (let t = 10; t <= 12; t += 0.013) {
    assert.ok(Math.abs(evalFf(part.cx, t) - zoomAt(zooms, t).cx) < 1e-3, `slice cx at ${t}`);
    assert.ok(Math.abs(evalFf(kpart.x, t) - keyframeAt(kfs, t).x) < 1e-4, `slice x at ${t}`);
  }
  // FFmpeg parses and evaluates the whole curves, frame by frame, as the preview has them.
  for (const [expr, at] of [
    [e.cx, (t: number) => zoomAt(zooms, t).cx],
    [k.x, (t: number) => keyframeAt(kfs, t).x],
  ] as const) {
    const values = await ffmpegValues(expr, seconds, fps);
    assert.equal(values.length, seconds * fps);
    for (const [i, v] of values.entries())
      assert.ok(Math.abs(v - at(i / fps)) <= 0.006, `frame ${i}: ${v} vs ${at(i / fps)}`);
  }
});

// ---- 6. An annotation coming in goes on after a cut ----

test("a cut annotation goes on with its words where it was, as the whole one", () => {
  const a = {
    kind: "lowerthird" as const,
    text: "Professora Helena Oliveira Matemática",
    subtitle: "Aula um",
    color: "#C8F031",
    reveal: "words" as const,
  };
  const whole = clip("n1", "img", "v2", 0, 8, { annotation: a });
  const pieces = splitAt([whole], 1.0, new Set(["n1"]));
  assert.equal(pieces.length, 2);
  const wholeTimes = revealTimes(a, whole, []);
  for (const t of [0.5, 1.05, 1.5, 3]) {
    const piece = pieces.find((x) => t >= x.start && t < x.start + x.duration);
    assert.ok(piece);
    const span = revealSpan(pieces, piece);
    assert.deepEqual([span.start, span.duration], [0, 8]);
    const times = revealTimes(a, span, []);
    assert.deepEqual(times, wholeTimes);
    assert.deepEqual(
      revealAt(a, times, span.duration, span.offset + (t - piece.start)),
      revealAt(a, wholeTimes, 8, t),
      `at ${t}`,
    );
  }
  // A drawn arrow too: the piece after the cut goes on drawing, it does not start over.
  const arrow = { kind: "arrow" as const, reveal: "draw" as const, color: "#C8F031" };
  const drawn = splitAt(
    [clip("ar", "img", "v2", 0, 4, { annotation: arrow })],
    0.4,
    new Set(["ar"]),
  );
  const second = drawn[1];
  const span = revealSpan(drawn, second);
  assert.deepEqual(revealAt(arrow, [], span.duration, span.offset), revealAt(arrow, [], 4, 0.4));
});

// ---- 7. Brightness, contrast and saturation: the export as the preview ----

test("the export's color correction gives the preview's colors (FFmpeg)", () => {
  const cases: [Parameters<typeof eqLut>[0], [number, number, number]][] = [
    [{ brightness: 0.2 }, [128, 128, 128]],
    [{ brightness: -0.15 }, [200, 200, 200]],
    [{ contrast: 1.4, brightness: 0.05 }, [100, 100, 100]],
    [{ saturation: 0.5 }, [200, 80, 40]],
    [{ contrast: 0.8, saturation: 1.5, brightness: -0.1 }, [60, 140, 200]],
  ];
  for (const [color, rgb] of cases) {
    const hex = rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    const out = execFileSync(
      FFMPEG,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x${hex}:s=16x16:d=0.1,format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,${eqLut(color)},scale=in_color_matrix=bt709:in_range=tv,format=rgb24`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-",
      ],
      { maxBuffer: 1 << 20 },
    );
    const got = [out[0], out[1], out[2]];
    const m = colorSvg(color).matrix;
    const want = [0, 1, 2].map((row) => {
      const v =
        m[row * 5] * (rgb[0] / 255) +
        m[row * 5 + 1] * (rgb[1] / 255) +
        m[row * 5 + 2] * (rgb[2] / 255) +
        m[row * 5 + 4];
      return Math.round(Math.min(1, Math.max(0, v)) * 255);
    });
    for (let i = 0; i < 3; i++)
      assert.ok(
        Math.abs(got[i] - want[i]) <= 3,
        `${JSON.stringify(color)} on ${rgb}: export ${got}, preview ${want}`,
      );
  }
});

// ---- P2 ----

test("replacing a media moves the markers on it with the ripple", () => {
  const p = project(
    [asset("voz", "audio", { duration: 60 })],
    [track("v1", "video"), track("a1", "audio")],
    [clip("c1", "voz", "a1", 0, 10), clip("c2", "voz", "a1", 10, 10, { in: 20 })],
    { markers: [{ id: "m1", t: 15, label: "Capítulo 2", chapter: true }] },
  );
  // The new file says the same with the first 10 s 2 s longer.
  const map = (s: number): number => (s < 10 ? s * 1.2 : s + 2);
  const result = replaceAsset(p, "voz", asset("voz2", "audio", { duration: 62 }), map);
  const after = settle(p, result.project);
  const c2 = after.clips.find((c) => c.id === "c2");
  assert.ok(c2);
  assert.ok(Math.abs(c2.start - 12) < 1e-6, `c2 at ${c2.start}`);
  // 5 s into c2 before, 5 s into it now.
  assert.ok(Math.abs((after.markers?.[0].t ?? 0) - 17) < 1e-6, `marker at ${after.markers?.[0].t}`);
});

test("the thumbnail of a range export is the lesson's second chosen, counted from the range", () => {
  assert.equal(thumbnailSecond({ thumbnailAt: 75 }, 30, 60), 15);
  assert.equal(thumbnailSecond({ thumbnailAt: 12 }, 30, 60), 0);
  assert.equal(thumbnailSecond({}, 30, 60), 9);
});

test("where a cut of the source stops is in the segment's key", () => {
  const p = project(
    [asset("scr", "video")],
    [track("v1", "video")],
    [clip("s1", "scr", "v1", 0, 10)],
  );
  const d = exportProject(p, r);
  const win = { from: 0, frames: 300 };
  const before = JSON.stringify(windowSignature(d, win, spec, r, []).key);
  const stopped = { ...d, clips: d.clips.map((c) => ({ ...c, sourceStop: 5 })) };
  assert.notEqual(JSON.stringify(windowSignature(stopped, win, spec, r, []).key), before);
});

// ---- Plausible ones ----

test("the lesson keeps a limited number of drawing points and warns before its file is full", () => {
  const stroke = (n: number) => ({
    t: 0,
    color: "#C8F031",
    width: 4,
    points: Array.from({ length: n }, (_, i): [number, number, number] => [0.5, 0.5, i / 100]),
  });
  const drawn = (n: number): Asset =>
    asset(`d${n}`, "video", { drawing: { strokes: [stroke(n)], clears: [] } });
  const full = { assets: [drawn(PROJECT_DRAWING_POINTS - 1000)] };
  assert.equal(drawingPoints(full), PROJECT_DRAWING_POINTS - 1000);
  const fresh = { strokes: [stroke(3000), stroke(1000)], clears: [] };
  const fit = fitDrawing(full, fresh);
  assert.equal(fit.thinned, true);
  const kept = fit.drawing.strokes.reduce((n, s) => n + s.points.length, 0);
  assert.ok(kept <= 1000, `${kept} points kept`);
  assert.equal(fitDrawing({ assets: [] }, fresh).thinned, false);
  // The warning comes past most of the limit, measured as it is saved (compact UTF-8).
  assert.equal(nearSaveLimit("x".repeat(1000)), false);
  assert.equal(nearSaveLimit("x".repeat(Math.ceil(NEAR_LIMIT * PROJECT_LIMIT_BYTES))), true);
  assert.equal(nearSaveLimit("é".repeat(Math.ceil((NEAR_LIMIT * PROJECT_LIMIT_BYTES) / 2))), true);
});

test("undoing after the file was recorded again keeps its frame rate and transparency", () => {
  const before = project([asset("scr", "video", { fps: 30 })], [track("v1", "video")], []);
  const now = {
    ...before,
    assets: [{ ...before.assets[0], fps: 60, vfr: true, alpha: false }],
  };
  const undone = restoreSnapshot(before, now, 1);
  assert.equal(undone.assets[0].fps, 60);
  assert.equal(undone.assets[0].vfr, true);
  assert.equal(undone.assets[0].alpha, false);
});

// ---- P0: lesson files only ----

test("opening and saving a lesson take only a .ediaula the person chose", async () => {
  const allowed = async (path: string): Promise<string> => path;
  const refused = async (): Promise<string> => {
    throw new Error("Selecione ou abra este arquivo antes de utilizá-lo.");
  };
  assert.equal(await lessonFile("C:\\Aulas\\aula.ediaula", allowed), "C:\\Aulas\\aula.ediaula");
  assert.equal(await lessonFile("C:\\Aulas\\AULA.EDIAULA", allowed), "C:\\Aulas\\AULA.EDIAULA");
  for (const bad of [
    "C:\\Aulas\\aula.mp4",
    "C:\\Aulas\\aula.json",
    "C:\\Windows\\win.ini",
    "aula.ediaula",
    "C:\\Aulas\\aula.ediaula\0.txt",
    "",
    42,
    null,
  ])
    await assert.rejects(() => lessonFile(bad, allowed), String(bad));
  // A path the desktop SDK did not allow, and a .ediaula that is a link to another file.
  await assert.rejects(() => lessonFile("C:\\Outro\\aula.ediaula", refused), /Selecione/);
  await assert.rejects(() =>
    lessonFile("C:\\Aulas\\link.ediaula", async () => "C:\\x\\segredo.txt"),
  );
});
