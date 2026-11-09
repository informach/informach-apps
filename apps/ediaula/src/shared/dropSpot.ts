import { clipEnd, newId } from "./clipTime.ts";
import { newTrackName } from "./timeline.ts";
import type { Project, Track } from "./types.ts";

/**
 * Where something dragged onto a track of the timeline lands (an annotation of the Anotações
 * panel): on that track at the time it was dropped, so the person decides where it goes and no
 * track is made for it. A clip after it shortens it to the gap (down to MIN_GAP). Dropped over a
 * clip, it goes to the nearest free track above, or a new one right above it (as pasting does).
 * An annotation is a picture: dropped on a sound track (the voice lane, under the lesson) it goes
 * in front of the picture shown at that moment, never behind the screen. A magnetic track packs its
 * clips from 0:00, so it never takes the drop at the time asked.
 */

/** Shortest piece a drop is cut down to so it fits before the next clip. */
export const MIN_GAP = 0.5;
const EPS = 1e-3;

export interface DropSpot {
  tracks: Track[];
  track: Track;
  duration: number;
  /** A track was made for it (it was dropped over a clip with no free track above). */
  made: boolean;
}

const freeOn = (p: Pick<Project, "clips">, trackId: string, start: number, end: number): boolean =>
  !p.clips.some((c) => c.trackId === trackId && c.start < end - EPS && clipEnd(c) > start + EPS);

/** Null when the track is gone or locked (the drop is refused there). */
export function dropSpot(
  p: Pick<Project, "tracks" | "clips">,
  trackId: string,
  start: number,
  duration: number,
): DropSpot | null {
  const index = p.tracks.findIndex((t) => t.id === trackId);
  const track = p.tracks[index];
  if (!track || track.locked) return null;
  const end = start + duration;
  const usable = (t: Track): boolean => t.kind === "video" && !t.locked && !t.magnetic;
  if (usable(track)) {
    if (freeOn(p, track.id, start, end)) return { tracks: p.tracks, track, duration, made: false };
    const own = p.clips.filter((c) => c.trackId === track.id);
    const under = own.some((c) => c.start <= start + EPS && clipEnd(c) > start + EPS);
    if (!under) {
      // Free where it was dropped, a clip later on: it fits in the gap.
      const next = Math.min(...own.filter((c) => c.start > start).map((c) => c.start));
      if (next - start >= MIN_GAP)
        return { tracks: p.tracks, track, duration: next - start, made: false };
    }
  }
  // Above the track it fell on; from a sound track, above the topmost picture at that moment.
  const shown = p.tracks.findIndex((t) => t.kind === "video" && !freeOn(p, t.id, start, end));
  const from = track.kind === "video" || shown < 0 ? index : Math.min(index, shown);
  for (let i = from - 1; i >= 0; i--) {
    const above = p.tracks[i];
    if (usable(above) && freeOn(p, above.id, start, end))
      return { tracks: p.tracks, track: above, duration, made: false };
  }
  const made: Track = {
    id: newId("t"),
    kind: "video",
    name: newTrackName(p.tracks),
    muted: false,
    hidden: false,
    locked: false,
  };
  return {
    tracks: [...p.tracks.slice(0, from), made, ...p.tracks.slice(from)],
    track: made,
    duration,
    made: true,
  };
}
