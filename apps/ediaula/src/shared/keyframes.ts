import { DEFAULT_TRANSFORM, type Transform } from "./compose.ts";
import type { Clip } from "./types.ts";
import { sliceByTime, smoothSteps } from "./zoom.ts";

/**
 * Free movement of a clip: positions and sizes marked at moments of the clip, with smooth
 * (ease in/out) travel between them. The preview evaluates transformAt(); the export evaluates
 * the same curves as ffmpeg expressions.
 */

export interface Keyframe {
  /** Seconds from the start of the clip (negative: before it, kept by a piece of a longer clip). */
  t: number;
  x: number;
  y: number;
  scale: number;
}

const smooth = (p: number): number => {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
};

/** Interpolated x, y and scale at clip-local time `local`. */
export function keyframeAt(kfs: Keyframe[], local: number): Pick<Keyframe, "x" | "y" | "scale"> {
  if (local <= kfs[0].t) return kfs[0];
  for (let i = 1; i < kfs.length; i++) {
    if (local < kfs[i].t) {
      const a = kfs[i - 1];
      const b = kfs[i];
      const k = smooth((local - a.t) / Math.max(1e-3, b.t - a.t));
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        scale: a.scale + (b.scale - a.scale) * k,
      };
    }
  }
  return kfs[kfs.length - 1];
}

/** The clip's transform at timeline time `t` (its keyframes, if any, override position and size). */
export function transformAt(
  clip: Pick<Clip, "transform" | "keyframes" | "start">,
  t: number,
): Transform {
  const base = clip.transform ?? DEFAULT_TRANSFORM;
  if (!clip.keyframes?.length) return base;
  return { ...base, ...keyframeAt(clip.keyframes, t - clip.start) };
}

const num = (v: number): string => (Math.round(v * 100000) / 100000).toString();

/**
 * ffmpeg expressions for the keyframed x, y and scale, `local` being clip-local seconds: a flat
 * sum of smooth steps (shared/zoom.ts smoothSteps), the same curve as keyframeAt. With `range`
 * (clip-local seconds), only the keyframes that shape it there are written.
 */
export function keyframeExprs(
  kfs: Keyframe[],
  local: string,
  range?: readonly [number, number],
): { x: string; y: string; scale: string } {
  const list = sliceByTime(kfs, range);
  const prop = (key: "x" | "y" | "scale"): string =>
    `(${smoothSteps(
      list.map((k) => ({ t: k.t, v: k[key] })),
      local,
      num,
    )})`;
  return { x: prop("x"), y: prop("y"), scale: prop("scale") };
}

/** Adds or replaces the keyframe at clip-local `local` (within 1/20 s), keeping them in order. */
export function upsertKeyframe(kfs: Keyframe[] | undefined, k: Keyframe): Keyframe[] {
  const rest = (kfs ?? []).filter((x) => Math.abs(x.t - k.t) > 0.05);
  return [...rest, k].sort((a, b) => a.t - b.t);
}
