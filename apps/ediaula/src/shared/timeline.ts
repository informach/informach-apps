import { clipEnd, clipSpeed, newId, timelineAt } from "./clipTime.ts";
import { AVATAR_FADE, defaultTransformFor } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { piece } from "./pieces.ts";
import type { Asset, Clip, Project, ProjectSettings, Track } from "./types.ts";

export { clipEnd, clipSpeed, newId, sourceAt, sourceEnd, timelineAt } from "./clipTime.ts";

/** Shortest clip the editor allows, in seconds. */
export const MIN_CLIP = 1 / 30;
const EPS = 1e-6;
/** Clips closer than this count as touching (a cut between them). */
export const CUT_TOUCH = 0.02;

/**
 * `t` on the lesson's frame grid: seeking, splitting, trimming and moving land on a frame, so a
 * cut never falls between two frames of the export. A rate of 0 (unknown) leaves `t` as it is.
 */
export function toFrame(t: number, fps: number): number {
  if (!Number.isFinite(t) || !(fps > 0)) return t;
  const frame = Math.round(t * fps);
  return frame <= 0 ? 0 : frame / fps;
}

/** Hours, minutes, seconds and frames (00:01:23:12), or anything parseDuration reads. */
export function parseTimecode(text: string, fps: number): number | null {
  const value = text.trim();
  const tc = /^(\d+):(\d{1,2}):(\d{1,2}):(\d{1,3})$/.exec(value);
  if (tc) {
    const [h, m, s, f] = tc.slice(1).map(Number);
    if (m >= 60 || s >= 60 || !(fps > 0) || f >= Math.ceil(fps)) return null;
    return h * 3600 + m * 60 + s + f / fps;
  }
  if (/^0+(?:[.,]0*)?$/.test(value)) return 0;
  return parseDuration(value);
}

/** Move the unlocked clips starting at/after the playhead as one block. */
export function rippleMoveFrom(
  clips: Clip[],
  tracks: Track[],
  at: number,
  delta: number,
): { clips: Clip[]; delta: number } {
  if (!Number.isFinite(at) || !Number.isFinite(delta)) return { clips, delta: 0 };
  const unlocked = new Set(tracks.filter((t) => !t.locked).map((t) => t.id));
  const moving = new Set(
    clips.filter((c) => unlocked.has(c.trackId) && c.start >= at - EPS).map((c) => c.id),
  );
  if (!moving.size) return { clips, delta: 0 };
  let minimum = -Math.max(0, at);
  for (const c of clips) {
    if (!moving.has(c.id)) continue;
    minimum = Math.max(minimum, -c.start);
    for (const other of clips) {
      if (other.trackId === c.trackId && !moving.has(other.id)) {
        minimum = Math.max(minimum, Math.min(0, clipEnd(other) - c.start));
      }
    }
  }
  const applied = Math.max(minimum, delta);
  return {
    clips:
      applied === 0
        ? clips
        : clips.map((c) => (moving.has(c.id) ? { ...c, start: c.start + applied } : c)),
    delta: applied,
  };
}

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 8;

/** Seconds, mm:ss or hh:mm:ss, with decimal seconds (comma or dot). */
export function parseDuration(text: string): number | null {
  const value = text.trim().replace(",", ".");
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((n) => n >= 60)) return null;
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Same source footage, played in the requested total duration. */
export function speedForDuration(clips: Clip[], seconds: number): number | null {
  if (!clips.length || !Number.isFinite(seconds) || seconds <= 0) return null;
  const speed = clips.reduce((sum, c) => sum + c.duration * clipSpeed(c), 0) / seconds;
  if (
    speed < SPEED_MIN ||
    speed > SPEED_MAX ||
    clips.some((c) => (c.duration * clipSpeed(c)) / speed < MIN_CLIP)
  )
    return null;
  return speed;
}

