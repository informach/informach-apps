import type { Layer, RasterLayer } from "@shared/doc";
import { localToDoc } from "@shared/vector";
import { bitmapFrom, createBitmap, requireBitmap } from "@/engine/bitmaps";
import { renderText } from "@/engine/text";
import { drawVector } from "@/engine/vector";
import { updateLayer, useDoc } from "@/state/doc";
import { OpError, requireDoc, requireEditableLayer, setTransform } from "./ops";
export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export function layerBounds(layer: Layer): { x: number; y: number; w: number; h: number } {
  if (!("transform" in layer)) throw new OpError("Escolha uma imagem, um texto ou uma forma.");
  const size =
    layer.kind === "raster"
      ? layer
      : layer.kind === "vector"
        ? layer.vector
        : renderText(layer.text).canvas;
  const points = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height },
  ].map((p) => localToDoc(p, layer.transform, size.width, size.height));
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...points.map((p) => p.x)) - x,
    h: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function alignLayer(id: string, alignment: Alignment, margin = 0): void {
  const doc = requireDoc(),
    layer = requireEditableLayer(id);
  if (!("transform" in layer)) throw new OpError("Escolha uma imagem, um texto ou uma forma.");
  if (!Number.isFinite(margin) || margin < 0 || margin > Math.min(doc.width, doc.height) / 2)
    throw new OpError("Margem inválida.");
  const box = layerBounds(layer),
    horizontal = ["left", "center", "right"].includes(alignment);
  const target =
    alignment === "left" || alignment === "top"
      ? margin
      : alignment === "center"
        ? (doc.width - box.w) / 2
        : alignment === "middle"
          ? (doc.height - box.h) / 2
          : alignment === "right"
            ? doc.width - margin - box.w
            : doc.height - margin - box.h;
  setTransform(
    id,
    horizontal
      ? { x: layer.transform.x + target - box.x }
      : { y: layer.transform.y + target - box.y },
  );
}
export function replaceImageSlot(id: string, canvas: HTMLCanvasElement): void {
  const doc = requireDoc(),
    slot = requireEditableLayer(id);
  if (slot.kind !== "vector" || slot.role !== "image-placeholder")
    throw new OpError("Escolha um espaço para imagem de um modelo.");
  const scale = Math.max(slot.vector.width / canvas.width, slot.vector.height / canvas.height);
  const transform = { ...slot.transform, scale: slot.transform.scale * scale };
  const bitmap = bitmapFrom(canvas, canvas.width, canvas.height);
  const mask = createBitmap(doc.width, doc.height, "#000000");
  drawVector(requireBitmap(mask).ctx, slot, true);
  const layer: RasterLayer = {
    ...slot,
    role: undefined,
    kind: "raster",
    bitmap,
    width: canvas.width,
    height: canvas.height,
    transform,
    mask: { bitmap: mask, enabled: true, reference: structuredClone(transform) },
  };
  useDoc
    .getState()
    .commit("Inserir no espaço de imagem", (current) => updateLayer(current, id, () => layer), {
      active: id,
    });
}
