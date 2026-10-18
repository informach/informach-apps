import { clipEnd } from "./clipTime.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Magnetic tracks (track.magnetic, as in Camtasia): the clips of the track always sit back to
 * back from 0:00, in the order of their starts, so removing, trimming or moving one never leaves
 * a hole. Every commit goes through applyMagnetic() (shared/settle.ts); a locked track stays as
 * it is. A clip that moves takes along, by the same amount, the clips of its group on the other
 * tracks (a video and the sound taken out of it stay together), except on locked tracks.
 */

const EPS = 1e-6;

/** How far each clip of the track moves to pack it from 0:00 (only the ones that move). */
export function packMoves(clips: readonly Clip[], trackId: string): Map<string, number> {
  const on = clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.trackId === trackId)
    .sort((a, b) => a.c.start - b.c.start || a.i - b.i);
  let cursor = 0;
  const moves = new Map<string, number>();
  for (const { c } of on) {
    if (Math.abs(c.start - cursor) > EPS) moves.set(c.id, cursor - c.start);
    cursor += c.duration;
  }
  return moves;
}

/** The clips of one track packed from 0:00, or the same array when they already are. */
export function packTrack(clips: Clip[], trackId: string): Clip[] {
  const moves = packMoves(clips, trackId);
  return moves.size
    ? clips.map((c) => {
        const d = moves.get(c.id);
        return d === undefined ? c : { ...c, start: c.start + d };
      })
    : clips;
}

/**
 * The project with every unlocked magnetic track packed, and the group members of the clips
 * that moved moved alike on the other unlocked tracks; the same object when nothing moves.
 */
export function applyMagnetic<T extends Pick<Project, "clips" | "tracks">>(p: T): T {
  const magnetic = p.tracks.filter((t) => t.magnetic && !t.locked);
  if (!magnetic.length) return p;
  const fixed = new Set(p.tracks.filter((t) => t.locked || t.magnetic).map((t) => t.id));
  let clips = p.clips;
  for (const t of magnetic) {
    const moves = packMoves(clips, t.id);
    if (!moves.size) continue;
    // The group of each clip that moves goes along on the other free tracks.
    const byGroup = new Map<string, number>();
    for (const c of clips)
      if (c.groupId && moves.has(c.id) && !byGroup.has(c.groupId))
        byGroup.set(c.groupId, moves.get(c.id) ?? 0);
    clips = clips.map((c) => {
      const own = moves.get(c.id);
      if (own !== undefined) return { ...c, start: c.start + own };
      const along = c.groupId ? byGroup.get(c.groupId) : undefined;
      if (along === undefined || fixed.has(c.trackId)) return c;
      return { ...c, start: Math.max(0, c.start + along) };
    });
  }
  return clips === p.clips ? p : { ...p, clips };
}

/**
 * Groups of the track's clips with a member on a locked track: packing would pull them apart,
 * so the track cannot be made magnetic while they are (the names of those locked tracks).
 */
export function magneticBlockers(p: Pick<Project, "clips" | "tracks">, trackId: string): string[] {
  const locked = new Map(p.tracks.filter((t) => t.locked).map((t) => [t.id, t.name]));
  const groups = new Set(
    p.clips.filter((c) => c.trackId === trackId && c.groupId).map((c) => c.groupId),
  );
  const names = new Set<string>();
  for (const c of p.clips)
    if (c.groupId && groups.has(c.groupId) && c.trackId !== trackId) {
      const name = locked.get(c.trackId);
      if (name) names.add(name);
    }
  return [...names];
}

/** Where a clip dropped at `t` on a magnetic track goes: before the clip whose middle is after t. */
export function magneticSlot(clips: readonly Clip[], trackId: string, t: number): number {
  const on = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  for (const c of on) if (c.start + c.duration / 2 > t) return c.start - EPS;
  return on.length ? clipEnd(on[on.length - 1]) : 0;
}
