import type { BlendMode } from "@shared/blendModes";
import {
  type Adjust,
  baseLayer,
  DEFAULT_ADJUST,
  DEFAULT_GRADIENT,
  DEFAULT_TEXT,
  type Doc,
  type Gradient,
  IDENTITY,
  type Layer,
  type LayerKind,
  newId,
  type RasterLayer,
  type TextStyle,
  type Transform,
} from "@shared/doc";
import { validateDimensions } from "@shared/documentFormat";
import { inverse, maskPlacement, resizedPlacement } from "@shared/placement";
import { bitmapFrom, cloneBitmap, createBitmap, requireBitmap } from "@/engine/bitmaps";
import { compositor } from "@/engine/compositor";
import { findLayer, updateLayer, useDoc } from "@/state/doc";

/**
 * Every change to the document goes through here, so the canvas, the panels and the AI tools
 * share one implementation and one undo history.
 */

export class OpError extends Error {}

const commit = (
  label: string,
  recipe: (d: Doc) => Doc,
  opts?: Parameters<ReturnType<typeof useDoc.getState>["commit"]>[2],
): void => {
  useDoc.getState().commit(label, recipe, opts);
};

export function requireDoc(): Doc {
  const d = useDoc.getState().doc;
  if (!d) throw new OpError("Nenhuma imagem aberta no EdiFoto.");
  return d;
}

export function requireLayer(id: string): Layer {
  const l = findLayer(requireDoc(), id);
  if (!l) throw new OpError(`Camada ${id} não existe. Use get_document para ver os ids.`);
  return l;
}

export function requireEditableLayer(id: string): Layer {
  const layer = requireLayer(id);
  if (layer.locked) throw new OpError(`A camada "${layer.name}" está bloqueada.`);
  return layer;
}
const maskFor = (layer: Layer, bitmap: string) => ({
  bitmap,
  enabled: true,
  reference: "transform" in layer ? structuredClone(layer.transform) : undefined,
});

const centered = (w: number, h: number): Transform => ({ ...IDENTITY, x: w / 2, y: h / 2 });

/* ----- New documents ----- */

export function docFromImage(img: CanvasImageSource, w: number, h: number, name: string): Doc {
  const bitmap = bitmapFrom(img, w, h);
  const layer: RasterLayer = {
    ...baseLayer("Fundo"),
    kind: "raster",
    bitmap,
    width: w,
    height: h,
    transform: centered(w, h),
  };
  return { id: newId("d"), name, width: w, height: h, layers: [layer] };
}

export function blankDoc(w: number, h: number, name: string, background: string | null): Doc {
  const layers: Layer[] = [];
  if (background) layers.push({ ...baseLayer("Fundo"), kind: "solid", color: background });
  layers.push({
    ...baseLayer("Camada 1"),
    kind: "raster",
    bitmap: createBitmap(w, h),
    width: w,
    height: h,
    transform: centered(w, h),
  });
  return { id: newId("d"), name, width: w, height: h, layers };
}

/* ----- Layers ----- */

function insertAbove(doc: Doc, layer: Layer, aboveId?: string | null): Doc {
  const ref = aboveId ?? useDoc.getState().activeId;
  const idx = ref ? doc.layers.findIndex((l) => l.id === ref) : -1;
  const layers = [...doc.layers];
  layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, layer);
  return { ...doc, layers };
}

const DEFAULT_NAMES: Record<LayerKind | "empty", string> = {
  vector: "Vetor",
  raster: "Imagem",
  empty: "Camada",
  solid: "Cor sólida",
  gradient: "Gradiente",
  text: "Texto",
  adjust: "Ajuste",
};

