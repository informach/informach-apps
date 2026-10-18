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

interface Clock {
  clip: Clip;
  order: number;
}

/** Clips that keep a clock of their own media: sound or video, never a picture or an effect. */
function clockClips(p: Lesson): Clock[] {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const order = new Map(p.tracks.map((t, i) => [t.id, i]));
  const music = new Set(p.tracks.filter((t) => t.music).map((t) => t.id));
  const out: Clock[] = [];
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

/**
 * The clock clips by time, so each marker looks only at the clips near it: buckets of the
 * timeline (each clip in the ones it spans, in project order) and the clips sorted by end.
 */
interface ClockIndex {
  size: number;
  buckets: Map<number, Clock[]>;
  byEnd: Clock[];
}

function indexClocks(clocks: Clock[]): ClockIndex {
  const last = clocks.reduce((m, x) => Math.max(m, clipEnd(x.clip)), 0);
  const size = Math.max(1, last / 4096);
  const buckets = new Map<number, Clock[]>();
  for (const x of clocks) {
    const to = Math.floor(clipEnd(x.clip) / size);
    for (let b = Math.floor(x.clip.start / size); b <= to; b++) {
      const list = buckets.get(b);
      if (list) list.push(x);
      else buckets.set(b, [x]);
    }
  }
  // Sorted by end, project order among equal ends (Array.prototype.sort is stable).
  const byEnd = [...clocks].sort((a, b) => clipEnd(a.clip) - clipEnd(b.clip));
  return { size, buckets, byEnd };
}

/** The clip a marker at `t` is on: the one on the lowest track (the lesson's own picture or voice). */
function under(index: ClockIndex, t: number): Clip | undefined {
  let best: Clock | undefined;
  for (const x of index.buckets.get(Math.floor((t + EPS) / index.size)) ?? [])
    if (x.clip.start <= t + EPS && clipEnd(x.clip) > t + EPS)
      if (
        !best ||
        x.order > best.order ||
        (x.order === best.order && x.clip.start < best.clip.start)
      )
        best = x;
  return best?.clip;
}

/** The clip that ends last at or before `t` (the first of them in project order). */
function endingBefore(index: ClockIndex, t: number): Clip | undefined {
  const list = index.byEnd;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (clipEnd(list[mid].clip) <= t + EPS) lo = mid + 1;
    else hi = mid;
  }
  if (!lo) return undefined;
  let i = lo - 1;
  const end = clipEnd(list[i].clip);
  while (i > 0 && clipEnd(list[i - 1].clip) === end) i--;
  return list[i].clip;
}

/**
 * Clips of one media (on one track, or on any) after the edit, ready for placeOf: by source
 * time in buckets, sorted by in-point, and the ones that reach furthest into the media.
 */
interface Pool {
  clips: Clip[];
  size: number;
  buckets: Map<number, Clip[]>;
  byIn: Clip[];
  furthest: Clip[];
}

function makePool(clips: Clip[]): Pool {
  const reach = clips.reduce((m, c) => Math.max(m, sourceEnd(c)), 0);
  const size = Math.max(1, reach / 4096);
  const buckets = new Map<number, Clip[]>();
  for (const c of clips) {
    const to = Math.floor(sourceEnd(c) / size);
    for (let k = Math.floor(c.in / size); k <= to; k++) {
      const list = buckets.get(k);
      if (list) list.push(c);
      else buckets.set(k, [c]);
    }
  }
  return {
    clips,
    size,
    buckets,
    byIn: [...clips].sort((x, y) => x.in - y.in),
    furthest: clips.filter((c) => Math.abs(sourceEnd(c) - reach) <= EPS),
  };
}

/** The clips after the edit, grouped by media and by media and track, made as needed. */
class Pools {
  private readonly byAsset = new Map<string, Clip[]>();
  private readonly made = new Map<string, Pool | null>();
  constructor(clips: readonly Clip[]) {
    for (const c of clips) {
      const list = this.byAsset.get(c.assetId);
      if (list) list.push(c);
      else this.byAsset.set(c.assetId, [c]);
    }
  }
  /** The media's clips on `trackId`, or on every track when it has none there. */
  get(assetId: string, trackId: string): Pool | null {
    const key = `${assetId}\u0000${trackId}`;
    const known = this.made.get(key);
    if (known !== undefined) return known;
    const same = this.byAsset.get(assetId) ?? [];
    const own = same.filter((c) => c.trackId === trackId);
    const pool = same.length ? makePool(own.length ? own : same) : null;
    this.made.set(key, pool);
    return pool;
  }
}

