import { clipEnd } from "./clipTime.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Magnetic tracks (track.magnetic, as in Camtasia): the clips of the track always sit back to
 * back from 0:00, in the order of their starts, so removing, trimming or moving one never leaves
 * a hole. Every commit goes through applyMagnetic() (shared/settle.ts); a locked track stays as
 * it is. A clip that moves takes along, by the same amount, the clips of its group on the other
 * tracks that play beside it (a video and the sound taken out of it stay together, each piece
 * of a cut with its own), except on locked tracks.
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
    // The group's clips on this track, by group: each member elsewhere goes along with the one
    // it plays beside (a video cut in two keeps each half of its sound under its own half).
    const leaders = new Map<string, Clip[]>();
    for (const c of clips)
      if (c.groupId && c.trackId === t.id)
        leaders.set(c.groupId, [...(leaders.get(c.groupId) ?? []), c]);
    clips = clips.map((c) => {
      const own = moves.get(c.id);
      if (own !== undefined) return { ...c, start: c.start + own };
      if (!c.groupId || c.trackId === t.id || fixed.has(c.trackId)) return c;
      const beside = besideOf(leaders.get(c.groupId), c);
      const along = beside ? moves.get(beside.id) : undefined;
      if (along === undefined) return c;
      return { ...c, start: Math.max(0, c.start + along) };
    });
  }
  return clips === p.clips ? p : { ...p, clips };
}

/**
 * Of a group's clips on the magnetic track, the one `c` plays beside: the one it overlaps most
 * in time, or the nearest one when it overlaps none (a J or L cut past the edge).
 */
function besideOf(list: readonly Clip[] | undefined, c: Clip): Clip | undefined {
  let best: Clip | undefined;
  let bestOverlap = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const x of list ?? []) {
    const overlap = Math.min(clipEnd(x), clipEnd(c)) - Math.max(x.start, c.start);
    const gap = Math.max(0, -overlap);
    if (overlap > bestOverlap + EPS || (bestOverlap <= EPS && overlap <= EPS && gap < bestGap)) {
      best = x;
      bestOverlap = Math.max(0, overlap);
      bestGap = gap;
    }
  }
  return best;
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
