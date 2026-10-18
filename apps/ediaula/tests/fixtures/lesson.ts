import { applyCuts } from "../../src/shared/cleanup.ts";
import { DEFAULT_SHADOW } from "../../src/shared/compose.ts";
import type { Asset, Clip, CursorSprite, Project } from "../../src/shared/types.ts";

/**
 * A lesson as the app makes them: one take (screen, camera and microphone) cut in many places by
 * the cleanup, all three cut together, with music underneath that is not cut. The screen has
 * rounded corners and a shadow, the camera is a circle with a lime border; a few cuts have
 * dissolves, the recording has zooms and the pointer moves.
 */
export interface LessonOptions {
  /** Minutes of the edited lesson. */
  minutes: number;
  cuts: number;
  screen: string;
  camera: string;
  mic: string;
  music?: string;
  fps?: number;
  /** Every n-th cut gets a dissolve (0: none). */
  dissolveEvery?: number;
  /** Seconds of each automatic zoom, one every `zoomEvery` seconds of the recording (0: none). */
  zoomEvery?: number;
  /** Cursor data for the screen recording. */
  cursor?: boolean;
}

/** A small deterministic random sequence (the same lesson every time). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function syntheticLesson(o: LessonOptions): {
  project: Project;
  cursors?: Record<string, CursorSprite>;
  recording: number;
} {
  const fps = o.fps ?? 30;
  const rand = random(7);
  const length = o.minutes * 60;
  // Pauses the cleanup removed, spread over the take.
  const removed: number[] = Array.from({ length: o.cuts }, () => 0.4 + rand() * 1.2);
  const recording = length + removed.reduce((a, b) => a + b, 0);
  const ranges: [number, number][] = [];
  const step = recording / (o.cuts + 1);
  for (let i = 0; i < o.cuts; i++) {
    const at = step * (i + 1) + (rand() - 0.5) * step * 0.4;
    ranges.push([at, at + removed[i]]);
  }
  const frame = (t: number): number => Math.round(t * fps) / fps;
  const take = (id: string, path: string, kind: Asset["kind"], w: number, h: number): Asset => ({
    id,
    name: id,
    path,
    kind,
    duration: kind === "audio" ? recording + 1 : recording + 1,
    width: w,
    height: h,
    fps: kind === "audio" ? 0 : fps,
    hasVideo: kind !== "audio",
    hasAudio: kind === "audio",
    size: 1,
    proxyStatus: "none",
    recording: {
      id: "take",
      role: id === "screen" ? "screen" : id === "camera" ? "camera" : "mic",
    },
  });
  const screen = take("screen", o.screen, "video", 1920, 1080);
  const camera = take("camera", o.camera, "video", 640, 360);
  const mic = take("mic", o.mic, "audio", 0, 0);
  const zoomEvery = o.zoomEvery;
  if (zoomEvery)
    screen.zooms = Array.from({ length: Math.floor(recording / zoomEvery) }, (_, i) => {
      const start = i * zoomEvery + 3;
      return {
        id: `z${i}`,
        start,
        end: start + 4,
        scale: 1.6,
        focus: [{ t: start, x: 0.3 + 0.4 * rand(), y: 0.3 + 0.4 * rand() }],
      };
    });
  if (o.cursor) screen.cursor = "C:/cache/cursor.json";
  const assets: Asset[] = [screen, camera, mic];
  const tracks: Project["tracks"] = [
    { id: "v2", kind: "video", name: "Câmera", muted: false, hidden: false, locked: false },
    { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "a1", kind: "audio", name: "Microfone", muted: false, hidden: false, locked: false },
  ];
  let clips: Clip[] = [
    {
      id: "screen",
      assetId: "screen",
      trackId: "v1",
      start: 0,
      in: 0,
      duration: frame(recording),
      volume: 0,
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 0.92,
        opacity: 1,
        mask: "rounded",
        shadow: DEFAULT_SHADOW,
      },
    },
    {
      id: "camera",
      assetId: "camera",
      trackId: "v2",
      start: 0,
      in: 0,
      duration: frame(recording),
      volume: 0,
      transform: {
        x: 0.88,
        y: 0.8,
        scale: 0.35,
        opacity: 1,
        crop: { left: 0.21875, right: 0.21875, top: 0, bottom: 0 },
        mask: "circle",
        border: "#C8F031",
        shadow: DEFAULT_SHADOW,
      },
    },
    { id: "mic", assetId: "mic", trackId: "a1", start: 0, in: 0, duration: recording, volume: 1 },
  ];
  clips = applyCuts(clips, ranges, new Set(["v1", "v2", "a1"]));
  if (o.music) {
    assets.push({
      id: "music",
      name: "music",
      path: o.music,
      kind: "audio",
      duration: length + 5,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    });
    tracks.push({
      id: "a2",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
    });
    clips.push({
      id: "music",
      assetId: "music",
      trackId: "a2",
      start: 0,
      in: 0,
      duration: length,
      volume: 0.3,
    });
  }
  const dissolveEvery = o.dissolveEvery;
  if (dissolveEvery) {
    const pieces = clips.filter((c) => c.trackId === "v1").sort((a, b) => a.start - b.start);
    pieces.forEach((c, i) => {
      if (i > 0 && i % dissolveEvery === 0) c.transition = { kind: "dissolve", duration: 0.5 };
    });
  }
  const project: Project = {
    version: 1,
    id: "lesson",
    name: "Aula sintética",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps },
    assets,
    tracks,
    clips,
  };
  if (!o.cursor) return { project, recording };
  const frames = Math.ceil((recording + 1) * fps);
  const positions = new Int32Array(frames * 2);
  for (let f = 0; f < frames; f++) {
    positions[f * 2] = Math.round(960 + 700 * Math.sin(f / 97));
    positions[f * 2 + 1] = Math.round(540 + 400 * Math.cos(f / 131));
  }
  return {
    project,
    recording,
    cursors: { screen: { sprite: "C:/cache/cursor-sprite.webm", size: 64, fps, positions } },
  };
}
