import { projectDuration } from "../timeline.ts";
import type { DerivedProject } from "../transitions.ts";
import type { ExportSpec } from "../types.ts";
import { frameAt, frameCount, frameRate, type Rate, rateValue } from "./frames.ts";
import type { VideoWindow } from "./videoPlan.ts";

/**
 * The lesson split into segments rendered on their own (and in parallel), each reused from the
 * cache while nothing it shows changes. Borders sit on cuts of the main track, chosen by the cut
 * itself (the media and the frame of it where the cut is), not by its place on the timeline: after
 * an edit, everything before it keeps its borders and the borders after it come back to the same
 * cuts, so those segments are the same and are not rendered again.
 */

export const MIN_SEGMENT = 4;
export const MAX_SEGMENT = 20;

/** FNV-1a: a small, stable hash of a text. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A cut becomes a border for one in four cuts, picked by the cut itself. */
export const isBorder = (assetId: string, sourceFrame: number): boolean =>
  hash32(`${assetId}:${sourceFrame}`) % 4 === 0;

/** The video track with the most picture on it (the screen, usually). */
export function mainTrack(project: DerivedProject): string | undefined {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const shown = new Map<string, number>();
  for (const t of project.tracks) if (t.kind === "video" && !t.hidden) shown.set(t.id, 0);
  for (const c of project.clips) {
    const asset = assets.get(c.assetId);
    if (
      c.zoomLayer ||
      c.regionFx ||
      c.soundOnly ||
      !asset ||
      asset.kind === "audio" ||
      !shown.has(c.trackId)
    )
      continue;
    shown.set(c.trackId, (shown.get(c.trackId) ?? 0) + c.duration);
  }
  let best: { id: string; seconds: number } | undefined;
  for (const [id, seconds] of shown) if (!best || seconds > best.seconds) best = { id, seconds };
  return best?.id;
}

/** Frames of the lesson on the export grid. */
export const lessonFrames = (project: Pick<DerivedProject, "clips">, r: Rate): number =>
  frameCount(projectDuration(project), r);

/**
 * Segments of at least MIN_SEGMENT and at most MAX_SEGMENT seconds, in whole frames. Where the
 * main track goes on without a border, the stretch is split every MAX_SEGMENT seconds from the
 * previous border. `range` (seconds) keeps only the part of them inside it, so exporting a stretch
 * of the lesson reuses the segments of the whole one.
 */
export function planSegments(
  project: DerivedProject,
  spec: Pick<ExportSpec, "fps">,
  range?: { from: number; to: number },
): VideoWindow[] {
  const r = frameRate(spec.fps);
  const fps = rateValue(r);
  const total = lessonFrames(project, r);
  const min = Math.round(MIN_SEGMENT * fps);
  const max = Math.round(MAX_SEGMENT * fps);
  const track = mainTrack(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const candidates = project.clips
    .filter((c) => c.trackId === track && !c.zoomLayer && !c.regionFx)
    .map((c) => {
      const asset = assets.get(c.assetId);
      const rate = asset?.fps && asset.fps > 0 ? asset.fps : fps;
      return { frame: frameAt(c.start, r), border: isBorder(c.assetId, Math.round(c.in * rate)) };
    })
    .filter((c) => c.border && c.frame > 0 && c.frame < total)
    .map((c) => c.frame)
    .sort((a, b) => a - b);
  const borders: number[] = [0];
  let last = 0;
  for (const frame of candidates) {
    while (frame - last > max) {
      last += max;
      borders.push(last);
    }
    if (frame - last >= min) {
      borders.push(frame);
      last = frame;
    }
  }
  while (total - last > max) {
    last += max;
    borders.push(last);
  }
  borders.push(total);
  const from = range ? Math.max(0, frameAt(range.from, r)) : 0;
  const to = range ? Math.min(total, frameAt(range.to, r)) : total;
  const windows: VideoWindow[] = [];
  for (let i = 0; i + 1 < borders.length; i++) {
    const a = Math.max(from, borders[i]);
    const b = Math.min(to, borders[i + 1]);
    if (b > a) windows.push({ from: a, frames: b - a });
  }
  return windows;
}
