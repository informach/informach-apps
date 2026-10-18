import type { RasterLayer } from "@shared/doc";
import { adoptCanvas, requireBitmap } from "@/engine/bitmaps";
import { updateLayer, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { OpError, requireLayer } from "./ops";

export function openChromaKey(): void {
  const id = useDoc.getState().activeId;
  if (!id) throw new OpError("Selecione uma camada de imagem para retirar o fundo.");
  const layer = requireLayer(id);
  if (layer.kind !== "raster")
    throw new OpError("Escolha uma camada de imagem para remover o fundo.");
  if (layer.locked) throw new OpError("Desbloqueie a camada antes de retirar o fundo.");
  useUi.setState({ chromaOpen: true });
}

export function applyChromaKey(
  layer: RasterLayer,
  version: number,
  pixels: Uint8ClampedArray,
): void {
  const current = requireLayer(layer.id);
  if (
    current.locked ||
    current.kind !== "raster" ||
    current.bitmap !== layer.bitmap ||
    requireBitmap(layer.bitmap).version !== version
  ) {
    throw new OpError("A imagem mudou durante a prévia. Feche e abra o recorte novamente.");
  }
  if (pixels.length !== layer.width * layer.height * 4)
    throw new OpError("Resultado de chroma key inválido.");
  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(new Uint8ClampedArray(pixels), layer.width, layer.height), 0, 0);
  const bitmap = adoptCanvas(canvas);
  useDoc
    .getState()
    .commit("Remover fundo · Chroma key", (d) =>
      updateLayer(d, layer.id, (l) => ({ ...l, bitmap })),
    );
}
