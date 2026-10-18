import { applyCuts } from "./cleanup.ts";
import { keyframeAt, transformAt } from "./keyframes.ts";
import { piece } from "./pieces.ts";
import { clipEnd, extendFrame, placeClips, projectDuration, trimClip } from "./timeline.ts";
import type { Asset, Clip, Project } from "./types.ts";

/**
 * Edits that change the length of the lesson in the middle (Shift + edge, Ctrl + drop, extend
 * frame on every track). They work on the tracks text cuts reach (shared/cleanup.ts cutTargets,
 * plus the track of the clip being edited): those stay in sync. Making the lesson shorter is a
 * cut there, the same path as "Excluir o intervalo"; making it longer opens a gap there, cutting
 * what crosses the point in two (pieces.ts). Music beds and other tracks outside the targets are
 * never pushed and never get a hole; a bed that played to the end follows the new end. Locked
 * tracks stay exactly as they are.
 */

const EPS = 1e-6;
/** A clip that ends this close to the end of the lesson plays to the end. */
const AT_END = 0.05;

type Lesson = Pick<Project, "clips" | "tracks" | "assets">;

const lockedOf = (p: Pick<Project, "tracks">): Set<string> =>
  new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));

/**
 * `gap` seconds opened at `t` on `targets`: what starts there or later moves right, what crosses
 * `t` is cut there with its second part after the gap. `cross` decides that last part instead,
 * for a clip it handles (a picture that just lasts longer, a video that holds its frame).
 */
export function openSpace(
  clips: readonly Clip[],
  t: number,
  gap: number,
  targets: ReadonlySet<string>,
  cross?: (c: Clip) => Clip[] | null,
): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    if (!targets.has(c.trackId)) out.push(c);
    else if (c.start >= t - EPS) out.push({ ...c, start: c.start + gap });
    else if (clipEnd(c) <= t + EPS) out.push(c);
    else {
      const handled = cross?.(c);
      if (handled) out.push(...handled);
      else {
        out.push(piece(c, c.start, t, { tail: false }));
        out.push({ ...piece(c, t, clipEnd(c), { head: false }), start: t + gap });
      }
    }
  }
  return out;
}

/**
 * Beds outside the targets (music, unlocked) that played to the end of the lesson keep playing
 * to its new end, as far as their media goes.
 */
function followEnd(
  before: readonly Clip[],
  after: Clip[],
  targets: ReadonlySet<string>,
  locked: ReadonlySet<string>,
  assets: ReadonlyMap<string, Asset>,
): Clip[] {
  const oldEnd = projectDuration({ clips: [...before] });
  const newEnd = projectDuration({ clips: after });
  if (newEnd <= oldEnd + EPS) return after;
  return after.map((c) =>
    !targets.has(c.trackId) && !locked.has(c.trackId) && clipEnd(c) >= oldEnd - AT_END
      ? trimClip(c, "end", newEnd, assets.get(c.assetId))
      : c,
  );
}

export interface RippleTrim {
  clips: Clip[];
  /** The stretch of the lesson taken out (shorter), for the protected passages check. */
  cut?: [number, number];
  /** Nothing changed: the media has no more footage on that side. */
  unchanged: boolean;
}

/**
 * Trims one edge with ripple (Shift + edge): the clip keeps its start and the lesson follows the
 * change. Shorter takes the trimmed stretch out of every target track (applyCuts); longer opens
 * room for the new footage on them (openSpace). With nothing after the edit point on the
 * targets, it is a plain trim.
 */
export function rippleTrim(
  p: Lesson,
  targets: ReadonlySet<string>,
  id: string,
  edge: "start" | "end",
  time: number,
): RippleTrim {
  const c = p.clips.find((x) => x.id === id);
  const locked = lockedOf(p);
  // A clip of a locked track is never trimmed (the timeline does not let it be grabbed either).
  if (!c || !Number.isFinite(time) || locked.has(c.trackId))
    return { clips: p.clips, unchanged: true };
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const asset = assets.get(c.assetId);
  const t = trimClip(c, edge, time, asset);
  const trimmed = edge === "start" ? { ...t, start: c.start } : t;
  const delta = trimmed.duration - c.duration;
  if (Math.abs(delta) <= EPS) return { clips: p.clips, unchanged: true };
  const all = new Set([...targets, c.trackId]);
  const point = edge === "end" ? clipEnd(c) : c.start;
  const after = p.clips.some(
    (x) => x.id !== c.id && all.has(x.trackId) && clipEnd(x) > point + EPS,
  );
  if (!after) return { clips: p.clips.map((x) => (x.id === id ? trimmed : x)), unchanged: false };
  if (delta < 0) {
    const cut: [number, number] =
      edge === "end" ? [clipEnd(c) + delta, clipEnd(c)] : [c.start, c.start - delta];
    return { clips: applyCuts(p.clips, [cut], all, locked), cut, unchanged: false };
  }
  const opened = openSpace(p.clips, point, delta, all).map((x) => (x.id === id ? trimmed : x));
  return { clips: followEnd(p.clips, opened, all, locked, assets), unchanged: false };
}

