import { type MaskShape, shapeAlpha } from "@shared/compose";

/** Pictures already made, by shape and size (the preview asks again on every render). */
const made = new Map<string, string>();
const KEEP = 64;
/** Longest side drawn; the picture is stretched to the layer (a soft edge needs no more). */
const MOST = 1024;

/**
 * The soft-edged shape as a picture for the CSS mask of a layer `w` × `h` stage pixels big:
 * white where the clip shows, fading out toward the edge exactly as the export's mask does
 * (shared/compose.ts shapeAlpha, the formula of export/fx.ts). `shape` is in stage pixels.
 */
export function softMaskUrl(shape: MaskShape, w: number, h: number): string {
  const k = Math.min(1, MOST / Math.max(w, h, 1));
  const cw = Math.max(1, Math.round(w * k));
  const ch = Math.max(1, Math.round(h * k));
  const scaled: MaskShape = {
    ellipse: shape.ellipse,
    radius: shape.radius * k,
    feather: shape.feather * k,
  };
  const key = `${cw}x${ch}:${scaled.ellipse ? "e" : `r${scaled.radius.toFixed(1)}`}:f${scaled.feather.toFixed(1)}`;
  const known = made.get(key);
  if (known) return known;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * shapeAlpha(scaled, cw, ch, x + 0.5, y + 0.5));
    }
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (made.size >= KEEP) made.delete(made.keys().next().value as string);
  made.set(key, url);
  return url;
}