/**
 * Where source second `s` of `assetId` is on the timeline after an edit, near `hint`: on a clip
 * of the same media (the same track first) that still shows it; when it was cut away, where
 * what came after it starts now (or where what came before it ends).
 */
function placeOf(
  pools: Pools,
  assetId: string,
  trackId: string,
  s: number,
  hint: number,
): number | null {
  const pool = pools.get(assetId, trackId);
  if (!pool) return null;
  const showing = (pool.buckets.get(Math.floor((s + EPS) / pool.size)) ?? []).filter(
    (c) => c.in <= s + EPS && sourceEnd(c) > s + EPS,
  );
  if (showing.length)
    return nearest(
      showing.map((c) => timelineAt(c, s)),
      hint,
    );
  // The first in-point at or after s, and every clip that starts its media there.
  const list = pool.byIn;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].in < s - EPS) lo = mid + 1;
    else hi = mid;
  }
  if (lo < list.length) {
    const first = list[lo].in;
    const starts: number[] = [];
    for (let i = lo; i < list.length && Math.abs(list[i].in - first) <= EPS; i++)
      starts.push(list[i].start);
    return nearest(starts, hint);
  }
  return nearest(pool.furthest.map(clipEnd), hint);
}

const nearest = (values: number[], hint: number): number =>
  values.reduce((best, v) => (Math.abs(v - hint) < Math.abs(best - hint) ? v : best), values[0]);

/** What follow() needs of the lesson after the edit: its clips by id and by media. */
interface After {
  byId: ReadonlyMap<string, Clip>;
  pools: Pools;
}

/**
 * One marker moved along with the lesson from `before` to `after`. A marker on a clip the edit
 * left as it was (the same object) stays where it is, without looking further.
 */
function follow(m: Marker, index: ClockIndex, after: After): number {
  const on = under(index, m.t);
  if (on) {
    if (after.byId.get(on.id) === on) return m.t;
    const t = placeOf(after.pools, on.assetId, on.trackId, sourceAt(on, m.t), m.t);
    return t === null ? m.t : t;
  }
  // Between clips: it keeps its distance from the end of the clip before it.
  const prev = endingBefore(index, m.t);
  if (!prev || after.byId.get(prev.id) === prev) return m.t;
  const end = placeOf(
    after.pools,
    prev.assetId,
    prev.trackId,
    sourceEnd(prev) - EPS,
    clipEnd(prev),
  );
  return end === null ? m.t : end + (m.t - clipEnd(prev));
}

/**
 * The markers of `after` (a lesson changed from `before`) put back on the moments of the media
 * they marked. Same array when no marker moves.
 */
export function followMarkers(before: Lesson, after: Lesson, markers: readonly Marker[]): Marker[] {
  if (!markers.length || before.clips === after.clips) return markers as Marker[];
  const index = indexClocks(clockClips(before));
  const lesson: After = {
    byId: new Map(after.clips.map((c) => [c.id, c])),
    pools: new Pools(after.clips),
  };
  let changed = false;
  const out = markers.map((m) => {
    const t = Math.max(0, follow(m, index, lesson));
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

/** Whether the chapters of the lesson come from its markers (chaptersOf). */
export const hasChapterMarkers = (p: Pick<Project, "markers">): boolean =>
  (p.markers ?? []).some((m) => m.chapter && m.label.trim());

/** publish.chapters from the chapter markers (unchanged when no marker is a chapter). */
export function withMarkerChapters<T extends Pick<Project, "markers" | "publish">>(p: T): T {
  if (!(p.markers ?? []).some((m) => m.chapter)) return p;
  return { ...p, publish: { ...p.publish, chapters: chaptersOf(p) } };
}
