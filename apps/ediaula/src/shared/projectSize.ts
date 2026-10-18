import { type Drawing, thinPoints } from "./drawing.ts";
import type { Project } from "./types.ts";

/**
 * How big the lesson file may get. The editor reads at most PROJECT_LIMIT_BYTES of it (compact
 * JSON, main/projects.ts); what grows it the most is what the person drew on the screen during
 * the takes (Asset.drawing, lists of points). Each take keeps at most MAX_DRAWING_POINTS
 * (shared/drawing.ts); the lesson keeps at most PROJECT_DRAWING_POINTS in all, so many takes with
 * drawings still save. The autosave warns once the file passes NEAR_LIMIT of the limit.
 */

export const PROJECT_LIMIT_BYTES = 32 * 1024 ** 2;
/** Share of the limit past which the person is told the lesson is getting close to it. */
export const NEAR_LIMIT = 0.8;
/** Drawing points of all the takes together: about 15 MB of numbers in the file. */
export const PROJECT_DRAWING_POINTS = 600_000;

/** Points of every drawing of the lesson. */
export function drawingPoints(p: Pick<Project, "assets">): number {
  let total = 0;
  for (const a of p.assets) for (const s of a.drawing?.strokes ?? []) total += s.points.length;
  return total;
}

/**
 * A new take's drawing held to what the lesson has room for: every stroke thinned alike (never
 * below its two ends) when the drawings already there and this one pass PROJECT_DRAWING_POINTS.
 */
export function fitDrawing(
  p: Pick<Project, "assets">,
  d: Drawing,
): { drawing: Drawing; thinned: boolean } {
  const total = d.strokes.reduce((n, s) => n + s.points.length, 0);
  const room = Math.max(0, PROJECT_DRAWING_POINTS - drawingPoints(p));
  if (total <= room) return { drawing: d, thinned: false };
  const share = room / Math.max(1, total);
  return {
    drawing: {
      ...d,
      strokes: d.strokes.map((s) => ({
        ...s,
        points: thinPoints(s.points, Math.max(2, Math.floor(s.points.length * share))),
      })),
    },
    thinned: true,
  };
}

/** Bytes of a text written as UTF-8. */
export const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Whether the lesson's JSON text (as it is saved) is past NEAR_LIMIT of the limit. A UTF-8 text
 * takes at least one byte per character and at most three, so most texts are decided by their
 * length alone.
 */
export function nearSaveLimit(text: string): boolean {
  const near = NEAR_LIMIT * PROJECT_LIMIT_BYTES;
  if (text.length >= near) return true;
  if (text.length * 3 < near) return false;
  return utf8Bytes(text) >= near;
}
