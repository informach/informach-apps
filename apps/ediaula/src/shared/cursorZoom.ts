import { sourceAt } from "./clipTime.ts";
import type { CursorFx, CursorRange } from "./cursor.ts";
import type { Asset, Project } from "./types.ts";
import { zoomAt } from "./zoom.ts";
import { zoomsOver } from "./zoomLayer.ts";

/**
 * The pointer's size under the zooms of the lesson. A zoom magnifies the recording and the
 * pointer drawn on it together, so a pointer big enough on the whole screen turns huge inside a
 * zoom, and one that reads well inside a zoom is too small on the whole screen (Helena,
 * 28/11/2026: "sem zoom, o cursor está ficando muito pequeno"). These stretches give the pointer
 * `inZoom` where the zoom is at `ZOOM_FULL` or more, the recording's size where there is no zoom,
 * and a size in between while the zoom opens and closes, so its size on screen grows smoothly
 * with the zoom and never jumps.
 *
 * The stretches are in source seconds, like every cursor stretch: they follow the recording's
 * clips as they are on the timeline when this runs (moving a zoom asks for it again).
 */

/** Zoom at which the pointer takes the size asked for inside zooms. */
export const ZOOM_FULL = 1.6;
/** Id prefix of the stretches made here (replaced each time). */
export const ZOOM_RANGE_PREFIX = "cz";
/** Sizes are kept on this step, so a still zoom gives one stretch. */
const STEP = 0.05;

/** The pointer's size (before the zoom) at a zoom of `k`. */
export function cursorSizeAtZoom(base: number, inZoom: number, k: number): number {
  const w = Math.max(0, Math.min(1, (k - 1) / (ZOOM_FULL - 1)));
  return Math.round((base + (inZoom - base) * w) / STEP) * STEP;
}

/** How much the recording's clip on track `trackIndex` is magnified at timeline time `t`. */
function zoomOn(
  p: Pick<Project, "clips" | "tracks">,
  asset: Pick<Asset, "zooms">,
  clip: Project["clips"][number],
  trackIndex: number,
  t: number,
): number {
  const layers = zoomsOver(p, trackIndex, t).reduce((k, v) => k * v.scale, 1);
  return layers * zoomAt(asset.zooms, sourceAt(clip, t)).scale;
}

/**
 * The recording's cursor stretches with the zoom ones made again for `inZoom` (undefined takes
 * them out). The other stretches stay, before the new ones, so these win where they overlap.
 */
export function zoomCursorRanges(
  p: Pick<Project, "clips" | "tracks" | "settings">,
  asset: Pick<Asset, "id" | "zooms">,
  fx: CursorFx,
  inZoom: number | undefined,
): CursorRange[] {
  const kept = (fx.ranges ?? []).filter((r) => !r.id.startsWith(ZOOM_RANGE_PREFIX));
  if (inZoom === undefined) return kept;
  const dt = 1 / (p.settings.fps || 30);
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  const made: CursorRange[] = [];
  for (const clip of p.clips) {
    if (clip.assetId !== asset.id) continue;
    const trackIndex = order.get(clip.trackId) ?? -1;
    if (trackIndex < 0 || p.tracks[trackIndex].hidden) continue;
    const end = clip.start + clip.duration;
    let run: { from: number; size: number } | null = null;
    const close = (to: number): void => {
      if (run && Math.abs(run.size - fx.size) > 1e-6)
        made.push({
          id: `${ZOOM_RANGE_PREFIX}${made.length}`,
          start: sourceAt(clip, run.from),
          end: sourceAt(clip, to),
          fx: { size: run.size },
        });
    };
    for (let t = clip.start; t < end - 1e-6; t += dt) {
      const size = cursorSizeAtZoom(
        fx.size,
        inZoom,
        zoomOn(p, asset, clip, trackIndex, t + dt / 2),
      );
      if (run && Math.abs(run.size - size) < 1e-6) continue;
      close(t);
      run = { from: t, size };
    }
    close(end);
  }
  return [...kept, ...made];
}
