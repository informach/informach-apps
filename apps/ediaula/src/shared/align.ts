/**
 * Aligning and spacing what is on screen: pure geometry over the boxes of the clips (frame
 * pixels, x/y = top left corner), as the box of what each one draws (an annotation without its
 * picture's transparent margin). Each result is how far each box moves; renderer/src/lib/align.ts
 * measures the boxes and moves the clips.
 */
import { DEFAULT_TRANSFORM } from "./compose.ts";
import type { Clip, ProjectSettings } from "./types.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Shift {
  dx: number;
  dy: number;
}
export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

export const ALIGN_EDGES: readonly AlignEdge[] = [
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
];

/** The box around all of them. */
export function unionBox(boxes: readonly Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Each box lined up on one edge (or center line) of `reference`: the selection's box to line
 * them up with each other, the frame to put them on its edge. Only that axis moves.
 */
export function alignShifts(boxes: readonly Box[], edge: AlignEdge, reference: Box): Shift[] {
  const r = reference;
  const line: Record<AlignEdge, (b: Box) => Shift> = {
    left: (b) => ({ dx: r.x - b.x, dy: 0 }),
    center: (b) => ({ dx: r.x + r.w / 2 - (b.x + b.w / 2), dy: 0 }),
    right: (b) => ({ dx: r.x + r.w - (b.x + b.w), dy: 0 }),
    top: (b) => ({ dx: 0, dy: r.y - b.y }),
    middle: (b) => ({ dx: 0, dy: r.y + r.h / 2 - (b.y + b.h / 2) }),
    bottom: (b) => ({ dx: 0, dy: r.y + r.h - (b.y + b.h) }),
  };
  return boxes.map(line[edge]);
}

/**
 * The same space between neighbours along an axis, in their order on screen (by their start
 * edge, then their center). Without `gap`, the first and the last stay and the space between
 * them is shared equally (it needs three or more). With `gap` (pixels), the first stays and
 * each next one starts `gap` after the end of the one before (two or more).
 */
export function distributeShifts(boxes: readonly Box[], axis: Axis, gap?: number): Shift[] {
  const shifts: Shift[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  const minimum = gap === undefined ? 3 : 2;
  if (boxes.length < minimum) return shifts;
  const start = (b: Box) => (axis === "horizontal" ? b.x : b.y);
  const size = (b: Box) => (axis === "horizontal" ? b.w : b.h);
  const order = boxes
    .map((_box, i) => i)
    .sort((a, b) => {
      const A = boxes[a];
      const B = boxes[b];
      return start(A) - start(B) || start(A) + size(A) / 2 - (start(B) + size(B) / 2);
    });
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const space =
    gap ??
    (start(last) + size(last) - start(first) - order.reduce((s, i) => s + size(boxes[i]), 0)) /
      (order.length - 1);
  let cursor = start(first);
  for (const i of order) {
    const move = cursor - start(boxes[i]);
    shifts[i] = axis === "horizontal" ? { dx: move, dy: 0 } : { dx: 0, dy: move };
    cursor += size(boxes[i]) + space;
  }
  return shifts;
}

/** The space between neighbours along an axis today, rounded (null when they differ or overlap). */
export function currentGap(boxes: readonly Box[], axis: Axis): number | null {
  if (boxes.length < 2) return null;
  const start = (b: Box) => (axis === "horizontal" ? b.x : b.y);
  const end = (b: Box) => start(b) + (axis === "horizontal" ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => start(a) - start(b));
  const gaps = sorted.slice(1).map((b, i) => Math.round(start(b) - end(sorted[i])));
  return gaps.every((g) => g === gaps[0]) && gaps[0] >= 0 ? gaps[0] : null;
}

/**
 * A clip moved by (dx, dy) frame pixels: its center and, when it travels, every keyframe of the
 * travel with it (the whole movement shifts, as Editar texto keeps it). Size and the rest stay.
 */
export function moveClipBy(
  clip: Clip,
  shift: Shift,
  frame: Pick<ProjectSettings, "width" | "height">,
): Clip {
  const dx = shift.dx / frame.width;
  const dy = shift.dy / frame.height;
  if (!dx && !dy) return clip;
  const t = clip.transform ?? DEFAULT_TRANSFORM;
  return {
    ...clip,
    transform: { ...t, x: t.x + dx, y: t.y + dy },
    ...(clip.keyframes?.length
      ? { keyframes: clip.keyframes.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy })) }
      : {}),
  };
}