/**
 * Inserts clips pushing what comes after (Ctrl + drop): the gap opens at `at` on the targets
 * and the tracks the clips go to (what crosses `at` there is cut in two), then the clips go in.
 */
export function insertClips(
  p: Lesson,
  targets: ReadonlySet<string>,
  inserted: Clip[],
  at: number,
): Clip[] {
  if (!inserted.length) return p.clips;
  const length = Math.max(...inserted.map(clipEnd)) - at;
  if (!(length > EPS)) return placeClips(p.clips, inserted);
  const all = new Set([...targets, ...inserted.map((c) => c.trackId)]);
  for (const id of lockedOf(p)) all.delete(id);
  const opened = openSpace(p.clips, at, length, all);
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  return placeClips(followEnd(p.clips, opened, all, lockedOf(p), assets), inserted);
}

/** Clips that can stretch over a held frame: pictures with no clock of their own. */
const stretches = (c: Clip, asset: Asset | undefined): boolean =>
  !!c.annotation || !!c.zoomLayer || asset?.kind === "image";

/**
 * A picture across a held frame lasts `seconds` longer: its movement stays where it is at the
 * point while the frame holds, and goes on from there after it.
 */
function stretched(x: Clip, at: number, seconds: number): Clip {
  const local = at - x.start;
  const kfs = x.keyframes?.length
    ? [
        ...x.keyframes.filter((k) => k.t < local - EPS),
        { t: local, ...keyframeAt(x.keyframes, local) },
        { t: local + seconds, ...keyframeAt(x.keyframes, local) },
        ...x.keyframes.filter((k) => k.t > local + EPS).map((k) => ({ ...k, t: k.t + seconds })),
      ]
    : undefined;
  return {
    ...x,
    duration: x.duration + seconds,
    // A piece of a longer zoom layer keeps the way out at the same distance from its end.
    ...(x.zoomLayer?.length !== undefined
      ? { zoomLayer: { ...x.zoomLayer, length: x.zoomLayer.length + seconds } }
      : {}),
    ...(kfs ? { keyframes: kfs } : {}),
  };
}

/**
 * Extend frame opening the gap on every target track: the clip holds its picture for `seconds`
 * (extendFrame), everything after `at` on the targets moves along, a picture across `at`
 * (annotation, image, zoom layer) lasts longer, a video across it holds its own frame too when
 * `stills` has a picture for it (the presenter does not vanish), and other video or sound across
 * it is cut there with its second part after the gap. A music bed that played to the end follows
 * the new end.
 */
export function extendFrameAll(
  p: Lesson,
  id: string,
  at: number,
  seconds: number,
  stillAssetId: string,
  targets: ReadonlySet<string>,
  stills: ReadonlyMap<string, string> = new Map(),
): { clips: Clip[]; stillId: string } {
  const c = p.clips.find((x) => x.id === id);
  if (!c) throw new Error("Tempo de extensão inválido.");
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const locked = lockedOf(p);
  const own = extendFrame(p.clips, id, at, seconds, stillAssetId);
  const others = new Set([...targets].filter((t) => t !== c.trackId && !locked.has(t)));
  const opened = openSpace(own.clips, at, seconds, others, (x) => {
    if (stretches(x, assets.get(x.assetId))) return [stretched(x, at, seconds)];
    const still = stills.get(x.id);
    if (!still) return null;
    return [
      piece(x, x.start, at, { tail: false }),
      {
        id: `${own.stillId}-${x.id}`,
        assetId: still,
        trackId: x.trackId,
        start: at,
        in: 0,
        duration: seconds,
        volume: 0,
        transform: transformAt(x, at),
      },
      { ...piece(x, at, clipEnd(x), { head: false }), start: at + seconds },
    ];
  });
  return {
    clips: followEnd(p.clips, opened, new Set([...others, c.trackId]), locked, assets),
    stillId: own.stillId,
  };
}