function uniqueName(doc: Doc, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

export interface NewLayer {
  kind: "adjust" | "solid" | "gradient" | "text" | "empty";
  name?: string;
  blendMode?: BlendMode;
  opacity?: number;
  above?: string | null;
  color?: string;
  gradient?: Partial<Gradient>;
  text?: Partial<TextStyle>;
  textAt?: { x: number; y: number };
  adjust?: Partial<Adjust>;
}

export function addLayer(spec: NewLayer): string {
  const doc = requireDoc();
  const name = spec.name ?? uniqueName(doc, DEFAULT_NAMES[spec.kind]);
  const base = {
    ...baseLayer(name),
    blendMode: spec.blendMode ?? "normal",
    opacity: spec.opacity ?? 1,
  };
  let layer: Layer;
  switch (spec.kind) {
    case "empty":
      layer = {
        ...base,
        kind: "raster",
        bitmap: createBitmap(doc.width, doc.height),
        width: doc.width,
        height: doc.height,
        transform: centered(doc.width, doc.height),
      };
      break;
    case "solid":
      layer = { ...base, kind: "solid", color: spec.color ?? "#ff7a45" };
      break;
    case "gradient":
      layer = {
        ...base,
        kind: "gradient",
        gradient: mergeGradient(DEFAULT_GRADIENT, spec.gradient),
      };
      break;
    case "text": {
      const text = {
        ...DEFAULT_TEXT,
        size: Math.round(Math.max(24, Math.min(doc.width, doc.height) / 10)),
        ...spec.text,
      };
      const at = spec.textAt ?? { x: doc.width / 2, y: doc.height / 2 };
      layer = {
        ...base,
        name: spec.name ?? uniqueName(doc, text.content.split("\n")[0].slice(0, 30) || "Texto"),
        kind: "text",
        text,
        transform: { ...IDENTITY, x: at.x, y: at.y },
      };
      break;
    }
    case "adjust":
      layer = { ...base, kind: "adjust", adjust: mergeAdjust(DEFAULT_ADJUST, spec.adjust) };
      break;
  }
  commit(`Nova camada: ${layer.name}`, (d) => insertAbove(d, layer, spec.above), {
    active: layer.id,
  });
  return layer.id;
}

/** Adds an image as a new layer, fitted inside the canvas and centered. */
export function placeImage(src: CanvasImageSource, w: number, h: number, name: string): string {
  const doc = requireDoc();
  const fit = Math.min(1, doc.width / w, doc.height / h);
  const layer: RasterLayer = {
    ...baseLayer(uniqueName(doc, name)),
    kind: "raster",
    bitmap: bitmapFrom(src, w, h),
    width: w,
    height: h,
    transform: { ...IDENTITY, x: doc.width / 2, y: doc.height / 2, scale: fit },
  };
  commit(`Inserir ${layer.name}`, (d) => insertAbove(d, layer), { active: layer.id });
  return layer.id;
}

export function mergeGradient(g: Gradient, p?: Partial<Gradient>): Gradient {
  return {
    ...g,
    ...p,
    stops: (p?.stops ?? g.stops).map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      color: s.color,
      position: s.position,
      opacity: s.opacity ?? 1,
    })),
  };
}

export function mergeAdjust(a: Adjust, p?: Partial<Adjust>): Adjust {
  return { ...a, ...p, levels: { ...a.levels, ...p?.levels } };
}

export type LayerProps = Partial<
  Pick<Layer, "name" | "blendMode" | "opacity" | "fill" | "visible" | "locked">
>;

const PROP_LABEL: Record<keyof LayerProps, string> = {
  name: "Renomear",
  blendMode: "Modo de mesclagem",
  opacity: "Opacidade",
  fill: "Preenchimento",
  visible: "Visibilidade",
  locked: "Bloqueio",
};

export function setLayerProps(id: string, props: LayerProps, key?: string): void {
  const layer = requireLayer(id);
  if (
    layer.locked &&
    props.locked !== false &&
    Object.keys(props).some((key) => key !== "locked" && key !== "visible")
  )
    throw new OpError(`A camada "${layer.name}" está bloqueada.`);
  const first = Object.keys(props)[0] as keyof LayerProps | undefined;
  if (!first) return;
  commit(PROP_LABEL[first], (d) => updateLayer(d, id, (l) => ({ ...l, ...props })), {
    key: key ?? `${first}:${id}`,
  });
}

