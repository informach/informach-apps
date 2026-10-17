import type { Doc, VectorLayer } from "@shared/doc";
import { shapePath } from "@shared/vector";

const cache = new Map<string, { key: string; canvas: HTMLCanvasElement; version: number }>();
let version = 1;

/** Document-space rasterization keeps strokes and Bézier handles outside the nominal bounds. */
export function drawVector(
  ctx: CanvasRenderingContext2D,
  layer: VectorLayer,
  silhouette = false,
): void {
  const v = layer.vector,
    t = layer.transform,
    path = new Path2D(shapePath(v));
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale * (t.flipX ? -1 : 1), t.scale * (t.flipY ? -1 : 1));
  ctx.translate(-v.width / 2, -v.height / 2);
  if (silhouette || v.fillColor) {
    ctx.fillStyle = silhouette ? "#ffffff" : v.fillColor!;
    ctx.globalAlpha = silhouette ? 1 : (v.fillOpacity ?? 1);
    if (v.closed && v.shape !== "line") ctx.fill(path);
    ctx.globalAlpha = 1;
  }
  if (!silhouette && v.strokeColor && v.strokeWidth > 0) {
    ctx.strokeStyle = v.strokeColor;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const closed = v.closed && v.shape !== "line";
    ctx.lineWidth = v.strokeWidth * (closed && v.strokeAlign !== "center" ? 2 : 1);
    if (closed && v.strokeAlign === "inside") ctx.clip(path);
    if (closed && v.strokeAlign === "outside") {
      const inverse = new Path2D();
      inverse.rect(-100000, -100000, 200000, 200000);
      inverse.addPath(path);
      ctx.clip(inverse, "evenodd");
    }
    ctx.stroke(path);
  }
  ctx.restore();
}

export function renderVector(
  layer: VectorLayer,
  doc: Pick<Doc, "width" | "height">,
): { canvas: HTMLCanvasElement; version: number } {
  const key = JSON.stringify([layer.vector, layer.transform, doc.width, doc.height]);
  const found = cache.get(layer.id);
  if (found?.key === key) return found;
  const canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  drawVector(canvas.getContext("2d")!, layer);
  const result = { key, canvas, version: version++ };
  cache.set(layer.id, result);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return result;
}
