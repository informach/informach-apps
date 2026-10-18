import type { VisibleStroke } from "@shared/drawing";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The highlighter is wider than the pen and lets the screen show through. */
const MARKER_WIDTH = 3;
const MARKER_ALPHA = 0.38;

/**
 * Paints strokes drawn on the screen (shared/drawing.ts drawingAt) over a frame of `width` ×
 * `height` placed at (`left`, `top`): the recorder window while drawing, and every frame of the
 * drawing's video, so what the teacher saw is what the lesson shows. The pen has a soft dark edge
 * that keeps a light color readable over a light screen; the highlighter is wide and translucent;
 * the arrow goes straight from where the stroke started to where it is, with a head.
 */
export function paintStrokes(
  ctx: Ctx,
  strokes: readonly VisibleStroke[],
  width: number,
  height: number,
  left = 0,
  top = 0,
): void {
  const k = height / 1080;
  const at = (p: [number, number]): [number, number] => [left + p[0] * width, top + p[1] * height];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const tool = s.tool ?? "pen";
    const line = Math.max(1, s.width * k * (tool === "marker" ? MARKER_WIDTH : 1));
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (tool === "marker") ctx.globalAlpha = MARKER_ALPHA;
    else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = Math.max(1, 2.5 * k);
    }
    const [x0, y0] = at(s.points[0]);
    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(x0, y0, line / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.lineWidth = line;
    if (tool === "arrow") {
      const [x1, y1] = at(s.points[s.points.length - 1]);
      const length = Math.hypot(x1 - x0, y1 - y0);
      const head = Math.min(length * 0.6, Math.max(10 * k, line * 4));
      const angle = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(angle) * head * 0.5, y1 - Math.sin(angle) * head * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(angle - 0.45) * head, y1 - Math.sin(angle - 0.45) * head);
      ctx.lineTo(x1 - Math.cos(angle + 0.45) * head, y1 - Math.sin(angle + 0.45) * head);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < s.points.length; i++) {
      const [x, y] = at(s.points[i]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** The board over the frame (`width` × `height` at `left`, `top`), in its solid color. */
export function paintBoard(
  ctx: Ctx,
  color: string,
  width: number,
  height: number,
  left = 0,
  top = 0,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}