export function setTransform(id: string, t: Partial<Transform>, key?: string): void {
  const l = requireLayer(id);
  if (l.kind !== "raster" && l.kind !== "text" && l.kind !== "vector")
    throw new OpError("Só camadas de imagem e de texto podem ser movidas ou giradas.");
  if (l.locked) throw new OpError(`A camada "${l.name}" está bloqueada.`);
  commit(
    "Transformar",
    (d) => updateLayer<RasterLayer>(d, id, (x) => ({ ...x, transform: { ...x.transform, ...t } })),
    { key: key ?? `transform:${id}` },
  );
}

export interface LayerContent {
  color?: string;
  gradient?: Partial<Gradient>;
  text?: Partial<TextStyle>;
  adjust?: Partial<Adjust>;
}

export function editLayer(id: string, c: LayerContent, key?: string): void {
  const l = requireEditableLayer(id);
  const wrong = (what: string): never => {
    throw new OpError(`A camada "${l.name}" não é ${what}.`);
  };
  let label = "Editar camada";
  const next = ((): Layer => {
    if (c.color !== undefined) {
      if (l.kind !== "solid") wrong("de cor sólida");
      label = "Cor da camada";
      return { ...l, color: c.color } as Layer;
    }
    if (c.gradient) {
      if (l.kind !== "gradient") wrong("de gradiente");
      label = "Gradiente";
      return l.kind === "gradient" ? { ...l, gradient: mergeGradient(l.gradient, c.gradient) } : l;
    }
    if (c.text) {
      if (l.kind !== "text") wrong("de texto");
      label = "Texto";
      return l.kind === "text" ? { ...l, text: { ...l.text, ...c.text } } : l;
    }
    if (c.adjust) {
      if (l.kind !== "adjust") wrong("de ajuste");
      label = "Ajuste";
      return l.kind === "adjust" ? { ...l, adjust: mergeAdjust(l.adjust, c.adjust) } : l;
    }
    return l;
  })();
  commit(label, (d) => updateLayer(d, id, () => next), { key: key ?? `content:${id}` });
}

export function duplicateLayer(id: string): string {
  const l = requireLayer(id);
  const copy: Layer = {
    ...structuredClone(l),
    id: newId(),
    name: uniqueName(requireDoc(), `${l.name} cópia`),
  };
  if (copy.kind === "raster") copy.bitmap = cloneBitmap(copy.bitmap);
  if (copy.mask) copy.mask = { ...copy.mask, bitmap: cloneBitmap(copy.mask.bitmap) };
  commit("Duplicar camada", (d) => insertAbove(d, copy, id), { active: copy.id });
  return copy.id;
}

export function deleteLayer(id: string): void {
  requireEditableLayer(id);
  const doc = requireDoc();
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx < 0) throw new OpError(`Camada ${id} não existe.`);
  const rest = doc.layers.filter((l) => l.id !== id);
  const active =
    useDoc.getState().activeId === id
      ? (rest[Math.min(idx, rest.length - 1)]?.id ?? null)
      : useDoc.getState().activeId;
  commit(
    `Apagar ${doc.layers[idx].name}`,
    (d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }),
    { active },
  );
}

export function reorderLayer(id: string, position: "up" | "down" | "top" | "bottom"): void {
  const doc = requireDoc();
  const i = doc.layers.findIndex((l) => l.id === id);
  if (i < 0) throw new OpError(`Camada ${id} não existe.`);
  const to =
    position === "up"
      ? i + 1
      : position === "down"
        ? i - 1
        : position === "top"
          ? doc.layers.length - 1
          : 0;
  moveLayerTo(id, to);
}

/** Moves a layer to a stack index (0 = bottom). */
export function moveLayerTo(id: string, to: number): void {
  requireEditableLayer(id);
  const doc = requireDoc();
  const i = doc.layers.findIndex((l) => l.id === id);
  const target = Math.max(0, Math.min(doc.layers.length - 1, to));
  if (i < 0 || i === target) return;
  commit("Reordenar camadas", (d) => {
    const layers = [...d.layers];
    const [l] = layers.splice(i, 1);
    layers.splice(target, 0, l);
    return { ...d, layers };
  });
}