/** Insert a silent still on this track and resume the original footage after it. */
export function extendFrame(
  clips: Clip[],
  id: string,
  at: number,
  seconds: number,
  stillAssetId: string,
): { clips: Clip[]; stillId: string } {
  const c = clips.find((x) => x.id === id);
  if (
    !c ||
    !Number.isFinite(at) ||
    at < c.start ||
    at > clipEnd(c) ||
    !Number.isFinite(seconds) ||
    seconds < MIN_CLIP
  )
    throw new Error("Tempo de extensão inválido.");
  const stillId = newId("c");
  const still: Clip = {
    id: stillId,
    assetId: stillAssetId,
    trackId: c.trackId,
    start: at,
    in: 0,
    duration: seconds,
    volume: 0,
    transform: transformAt(c, at),
  };
  const out = clips
    .filter((x) => x.id !== id)
    .map((x) =>
      x.trackId === c.trackId && x.start >= at - EPS ? { ...x, start: x.start + seconds } : x,
    );
  // The held picture takes over the clip's entrance when it comes first, and its exit when last.
  const edge = (values: Partial<Clip>): void => {
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) Object.assign(still, { [key]: value });
  };
  if (at - c.start > EPS) out.push(piece(c, c.start, at, { tail: false }));
  else edge({ fadeIn: c.fadeIn, enter: c.enter, transition: c.transition });
  out.push(still);
  if (clipEnd(c) - at > EPS)
    out.push({ ...piece(c, at, clipEnd(c), { head: false }), start: at + seconds });
  else edge({ fadeOut: c.fadeOut, exit: c.exit });
  return { clips: out, stillId };
}

/**
 * Changes a clip's speed keeping the same stretch of the source: faster makes it shorter, slower
 * longer. With `ripple` the clips after it on its track move by the difference (nothing is covered
 * and no gap is left); without it, a longer clip covers what follows. Movement keyframes stretch along.
 */
export function setClipSpeed(clips: Clip[], id: string, speed: number, ripple: boolean): Clip[] {
  const c = clips.find((x) => x.id === id);
  if (!c || !Number.isFinite(speed)) return clips;
  const s = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  const k = clipSpeed(c) / s;
  const duration = Math.max(MIN_CLIP, c.duration * k);
  const delta = duration - c.duration;
  const { speed: _old, ...rest } = c;
  const changed: Clip = {
    ...rest,
    duration,
    ...(Math.abs(s - 1) < 1e-12 ? {} : { speed: s }),
    ...(c.keyframes?.length ? { keyframes: c.keyframes.map((f) => ({ ...f, t: f.t * k })) } : {}),
  };
  const others = clips.filter((x) => x.id !== id);
  if (ripple)
    return [
      ...others.map((x) =>
        x.trackId === c.trackId && x.start >= clipEnd(c) - EPS
          ? { ...x, start: Math.max(0, x.start + delta) }
          : x,
      ),
      changed,
    ];
  return placeClips(others, [changed]);
}

export function projectDuration(p: Pick<Project, "clips">): number {
  let end = 0;
  for (const c of p.clips) end = Math.max(end, clipEnd(c));
  return end;
}

/**
 * Clears [start, end) on a track, trimming, splitting or removing clips that overlap it
 * (Premiere-style overwrite). Clips listed in `except` are left untouched.
 */
export function overwriteRange(
  clips: Clip[],
  trackId: string,
  start: number,
  end: number,
  except: Set<string> = new Set(),
): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    const cEnd = clipEnd(c);
    if (c.trackId !== trackId || except.has(c.id) || cEnd <= start + EPS || c.start >= end - EPS) {
      out.push(c);
      continue;
    }
    const hasLeft = c.start < start - EPS;
    const hasRight = cEnd > end + EPS;
    // Only a cut through the middle takes the inner edges' entrance and exit away: cutting off
    // the head or the tail just moves that edge, with its transition, fade or motion.
    if (hasLeft) out.push(piece(c, c.start, start, { tail: !hasRight }));
    if (hasRight) out.push(piece(c, end, cEnd, { head: !hasLeft }));
  }
  return out;
}

