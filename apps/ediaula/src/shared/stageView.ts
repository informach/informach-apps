/**
 * The zoom and pan of a picture inside its frame, as a dialog shows it (the cursor path editor):
 * the picture is scaled by `zoom` from its top-left corner and moved by `x`, `y`, all measured
 * in fractions of the frame, so the same view holds at any size of the window.
 */
export interface StageView {
  zoom: number;
  x: number;
  y: number;
}

export const STAGE_VIEW_MAX = 8;
export const WHOLE_VIEW: StageView = { zoom: 1, x: 0, y: 0 };

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The view kept inside the frame: zoom between 1 and the max, and no empty border showing. */
export function clampStageView(v: StageView): StageView {
  const zoom = clamp(v.zoom, 1, STAGE_VIEW_MAX);
  if (zoom === 1) return WHOLE_VIEW;
  return { zoom, x: clamp(v.x, 1 - zoom, 0), y: clamp(v.y, 1 - zoom, 0) };
}

/** The view zoomed by `factor` around the point (`fx`, `fy`) of the frame, which stays still. */
export function zoomStageView(v: StageView, factor: number, fx: number, fy: number): StageView {
  const zoom = clamp(v.zoom * factor, 1, STAGE_VIEW_MAX);
  const u = (fx - v.x) / v.zoom;
  const w = (fy - v.y) / v.zoom;
  return clampStageView({ zoom, x: fx - u * zoom, y: fy - w * zoom });
}

/** The view moved by (`dx`, `dy`) fractions of the frame, as a hand drags the picture. */
export function panStageView(v: StageView, dx: number, dy: number): StageView {
  return clampStageView({ zoom: v.zoom, x: v.x + dx, y: v.y + dy });
}

/**
 * The view that shows the point (`u`, `w`) of the picture (fractions of it): unchanged when the
 * point is already on screen, away from the edges by `margin`; centered on it otherwise.
 */
export function stageViewShowing(v: StageView, u: number, w: number, margin = 0.08): StageView {
  if (v.zoom === 1) return v;
  const sx = v.x + u * v.zoom;
  const sy = v.y + w * v.zoom;
  if (sx >= margin && sx <= 1 - margin && sy >= margin && sy <= 1 - margin) return v;
  return clampStageView({ zoom: v.zoom, x: 0.5 - u * v.zoom, y: 0.5 - w * v.zoom });
}

/** A wheel's turn as a zoom factor: one notch of a mouse (100) is 20 %, a trackpad's steps less. */
export function wheelZoomFactor(deltaY: number): number {
  return 1.2 ** clamp(-deltaY / 100, -3, 3);
}