/** Merges a raster layer into the raster layer below it (Ctrl+E). */
export function mergeDown(
  id: string,
  renderLayer: (doc: Doc, ids: string[]) => HTMLCanvasElement,
): void {
  const doc = requireDoc();
  const i = doc.layers.findIndex((l) => l.id === id);
  const below = doc.layers[i - 1];
  if (i <= 0 || !below) throw new OpError("Não há camada abaixo para mesclar.");
  requireEditableLayer(id);
  requireEditableLayer(below.id);
  const top = doc.layers[i];
  if (
    below.blendMode !== "normal" ||
    top.blendMode !== "normal" ||
    below.kind === "adjust" ||
    top.kind === "adjust"
  )
    throw new OpError(
      "Essas camadas dependem da composição. Use Copiar imagem para obter o resultado sem alterar a aparência.",
    );
  const canvas = renderLayer(doc, [below.id, id]);
  const merged: RasterLayer = {
    ...baseLayer(below.name),
    kind: "raster",
    bitmap: bitmapFrom(canvas, doc.width, doc.height),
    width: doc.width,
    height: doc.height,
    transform: centered(doc.width, doc.height),
    blendMode: "normal",
    opacity: 1,
  };
  commit(
    "Mesclar para baixo",
    (d) => ({ ...d, layers: [...d.layers.slice(0, i - 1), merged, ...d.layers.slice(i + 1)] }),
    { active: merged.id },
  );
}

/* ----- Masks ----- */

function maskCanvas(doc: Doc, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const id = createBitmap(doc.width, doc.height);
  draw(requireBitmap(id).ctx);
  return id;
}

export function addMask(id: string, fill: "reveal" | "hide" = "reveal"): void {
  const doc = requireDoc();
  const l = requireEditableLayer(id);
  const bitmap = createBitmap(doc.width, doc.height, fill === "reveal" ? "#ffffff" : "#000000");
  commit(l.mask ? "Refazer máscara" : "Adicionar máscara", (d) =>
    updateLayer(d, id, (x) => ({ ...x, mask: maskFor(x, bitmap) })),
  );
}

export interface MaskShape {
  kind: "linear" | "radial";
  angle?: number;
  start?: number;
  end?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  feather?: number;
}

