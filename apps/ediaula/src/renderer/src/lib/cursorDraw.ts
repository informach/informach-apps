import type { CursorFx, CursorState, Ripple } from "@shared/cursor";

/**
 * Draws the pointer, its halo and click rings. Used by the preview (live, over the video) and to
 * pre-render the pointer video for the export, so both look the same.
 * Shapes are in "pointer units": the standard arrow is ~24 units tall; `scale` = pixels per unit.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Paths with the hotspot at (0, 0).
const ARROW = new Path2D("M0 0 L0 20.5 L4.8 15.9 L8.2 23.6 L11.6 22.1 L8.3 14.6 L14.8 14.6 Z");
const HAND = new Path2D(
  "M-1 1.2 C-1 -0.6 2 -0.6 2 1.2 L2 9 L2.6 9 L2.6 7.7 C2.6 6.2 5.3 6.2 5.3 7.7 L5.3 9.4 L5.9 9.4 L5.9 8.6 C5.9 7.1 8.6 7.1 8.6 8.6 L8.6 10.1 L9.2 10.1 C9.2 8.8 11.8 8.8 11.8 10.1 L11.8 15.6 C11.8 19.6 9.6 22.2 6.2 22.2 L4 22.2 C1.9 22.2 0.4 21.2 -0.8 19.5 L-4.6 14 C-5.5 12.7 -3.9 11.1 -2.5 12.1 L-1 13.6 Z",
);
const TEXT_SEGMENTS: [number, number, number, number][] = [
  [-3.4, -10, 3.4, -10],
  [0, -10, 0, 10],
  [-3.4, 10, 3.4, 10],
];

export function drawPointer(
  ctx: Ctx,
  state: CursorState,
  x: number,
  y: number,
  scale: number,
  fx: CursorFx,
): void {
  if (fx.hidden || state.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = state.alpha;
  if (fx.halo) {
    const r = 22 * scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255, 226, 64, 0.55)");
    g.addColorStop(0.6, "rgba(255, 226, 64, 0.28)");
    g.addColorStop(1, "rgba(255, 226, 64, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.shape !== "hidden") {
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 3 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (state.shape === "text") {
      for (const [w, color] of [
        [3.2, "#111"],
        [1.3, "#fff"],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const [a, b, c, d] of TEXT_SEGMENTS) {
          ctx.moveTo(a, b);
          ctx.lineTo(c, d);
        }
        ctx.stroke();
        ctx.shadowColor = "transparent";
      }
    } else {
      const path = state.shape === "hand" ? HAND : ARROW;
      ctx.fillStyle = "#fff";
      ctx.fill(path);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.3;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

export function drawRipples(
  ctx: Ctx,
  ripples: Ripple[],
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  for (const r of ripples) {
    const p = r.progress;
    const ease = 1 - (1 - p) ** 3;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = r.button === 1 ? "#9b7bff" : "#c8f031";
    ctx.lineWidth = (3.2 * (1 - p) + 1) * scale;
    ctx.beginPath();
    ctx.arc(r.x + offsetX, r.y + offsetY, (5 + 28 * ease) * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = r.button === 1 ? "rgba(155, 123, 255, 0.25)" : "rgba(200, 240, 49, 0.25)";
    ctx.globalAlpha = Math.max(0, 1 - p * 2);
    ctx.beginPath();
    ctx.arc(r.x + offsetX, r.y + offsetY, (5 + 14 * ease) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
