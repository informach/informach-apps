import type { Point, VectorLayer } from "@shared/doc";
import { borderColor, refineAlpha, uniformCutout } from "@shared/masks";
import { inverse, localPlacement, maskPlacement } from "@shared/placement";
import { floodMask } from "@shared/selection";
import { adoptCanvas, cloneBitmap, createBitmap, requireBitmap } from "@/engine/bitmaps";
import { compositor } from "@/engine/compositor";
import { drawVector } from "@/engine/vector";
import { updateLayer, useDoc } from "@/state/doc";
import { type SelectionMode, useUi } from "@/state/ui";
import { OpError, requireDoc, requireLayer } from "./ops";

export function clearSelection(): void {
  useUi.setState({ selection: null, selectionPreview: null });
}
export function setSelection(canvas: HTMLCanvasElement): void {
  const id = adoptCanvas(canvas);
  const preview = document.createElement("canvas");
  preview.width = canvas.width;
  preview.height = canvas.height;
  const c = preview.getContext("2d")!;
  c.drawImage(canvas, 0, 0);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = "#ff7a4555";
  c.fillRect(0, 0, canvas.width, canvas.height);
  useUi.setState({ selection: id, selectionPreview: preview.toDataURL() });
}
function blank(): HTMLCanvasElement {
  const doc = requireDoc(),
    c = document.createElement("canvas");
  c.width = doc.width;
  c.height = doc.height;
  return c;
}
export function combineSelection(canvas: HTMLCanvasElement, mode: SelectionMode): void {
  const previous = useUi.getState().selection;
  if (mode === "replace" || !previous) {
    setSelection(canvas);
    return;
  }
  const result = blank(),
    ctx = result.getContext("2d")!;
  ctx.drawImage(requireBitmap(previous).canvas, 0, 0);
  ctx.globalCompositeOperation =
    mode === "add" ? "source-over" : mode === "subtract" ? "destination-out" : "destination-in";
  ctx.drawImage(canvas, 0, 0);
  setSelection(result);
}
export function selectPolygon(points: Point[], mode: SelectionMode = "replace"): void {
  if (points.length < 3) return;
  const c = blank(),
    ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  points.forEach((p, i) => {
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  combineSelection(c, mode);
}
export function selectWand(x: number, y: number, mode: SelectionMode = "replace"): void {
  const d = requireDoc();
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= d.width || y >= d.height) return;
  const c = compositor().renderToCanvas(d),
    ctx = c.getContext("2d")!,
    data = ctx.getImageData(0, 0, c.width, c.height);
  data.data.set(
    floodMask(data.data, c.width, c.height, [y * c.width + x], useUi.getState().tolerance),
  );
  ctx.putImageData(data, 0, 0);
  combineSelection(c, mode);
}
export function refineSelection(grow = 0, feather = 0): void {
  const id = useUi.getState().selection;
  if (!id) throw new OpError("Crie uma seleção primeiro.");
  const source = requireBitmap(id).canvas,
    ctx = source.getContext("2d");
  if (!ctx) throw new Error("Não foi possível ler a seleção.");
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  const alpha = new Uint8ClampedArray(source.width * source.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
  const refined = refineAlpha(alpha, source.width, source.height, grow, feather);
  for (let i = 0; i < alpha.length; i++) {
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 255;
    pixels[i * 4 + 3] = refined[i];
  }
  const canvas = blank(),
    output = canvas.getContext("2d");
  if (!output) throw new Error("Não foi possível refinar a seleção.");
  output.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
  setSelection(canvas);
}
export function invertSelection(): void {
  const id = useUi.getState().selection,
    c = blank(),
    ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  if (id) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(requireBitmap(id).canvas, 0, 0);
  }
  setSelection(c);
}
export function vectorSelection(layer: VectorLayer): void {
  if (!layer.vector.closed || layer.vector.shape === "line")
    throw new OpError("Feche o traçado antes de criar uma seleção.");
  const c = blank();
  drawVector(c.getContext("2d")!, layer, true);
  setSelection(c);
}
export function selectionMask(targetId?: string): void {
  const id = targetId ?? useDoc.getState().activeId,
    selection = useUi.getState().selection;
  if (!id || !selection)
    throw new OpError("Crie uma seleção e escolha a camada que receberá a máscara.");
  const layer = requireLayer(id);
  if (layer.locked) throw new OpError("A camada está bloqueada.");
  const doc = requireDoc(),
    bitmap = createBitmap(doc.width, doc.height, "#000000"),
    ctx = requireBitmap(bitmap).ctx;
  ctx.drawImage(requireBitmap(selection).canvas, 0, 0);
  useDoc.getState().commit("Máscara da seleção", (d) =>
    updateLayer(d, id, (l) => ({
      ...l,
      mask: {
        bitmap,
        enabled: true,
        reference: "transform" in l ? structuredClone(l.transform) : undefined,
      },
    })),
  );
}
export function deleteSelectedPixels(): void {
  const id = useDoc.getState().activeId,
    selection = useUi.getState().selection;
  if (!id || !selection) return;
  const l = requireLayer(id);
  if (l.kind !== "raster" || l.locked)
    throw new OpError("Selecione uma camada de pixels desbloqueada.");
  const bitmap = cloneBitmap(l.bitmap),
    ctx = requireBitmap(bitmap).ctx,
    t = l.transform;
  ctx.save();
  ctx.transform(...inverse(localPlacement(t, l.width, l.height)));
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(requireBitmap(selection).canvas, 0, 0);
  ctx.restore();
  useDoc.getState().commit("Apagar seleção", (d) => updateLayer(d, id, (x) => ({ ...x, bitmap })));
}
/** Local color cutout uses source pixels and preserves existing layer masks. */
export function removeBackground(tolerance = useUi.getState().tolerance): void {
  const id = useDoc.getState().activeId;
  if (!id) throw new OpError("Selecione uma imagem.");
  const layer = requireLayer(id);
  if (layer.kind !== "raster" || layer.locked)
    throw new OpError("Selecione uma camada de imagem desbloqueada.");
  const source = requireBitmap(layer.bitmap),
    image = source.ctx.getImageData(0, 0, layer.width, layer.height);
  const color = borderColor(image.data, layer.width, layer.height);
  if (!color)
    throw new OpError("Não encontrei um fundo opaco. Use Remover fundo para escolher a cor.");
  const pixels = uniformCutout(image.data, layer.width, layer.height, color, tolerance);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = image.data[i + 3]
      ? Math.min(255, (pixels[i + 3] * 255) / image.data[i + 3])
      : 0;
  }
  const local = document.createElement("canvas");
  local.width = layer.width;
  local.height = layer.height;
  const ctx = local.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar o recorte.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), layer.width, layer.height), 0, 0);
  const doc = requireDoc(),
    bitmap = createBitmap(doc.width, doc.height, "#000000"),
    output = requireBitmap(bitmap).ctx;
  output.save();
  output.transform(...localPlacement(layer.transform, layer.width, layer.height));
  output.drawImage(local, 0, 0);
  output.restore();
  if (layer.mask?.enabled) {
    const previous = blank(),
      context = previous.getContext("2d");
    if (!context) throw new Error("Não foi possível ler a máscara.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, doc.width, doc.height);
    context.transform(...inverse(maskPlacement(layer)));
    context.drawImage(requireBitmap(layer.mask.bitmap).canvas, 0, 0);
    output.globalCompositeOperation = "multiply";
    output.drawImage(previous, 0, 0);
    output.globalCompositeOperation = "source-over";
  }
  useDoc.getState().commit("Remover fundo por cor", (current) =>
    updateLayer(current, id, (l) => ({
      ...l,
      mask: { bitmap, enabled: true, reference: structuredClone(layer.transform) },
    })),
  );
  useUi.setState({ tab: "props" });
}
