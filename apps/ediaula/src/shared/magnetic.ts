import { clipEnd } from "./clipTime.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Magnetic tracks (track.magnetic, as in Camtasia): the clips of the track always sit back to
 * back from 0:00, in the order of their starts, so removing, trimming or moving one never leaves
 * a hole. Every commit goes through applyMagnetic() (state/project.ts); a locked track stays as
 * it is.
 */

const EPS = 1e-6;

/** The clips of one track packed from 0:00, or the same array when they already are. */
export function packTrack(clips: Clip[], trackId: string): Clip[] {
  const on = clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.trackId === trackId)
    .sort((a, b) => a.c.start - b.c.start || a.i - b.i);
  let cursor = 0;
  let changed = false;
  const moved = new Map<number, Clip>();
  for (const { c, i } of on) {
    if (Math.abs(c.start - cursor) > EPS) {
      moved.set(i, { ...c, start: cursor });
      changed = true;
    }
    cursor += c.duration;
  }
  return changed ? clips.map((c, i) => moved.get(i) ?? c) : clips;
}

/** The project with every unlocked magnetic track packed; the same object when nothing moves. */
export function applyMagnetic<T extends Pick<Project, "clips" | "tracks">>(p: T): T {
  let clips = p.clips;
  for (const t of p.tracks) if (t.magnetic && !t.locked) clips = packTrack(clips, t.id);
  return clips === p.clips ? p : { ...p, clips };
}

/** Where a clip dropped at `t` on a magnetic track goes: before the clip whose middle is after t. */
export function magneticSlot(clips: readonly Clip[], trackId: string, t: number): number {
  const on = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  for (const c of on) if (c.start + c.duration / 2 > t) return c.start - EPS;
  return on.length ? clipEnd(on[on.length - 1]) : 0;
}
