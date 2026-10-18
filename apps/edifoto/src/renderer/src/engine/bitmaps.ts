import { newId } from "@shared/doc";
import { validateDimensions } from "@shared/documentFormat";

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

let store = new Map<string, Bitmap>();
// A key reused by a reopened project must never reuse a GPU generation.
let nextVersion = 1;
const MAX_STORED_PIXELS = 96_000_000;
function checkAllocation(w: number, h: number, replaced?: string): void {
  validateDimensions(w, h);
  let pixels = w * h;
  for (const [id, bitmap] of store)
    if (id !== replaced) pixels += bitmap.canvas.width * bitmap.canvas.height;
  if (pixels > MAX_STORED_PIXELS)
    throw new Error(
      "Há muitas imagens grandes neste projeto. Salve e reabra para liberar o histórico antes de continuar.",
    );
}

function make(w: number, h: number): Bitmap {
  checkAllocation(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("Não foi possível preparar os pixels da imagem.");
  return { canvas, ctx, version: nextVersion++, dirty: "all" };
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
  checkAllocation(canvas.width, canvas.height, id);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar os pixels da imagem.");
  store.set(id, { canvas, ctx, version: nextVersion++, dirty: "all" });
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
  b.version = nextVersion++;
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
export function collectBitmaps(live: ReadonlySet<string>): void {
  for (const id of store.keys()) if (!live.has(id)) store.delete(id);
}

export const bitmapIds = (): string[] => [...store.keys()];

/** Stage a complete registry before switching documents; failures preserve the previous workspace. */
export function withBitmapReplacement<T>(
  canvases: ReadonlyMap<string, HTMLCanvasElement>,
  load: () => T,
): T {
  const replacement = new Map<string, Bitmap>();
  let pixels = 0;
  for (const [id, canvas] of canvases) {
    validateDimensions(canvas.width, canvas.height);
    pixels += canvas.width * canvas.height;
    if (pixels > MAX_STORED_PIXELS) throw new Error("O projeto contém imagens grandes demais.");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar os pixels da imagem.");
    replacement.set(id, { canvas, ctx, version: nextVersion++, dirty: "all" });
  }
  const previous = store;
  store = replacement;
  try {
    return load();
  } catch (error) {
    store = previous;
    throw error;
  }
}