/** Splits a clip at timeline time `t`. Returns null when `t` is not strictly inside the clip. */
export function splitClip(c: Clip, t: number): [Clip, Clip] | null {
  if (t <= c.start + MIN_CLIP || t >= clipEnd(c) - MIN_CLIP) return null;
  // The entrance stays with the first part and the exit with the second (pieces.ts).
  return [piece(c, c.start, t), piece(c, t, clipEnd(c))];
}

/** Splits every clip in `ids` (or every clip under the playhead when `ids` is empty) at `t`. */
export function splitAt(
  clips: Clip[],
  t: number,
  ids: Set<string>,
  lockedTracks: Set<string> = new Set(),
): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    const target = (ids.size === 0 || ids.has(c.id)) && !lockedTracks.has(c.trackId);
    const parts = target ? splitClip(c, t) : null;
    if (parts) out.push(...parts);
    else out.push(c);
  }
  return out;
}

/** Removes clips and closes the gap they leave on their own track. */
export function rippleDelete(clips: Clip[], ids: Set<string>): Clip[] {
  const removed = clips.filter((c) => ids.has(c.id));
  let out = clips.filter((c) => !ids.has(c.id));
  // Process from the latest removed clip backwards so earlier shifts don't disturb later ranges.
  removed.sort((a, b) => b.start - a.start);
  for (const r of removed) {
    out = out.map((c) =>
      c.trackId === r.trackId && c.start >= clipEnd(r) - EPS
        ? { ...c, start: Math.max(0, c.start - r.duration) }
        : c,
    );
  }
  return out;
}

/**
 * Packs the clips of one track back to back, removing the gaps between them. The first clip
 * stays where it is, so the track keeps its place against the others.
 */
export function closeGaps(clips: Clip[], trackId: string): Clip[] {
  const on = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  const moved = new Map<string, number>();
  let cursor = on[0]?.start ?? 0;
  for (const c of on) {
    moved.set(c.id, cursor);
    cursor += c.duration;
  }
  return clips.map((c) => (moved.has(c.id) ? { ...c, start: moved.get(c.id)! } : c));
}

/** Returns the candidate closest to `t` within `threshold`, or `t` itself. */
export function snapTime(
  t: number,
  candidates: number[],
  threshold: number,
): { time: number; snapped: boolean } {
  let best = t;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return { time: best, snapped: best !== t };
}

/** Maximum source length available to a clip (Infinity for still images). */
export function sourceLength(asset: Asset | undefined): number {
  if (!asset || asset.kind === "image" || asset.duration <= 0) return Infinity;
  return asset.duration;
}

/**
 * Applies a trim of one edge, honouring the source bounds. Movement keyframes stay on the same
 * moments of the footage, so trimming back out brings the movement back.
 */
export function trimClip(
  c: Clip,
  edge: "start" | "end",
  time: number,
  asset: Asset | undefined,
): Clip {
  const srcLen = sourceLength(asset);
  if (edge === "start") {
    const minStart = Math.max(0, timelineAt(c, 0));
    const maxStart = clipEnd(c) - MIN_CLIP;
    const start = Math.min(Math.max(time, minStart), maxStart);
    const out = piece(c, start, clipEnd(c), { head: true });
    return out.in < 0 ? { ...out, in: 0 } : out;
  }
  const maxEnd = timelineAt(c, srcLen);
  const end = Math.min(Math.max(time, c.start + MIN_CLIP), maxEnd);
  return piece(c, c.start, end, { tail: true });
}

/**
 * Where a new picture track goes so it is drawn under the lesson's pictures: right after the
 * last video track, wherever the tracks were moved to (sound may be above it); with no video
 * track yet, before the first sound track.
 */
export function videoTrackSlot(tracks: readonly Track[]): number {
  for (let i = tracks.length - 1; i >= 0; i--) if (tracks[i].kind === "video") return i + 1;
  const firstAudio = tracks.findIndex((t) => t.kind === "audio");
  return firstAudio < 0 ? tracks.length : firstAudio;
}

/**
 * The track `id` moved to position `to` of the list (0 = top, in front of the others). Every
 * track takes every kind of clip, so any order is valid; only the drawing order changes.
 */
