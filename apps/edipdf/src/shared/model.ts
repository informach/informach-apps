/**
 * Editable document model.
 *
 * A document is an ordered list of page references into one or more source PDFs plus overlay
 * annotations. Nothing touches the source bytes until save, when `buildPdf` assembles the output.
 *
 * All annotation geometry is in "view space": PDF points, origin at the top-left of the page as it
 * is displayed (after the page's own /Rotate and the user's rotation), y pointing down.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageRef {
  id: string;
  /** Source id; empty for a blank page. */
  src: string;
  /** Page index inside the source. */
  index: number;
  /** Extra clockwise rotation applied by the user. */
  rotation: Rotation;
  /** Size of a blank page in points (unrotated). */
  blank?: { w: number; h: number };
}

/** Static facts about a source page, read once when the source is loaded. */
export interface SourcePageInfo {
  /** Unrotated crop box size in points. */
  w: number;
  h: number;
  /** The page's own /Rotate. */
  rotate: Rotation;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FontKey = "helvetica" | "times" | "courier";

interface Base {
  id: string;
  /** PageRef id. */
  page: string;
  opacity?: number;
  locked?: boolean;
  group?: string;
}

export interface TextAnnot extends Base {
  kind: "text";
  x: number;
  /** Top of the first line. */
  y: number;
  text: string;
  font: FontKey;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
}

/** One editable fixed frame; wrapping/alignment are evaluated from its embedded font metrics. */
export interface ParagraphAnnot extends Base, Box {
  kind: "paragraph";
  text: string;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align: "left" | "center" | "right" | "justify";
  spacing: number;
  padding: number;
  list: "none" | "bullet" | "numbered";
  fontData?: { name: string; data: string };
}

export interface ShapeAnnot extends Base, Box {
  kind: "rect" | "ellipse";
  stroke: string | null;
  fill: string | null;
  width: number;
}

export interface LineAnnot extends Base {
  kind: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  width: number;
}

export interface InkAnnot extends Base {
  kind: "ink";
  /** Each stroke is a flat [x0, y0, x1, y1, …] list. */
  paths: number[][];
  stroke: string;
  width: number;
  signature?: boolean;
}

export interface MarkupAnnot extends Base {
  kind: "highlight" | "underline" | "strike";
  rects: Box[];
  color: string;
}

export interface ImageAnnot extends Base, Box {
  kind: "image";
  /** PNG or JPEG data URL. */
  src: string;
  signature?: boolean;
}

export interface NoteAnnot extends Base {
  kind: "note";
  x: number;
  y: number;
  text: string;
  color: string;
  resolved?: boolean;
  author?: string;
}

export type Annot =
  | TextAnnot
  | ParagraphAnnot
  | ShapeAnnot
  | LineAnnot
  | InkAnnot
  | MarkupAnnot
  | ImageAnnot
  | NoteAnnot;
export type AnnotKind = Annot["kind"];

export interface Watermark {
  text: string;
  size: number;
  color: string;
  opacity: number;
  /** Degrees counter-clockwise. */
  angle: number;
  position?: NumberPosition | "center" | "middle-left" | "middle-right";
  marginX?: number;
  marginY?: number;
  fit?: boolean;
  scope?: DecorationScope;
}

export interface DecorationScope {
  /** Absent means all pages, including pages inserted later. IDs remain stable when reordered. */
  pages?: string[];
  except?: string[];
}
export type NumberStyle = "decimal" | "roman-lower" | "roman-upper" | "letters-lower" | "letters-upper";
export interface PageNumberEntry {
  format: string;
  position: NumberPosition;
  size?: number;
  color?: string;
}

export type NumberPosition =
  | "bottom-center"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "top-right"
  | "top-left";

export interface PageNumbers {
  /** `{n}` is the page number, `{total}` the page count. */
  format: string;
  position: NumberPosition;
  size: number;
  color: string;
  start: number;
  marginX?: number;
  marginY?: number;
  scope?: DecorationScope;
  countMode?: "physical" | "applied";
  style?: NumberStyle;
  padding?: number;
  additional?: PageNumberEntry[];
  writePageLabels?: boolean;
}

export interface DocMeta {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export type FormValue = string | boolean | string[];

/** Everything undo/redo restores. */
export interface DocContent {
  /** Base for a structural revision; participates in undo/redo with its page references. */
  baseSource?: string;
  requiresCopy?: boolean;
  pages: PageRef[];
  annots: Annot[];
  watermark: Watermark | null;
  pageNumbers: PageNumbers | null;
  meta: DocMeta;
  forms: Record<string, FormValue>;
}

export const NOTE_SIZE = 22;

/** Baseline position from the top of a line box, as a fraction of the font size (line-height 1.2). */
export const BASELINE: Record<FontKey, number> = {
  helvetica: 0.9465,
  times: 0.9375,
  courier: 0.8665,
};
export const LINE_HEIGHT = 1.2;

export const CSS_FONT: Record<FontKey, string> = {
  helvetica: "Arial, Helvetica, sans-serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
};

let counter = 0;
export const uid = (prefix = "id"): string =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Total clockwise rotation of a page as displayed. */
export function totalRotation(ref: PageRef, info: SourcePageInfo | undefined): Rotation {
  return (((info?.rotate ?? 0) + ref.rotation) % 360) as Rotation;
}

/** Page size in view space (points). */
export function viewSize(ref: PageRef, info: SourcePageInfo | undefined): { w: number; h: number } {
  const w = ref.blank?.w ?? info?.w ?? 612;
  const h = ref.blank?.h ?? info?.h ?? 792;
  return totalRotation(ref, info) % 180 === 0 ? { w, h } : { w: h, h: w };
}

/**
 * Maps a view-space point to PDF user space for a page whose crop box starts at (x0, y0) with
 * unrotated size (w, h), displayed with clockwise rotation `r`.
 */
export function viewToPdf(
  r: Rotation,
  crop: { x: number; y: number; w: number; h: number },
  vx: number,
  vy: number,
): [number, number] {
  const { x: x0, y: y0, w, h } = crop;
  switch (r) {
    case 0:
      return [x0 + vx, y0 + h - vy];
    case 90:
      return [x0 + vy, y0 + vx];
    case 180:
      return [x0 + w - vx, y0 + vy];
    case 270:
      return [x0 + w - vy, y0 + h - vx];
  }
}

export function pdfToView(
  r: Rotation,
  crop: { x: number; y: number; w: number; h: number },
  px: number,
  py: number,
): [number, number] {
  const x = px - crop.x,
    y = py - crop.y;
  switch (r) {
    case 0:
      return [x, crop.h - y];
    case 90:
      return [y, x];
    case 180:
      return [crop.w - x, y];
    case 270:
      return [crop.h - y, crop.w - x];
  }
}

/** Rotates a view-space point by 90° clockwise steps on a page of view size (W, H). */
function rotatePoint(x: number, y: number, W: number, H: number, steps: number): [number, number] {
  let px = x;
  let py = y;
  let w = W;
  let h = H;
  for (let i = 0; i < steps; i++) {
    [px, py] = [h - py, px];
    [w, h] = [h, w];
  }
  return [px, py];
}

function rotateBox(b: Box, W: number, H: number, steps: number): Box {
  const [ax, ay] = rotatePoint(b.x, b.y, W, H, steps);
  const [bx, by] = rotatePoint(b.x + b.w, b.y + b.h, W, H, steps);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/**
 * Keeps an annotation attached to its spot when its page is rotated clockwise by `delta` degrees.
 * Geometry (shapes, ink, markup) turns with the page; text, images and notes keep their upright
 * orientation and size and only move with their centre.
 */
export function rotateAnnot(
  a: Annot,
  W: number,
  H: number,
  delta: number,
  size?: { w: number; h: number },
): Annot {
  const steps = (((delta / 90) % 4) + 4) % 4;
  if (!steps) return a;
  const moveCenter = (x: number, y: number, w: number, h: number): { x: number; y: number } => {
    const [cx, cy] = rotatePoint(x + w / 2, y + h / 2, W, H, steps);
    return { x: cx - w / 2, y: cy - h / 2 };
  };
  switch (a.kind) {
    case "rect":
    case "ellipse":
      return { ...a, ...rotateBox(a, W, H, steps) };
    case "image":
    case "paragraph":
      return { ...a, ...moveCenter(a.x, a.y, a.w, a.h) };
    case "text": {
      const s = size ?? { w: 0, h: 0 };
      return { ...a, ...moveCenter(a.x, a.y, s.w, s.h) };
    }
    case "note":
      return { ...a, ...moveCenter(a.x, a.y, NOTE_SIZE, NOTE_SIZE) };
    case "line":
    case "arrow": {
      const [x1, y1] = rotatePoint(a.x1, a.y1, W, H, steps);
      const [x2, y2] = rotatePoint(a.x2, a.y2, W, H, steps);
      return { ...a, x1, y1, x2, y2 };
    }
    case "ink":
      return {
        ...a,
        paths: a.paths.map((p) => {
          const out: number[] = [];
          for (let i = 0; i < p.length; i += 2) {
            const x = p[i],
              y = p[i + 1];
            if (x === undefined || y === undefined)
              throw new Error("Traçado contém um ponto incompleto.");
            out.push(...rotatePoint(x, y, W, H, steps));
          }
          return out;
        }),
      };
    case "highlight":
    case "underline":
    case "strike":
      return { ...a, rects: a.rects.map((r) => rotateBox(r, W, H, steps)) };
  }
}

/** Splits text into lines the same way the overlay and the saved PDF both lay it out. */
export const textLines = (text: string): string[] => text.replace(/\r/g, "").split("\n");

export function sameText(a: TextAnnot, b: TextAnnot): boolean {
  return (
    a.text === b.text &&
    a.font === b.font &&
    a.size === b.size &&
    a.color === b.color &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    a.x === b.x &&
    a.y === b.y &&
    a.opacity === b.opacity
  );
}

/** Bounding box of an annotation in view space; text needs its measured size. */
export function annotBounds(a: Annot, textSize?: { w: number; h: number }): Box {
  switch (a.kind) {
    case "rect":
    case "ellipse":
    case "image":
    case "paragraph":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "text":
      return {
        x: a.x,
        y: a.y,
        w: textSize?.w ?? a.size * 4,
        h: textSize?.h ?? a.size * LINE_HEIGHT * textLines(a.text).length,
      };
    case "note":
      return { x: a.x, y: a.y, w: NOTE_SIZE, h: NOTE_SIZE };
    case "line":
    case "arrow": {
      const pad = a.width / 2 + 2;
      return {
        x: Math.min(a.x1, a.x2) - pad,
        y: Math.min(a.y1, a.y2) - pad,
        w: Math.abs(a.x2 - a.x1) + pad * 2,
        h: Math.abs(a.y2 - a.y1) + pad * 2,
      };
    }
    case "ink": {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of a.paths)
        for (let i = 0; i < p.length; i += 2) {
          const x = p[i],
            y = p[i + 1];
          if (x === undefined || y === undefined)
            throw new Error("Traçado contém um ponto incompleto.");
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      if (!Number.isFinite(x0)) throw new Error("Traçado sem pontos.");
      const pad = a.width / 2;
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    }
    case "highlight":
    case "underline":
    case "strike": {
      const xs = a.rects.map((r) => r.x);
      const ys = a.rects.map((r) => r.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        x,
        y,
        w: Math.max(...a.rects.map((r) => r.x + r.w)) - x,
        h: Math.max(...a.rects.map((r) => r.y + r.h)) - y,
      };
    }
  }
}

export function translateAnnot(a: Annot, dx: number, dy: number): Annot {
  switch (a.kind) {
    case "line":
    case "arrow":
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    case "ink":
      return { ...a, paths: a.paths.map((p) => p.map((v, i) => v + (i % 2 ? dy : dx))) };
    case "highlight":
    case "underline":
    case "strike":
      return { ...a, rects: a.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) };
    default:
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

/** Merges per-glyph selection rectangles into one rectangle per line. */
export function mergeLineRects(rects: Box[]): Box[] {
  const sorted = rects.filter((r) => r.w > 0.5 && r.h > 0.5).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Box[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    const sameLine =
      last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) * 0.5;
    if (sameLine && r.x <= last.x + last.w + r.h) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      last.w = Math.max(last.x + last.w, r.x + r.w) - x;
      last.h = Math.max(last.y + last.h, r.y + r.h) - y;
      last.x = x;
      last.y = y;
    } else lines.push({ ...r });
  }
  return lines;
}

export function pageLabel(n: number, total: number, fmt: string): string {
  return fmt.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total));
}

/** Legacy diagnostic conversion. The editor never uses lossy conversion when saving. */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function needsUnicodeFont(text: string): boolean {
  return [...text].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return !(
      c === 10 ||
      c === 13 ||
      c === 9 ||
      (c >= 32 && c <= 126) ||
      (c >= 160 && c <= 255) ||
      WIN_ANSI_EXTRA.includes(ch)
    );
  });
}
export const cssFontForText = (font: FontKey, text: string): string =>
  needsUnicodeFont(text) ? '"Edi Noto Sans", sans-serif' : CSS_FONT[font];
export const baselineForText = (font: FontKey, text: string): number =>
  needsUnicodeFont(text) ? 0.988 : BASELINE[font];
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out +=
      c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)
        ? ch
        : "?";
  }
  return out;
}

export function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
