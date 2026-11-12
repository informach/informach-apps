/**
 * The preview's rulers and the guides pulled from them (editor/Rulers.tsx). Guides are kept in the
 * lesson as shares of the frame (Project.guides), so they stay put when the preview zooms and
 * when the lesson changes format; the rulers count frame pixels.
 */

export type GuideAxis = "x" | "y";
export interface GuideSet {
  x: number[];
  y: number[];
}

export const NO_GUIDES: GuideSet = { x: [], y: [] };
/** At most this many guides each way (as the project file allows). */
export const MAX_GUIDES = 200;

/**
 * The frame pixels between numbered ticks of a ruler at `scale` screen pixels per frame pixel:
 * 1, 2 or 5 × 10ⁿ, at least 50 screen pixels apart, with four small ticks between them. The same
 * steps as EdiSVG's rulers (apps/edisvg/src/renderer/src/rulers.ts), so both read alike.
 */
export function rulerStep(scale: number): number {
  const target = 50 / Math.max(1e-6, Math.abs(scale));
  const power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= target) ?? target;
}

/**
 * The guides after one gesture: a new guide (`index` null) or one moved (`index`) to `value`,
 * or taken away (`value` null: dropped off the frame). A guide landing on another one (within
 * half a frame pixel) is the same guide.
 */
export function placeGuide(
  guides: GuideSet,
  axis: GuideAxis,
  index: number | null,
  value: number | null,
  framePixels: number,
): GuideSet {
  const list = guides[axis].filter((_, i) => i !== index);
  const kept =
    value === null || value < 0 || value > 1
      ? list
      : list.some((g) => Math.abs(g - value) * framePixels < 0.5)
        ? list
        : [...list, value].slice(-MAX_GUIDES);
  return { ...guides, [axis]: kept };
}

/** `v` moved onto the nearest of `targets` within `threshold` (same units), and that target. */
export function snapGuide(
  v: number,
  targets: readonly number[],
  threshold: number,
): { value: number; target: number | null } {
  let best: number | null = null;
  for (const t of targets)
    if (Math.abs(t - v) < threshold && (best === null || Math.abs(t - v) < Math.abs(best - v)))
      best = t;
  return { value: best ?? v, target: best };
}
