import assert from "node:assert/strict";
import { test } from "node:test";
import { segmentOptions } from "../src/main/export/renderSegments.ts";
import { applyCuts } from "../src/shared/cleanup.ts";
import { canonical, windowSignature } from "../src/shared/export/fingerprint.ts";
import { exportProject, frameRate } from "../src/shared/export/frames.ts";
import type { FxProvider } from "../src/shared/export/fx.ts";
import {
  isBorder,
  lessonFrames,
  MAX_SEGMENT,
  MIN_SEGMENT,
  mainTrack,
  planSegments,
} from "../src/shared/export/segments.ts";
import { buildVideoWindowPlan, clipFrames } from "../src/shared/export/videoPlan.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";
import { syntheticLesson } from "./fixtures/lesson.ts";

const r = frameRate(30);
const spec = (cursors?: ExportSpec["cursors"]): ExportSpec => ({
  outPath: "C:/Users/professora/Videos/Aula sintética.mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: 12000,
  quality: "high",
  normalizeLoudness: true,
  encoder: "nvenc",
  cursors,
});
/** Effect pictures as the app keeps them (userData/cache/fx/<hash>.png). */
const fx: FxProvider = (a) =>
  `C:/Users/professora/AppData/Roaming/ediaula/cache/fx/${canonical(a).length.toString(16).padStart(32, "0")}.png`;

const lesson = () =>
  syntheticLesson({
    minutes: 25,
    cuts: 200,
    screen: "C:/Users/professora/Documents/EdiAula/Gravações/2026-10-18 aula/tela.mp4",
    camera: "C:/Users/professora/Documents/EdiAula/Gravações/2026-10-18 aula/camera.mp4",
    mic: "C:/Users/professora/Documents/EdiAula/Gravações/2026-10-18 aula/microfone.wav",
    music: "C:/Users/professora/Music/trilha.mp3",
    dissolveEvery: 25,
    zoomEvery: 40,
    cursor: true,
  });

const signatures = (project: Project, s: ExportSpec): string[] => {
  const derived = exportProject(project, r);
  const options = segmentOptions({ encoder: s.encoder, spec: s, rate: r });
  return planSegments(derived, s).map((w) =>
    canonical(windowSignature(derived, w, s, r, options).key),
  );
};

test("segments: whole frames from cut to cut of the main track, 4 to 20 seconds each", () => {
  const { project, cursors } = lesson();
  const derived = exportProject(project, r);
  const windows = planSegments(derived, spec(cursors));
  const total = lessonFrames(derived, r);
  assert.equal(mainTrack(derived), "v1");
  assert.equal(windows[0].from, 0);
  assert.equal(
    windows.reduce((n, w) => n + w.frames, 0),
    total,
    "they cover the lesson exactly",
  );
  for (let i = 1; i < windows.length; i++)
    assert.equal(windows[i].from, windows[i - 1].from + windows[i - 1].frames);
  for (const w of windows.slice(0, -1)) {
    assert.ok(w.frames >= MIN_SEGMENT * 30, `at least 4 s: ${w.frames}`);
    assert.ok(w.frames <= MAX_SEGMENT * 30, `at most 20 s: ${w.frames}`);
  }
  // Borders that are not every 20 s from the previous one sit on cuts the hash picked.
  const cuts = new Map(
    derived.clips
      .filter((c) => c.trackId === "v1")
      .map((c) => [Math.round(c.start * 30), isBorder(c.assetId, Math.round(c.in * 30))]),
  );
  for (let i = 1; i < windows.length; i++)
    if (windows[i - 1].frames !== MAX_SEGMENT * 30)
      assert.equal(cuts.get(windows[i].from), true, `border at frame ${windows[i].from}`);
  // A stretch of the lesson keeps the borders of the whole one.
  const part = planSegments(derived, spec(cursors), { from: 300, to: 420 });
  assert.equal(part[0].from, 300 * 30);
  const last = part[part.length - 1];
  assert.equal(last.from + last.frames, 420 * 30);
  for (const w of part.slice(1)) assert.ok(windows.some((x) => x.from === w.from));
});

test("each window reads only the media of the clips it shows", () => {
  const { project, cursors } = lesson();
  const derived = exportProject(project, r);
  const s = spec(cursors);
  const assets = new Map(derived.assets.map((a) => [a.id, a]));
  for (const w of planSegments(derived, s).slice(0, 12)) {
    const plan = buildVideoWindowPlan(derived, s, r, w, fx);
    const pictures = derived.clips.flatMap((c) => {
      const a = assets.get(c.assetId);
      return a && a.kind !== "audio" && clipFrames(c, r, w) ? [{ clip: c, path: a.path }] : [];
    });
    const shown = pictures.map((p) => p.clip);
    const expected = new Set(pictures.map((p) => p.path));
    assert.deepEqual(new Set(plan.media), expected);
    // One input per run of pieces of the same recording, not one per piece.
    const reads = plan.inputArgs.filter((a) => a === project.assets[0].path).length;
    assert.ok(reads <= shown.filter((c) => c.trackId === "v1").length);
    assert.ok(reads >= 1);
  }
});

