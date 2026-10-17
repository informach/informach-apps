import { clipEnd, newId, sourceAt, sourceEnd } from "./clipTime.ts";
import type { Keyframe } from "./keyframes.ts";
import type { Clip, Project } from "./types.ts";
import type { Zoom } from "./zoom.ts";
import type { ZoomLayer } from "./zoomLayer.ts";

/**
 * Every operation that cuts a clip (split, overwrite, trim, extend frame, text cuts) makes its
 * pieces here, so each piece plays the same footage at the same moments as the original clip:
 * the movement curve, the zooms and the zoom layer's view stay where they were, entrances and
 * exits stay on the outer edges only, and the pieces never carry data they cannot show.
 */

const EPS = 1e-6;

export interface PieceOptions {
  /**
   * The piece's start edge. true: it is the clip's own start, moved by a trim (the entrance and
   * the id stay); false: something else now comes first (no entrance). Default: only a piece
   * starting where the clip starts keeps the entrance.
   */
  head?: boolean;
  /** The same for the end edge and the exit. */
  tail?: boolean;
  /** Zooms of every clip of the same media (zoomBankOf): a piece made longer gets back the ones it now covers. */
  zoomBank?: Zoom[];
}

/** Copies only the defined values, so pieces don't grow keys set to undefined. */
function assignDefined(target: Clip, values: Partial<Clip>): void {
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) Object.assign(target, { [key]: value });
}

/**
 * Keyframes moved to a piece that starts `offset` seconds into the clip and lasts `duration`:
 * the last one at or before its start, the ones inside it and the first one at or after its end,
 * which is all keyframeAt() reads there, so the movement is identical.
 */
export function bracketKeyframes(kfs: Keyframe[], offset: number, duration: number): Keyframe[] {
  const moved = [...kfs].sort((a, b) => a.t - b.t).map((k) => ({ ...k, t: k.t - offset }));
  let first = 0;
  for (let i = 0; i < moved.length; i++) if (moved[i].t <= 0) first = i;
  let last = moved.length - 1;
  for (let i = moved.length - 1; i >= 0; i--) if (moved[i].t >= duration) last = i;
  return moved.slice(first, last + 1);
}

/** Zooms that act on the source stretch [from, to): a zoom's envelope is zero outside [start, end]. */
export const zoomsWithin = (zooms: Zoom[], from: number, to: number): Zoom[] =>
  zooms.filter((z) => z.end > from && z.start < to);

function unionById(a: Zoom[], b: Zoom[]): Zoom[] {
  const out = new Map(a.map((z) => [z.id, z]));
  for (const z of b) if (!out.has(z.id)) out.set(z.id, z);
  return [...out.values()].sort((x, y) => x.start - y.start);
}

/** Every zoom the clips of a media carry, joined by id: what a longer piece can get back. */
export function zoomBankOf(project: Pick<Project, "clips">, assetId: string): Zoom[] {
  let bank: Zoom[] = [];
  for (const c of project.clips)
    if (c.assetId === assetId && c.zooms?.length) bank = unionById(bank, c.zooms);
  return bank;
}

/**
 * A zoom layer cut in two keeps its view across the cut: the left piece stays zoomed until it
 * ends and the right one starts at that same view (zoomLayer.ts), so nothing jumps or zooms out
 * and back in. The outer edges keep their way in and out.
 */
const layerPiece = (z: ZoomLayer, head: boolean, tail: boolean): ZoomLayer => ({
  ...z,
  ...(head ? {} : { zoomIn: false }),
  ...(tail ? {} : { zoomOut: false }),
});

/** The stretch [from, to) of a clip, in timeline seconds, as a clip of its own. */
export function piece(c: Clip, from: number, to: number, opts: PieceOptions = {}): Clip {
  const { fadeIn, enter, transition, fadeOut, exit, keyframes, zooms, zoomLayer, ...rest } = c;
  const head = opts.head ?? Math.abs(from - c.start) <= EPS;
  const tail = opts.tail ?? Math.abs(to - clipEnd(c)) <= EPS;
  const out: Clip = {
    ...rest,
    // The original id stays with the piece holding the clip's start (or its trimmed start).
    id: from <= c.start + EPS || opts.head === true ? c.id : newId("c"),
    start: from,
    in: sourceAt(c, from),
    duration: to - from,
  };
  if (head) assignDefined(out, { fadeIn, enter, transition });
  if (tail) assignDefined(out, { fadeOut, exit });
  if (keyframes?.length) out.keyframes = bracketKeyframes(keyframes, from - c.start, to - from);
  const pool = opts.zoomBank ? unionById(zooms ?? [], opts.zoomBank) : (zooms ?? []);
  const kept = zoomsWithin(pool, out.in, sourceEnd(out));
  if (kept.length) out.zooms = kept;
  if (zoomLayer) out.zoomLayer = layerPiece(zoomLayer, head, tail);
  return out;
}
