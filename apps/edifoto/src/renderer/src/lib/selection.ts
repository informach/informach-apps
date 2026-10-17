import type { Point, VectorLayer } from "@shared/doc";
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
  useDoc
    .getState()
    .commit("Máscara da seleção", (d) =>
      updateLayer(d, id, (l) => ({ ...l, mask: { bitmap, enabled: true } })),
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
  ctx.translate(l.width / 2, l.height / 2);
  ctx.scale((t.flipX ? -1 : 1) / t.scale, (t.flipY ? -1 : 1) / t.scale);
  ctx.rotate((-t.rotation * Math.PI) / 180);
  ctx.translate(-t.x, -t.y);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(requireBitmap(selection).canvas, 0, 0);
  ctx.restore();
  useDoc.getState().commit("Apagar seleção", (d) => updateLayer(d, id, (x) => ({ ...x, bitmap })));
}
/** Border-connected color removal, deliberately exposed as color-based rather than semantic AI. */
export function removeBackground(): void {
  const id = useDoc.getState().activeId;
  if (!id) throw new OpError("Selecione a foto.");
  const layer = requireLayer(id);
  if (layer.locked) throw new OpError("Desbloqueie a camada para remover o fundo.");
  const doc = requireDoc(),
    c = compositor().renderToCanvas(doc, { only: id }),
    ctx = c.getContext("2d")!,
    im = ctx.getImageData(0, 0, c.width, c.height);
  const w = c.width,
    h = c.height,
    seeds = [0, w - 1, (h - 1) * w, h * w - 1];
  const mask = floodMask(im.data, w, h, seeds, useUi.getState().tolerance);
  for (let i = 0; i < mask.length; i += 4) {
    const v = 255 - mask[i + 3];
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const bitmap = adoptCanvas(c);
  useDoc
    .getState()
    .commit("Remover fundo por cor", (d) =>
      updateLayer(d, id, (l) => ({ ...l, mask: { bitmap, enabled: true } })),
    );
  useUi.setState({ tab: "props" });
  useUi.getState().toast("Fundo removido por cor dos cantos. Refine a máscara com o pincel.", "ok");
}
