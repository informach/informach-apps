import assert from "node:assert/strict";
import { test } from "node:test";
// The desktop SDK's own IPC structure check, the one every editor call goes through.
import { validateIpcValues } from "../../../packages/edi-desktop/src/files.ts";
import { applyCuts, closeCommonGaps, rippleDeleteRange } from "../src/shared/cleanup.ts";
import { normalizeProject } from "../src/shared/project-normalize.ts";
import { exportSpecSchema, projectSchema } from "../src/shared/project-schema.ts";
import {
  clipEnd,
  extendFrame,
  overwriteRange,
  placeClips,
  splitAt,
  trimClip,
} from "../src/shared/timeline.ts";
import type { Asset, Clip, ExportSpec, Project, Track } from "../src/shared/types.ts";
import type { Zoom } from "../src/shared/zoom.ts";

const LESSON = 25 * 60;

/** Deterministic pseudo-random numbers, so a failure always reproduces. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.${kind === "audio" ? "wav" : kind === "image" ? "png" : "mp4"}`,
  kind,
  duration: kind === "image" ? 0 : LESSON,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1000,
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

/** 300 automatic zooms over the recording, as auto_zoom makes them. */
const ZOOMS: Zoom[] = Array.from({ length: 300 }, (_, i) => ({
  id: `z${i}`,
  start: i * 5 + 0.5,
  end: i * 5 + 3.5,
  scale: 1.8,
  auto: true,
  focus: [0.7, 1.4, 2.1, 2.8].map((d, k) => ({ t: i * 5 + d, x: 0.2 + k * 0.1, y: 0.3 })),
}));

function lesson(): Project {
  const balloons: Clip[] = Array.from({ length: 60 }, (_, i) => ({
    id: `b${i}`,
    assetId: "balloon",
    trackId: "n",
    start: 10 + i * 24,
    in: 0,
    duration: 3,
    volume: 0,
    fadeIn: 0.3,
    enter: "pop",
    annotation: { kind: "balloon", text: `Fala ${i}`, color: "#3D6BFF" },
  }));
  const layers: Clip[] = Array.from({ length: 10 }, (_, i) => ({
    id: `l${i}`,
    assetId: "fx",
    trackId: "z",
    start: 30 + i * 140,
    in: 0,
    duration: 6,
    volume: 0,
    zoomLayer: { scale: 1.6, x: 0.4, y: 0.5, zoomIn: true, zoomOut: true, easeIn: 0.6 },
  }));
  return {
    version: 1,
    id: "longa",
    name: "Aula longa",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("screen", "video", { cursor: "C:/aulas/cursor.json", zooms: ZOOMS }),
      asset("avatar", "video", {
        key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
      }),
      asset("balloon", "image", { generated: "annotation" }),
      asset("fx", "image", { generated: "effect" }),
      asset("music", "audio"),
    ],
    tracks: [
      track("n", "video"),
      track("z", "video"),
      track("a", "video"),
      track("v", "video"),
      track("m", "audio", { music: true }),
    ],
    clips: [
      ...balloons,
      ...layers,
      {
        id: "avatar-clip",
        assetId: "avatar",
        trackId: "a",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 1,
        fadeIn: 0.3,
        fadeOut: 0.3,
        transition: { kind: "dissolve", duration: 0.6 },
        transform: { x: 0.82, y: 0.6, scale: 0.4, opacity: 1 },
        keyframes: Array.from({ length: 40 }, (_, i) => ({
          t: i * 37,
          x: 0.7 + (i % 3) * 0.05,
          y: 0.6,
          scale: 0.4,
        })),
      },
      {
        id: "screen-clip",
        assetId: "screen",
        trackId: "v",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 1,
      },
      {
        id: "music-clip",
        assetId: "music",
        trackId: "m",
        start: 0,
        in: 0,
        duration: LESSON,
        volume: 0.35,
      },
    ],
  };
}

/** What every save and every export sends through IPC must stay valid and within the limits. */
function valid(project: Project, step: string): void {
  const parsed = projectSchema.safeParse(project);
  assert.ok(parsed.success, `${step}: ${JSON.stringify(parsed.error?.issues.slice(0, 3))}`);
  // What project:save and export:start send (the project as JSON text).
  validateIpcValues(["C:/aulas/longa.ediaula", JSON.stringify(project)]);
  validateIpcValues(["job", JSON.stringify(project), { outPath: "C:/aulas/longa.mp4" }]);
  // Even as a structure it stays far from the limit: the pieces do not pile up data.
  assert.doesNotThrow(() => validateIpcValues(["job", project]), `${step}: IPC structure`);
  // The zooms stay once, on the media, however many pieces the recording is cut into.
  assert.ok(
    project.clips.every((c) => !("zooms" in c)),
    `${step}: zooms on a clip`,
  );
  assert.equal(project.assets.find((a) => a.id === "screen")?.zooms?.length, ZOOMS.length);
}

