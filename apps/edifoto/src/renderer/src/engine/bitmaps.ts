import { newId } from "@shared/doc";

/**
 * Pixel storage for raster layers and masks, outside the (plain JSON) document. Each bitmap is a
 * 2D canvas; `version` bumps whenever its pixels change so the GPU copy knows to re-upload.
 * Bitmaps referenced by undo history are kept even after their layer is deleted.
 */
export interface Bitmap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  version: number;
  /** Pixels changed since the last GPU upload: a rectangle, 'all', or null when in sync. */
  dirty: Rect | "all" | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const store = new Map<string, Bitmap>();

function make(w: number, h: number): Bitmap {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
  return { canvas, ctx, version: 1, dirty: "all" };
}

export function createBitmap(w: number, h: number, fill?: string): string {
  const b = make(w, h);
  if (fill) {
    b.ctx.fillStyle = fill;
    b.ctx.fillRect(0, 0, b.canvas.width, b.canvas.height);
  }
  const id = newId("b");
  store.set(id, b);
  return id;
}

/** Stores a copy of an image source as a new bitmap. */
export function bitmapFrom(src: CanvasImageSource, w: number, h: number): string {
  const b = make(w, h);
  b.ctx.drawImage(src, 0, 0, b.canvas.width, b.canvas.height);
  const id = newId("b");
  store.set(id, b);
  return id;
}

export function adoptCanvas(canvas: HTMLCanvasElement, id = newId("b")): string {
  store.set(id, { canvas, ctx: canvas.getContext("2d")!, version: 1, dirty: "all" });
  return id;
}

export function getBitmap(id: string): Bitmap | undefined {
  return store.get(id);
}

export function requireBitmap(id: string): Bitmap {
  const b = store.get(id);
  if (!b) throw new Error(`Bitmap ${id} não encontrado`);
  return b;
}

/** Marks pixels as changed (a rectangle, or the whole bitmap). */
export function touchBitmap(id: string, rect?: Rect): void {
  const b = store.get(id);
  if (!b) return;
  b.version++;
  if (!rect || b.dirty === "all") {
    b.dirty = "all";
    return;
  }
  const d = b.dirty ?? rect;
  const x = Math.min(d.x, rect.x);
  const y = Math.min(d.y, rect.y);
  b.dirty = {
    x,
    y,
    w: Math.max(d.x + d.w, rect.x + rect.w) - x,
    h: Math.max(d.y + d.h, rect.y + rect.h) - y,
  };
}

export function cloneBitmap(id: string): string {
  const b = requireBitmap(id);
  return bitmapFrom(b.canvas, b.canvas.width, b.canvas.height);
}

export function clearBitmaps(): void {
  store.clear();
}

export const bitmapIds = (): string[] => [...store.keys()];