test("25 minutes and 200 cuts: every segment's command line stays under 8,000 characters", () => {
  const { project, cursors } = lesson();
  const derived = exportProject(project, r);
  const s = spec(cursors);
  const options = segmentOptions({ encoder: "nvenc", spec: s, rate: r });
  const work = "C:/Users/professora/AppData/Roaming/ediaula/work/export-a1B2c3";
  const cache = "C:/Users/professora/AppData/Roaming/ediaula/cache/segments";
  const quote = (a: string): string => (/[\s"]/.test(a) ? `"${a}"` : a);
  let longest = 0;
  const windows = planSegments(derived, s);
  for (const [i, w] of windows.entries()) {
    const plan = buildVideoWindowPlan(derived, s, r, w, fx);
    const args = [
      "C:/Program Files/EdiAula/resources/native-media/bin/ffmpeg.exe",
      "-progress",
      "pipe:2",
      "-nostats",
      "-y",
      "-v",
      "error",
      "-nostdin",
      ...plan.inputArgs,
      "-/filter_complex",
      `${work}/segment-${i}.txt`,
      "-map",
      "[vout]",
      ...options,
      "-frames:v",
      String(w.frames),
      "-an",
      `${cache}/${"f".repeat(64)}.part.mp4`,
    ];
    longest = Math.max(longest, args.map(quote).join(" ").length);
  }
  assert.ok(windows.length > 60, `${windows.length} segments`);
  assert.ok(longest < 8000, `longest command line: ${longest}`);
});

test("a segment's signature does not change when its content only moves on the timeline", () => {
  const { project, cursors } = lesson();
  const s = spec(cursors);
  const moved: Project = {
    ...project,
    clips: project.clips.map((c) => ({ ...c, start: c.start + 2 })),
  };
  const derived = exportProject(project, r);
  const shifted = exportProject(moved, r);
  const options = segmentOptions({ encoder: "nvenc", spec: s, rate: r });
  for (const w of planSegments(derived, s).slice(0, 20)) {
    const a = windowSignature(derived, w, s, r, options);
    const b = windowSignature(shifted, { from: w.from + 60, frames: w.frames }, s, r, options);
    assert.equal(canonical(a.key), canonical(b.key));
    assert.deepEqual(a.files, b.files);
  }
  // Anything that changes the picture changes it.
  const w = planSegments(derived, s)[3];
  const before = canonical(windowSignature(derived, w, s, r, options).key);
  const edited = structuredClone(project);
  const piece = exportProject(edited, r).clips.find(
    (c) => clipFrames(c, r, w) && c.trackId === "v2",
  );
  const target = edited.clips.find((c) => c.id === piece?.id);
  assert.ok(target?.transform);
  target.transform = { ...target.transform, border: "#3D6BFF" };
  assert.notEqual(
    canonical(windowSignature(exportProject(edited, r), w, s, r, options).key),
    before,
  );
  assert.notEqual(
    canonical(
      windowSignature(
        derived,
        w,
        { ...s, quality: "max" },
        r,
        segmentOptions({ encoder: "nvenc", spec: { ...s, quality: "max" }, rate: r }),
      ).key,
    ),
    before,
  );
});

test("cutting 2 seconds at minute 10 keeps at least 90% of the signatures after it", () => {
  const { project, cursors } = lesson();
  const s = spec(cursors);
  const before = new Set(signatures(project, s));
  const cut: Project = {
    ...project,
    clips: applyCuts(project.clips, [[600, 602]], new Set(["v1", "v2", "a1"])),
  };
  const derived = exportProject(cut, r);
  const options = segmentOptions({ encoder: "nvenc", spec: s, rate: r });
  const after = planSegments(derived, s).filter((w) => w.from >= 600 * 30);
  const same = after.filter((w) =>
    before.has(canonical(windowSignature(derived, w, s, r, options).key)),
  ).length;
  assert.ok(after.length > 30);
  assert.ok(same / after.length >= 0.9, `${same} of ${after.length} reused`);
  // And everything before the cut is untouched.
  const early = planSegments(derived, s).filter((w) => w.from + w.frames <= 590 * 30);
  for (const w of early)
    assert.ok(before.has(canonical(windowSignature(derived, w, s, r, options).key)));
});