const targets = new Set(["n", "z", "a", "v"]);

test("a 25-minute lesson stays savable and exportable through every timeline operation", () => {
  const rnd = random(25);
  let p = lesson();
  valid(p, "start");

  for (let i = 0; i < 40; i++)
    p = { ...p, clips: splitAt(p.clips, 20 + rnd() * (LESSON - 40), new Set()) };
  valid(p, "split");

  const cuts: [number, number][] = Array.from({ length: 200 }, (_, i) => {
    const start = 10 + i * 7.2 + rnd() * 3;
    return [start, start + 0.5 + rnd() * 1.5];
  });
  p = { ...p, clips: applyCuts(p.clips, cuts, targets) };
  valid(p, "text cuts");

  for (let i = 0; i < 20; i++) {
    const start = rnd() * 1100;
    p = { ...p, clips: overwriteRange(p.clips, "v", start, start + 1 + rnd() * 2) };
  }
  valid(p, "overwrite");

  const screen = p.assets.find((a) => a.id === "screen");
  for (let i = 0; i < 30; i++) {
    const pieces = p.clips.filter((c) => c.trackId === "v");
    const c = pieces[Math.floor(rnd() * pieces.length)];
    const edge = rnd() < 0.5 ? "start" : "end";
    const time = edge === "start" ? c.start - 4 : clipEnd(c) + 4;
    const trimmed = trimClip(c, edge, time, screen);
    p = { ...p, clips: placeClips(p.clips, [trimmed]) };
  }
  valid(p, "trim");

  for (let i = 0; i < 10; i++) {
    const avatars = p.clips.filter((c) => c.trackId === "a" && c.duration > 2);
    const c = avatars[Math.floor(rnd() * avatars.length)];
    const still = `still${i}`;
    p = {
      ...p,
      assets: [...p.assets, asset(still, "image", { generated: "effect" })],
      clips: extendFrame(p.clips, c.id, c.start + c.duration * rnd(), 1 + rnd() * 2, still).clips,
    };
  }
  assert.ok(
    p.clips.some((c) => c.keyframes?.some((k) => k.t < 0)),
    "pieces of the moving avatar keep the keyframe before them",
  );
  valid(p, "extend frame");

  for (let i = 0; i < 10; i++) {
    const start = 30 + rnd() * 1000;
    p = { ...p, clips: rippleDeleteRange(p.clips, start, start + 2, targets) };
  }
  valid(p, "ripple delete");

  p = { ...p, clips: closeCommonGaps(p, targets) };
  valid(p, "close gaps");

  // Older projects had every piece of the recording carrying all 300 zooms: that project could
  // no longer be sent, and opening it moves the zooms back to the media (project-normalize.ts).
  const legacy = {
    ...p,
    assets: p.assets.map(({ zooms: _zooms, ...a }) => a),
    clips: p.clips.map((c) => (c.assetId === "screen" ? { ...c, zooms: ZOOMS } : c)),
  };
  assert.throws(() => validateIpcValues(["job", legacy]), /exceeds limit/);
  valid(normalizeProject(projectSchema.parse(legacy)), "legacy project opened again");
});

test("the cursor of a 27-minute recording reaches the export as one IPC value", () => {
  const frames = 27 * 60 * 30;
  const positions = new Int32Array(frames * 2).map((_, i) => i % 1900);
  const cursor = { sprite: "C:/cache/cursor.webm", size: 96, fps: 30, positions };
  const spec: ExportSpec = {
    outPath: "C:/aulas/longa.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8000,
    normalizeLoudness: true,
    encoder: "x264",
    cursors: { screen: cursor },
  };
  const project = lesson();
  assert.doesNotThrow(() => validateIpcValues(["job", JSON.stringify(project), spec]));
  const parsed = exportSpecSchema.parse(spec);
  assert.ok(parsed.cursors?.screen.positions instanceof Int32Array);
  assert.equal(structuredClone(spec).cursors?.screen.positions.length, frames * 2);
  // As a plain list next to the project structure (the old call) it is over the limit.
  assert.throws(
    () =>
      validateIpcValues([
        "job",
        project,
        {
          ...spec,
          cursors: { screen: { ...cursor, positions: Array.from(positions) } },
        },
      ]),
    /exceeds limit/,
  );
  for (const bad of [new Int32Array(3), new Int32Array(4_000_002), Array.from(positions)])
    assert.equal(
      exportSpecSchema.safeParse({
        ...spec,
        cursors: { screen: { ...cursor, positions: bad } },
      }).success,
      false,
    );
});