export function shapeMask(id: string, s: MaskShape): void {
  const doc = requireDoc();
  requireEditableLayer(id);
  const W = doc.width;
  const H = doc.height;
  const bitmap = maskCanvas(doc, (ctx) => {
    let g: CanvasGradient;
    if (s.kind === "linear") {
      const a = ((s.angle ?? 90) * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const len = Math.abs(W * dx) + Math.abs(H * dy);
      const at = (t: number): [number, number] => [
        W / 2 + dx * (t - 0.5) * len,
        H / 2 + dy * (t - 0.5) * len,
      ];
      g = ctx.createLinearGradient(...at(s.start ?? 0.3), ...at(s.end ?? 0.7));
    } else {
      const cx = (s.cx ?? 0.5) * W;
      const cy = (s.cy ?? 0.5) * H;
      const r = Math.max(1, (s.radius ?? 0.5) * Math.max(W, H));
      g = ctx.createRadialGradient(cx, cy, r * (1 - (s.feather ?? 0.5)), cx, cy, r);
    }
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  commit("Máscara em degradê", (d) =>
    updateLayer(d, id, (x) => ({ ...x, mask: maskFor(x, bitmap) })),
  );
}

export function invertMask(id: string): void {
  const l = requireEditableLayer(id);
  if (!l.mask) throw new OpError(`A camada "${l.name}" não tem máscara.`);
  const src = requireBitmap(l.mask.bitmap);
  const bitmap = cloneBitmap(l.mask.bitmap);
  const b = requireBitmap(bitmap);
  b.ctx.globalCompositeOperation = "difference";
  b.ctx.fillStyle = "#ffffff";
  b.ctx.fillRect(0, 0, src.canvas.width, src.canvas.height);
  b.ctx.globalCompositeOperation = "source-over";
  commit("Inverter máscara", (d) =>
    updateLayer(d, id, (x) => ({ ...x, mask: { ...l.mask, bitmap, enabled: true } })),
  );
}

export function removeMask(id: string): void {
  requireEditableLayer(id);
  commit("Remover máscara", (d) => updateLayer(d, id, (x) => ({ ...x, mask: undefined })));
}

export function setMaskEnabled(id: string, enabled: boolean): void {
  const l = requireEditableLayer(id);
  if (!l.mask) throw new OpError(`A camada "${l.name}" não tem máscara.`);
  commit(enabled ? "Ativar máscara" : "Desativar máscara", (d) =>
    updateLayer(d, id, (x) => ({ ...x, mask: x.mask && { ...x.mask, enabled } })),
  );
}

export function setMaskLinked(id: string, linked: boolean): void {
  const layer = requireEditableLayer(id),
    doc = requireDoc();
  if (!layer.mask || !("transform" in layer))
    throw new OpError("Escolha uma imagem, texto ou forma com máscara.");
  if (!!layer.mask.reference === linked) return;
  // Bake the current placement first so linking never moves the existing cutout.
  const bitmap = createBitmap(doc.width, doc.height, "#000000");
  const ctx = requireBitmap(bitmap).ctx;
  ctx.save();
  ctx.transform(...inverse(maskPlacement(layer)));
  ctx.drawImage(requireBitmap(layer.mask.bitmap).canvas, 0, 0);
  ctx.restore();
  commit(linked ? "Vincular máscara" : "Desvincular máscara", (d) =>
    updateLayer(d, id, (l) => ({
      ...l,
      mask: {
        bitmap,
        enabled: layer.mask?.enabled ?? true,
        reference: linked ? structuredClone(layer.transform) : undefined,
      },
    })),
  );
}

/* ----- Whole image ----- */

/** Redraws every mask into a new bitmap (crop/rotate/resize keep the old ones for undo). */
function remapMasks(
  doc: Doc,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => void,
): Doc {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!l.mask) return l;
      const src = requireBitmap(l.mask.bitmap).canvas;
      const bitmap = createBitmap(w, h, "#ffffff");
      const ctx = requireBitmap(bitmap).ctx;
      ctx.save();
      draw(ctx, src);
      ctx.restore();
      return { ...l, mask: { ...l.mask, bitmap } };
    }),
  };
}

const mapPlaced = (
  doc: Doc,
  fn: (t: Transform) => Transform,
  grad: (g: Gradient) => Gradient,
): Doc => ({
  ...doc,
  layers: doc.layers.map((l) =>
    l.kind === "raster" || l.kind === "text" || l.kind === "vector"
      ? {
          ...l,
          transform: fn(l.transform),
          mask: l.mask?.reference ? { ...l.mask, reference: fn(l.mask.reference) } : l.mask,
        }
      : l.kind === "gradient"
        ? { ...l, gradient: grad(l.gradient) }
        : l,
  ),
});

export function crop(x: number, y: number, w: number, h: number): void {
  requireDoc();
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  validateDimensions(rw, rh, compositor().maxTexture);
  commit("Cortar", (d) => {
    let next: Doc = { ...d, width: rw, height: rh };
    next = mapPlaced(
      next,
      (t) => ({ ...t, x: t.x - rx, y: t.y - ry }),
      (g) => ({ ...g, cx: (g.cx * d.width - rx) / rw, cy: (g.cy * d.height - ry) / rh }),
    );
    return remapMasks(next, rw, rh, (ctx, src) => {
      ctx.clearRect(0, 0, rw, rh);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rw, rh);
      ctx.drawImage(src, -rx, -ry);
    });
  });
}

