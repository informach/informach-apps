import type { Doc, Layer } from "@shared/doc";
import { type Affine, apply, inverse, localPlacement, maskPlacement } from "@shared/placement";
import { type Rect, requireBitmap, touchBitmap } from "@/engine/bitmaps";
import { type Patch, useDoc } from "@/state/doc";
import { type BrushSettings, useUi } from "@/state/ui";
import { addMask } from "./ops";

/**
 * Brush and eraser. A stroke is drawn as stamped dabs into a stroke buffer (flow accumulates up
 * to full strength), and the target is rebuilt in the touched area as snapshot + stroke ×
 * opacity with the brush mode — so opacity caps the stroke like in Photoshop.
 */

interface Stroke {
  bitmap: string;
  target: "layer" | "mask";
  /** Document → bitmap pixel mapping. */
  toBitmap: (x: number, y: number) => [number, number];
  /** Bitmap pixels per document pixel. */
  ratio: number;
  mapping: Affine;
  selection: HTMLCanvasElement | null;
  retouch: null | { source: HTMLCanvasElement; dx: number; dy: number };
  snapshot: HTMLCanvasElement;
  buffer: HTMLCanvasElement;
  bctx: CanvasRenderingContext2D;
  stamp: HTMLCanvasElement;
  radius: number;
  spacing: number;
  settings: BrushSettings;
  erase: boolean;
  last: [number, number];
  bounds: Rect | null;
  label: string;
}

let stroke: Stroke | null = null;
const scratch = new Map<string, HTMLCanvasElement>();

function scratchCanvas(key: string, w: number, h: number): HTMLCanvasElement {
  let c = scratch.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    scratch.set(key, c);
  }
  return c;
}

function makeStamp(
  radius: number,
  hardness: number,
  color: string,
  mapping: Affine,
): HTMLCanvasElement {
  const width = Math.max(2, Math.ceil(radius * 2 * Math.hypot(mapping[0], mapping[2])) + 2);
  const height = Math.max(2, Math.ceil(radius * 2 * Math.hypot(mapping[1], mapping[3])) + 2);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.translate(width / 2, height / 2);
  ctx.transform(mapping[0], mapping[1], mapping[2], mapping[3], 0, 0);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  const hard = Math.min(0.99, Math.max(0, hardness / 100));
  g.addColorStop(0, color);
  g.addColorStop(hard, color);
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

const gray = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const l = Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  const h = l.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
};

const union = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

