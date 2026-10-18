import type { CursorData } from "@shared/cursorData";
import { mediaUrl } from "./media";

/**
 * The cursor images a recording's helper saved (cursors/<hash>.png beside cursor.json), as
 * bitmaps ready to draw, by shape index. A cursor whose pixels invert the screen (the text bar
 * of many programs) was saved with those pixels black: it gets a light outline here, so it reads
 * on dark backgrounds too. The preview and the export's sprite draw from the same bitmaps.
 */

export interface CursorImage {
  bitmap: ImageBitmap;
  /** Size and hotspot of the picture as saved (system pixels). */
  w: number;
  h: number;
  hotX: number;
  hotY: number;
  /** The picture was drawn with an outline: it is `pad` pixels larger on every side. */
  pad: number;
}

export type CursorImages = (CursorImage | undefined)[];

const cache = new Map<string, Promise<CursorImages>>();

const folderOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, "");

/** An inverted cursor's picture with a one-pixel light outline around its dark pixels. */
async function outlined(source: ImageBitmap): Promise<{ bitmap: ImageBitmap; pad: number }> {
  const pad = 1;
  const canvas = new OffscreenCanvas(source.width + pad * 2, source.height + pad * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { bitmap: source, pad: 0 };
  // The silhouette in white, moved one pixel each way, then the picture over it.
  const ghost = new OffscreenCanvas(source.width, source.height);
  const g = ghost.getContext("2d");
  if (!g) return { bitmap: source, pad: 0 };
  g.drawImage(source, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, ghost.width, ghost.height);
  for (const [dx, dy] of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ])
    ctx.drawImage(ghost, pad + dx, pad + dy);
  ctx.drawImage(source, pad, pad);
  return { bitmap: await createImageBitmap(canvas), pad };
}

async function load(cursorPath: string, data: CursorData): Promise<CursorImages> {
  const folder = folderOf(cursorPath);
  const wanted = data.shapes.map((s) => (s.image ? `${folder}/${s.image}` : null));
  const paths = wanted.filter((p): p is string => !!p);
  const there = paths.length ? await window.api.exists(paths) : [];
  const present = new Set(paths.filter((_, i) => there[i]));
  return Promise.all(
    data.shapes.map(async (shape, i): Promise<CursorImage | undefined> => {
      const path = wanted[i];
      if (!path || !present.has(path) || shape.w <= 0 || shape.h <= 0) return undefined;
      try {
        const response = await fetch(mediaUrl(path));
        if (!response.ok) return undefined;
        const plain = await createImageBitmap(await response.blob());
        const { bitmap, pad } = shape.inverted ? await outlined(plain) : { bitmap: plain, pad: 0 };
        return { bitmap, w: shape.w, h: shape.h, hotX: shape.hotX, hotY: shape.hotY, pad };
      } catch {
        // A picture that cannot be read is drawn as the shape it resembles.
        return undefined;
      }
    }),
  );
}

/** The images of a recording's cursor data, loaded once per file. */
export function loadCursorImages(cursorPath: string, data: CursorData): Promise<CursorImages> {
  let p = cache.get(cursorPath);
  if (!p) {
    p = load(cursorPath, data);
    p.catch(() => cache.delete(cursorPath));
    cache.set(cursorPath, p);
  }
  return p;
}