/** Largest centered crop with an aspect ratio, optionally shifted toward a focus point (0..1). */
export function aspectRect(
  doc: Doc,
  aspect: number,
  fx = 0.5,
  fy = 0.5,
): { x: number; y: number; w: number; h: number } {
  let w = doc.width;
  let h = Math.round(w / aspect);
  if (h > doc.height) {
    h = doc.height;
    w = Math.round(h * aspect);
  }
  return { x: Math.round((doc.width - w) * fx), y: Math.round((doc.height - h) * fy), w, h };
}

export const parseAspect = (s: string): number => {
  const [a, b] = s.split(":").map(Number);
  if (!a || !b) throw new OpError(`Proporção inválida: ${s}`);
  return a / b;
};

/** Rotates the whole image: 1 = 90° clockwise, -1 = 90° counter-clockwise, 2 = 180°. */
export function rotateImage(dir: 1 | -1 | 2): void {
  if (dir === 2) {
    rotateImage(1);
    rotateImage(1);
    return;
  }
  const doc = requireDoc();
  const W = doc.width;
  const H = doc.height;
  commit(dir === 1 ? "Girar 90° à direita" : "Girar 90° à esquerda", (d) => {
    let next: Doc = { ...d, width: H, height: W };
    next = mapPlaced(
      next,
      (t) => ({
        ...t,
        x: dir === 1 ? H - t.y : t.y,
        y: dir === 1 ? t.x : W - t.x,
        rotation: t.rotation + 90 * dir,
        basis: t.basis ? [t.basis[3], -t.basis[2], -t.basis[1], t.basis[0]] : undefined,
      }),
      (g) => ({
        ...g,
        angle: g.angle + 90 * dir,
        cx: dir === 1 ? 1 - g.cy : g.cy,
        cy: dir === 1 ? g.cx : 1 - g.cx,
      }),
    );
    return remapMasks(next, H, W, (ctx, src) => {
      ctx.translate(H / 2, W / 2);
      ctx.rotate((dir * Math.PI) / 2);
      ctx.drawImage(src, -W / 2, -H / 2);
    });
  });
}

export function flipImage(axis: "horizontal" | "vertical"): void {
  const doc = requireDoc();
  const W = doc.width;
  const H = doc.height;
  const hz = axis === "horizontal";
  commit(hz ? "Espelhar horizontal" : "Espelhar vertical", (d) => {
    const next = mapPlaced(
      d,
      (t) =>
        hz
          ? {
              ...t,
              x: W - t.x,
              flipX: !t.flipX,
              rotation: -t.rotation,
              basis: t.basis ? [t.basis[0], -t.basis[1], -t.basis[2], t.basis[3]] : undefined,
            }
          : {
              ...t,
              y: H - t.y,
              flipY: !t.flipY,
              rotation: -t.rotation,
              basis: t.basis ? [t.basis[0], -t.basis[1], -t.basis[2], t.basis[3]] : undefined,
            },
      (g) =>
        hz ? { ...g, angle: 180 - g.angle, cx: 1 - g.cx } : { ...g, angle: -g.angle, cy: 1 - g.cy },
    );
    return remapMasks(next, W, H, (ctx, src) => {
      ctx.translate(hz ? W : 0, hz ? 0 : H);
      ctx.scale(hz ? -1 : 1, hz ? 1 : -1);
      ctx.drawImage(src, 0, 0);
    });
  });
}

export function resizeImage(w: number, h: number): void {
  const doc = requireDoc();
  const nw = Math.max(1, Math.round(w));
  const nh = Math.max(1, Math.round(h));
  validateDimensions(nw, nh, compositor().maxTexture);
  const sx = nw / doc.width;
  const sy = nh / doc.height;
  commit("Tamanho da imagem", (d) => {
    let next: Doc = { ...d, width: nw, height: nh };
    next = mapPlaced(
      next,
      (t) => resizedPlacement(t, sx, sy),
      (g) => g,
    );
    return remapMasks(next, nw, nh, (ctx, src) => {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, nw, nh);
    });
  });
}
