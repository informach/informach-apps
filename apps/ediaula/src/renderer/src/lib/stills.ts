import { buildTrack } from "@shared/cursor";
import type { Asset } from "@shared/types";
import { zoomAt } from "@shared/zoom";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { drawCursorScene } from "./cursorDraw";
import { loadCursorImages } from "./cursorImages";
import { mediaUrl } from "./media";

/**
 * The picture Estender quadro holds: the frame of `asset` at source second `t`, with the zoom
 * and the pointer the video shows there (they are drawn on it, since a still has neither). Made
 * from the source each time, so a held frame whose file is gone is drawn again the same
 * (lib/relink.ts). Returns the path of the PNG in the app's cache.
 */
export async function stillPicture(asset: Asset, t: number): Promise<string> {
  if (asset.key && (!asset.keyed || asset.keyStatus !== "ready"))
    throw new Error("Aguarde a remoção de fundo terminar antes de estender o quadro.");
  const source = asset.key ? asset.keyed : asset.path;
  if (!source) throw new Error("O vídeo sem fundo desta mídia ainda não existe.");
  let path = await window.api.stillFrame(source, t, !!asset.key);
  if (!asset.cursor && !asset.zooms?.length) return path;
  const image = new Image();
  // media:// is a separate origin; request its CORS-enabled image before drawing to canvas.
  image.crossOrigin = "anonymous";
  image.src = mediaUrl(path);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível desenhar o quadro.");
  const view = zoomAt(asset.zooms, t);
  ctx.translate(
    (0.5 - view.cx * view.scale) * canvas.width,
    (0.5 - view.cy * view.scale) * canvas.height,
  );
  ctx.scale(view.scale, view.scale);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (asset.cursor && !asset.cursorMissing) {
    const data = await loadCursorData(asset.cursor);
    const fx = cursorFxOf(asset);
    const track = buildTrack(data, fx, asset.duration);
    const k = canvas.width / data.width;
    const images = await loadCursorImages(asset.cursor, data).catch(() => undefined);
    // In the zoomed view; the magnifier enlarges the frame itself, like the video does.
    drawCursorScene(ctx, {
      data,
      track,
      fx,
      t,
      k,
      images,
      source: { image, width: image.naturalWidth, height: image.naturalHeight },
    });
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Não foi possível salvar o quadro."))),
      "image/png",
    ),
  );
  path = await window.api.saveGenerated(new Uint8Array(await blob.arrayBuffer()), "png");
  return path;
}