export function moveTrack(tracks: Track[], id: string, to: number): Track[] {
  const from = tracks.findIndex((t) => t.id === id);
  // A locked track stays where it is (it still shifts when another one moves past it).
  if (from < 0 || !Number.isFinite(to) || tracks[from].locked) return tracks;
  const target = Math.max(0, Math.min(tracks.length - 1, Math.round(to)));
  if (target === from) return tracks;
  const rest = tracks.filter((t) => t.id !== id);
  return [...rest.slice(0, target), tracks[from], ...rest.slice(target)];
}

/** Clips of `tracks` that show anywhere between timeline times `from` and `to` (marquee). */
export function clipsInSpan(
  clips: readonly Clip[],
  trackIds: ReadonlySet<string>,
  from: number,
  to: number,
): Clip[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  return clips.filter((c) => trackIds.has(c.trackId) && c.start < b && clipEnd(c) > a);
}

/** Clips starting at `at` or after it, on one track or on all of them. */
export function clipsFrom(clips: readonly Clip[], at: number, trackId?: string): Clip[] {
  return clips.filter((c) => c.start >= at - EPS && (!trackId || c.trackId === trackId));
}

/**
 * For every clip that starts where another clip of its track ends (a cut), that previous clip:
 * the same pairs as previousClip() for each clip, in O(n log n).
 */
export function adjacency(clips: Clip[]): Map<string, Clip> {
  const ends = new Map<string, { end: number; index: number }[]>();
  clips.forEach((c, index) => {
    let list = ends.get(c.trackId);
    if (!list) {
      list = [];
      ends.set(c.trackId, list);
    }
    list.push({ end: clipEnd(c), index });
  });
  for (const list of ends.values()) list.sort((a, b) => a.end - b.end);
  const out = new Map<string, Clip>();
  clips.forEach((c, i) => {
    const list = ends.get(c.trackId) ?? [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].end <= c.start - CUT_TOUCH - EPS) lo = mid + 1;
      else hi = mid;
    }
    // previousClip() takes the first match in project order.
    let best = -1;
    for (let k = lo; k < list.length && list[k].end < c.start + CUT_TOUCH + EPS; k++) {
      const j = list[k].index;
      if (j === i || clips[j].id === c.id || Math.abs(list[k].end - c.start) >= CUT_TOUCH) continue;
      if (best < 0 || j < best) best = j;
    }
    if (best >= 0) out.set(c.id, clips[best]);
  });
  return out;
}

/** Clips of one track by start, with the furthest end reached so far, for windowed lookups. */
export interface TrackClips {
  clips: Clip[];
  reach: number[];
}

export function clipIndex(clips: Clip[]): Map<string, TrackClips> {
  const out = new Map<string, TrackClips>();
  for (const c of clips) {
    const track = out.get(c.trackId);
    if (track) track.clips.push(c);
    else out.set(c.trackId, { clips: [c], reach: [] });
  }
  for (const track of out.values()) {
    track.clips.sort((a, b) => a.start - b.start);
    let reach = -Infinity;
    track.reach = track.clips.map((c) => {
      reach = Math.max(reach, clipEnd(c));
      return reach;
    });
  }
  return out;
}