function clampRect(r: Rect, w: number, h: number): Rect | null {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const x2 = Math.min(w, Math.ceil(r.x + r.w));
  const y2 = Math.min(h, Math.ceil(r.y + r.h));
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

/** Where a stroke on this layer lands; creates a mask on fill/adjustment layers. */
function resolveTarget(
  layer: Layer,
  doc: Doc,
):
  | {
      bitmap: string;
      target: "layer" | "mask";
      toBitmap: Stroke["toBitmap"];
      ratio: number;
      mapping: Affine;
    }
  | string {
  const ui = useUi.getState();
  if (layer.locked) return `A camada "${layer.name}" está bloqueada.`;
  if (
    ui.paintTarget === "mask" ||
    layer.kind === "adjust" ||
    layer.kind === "solid" ||
    layer.kind === "gradient"
  ) {
    if (layer.kind === "text" && !layer.mask)
      return "Texto não recebe pintura. Crie uma camada vazia (Ctrl+Shift+N) ou adicione uma máscara.";
    if (!layer.mask) {
      addMask(layer.id, "reveal");
      useUi.setState({ paintTarget: "mask", fg: "#000000", bg: "#ffffff" });
      useUi.getState().toast("Máscara criada: preto esconde, branco revela.");
    }
    const l = useDoc.getState().doc!.layers.find((x) => x.id === layer.id)!;
    const mapping = maskPlacement(l);
    return {
      bitmap: l.mask!.bitmap,
      mapping,
      target: "mask",
      toBitmap: (x, y) => {
        const p = apply(mapping, { x, y });
        return [p.x, p.y];
      },
      ratio: Math.sqrt(Math.abs(mapping[0] * mapping[3] - mapping[1] * mapping[2])),
    };
  }
  if (layer.kind === "vector")
    return "Use uma máscara ou uma camada de pixels para pintar sobre o vetor.";
  if (layer.kind === "text")
    return "Texto não recebe pintura. Crie uma camada vazia (Ctrl+Shift+N) para pintar por cima.";
  const mapping = inverse(localPlacement(layer.transform, layer.width, layer.height));
  void doc;
  return {
    bitmap: layer.bitmap,
    mapping,
    target: "layer",
    ratio: Math.sqrt(Math.abs(mapping[0] * mapping[3] - mapping[1] * mapping[2])),
    toBitmap: (x, y) => {
      const p = apply(mapping, { x, y });
      return [p.x, p.y];
    },
  };
}

export function beginStroke(x: number, y: number, erase: boolean): string | null {
  if (stroke) return "Termine o traço atual antes de iniciar outro.";
  const { doc, activeId } = useDoc.getState();
  const layer = doc?.layers.find((l) => l.id === activeId);
  if (!doc || !layer) return "Selecione uma camada para pintar.";
  if (!layer.visible) return `A camada "${layer.name}" está oculta.`;
  const t = resolveTarget(layer, doc);
  if (typeof t === "string") return t;
  const ui = useUi.getState();
  const settings = erase ? ui.eraser : ui.brush;
  if (ui.tool === "clone" && !ui.cloneSource) return "Alt+clique para definir a origem do carimbo.";
  const bmp = requireBitmap(t.bitmap);
  const W = bmp.canvas.width;
  const H = bmp.canvas.height;
  const snapshot = scratchCanvas("snap", W, H);
  const sctx = snapshot.getContext("2d")!;
  sctx.clearRect(0, 0, W, H);
  sctx.drawImage(bmp.canvas, 0, 0);
  const buffer = scratchCanvas("buf", W, H);
  const bctx = buffer.getContext("2d")!;
  bctx.clearRect(0, 0, W, H);
  const worldRadius = Math.max(0.5, settings.size / 2);
  const radius =
    worldRadius *
    Math.max(Math.hypot(t.mapping[0], t.mapping[2]), Math.hypot(t.mapping[1], t.mapping[3]));
  if (radius > 4095)
    return "O pincel é grande demais para esta escala. Aumente a camada ou reduza o pincel.";
  // On a mask the eraser paints white (reveals) and the brush paints the gray of the color.
  const color = t.target === "mask" ? (erase ? "#ffffff" : gray(ui.fg)) : erase ? "#000000" : ui.fg;
  let selection: HTMLCanvasElement | null = null;
  if (ui.selection) {
    selection = scratchCanvas("selection", W, H);
    const sc = selection.getContext("2d")!;
    sc.clearRect(0, 0, W, H);
    sc.save();
    if (t.target === "layer" && layer.kind === "raster") {
      sc.transform(...inverse(localPlacement(layer.transform, W, H)));
    } else if (t.target === "mask") sc.transform(...maskPlacement(layer));
    sc.drawImage(requireBitmap(ui.selection).canvas, 0, 0);
    sc.restore();
  }
  let retouch: Stroke["retouch"] = null;
  if (ui.tool === "clone" || ui.tool === "blur") {
    if (layer.kind !== "raster" || t.target !== "layer")
      return "Carimbo e desfoque precisam de uma camada de pixels.";
    const source = scratchCanvas("retouch", W, H),
      ctx = source.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.filter =
      ui.tool === "blur" ? `blur(${Math.max(1, (settings.size * t.ratio) / 15)}px)` : "none";
    ctx.drawImage(snapshot, 0, 0);
    ctx.filter = "none";
    const start = t.toBitmap(x, y),
      origin = ui.cloneSource ? t.toBitmap(ui.cloneSource.x, ui.cloneSource.y) : start;
    retouch = {
      source,
      dx: ui.tool === "clone" ? origin[0] - start[0] : 0,
      dy: ui.tool === "clone" ? origin[1] - start[1] : 0,
    };
  }
  stroke = {
    selection,
    retouch,
    ...t,
    snapshot,
    buffer,
    bctx,
    stamp: makeStamp(worldRadius, settings.hardness, color, t.mapping),
    radius,
    spacing: Math.max(0.5, worldRadius * 0.12),
    settings,
    erase: erase && t.target === "layer",
    last: t.toBitmap(x, y),
    bounds: null,
    label:
      ui.tool === "clone"
        ? "Carimbo"
        : ui.tool === "blur"
          ? "Desfoque"
          : erase
            ? "Borracha"
            : t.target === "mask"
              ? "Pintar máscara"
              : "Pincel",
  };
  dab(stroke.last[0], stroke.last[1]);
  return null;
}

function drawDab(s: Stroke, x: number, y: number): void {
  if (!s.retouch) {
    s.bctx.drawImage(s.stamp, x - s.stamp.width / 2, y - s.stamp.height / 2);
    return;
  }
  const tile = scratchCanvas("retouch-dab", s.stamp.width, s.stamp.height),
    ctx = tile.getContext("2d")!;
  ctx.clearRect(0, 0, tile.width, tile.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(
    s.retouch.source,
    -x - s.retouch.dx + tile.width / 2,
    -y - s.retouch.dy + tile.height / 2,
  );
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(s.stamp, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  s.bctx.drawImage(tile, x - tile.width / 2, y - tile.height / 2);
}

function dab(x: number, y: number): void {
  const s = stroke!;
  s.bctx.globalAlpha = s.settings.flow / 100;
  drawDab(s, x, y);
  refresh({ x: x - s.radius - 1, y: y - s.radius - 1, w: s.radius * 2 + 2, h: s.radius * 2 + 2 });
}

export function continueStroke(x: number, y: number): void {
  const s = stroke;
  if (!s) return;
  const [tx, ty] = s.toBitmap(x, y);
  const [lx, ly] = s.last;
  const m = inverse(s.mapping);
  const dx = tx - lx,
    dy = ty - ly;
  const dist = Math.hypot(m[0] * dx + m[2] * dy, m[1] * dx + m[3] * dy);
  if (dist < s.spacing) return;
  const steps = Math.floor(dist / s.spacing);
  const area: Rect = {
    x: Math.min(lx, tx) - s.radius - 1,
    y: Math.min(ly, ty) - s.radius - 1,
    w: Math.abs(tx - lx) + s.radius * 2 + 2,
    h: Math.abs(ty - ly) + s.radius * 2 + 2,
  };
  s.bctx.globalAlpha = s.settings.flow / 100;
  for (let i = 1; i <= steps; i++) {
    const px = lx + ((tx - lx) * i) / steps;
    const py = ly + ((ty - ly) * i) / steps;
    drawDab(s, px, py);
  }
  s.last = [lx + ((tx - lx) * steps) / steps, ly + ((ty - ly) * steps) / steps];
  refresh(area);
}

/** Rebuilds the target in an area: snapshot + stroke buffer at the stroke's opacity and mode. */
function refresh(area: Rect): void {
  const s = stroke!;
  const b = requireBitmap(s.bitmap);
  const r = clampRect(area, b.canvas.width, b.canvas.height);
  if (!r) return;
  s.bounds = union(s.bounds, r);
  const ctx = b.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.clearRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(s.snapshot, 0, 0);
  ctx.globalAlpha = s.settings.opacity / 100;
  ctx.globalCompositeOperation = s.erase
    ? "destination-out"
    : s.target === "mask"
      ? "source-over"
      : s.settings.mode;
  if (s.selection) {
    const c = scratchCanvas("selected-stroke", s.buffer.width, s.buffer.height),
      sc = c.getContext("2d")!;
    sc.clearRect(0, 0, c.width, c.height);
    sc.globalCompositeOperation = "source-over";
    sc.drawImage(s.buffer, 0, 0);
    sc.globalCompositeOperation = "destination-in";
    sc.drawImage(s.selection, 0, 0);
    sc.globalCompositeOperation = "source-over";
    ctx.drawImage(c, 0, 0);
  } else ctx.drawImage(s.buffer, 0, 0);
  ctx.restore();
  touchBitmap(s.bitmap, r);
  useDoc.getState().bump();
}

export function endStroke(): void {
  const s = stroke;
  stroke = null;
  if (!s?.bounds) return;
  const b = requireBitmap(s.bitmap);
  const r = s.bounds;
  const before = s.snapshot.getContext("2d")!.getImageData(r.x, r.y, r.w, r.h);
  const after = b.ctx.getImageData(r.x, r.y, r.w, r.h);
  const patch: Patch = { bitmap: s.bitmap, x: r.x, y: r.y, before, after };
  useDoc.getState().commit(s.label, (d) => d, { patches: [patch] });
}

export const isPainting = (): boolean => stroke !== null;

export function assertNotPainting(): void {
  if (isPainting()) throw new Error("Termine o traço antes de iniciar outra edição.");
}
