import { clipEnd, newId, sourceAt, sourceEnd, timelineAt } from "./clipTime.ts";
import type { Clip, Project, PublishInfo } from "./types.ts";

/**
 * Markers of the lesson (M on the timeline): a name at a moment, and the chapters of the MP4
 * when `chapter` is on. A marker belongs to what is on screen and heard there, so every edit
 * that moves the lesson (ripple, text cuts, extend frame, insert, drafts applied, AI edits)
 * takes it along: followMarkers() runs after each commit and puts each marker back on the same
 * moment of the same media.
 */

export interface Marker {
  id: string;
  /** Timeline seconds. */
  t: number;
  label: string;
  /** Starts a chapter of the exported MP4 (and of publish.chapters). */
  chapter?: boolean;
}

export const MARKER_LIMIT = 2000;
const EPS = 1e-6;

type Lesson = Pick<Project, "clips" | "tracks" | "assets">;

/** Clips that keep a clock of their own media: sound or video, never a picture or an effect. */
function clockClips(p: Lesson): { clip: Clip; order: number }[] {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const order = new Map(p.tracks.map((t, i) => [t.id, i]));
  const music = new Set(p.tracks.filter((t) => t.music).map((t) => t.id));
  const out: { clip: Clip; order: number }[] = [];
  for (const c of p.clips) {
    const a = assets.get(c.assetId);
    if (
      !a ||
      a.kind === "image" ||
      !(a.duration > 0) ||
      c.annotation ||
      c.zoomLayer ||
      c.regionFx ||
      music.has(c.trackId) ||
      !order.has(c.trackId)
    )
      continue;
    out.push({ clip: c, order: order.get(c.trackId) ?? 0 });
  }
  return out;
}

/** The clip a marker at `t` is on: the one on the lowest track (the lesson's own picture or voice). */
function under(clips: { clip: Clip; order: number }[], t: number): Clip | undefined {
  let best: { clip: Clip; order: number } | undefined;
  for (const x of clips)
    if (x.clip.start <= t + EPS && clipEnd(x.clip) > t + EPS)
      if (
        !best ||
        x.order > best.order ||
        (x.order === best.order && x.clip.start < best.clip.start)
      )
        best = x;
  return best?.clip;
}

/**
 * Where source second `s` of `assetId` is on the timeline after an edit, near `hint`: on a clip
 * of the same media (the same track first) that still shows it; when it was cut away, where
 * what came after it starts now (or where what came before it ends).
 */
function placeOf(
  after: Clip[],
  assetId: string,
  trackId: string,
  s: number,
  hint: number,
): number | null {
  const same = after.filter((c) => c.assetId === assetId);
  if (!same.length) return null;
  const own = same.filter((c) => c.trackId === trackId);
  const pool = own.length ? own : same;
  const showing = pool.filter((c) => c.in <= s + EPS && sourceEnd(c) > s + EPS);
  if (showing.length)
    return nearest(
      showing.map((c) => timelineAt(c, s)),
      hint,
    );
  const later = pool.filter((c) => c.in >= s - EPS);
  if (later.length) {
    const first = Math.min(...later.map((c) => c.in));
    return nearest(
      later.filter((c) => Math.abs(c.in - first) <= EPS).map((c) => c.start),
      hint,
    );
  }
  const last = Math.max(...pool.map(sourceEnd));
  return nearest(pool.filter((c) => Math.abs(sourceEnd(c) - last) <= EPS).map(clipEnd), hint);
}

const nearest = (values: number[], hint: number): number =>
  values.reduce((best, v) => (Math.abs(v - hint) < Math.abs(best - hint) ? v : best), values[0]);

/** One marker moved along with the lesson from `before` to `after`. */
function follow(m: Marker, before: { clip: Clip; order: number }[], after: Clip[]): number {
  const on = under(before, m.t);
  if (on) {
    const t = placeOf(after, on.assetId, on.trackId, sourceAt(on, m.t), m.t);
    return t === null ? m.t : t;
  }
  // Between clips: it keeps its distance from the end of the clip before it.
  let prev: Clip | undefined;
  for (const { clip } of before)
    if (clipEnd(clip) <= m.t + EPS && (!prev || clipEnd(clip) > clipEnd(prev))) prev = clip;
  if (!prev) return m.t;
  const end = placeOf(after, prev.assetId, prev.trackId, sourceEnd(prev) - EPS, clipEnd(prev));
  return end === null ? m.t : end + (m.t - clipEnd(prev));
}

/**
 * The markers of `after` (a lesson changed from `before`) put back on the moments of the media
 * they marked. Same array when no marker moves.
 */
export function followMarkers(before: Lesson, after: Lesson, markers: readonly Marker[]): Marker[] {
  if (!markers.length || before.clips === after.clips) return markers as Marker[];
  const clocks = clockClips(before);
  let changed = false;
  const out = markers.map((m) => {
    const t = Math.max(0, follow(m, clocks, after.clips));
    if (Math.abs(t - m.t) <= EPS) return m;
    changed = true;
    return { ...m, t };
  });
  return changed ? sortMarkers(out) : (markers as Marker[]);
}

export const sortMarkers = (list: readonly Marker[]): Marker[] =>
  [...list].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));

/** "Marcador 3": the first number not taken yet. */
export function newMarkerLabel(list: readonly Marker[]): string {
  let n = list.length + 1;
  while (list.some((m) => m.label === `Marcador ${n}`)) n++;
  return `Marcador ${n}`;
}

/** A marker at `t` (on the frame grid of the caller), named after the ones there are. */
export function addMarker(list: readonly Marker[], t: number, label?: string): Marker[] {
  if (list.length >= MARKER_LIMIT) return list as Marker[];
  // One marker per moment: pressing M twice on the same frame does not stack them.
  if (list.some((m) => Math.abs(m.t - t) < 1e-3)) return list as Marker[];
  return sortMarkers([
    ...list,
    { id: newId("m"), t: Math.max(0, t), label: label ?? newMarkerLabel(list) },
  ]);
}

/** The next marker after `t` (dir 1) or the one before it (dir −1). */
export function stepMarker(list: readonly Marker[], t: number, dir: 1 | -1): Marker | undefined {
  const sorted = sortMarkers(list);
  if (dir > 0) return sorted.find((m) => m.t > t + 1e-3);
  return [...sorted].reverse().find((m) => m.t < t - 1e-3);
}

/**
 * The chapters of the lesson: the markers set as chapters, when there are any, otherwise the
 * ones in publish.chapters (written by the assistant). A chapter list always starts at 0:00 on
 * YouTube, so the first one is moved there when it starts a little later.
 */
export function chaptersOf(
  p: Pick<Project, "markers" | "publish">,
): NonNullable<PublishInfo["chapters"]> {
  const marked = (p.markers ?? [])
    .filter((m) => m.chapter && m.label.trim())
    .map((m) => ({ time: m.t, title: m.label.trim() }));
  const list = marked.length ? marked : [...(p.publish?.chapters ?? [])];
  return list.sort((a, b) => a.time - b.time);
}

/** publish.chapters from the chapter markers (unchanged when no marker is a chapter). */
export function withMarkerChapters<T extends Pick<Project, "markers" | "publish">>(p: T): T {
  if (!(p.markers ?? []).some((m) => m.chapter)) return p;
  return { ...p, publish: { ...p.publish, chapters: chaptersOf(p) } };
}
