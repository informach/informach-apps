import { clipEnd, newId, sourceAt } from "./clipTime.ts";
import { shiftGain } from "./gain.ts";
import type { Clip } from "./types.ts";
import { layerCurve, type ZoomLayer } from "./zoomLayer.ts";

/**
 * Every operation that cuts a clip (split, overwrite, trim, extend frame, text cuts) makes its
 * pieces here, so each piece plays the same footage at the same moments as the original clip:
 * the movement keeps every keyframe (moved to the piece's own clock, so trimming back out
 * brings the movement back), the zoom layer keeps its curve, and entrances and exits stay on
 * the outer edges only. Zooms belong to the media (shared/zoom.ts), so pieces carry none.
 */

const EPS = 1e-6;

export interface PieceOptions {
  /**
   * The piece's start edge. true: it is still the clip's own start, moved by a trim or by
   * cutting away the head (the entrance and the id stay); false: the piece starts where the
   * clip was cut in two (no entrance). Default: only a piece starting where the clip starts.
   */
  head?: boolean;
  /** The same for the end edge and the exit. */
  tail?: boolean;
}

/** Copies only the defined values, so pieces don't grow keys set to undefined. */
function assignDefined(target: Clip, values: Partial<Clip>): void {
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) Object.assign(target, { [key]: value });
}

/**
 * A zoom layer piece plays its stretch of the original curve (ZoomLayer.origin): the way in and
 * out keep their length and timing however short the piece is. An outer edge that moved (a
 * trim, a cut head or tail) carries the curve's edge along, like a fade.
 */
function layerPiece(
  c: Clip,
  z: ZoomLayer,
  from: number,
  to: number,
  head: boolean,
  tail: boolean,
): ZoomLayer {
  const curve = layerCurve(c);
  const curveEnd = curve.start + curve.duration;
  const start = head ? from - (c.start - curve.start) : curve.start;
  const end = tail ? to + (curveEnd - clipEnd(c)) : curveEnd;
  const { origin: _origin, length: _length, ...rest } = z;
  const origin = from - start;
  const length = end - start;
  return Math.abs(origin) <= EPS && Math.abs(length - (to - from)) <= EPS
    ? rest
    : { ...rest, origin, length };
}

/** The stretch [from, to) of a clip, in timeline seconds, as a clip of its own. */
export function piece(c: Clip, from: number, to: number, opts: PieceOptions = {}): Clip {
  const {
    fadeIn,
    enter,
    transition,
    fadeOut,
    exit,
    keyframes,
    zoomLayer,
    gain,
    timelapse,
    ...rest
  } = c;
  const head = opts.head ?? Math.abs(from - c.start) <= EPS;
  const tail = opts.tail ?? Math.abs(to - clipEnd(c)) <= EPS;
  // "Tela sem voz" is about the whole stretch: a piece of it is a plain sped-up clip.
  const whole = Math.abs(from - c.start) <= EPS && Math.abs(to - clipEnd(c)) <= EPS;
  const out: Clip = {
    ...rest,
    ...(timelapse && whole ? { timelapse } : {}),
    // The original id stays with the piece holding the clip's start (or its moved start).
    id: from <= c.start + EPS || opts.head === true ? c.id : newId("c"),
    start: from,
    in: sourceAt(c, from),
    duration: to - from,
  };
  if (head) assignDefined(out, { fadeIn, enter, transition });
  if (tail) assignDefined(out, { fadeOut, exit });
  // Keyframes are seconds from the clip's start: the same moments, on the piece's clock.
  if (keyframes?.length)
    out.keyframes = keyframes.map((k) => ({ ...k, t: k.t - (from - c.start) }));
  // The volume envelope too, every point kept, so trimming back out brings it back.
  if (gain?.length) out.gain = shiftGain(gain, from - c.start);
  if (zoomLayer) out.zoomLayer = layerPiece(c, zoomLayer, from, to, head, tail);
  return out;
}
