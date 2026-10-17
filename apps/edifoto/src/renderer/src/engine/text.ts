import type { TextStyle } from "@shared/doc";

/**
 * Text layers are drawn with the 2D canvas into a tight image, then placed like any image layer.
 * Results are cached by style; a font that is not loaded yet is fetched and the layer redrawn.
 */

export interface TextImage {
  canvas: HTMLCanvasElement;
  key: string;
  version: number;
}

const cache = new Map<string, TextImage>();
const loading = new Set<string>();
let onFontLoaded: (() => void) | null = null;
let version = 1;

export function setFontLoadedListener(fn: () => void): void {
  onFontLoaded = fn;
}

export const fontString = (t: TextStyle, size = t.size): string =>
  `${t.italic ? "italic " : ""}${Math.round(t.weight)} ${size}px "${t.font}", "Inter Variable", sans-serif`;

const keyOf = (t: TextStyle): string =>
  JSON.stringify([
    t.content,
    t.font,
    t.size,
    t.weight,
    t.italic,
    t.color,
    t.align,
    t.lineHeight,
    t.letterSpacing,
  ]);

function ensureFont(t: TextStyle): void {
  const f = fontString(t, 32);
  if (document.fonts.check(f) || loading.has(f)) return;
  loading.add(f);
  void document.fonts.load(f).then(() => {
    loading.delete(f);
    for (const [k, v] of cache) if (k.includes(`"${t.font}"`)) cache.delete(v.key);
    onFontLoaded?.();
  });
}

export function renderText(t: TextStyle): TextImage {
  const key = keyOf(t);
  const hit = cache.get(key);
  if (hit) return hit;
  ensureFont(t);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = fontString(t);
  measure.letterSpacing = `${t.letterSpacing}px`;
  const lines = t.content.split("\n");
  const widths = lines.map((l) => measure.measureText(l || " ").width);
  const lineH = t.size * t.lineHeight;
  const pad = Math.ceil(t.size * 0.25);
  const w = Math.ceil(Math.max(1, ...widths)) + pad * 2;
  const h = Math.ceil(lineH * lines.length) + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(w, 16000);
  canvas.height = Math.min(h, 16000);
  const ctx = canvas.getContext("2d")!;
  ctx.font = fontString(t);
  ctx.letterSpacing = `${t.letterSpacing}px`;
  ctx.fillStyle = t.color;
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    const x =
      t.align === "left" ? pad : t.align === "right" ? w - pad - widths[i] : (w - widths[i]) / 2;
    ctx.fillText(line, x, pad + lineH * i + lineH / 2);
  });
  const img = { canvas, key, version: version++ };
  if (cache.size > 200) cache.clear();
  cache.set(key, img);
  return img;
}