/** The clips of a track that show between timeline times `from` and `to`. */
export function clipsBetween(track: TrackClips, from: number, to: number): Clip[] {
  let lo = 0;
  let hi = track.clips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track.reach[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  const out: Clip[] = [];
  for (let i = lo; i < track.clips.length && track.clips[i].start <= to; i++)
    if (clipEnd(track.clips[i]) >= from) out.push(track.clips[i]);
  return out;
}

/** Default length for still images dropped on the timeline. */
export const IMAGE_DEFAULT_DURATION = 5;

export function makeClip(
  asset: Asset,
  trackId: string,
  start: number,
  frame?: Pick<ProjectSettings, "width" | "height">,
): Clip {
  const duration =
    asset.kind === "image" || asset.duration <= 0 ? IMAGE_DEFAULT_DURATION : asset.duration;
  const clip: Clip = {
    id: newId("c"),
    assetId: asset.id,
    trackId,
    start: Math.max(0, start),
    in: 0,
    duration,
    volume: 1,
  };
  // Avatars come in already placed beside the content, with a short dissolve.
  const transform = frame && defaultTransformFor(asset, frame);
  if (transform) Object.assign(clip, { transform, fadeIn: AVATAR_FADE, fadeOut: AVATAR_FADE });
  return clip;
}

/** Places clips on the timeline, overwriting whatever was under them. */
export function placeClips(clips: Clip[], placed: Clip[]): Clip[] {
  const ids = new Set(placed.map((c) => c.id));
  let out = clips.filter((c) => !ids.has(c.id));
  for (const c of placed) out = overwriteRange(out, c.trackId, c.start, clipEnd(c), ids);
  return [...out, ...placed];
}

/** Every track takes every kind of clip (like Camtasia); only a locked track refuses. */
export function trackAccepts(track: Track, _asset?: Asset): boolean {
  return !track.locked;
}

export function trackEnd(clips: Clip[], trackId: string): number {
  let end = 0;
  for (const c of clips) if (c.trackId === trackId) end = Math.max(end, clipEnd(c));
  return end;
}

export function defaultTracks(): Track[] {
  const t = (kind: Track["kind"], name: string): Track => ({
    id: newId("t"),
    kind,
    name,
    muted: false,
    hidden: false,
    locked: false,
  });
  return [
    t("video", "Faixa 4"),
    t("video", "Faixa 3"),
    t("audio", "Faixa 2"),
    t("audio", "Faixa 1"),
  ];
}

/** Labels by position, counted from the bottom like Camtasia: the top track is drawn in front. */
export function trackLabels(tracks: Track[]): Map<string, string> {
  return new Map(tracks.map((t, i) => [t.id, `F${tracks.length - i}`]));
}

/** A neutral name for a new track ("Faixa 5"): names do not limit what a track can hold. */
export function newTrackName(tracks: Track[]): string {
  let n = tracks.length + 1;
  while (tracks.some((t) => t.name === `Faixa ${n}`)) n++;
  return `Faixa ${n}`;
}

/**
 * Pastes copied clips with the earliest one starting at `at`, keeping their spacing. Each goes back
 * to its own track when that stretch is free; otherwise to the first free track above it, or to a
 * new track right above it (like Camtasia), so pasting never covers what is already there.
 */
export function pasteClips(
  tracks: Track[],
  clips: Clip[],
  copied: Clip[],
  at: number,
): { tracks: Track[]; clips: Clip[]; ids: string[] } {
  if (!copied.length) return { tracks, clips, ids: [] };
  const shift = at - Math.min(...copied.map((c) => c.start));
  let outTracks = tracks;
  let outClips = clips;
  const ids: string[] = [];
  const free = (trackId: string, start: number, end: number): boolean =>
    !outClips.some((c) => c.trackId === trackId && c.start < end - EPS && clipEnd(c) > start + EPS);
  for (const c of [...copied].sort((a, b) => a.start - b.start)) {
    const start = Math.max(0, c.start + shift);
    const end = start + c.duration;
    const home = outTracks.findIndex((t) => t.id === c.trackId);
    let track =
      home < 0
        ? undefined
        : outTracks
            .slice(0, home + 1)
            .reverse()
            .find((t) => !t.locked && free(t.id, start, end));
    if (!track) {
      track = {
        id: newId("t"),
        kind: home < 0 ? "video" : outTracks[home].kind,
        name: newTrackName(outTracks),
        muted: false,
        hidden: false,
        locked: false,
      };
      const i = Math.max(0, home);
      outTracks = [...outTracks.slice(0, i), track, ...outTracks.slice(i)];
    }
    const id = newId("c");
    ids.push(id);
    outClips = [...outClips, { ...structuredClone(c), id, trackId: track.id, start }];
  }
  return { tracks: outTracks, clips: outClips, ids };
}
