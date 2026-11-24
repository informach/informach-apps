import { clipSpeed, newId, sourceEnd, sourceRoom } from "./clipTime.ts";
import { presenterClips } from "./courseTemplate.ts";
import { transformAt } from "./keyframes.ts";
import type { Asset, Clip, Project } from "./types.ts";

/**
 * Animations that cover the screen recording one after another (cutaways, place_cutaway). Between
 * two of them a sliver of the screen is easy to leave (0.3 s where one ends a little before the
 * next starts): it shows as two transitions with a flash of the screen in the middle, and the
 * presenter, cut on those points, jumps between layouts. Here: finding those slivers (and the
 * empty gaps of the same kind, which show black), covering them with the animation before (its
 * own footage, then its last frame held, and only then a slightly slower animation), and the
 * presenter's pieces too short to be a shot of their own.
 */

export const CUTAWAY_JOIN = {
  /** A stretch of screen shorter than this between two animations is a sliver (seconds). */
  shortScreen: 1.5,
  /** The presenter's pieces are never shorter than this (seconds). */
  presenterPiece: 1,
  /** The slowest an animation may go to cover a sliver, as a last resort. */
  minSpeed: 0.95,
  /** Clips this close touch each other (seconds). */
  touch: 0.05,
} as const;

/** A stretch of the screen too short to show between two animations (or at a track's ends). */
export interface Sliver {
  trackId: string;
  start: number;
  end: number;
  /** The short piece of the screen; null for an empty gap (it shows black or what is below). */
  pieceId: string | null;
  /** The animation before it (null at the start of the track) and after it (null at the end). */
  beforeId: string | null;
  afterId: string | null;
  /** Pieces of the screen's sound, in step with it, that only play in this stretch. */
  companions: string[];
}

const end = (c: Pick<Clip, "start" | "duration">): number => c.start + c.duration;

/** Pictures of a track: not annotations, zoom layers, region effects or sound-only clips. */
function picture(c: Clip, asset: Asset | undefined): boolean {
  return (
    !!asset &&
    !c.annotation &&
    !c.zoomLayer &&
    !c.regionFx &&
    !c.soundOnly &&
    (asset.kind === "image" || (asset.kind === "video" && asset.hasVideo))
  );
}

/** The timeline second where source second 0 of a clip would be: equal for clips in step. */
const origin = (c: Clip): number => c.start - c.in / clipSpeed(c);

/**
 * Every sliver of the lesson: on each visible video track, the recording that fills most of it
 * is its screen, and a piece of that screen shorter than `min` between two other pictures that
 * touch it (or between the track's start and one, or one and the track's end) is a sliver; so
 * is an empty gap shorter than `min` between two pictures that are not the screen.
 */
