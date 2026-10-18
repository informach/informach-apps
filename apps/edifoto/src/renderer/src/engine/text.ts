import type { TextStyle } from "@shared/doc";
import { validateDimensions } from "@shared/documentFormat";

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
    t.maxWidth,
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
  const lines: string[] = [];
  for (const paragraph of t.content.split("\n")) {
    if (!t.maxWidth) {
      lines.push(paragraph);
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure.measureText(next).width > t.maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
      // Long unbroken strings wrap by grapheme instead of clipping silently.
      if (measure.measureText(line).width > t.maxWidth) {
        let part = "";
        for (const char of Array.from(line)) {
          if (part && measure.measureText(part + char).width > t.maxWidth) {
            lines.push(part);
            part = char;
          } else part += char;
        }
        line = part;
      }
    }
    lines.push(line);
  }
  const widths = lines.map((l) => measure.measureText(l || " ").width);
  const lineH = t.size * t.lineHeight;
  const pad = Math.ceil(t.size * 0.25);
  const w = Math.ceil(Math.max(1, t.maxWidth ?? 0, ...widths)) + pad * 2;
  const h = Math.ceil(lineH * lines.length) + pad * 2;
  validateDimensions(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
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
  let cachedPixels = w * h;
  for (const entry of cache.values()) cachedPixels += entry.canvas.width * entry.canvas.height;
  if (cache.size > 100 || cachedPixels > 32_000_000) cache.clear();
  cache.set(key, img);
  return img;
}