export function findSlivers(
  p: Pick<Project, "clips" | "tracks" | "assets">,
  opts: { min?: number; trackIds?: readonly string[] } = {},
): Sliver[] {
  const min = opts.min ?? CUTAWAY_JOIN.shortScreen;
  const { touch } = CUTAWAY_JOIN;
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const audio = new Set(p.tracks.filter((t) => t.kind === "audio" && !t.music).map((t) => t.id));
  const out: Sliver[] = [];
  for (const track of p.tracks) {
    if (track.kind !== "video" || track.hidden) continue;
    if (opts.trackIds && !opts.trackIds.includes(track.id)) continue;
    const clips = p.clips
      .filter((c) => c.trackId === track.id && picture(c, assets.get(c.assetId)))
      .sort((a, b) => a.start - b.start);
    // The screen: the recording (not something the editor made) that covers most of the track.
    const length = new Map<string, number>();
    for (const c of clips) {
      const a = assets.get(c.assetId);
      if (a?.kind === "video" && !a.generated)
        length.set(c.assetId, (length.get(c.assetId) ?? 0) + c.duration);
    }
    const screen = [...length].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!screen) continue;
    const other = (c: Clip | undefined): c is Clip => !!c && c.assetId !== screen;
    const screens = clips.filter((c) => c.assetId === screen);
    // The screen's sound (in step with it) left under the animations around the stretch, where
    // the screen is not seen.
    const companions = (from: number, to: number): string[] =>
      p.clips
        .filter(
          (c) =>
            audio.has(c.trackId) &&
            c.start >= from - touch &&
            end(c) <= to + touch &&
            screens.some((s) => Math.abs(origin(s) - origin(c)) < touch),
        )
        .map((c) => c.id);
    clips.forEach((c, i) => {
      const prev = clips[i - 1];
      const next = clips[i + 1];
      const before = prev && Math.abs(end(prev) - c.start) <= touch ? prev : undefined;
      const after = next && Math.abs(next.start - end(c)) <= touch ? next : undefined;
      if (c.assetId === screen && c.duration < min) {
        const between = other(before) && other(after);
        const first = i === 0 && c.start <= touch && other(after);
        const last = !next && other(before);
        if (between || first || last)
          out.push({
            trackId: track.id,
            start: c.start,
            end: end(c),
            pieceId: c.id,
            beforeId: before?.id ?? null,
            afterId: after?.id ?? null,
            companions: companions(before?.start ?? c.start, after ? end(after) : end(c)),
          });
      }
      // An empty gap between two animations.
      if (next && other(c) && other(next)) {
        const gap = next.start - end(c);
        if (gap > 1e-4 && gap < min)
          out.push({
            trackId: track.id,
            start: end(c),
            end: next.start,
            pieceId: null,
            beforeId: c.id,
            afterId: next.id,
            companions: companions(c.start, end(next)),
          });
      }
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Where covering a sliver ends: the start of the animation after it, or the stretch's end. */
function coverEnd(p: Pick<Project, "clips">, s: Sliver): number {
  const b = s.afterId ? p.clips.find((c) => c.id === s.afterId) : undefined;
  return b ? b.start : s.end;
}

/** A frame of an animation held still over part of a sliver: after it, or before it at the start. */
export interface Hold {
  clipId: string;
  side: "after" | "before";
  from: number;
  to: number;
}

/**
 * How a sliver gets covered: the animation before it runs on into it as far as its own footage
 * goes; what is left is its last frame held (`hold`). At the start of a track, the animation after
 * it starts earlier if its footage has room, or its first frame is held.
 */
export function sliverCover(
  p: Pick<Project, "clips" | "assets" | "settings">,
  s: Sliver,
): { extend: number; hold: Hold | null; tiny?: boolean } {
  const byId = (id: string | null): Clip | undefined =>
    id ? p.clips.find((c) => c.id === id) : undefined;
  const assetOf = (c: Clip): Asset | undefined => p.assets.find((a) => a.id === c.assetId);
  const frame = 1 / (p.settings.fps || 30);
  const a = byId(s.beforeId);
  if (a) {
    // Up to where the next animation starts (never over it), or the end of the stretch.
    const to = coverEnd(p, s);
    const need = to - end(a);
    const room = Math.max(0, (sourceRoom(a, assetOf(a))[1] - sourceEnd(a)) / clipSpeed(a));
    if (room >= need - 1e-6) return { extend: need, hold: null };
    // A frame or so left over is not worth a picture of its own: the animation takes that much
    // longer instead (closeSlivers), which no one sees.
    return {
      extend: room,
      hold: { clipId: a.id, side: "after", from: end(a) + room, to },
      ...(need - room < frame * 1.5 ? { tiny: true } : {}),
    };
  }
  const b = byId(s.afterId);
  if (!b) return { extend: 0, hold: null };
  const need = b.start - s.start;
  const room = Math.max(0, (b.in - sourceRoom(b, assetOf(b))[0]) / clipSpeed(b));
  if (room >= need - 1e-6) return { extend: need, hold: null };
  return { extend: 0, hold: { clipId: b.id, side: "before", from: s.start, to: b.start } };
}

export interface ClosedSlivers {
  clips: Clip[];
  /** Slivers covered, and the ones left as they were (nothing could cover them). */
  closed: Sliver[];
  left: Sliver[];
  /** Animations made a little slower to cover a sliver (no held frame could be made). */
  slowed: { clipId: string; speed: number }[];
}

/**
 * Covers each sliver: its piece of screen and that screen's sound there are taken out, and the
 * animation before it runs on to the next one (sliverCover), so the change has the next
 * animation's transition only. A held frame is a still picture `stills` made for it
 * (clipId + side); without one, the animation slows down to fill the stretch, never below
 * CUTAWAY_JOIN.minSpeed; past that the sliver stays as it was. Nothing else moves.
 */
export function closeSlivers(
  p: Pick<Project, "clips" | "assets" | "settings">,
  slivers: readonly Sliver[],
  stills: (hold: Hold) => string | undefined,
): ClosedSlivers {
  let clips = [...p.clips];
  const closed: Sliver[] = [];
  const left: Sliver[] = [];
  const slowed: { clipId: string; speed: number }[] = [];
  const set = (id: string, change: (c: Clip) => Clip): void => {
    clips = clips.map((c) => (c.id === id ? change(c) : c));
  };
  for (const s of slivers) {
    const now = { ...p, clips };
    const { extend, hold, tiny } = sliverCover(now, s);
    const a = s.beforeId ? clips.find((c) => c.id === s.beforeId) : undefined;
    const b = s.afterId ? clips.find((c) => c.id === s.afterId) : undefined;
    if (!a && !b) {
      left.push(s);
      continue;
    }
    const still = hold && !tiny ? stills(hold) : undefined;
    // No held frame: the animation before slows down to reach the next one, if just a little.
    let speed: number | null = null;
    if (hold && !still) {
      if (!a) {
        left.push(s);
        continue;
      }
      // All of its footage, over the whole stretch up to the next animation.
      const last = sourceRoom(
        a,
        now.assets.find((x) => x.id === a.assetId),
      )[1];
      const footage = Number.isFinite(last) ? Math.max(last, sourceEnd(a)) : sourceEnd(a);
      speed = (footage - a.in) / (coverEnd(now, s) - a.start);
      if (speed < CUTAWAY_JOIN.minSpeed) {
        left.push(s);
        continue;
      }
    }
    const gone = new Set([...(s.pieceId ? [s.pieceId] : []), ...s.companions]);
    clips = clips.filter((c) => !gone.has(c.id));
    if (a && speed !== null) {
      const to = coverEnd(now, s);
      const slower = speed;
      set(a.id, (c) => ({ ...c, speed: slower, duration: to - c.start }));
      if (!tiny) slowed.push({ clipId: a.id, speed: slower });
    } else if (a) {
      set(a.id, (c) => ({ ...c, duration: c.duration + extend }));
      if (hold && still) {
        const held = clips.find((c) => c.id === a.id)!;
        const picture: Clip = {
          id: newId("c"),
          assetId: still,
          trackId: held.trackId,
          start: hold.from,
          in: 0,
          duration: hold.to - hold.from,
          volume: 0,
          transform: transformAt(held, end(held)),
        };
        // The held frame is the new end: the animation's exit goes with it.
        if (held.fadeOut !== undefined) picture.fadeOut = held.fadeOut;
        if (held.exit !== undefined) picture.exit = held.exit;
        set(a.id, ({ fadeOut: _f, exit: _e, ...c }) => c);
        clips.push(picture);
      }
    } else if (b && hold && still) {
      // At the start of the track: the first frame of the animation after it, held.
      const picture: Clip = {
        id: newId("c"),
        assetId: still,
        trackId: b.trackId,
        start: hold.from,
        in: 0,
        duration: hold.to - hold.from,
        volume: 0,
        transform: transformAt(b, b.start),
      };
      if (b.fadeIn !== undefined) picture.fadeIn = b.fadeIn;
      if (b.enter !== undefined) picture.enter = b.enter;
      if (b.transition !== undefined) picture.transition = b.transition;
      set(b.id, ({ fadeIn: _f, enter: _e, transition: _t, ...c }) => c);
      clips.push(picture);
    } else if (b) {
      const step = extend * clipSpeed(b);
      set(b.id, (c) => ({
        ...c,
        start: s.start,
        in: c.in - step,
        duration: c.duration + extend,
      }));
    }
    closed.push(s);
  }
  return { clips, closed, left, slowed };
}

/** A piece of the presenter too short to be a shot, and the piece next to it it belongs with. */
export interface PresenterFlash {
  clipId: string;
  start: number;
  end: number;
  /** The neighbor it joins (the one before when both could). */
  intoId: string;
}

/**
 * The presenter's pieces shorter than `min` that touch another piece of the same video: a cut
 * that short shows as a jump of size or place (a layout of its own) or a blink (a transition on
 * each side).
 */
export function presenterFlashes(
  p: Project,
  min: number = CUTAWAY_JOIN.presenterPiece,
): PresenterFlash[] {
  const { touch } = CUTAWAY_JOIN;
  const pieces = presenterClips(p).sort((a, b) => a.start - b.start);
  const out: PresenterFlash[] = [];
  for (const c of pieces) {
    if (c.duration >= min) continue;
    const near = pieces.filter(
      (o) => o.id !== c.id && o.trackId === c.trackId && o.assetId === c.assetId,
    );
    const before = near.find((o) => Math.abs(end(o) - c.start) <= touch);
    const after = near.find((o) => Math.abs(o.start - end(c)) <= touch);
    const into = before ?? after;
    if (into) out.push({ clipId: c.id, start: c.start, end: end(c), intoId: into.id });
  }
  return out;
}

/**
 * The short piece joined to its neighbor: the neighbor takes its time. A piece right after it in
 * its own footage (and at the same speed) simply grows over it; otherwise the short piece takes
 * the neighbor's place and size and loses its transition, so nothing changes on screen there.
 */
export function joinPresenterFlash(clips: readonly Clip[], f: PresenterFlash): Clip[] {
  const c = clips.find((x) => x.id === f.clipId);
  const into = clips.find((x) => x.id === f.intoId);
  if (!c || !into) return [...clips];
  const before = into.start < c.start;
  const sameSpeed = Math.abs(clipSpeed(c) - clipSpeed(into)) < 1e-6;
  const inStep = Math.abs(origin(c) - origin(into)) < 1 / 50;
  if (sameSpeed && inStep) {
    const joined: Clip = before
      ? { ...into, duration: end(c) - into.start }
      : { ...into, start: c.start, in: c.in, duration: end(into) - c.start };
    // The ends that were the short piece's: its exit (joined after) or its entrance (before).
    if (before) {
      for (const k of ["fadeOut", "exit"] as const) {
        if (c[k] !== undefined) Object.assign(joined, { [k]: c[k] });
        else delete joined[k];
      }
    } else {
      for (const k of ["fadeIn", "enter", "transition"] as const) {
        if (c[k] !== undefined) Object.assign(joined, { [k]: c[k] });
        else delete joined[k];
      }
      if (into.keyframes?.length)
        joined.keyframes = into.keyframes.map((k) => ({ ...k, t: k.t + (into.start - c.start) }));
    }
    return clips.filter((x) => x.id !== c.id).map((x) => (x.id === into.id ? joined : x));
  }
  const look = transformAt(into, before ? end(into) : into.start);
  const next = clips.find(
    (x) =>
      x.id !== c.id && Math.abs(x.start - end(c)) <= CUTAWAY_JOIN.touch && x.trackId === c.trackId,
  );
  return clips.map((x) => {
    if (x.id === c.id) {
      const { transition: _t, keyframes: _k, ...rest } = x;
      return { ...rest, transform: look };
    }
    // The cut after it, now between two pieces that look the same, needs no transition either.
    if (before && next && x.id === next.id && x.assetId === c.assetId) {
      const { transition: _t, ...rest } = x;
      return rest;
    }
    return x;
  });
}
