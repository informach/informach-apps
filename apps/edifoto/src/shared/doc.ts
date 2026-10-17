import type { BlendMode } from "./blendModes.ts";

/**
 * The image document. Layers are stored bottom-first (index 0 is the lowest layer). Pixel data
 * never lives here: raster layers and masks point at bitmaps by id, kept by the renderer.
 */

/** Placement of content inside the document. x/y is the content's CENTER, in document pixels. */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Mask {
  /** Document-sized grayscale bitmap: white shows the layer, black hides it. */
  bitmap: string;
  enabled: boolean;
}

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  /** 0..1 */
  opacity: number;
  /** 0..1, multiplies opacity (kept separate like Photoshop's "Preenchimento"). */
  fill: number;
  mask?: Mask;
}

export interface RasterLayer extends LayerBase {
  kind: "raster";
  bitmap: string;
  width: number;
  height: number;
  transform: Transform;
}

export interface SolidLayer extends LayerBase {
  kind: "solid";
  color: string;
}

export interface GradientStop {
  id?: string;
  color: string;
  /** 0..1 along the gradient */
  position: number;
  /** 0..1 */
  opacity: number;
}

/** Additive compatibility for legacy files; preserve object identity on no-op
 * commits so normalization cannot create artificial undo steps. */
export function identifyGradientStops(doc: Doc): Doc {
  let changed = false;
  const layers = doc.layers.map((layer) => {
    if (layer.kind !== "gradient") return layer;
    const used = new Set<string>();
    let layerChanged = false;
    const stops = layer.gradient.stops.map((stop) => {
      if (stop.id && !used.has(stop.id)) {
        used.add(stop.id);
        return stop;
      }
      const id = crypto.randomUUID();
      used.add(id);
      layerChanged = true;
      return { ...stop, id };
    });
    if (!layerChanged) return layer;
    changed = true;
    return { ...layer, gradient: { ...layer.gradient, stops } };
  });
  return changed ? { ...doc, layers } : doc;
}

export interface Gradient {
  type: "linear" | "radial";
  /** Degrees; 90 = top to bottom. Linear only. */
  angle: number;
  stops: GradientStop[];
  /** Radial center, 0..1 of the document. */
  cx: number;
  cy: number;
  /** Radial radius as a fraction of the document diagonal / linear length factor. */
  scale: number;
}

export interface GradientLayer extends LayerBase {
  kind: "gradient";
  gradient: Gradient;
}

export interface TextStyle {
  content: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: TextStyle;
  transform: Transform;
}

export interface Adjust {
  /** Stops, -3..3 */
  curves?: [number, number, number, number, number];
  exposure: number;
  /** All of these are -100..100 */
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  /** Degrees, -180..180 */
  hue: number;
  /** Input levels per channel (0..255) and gamma. */
  levels: { black: [number, number, number]; white: [number, number, number]; gamma: number };
  grayscale: boolean;
  invert: boolean;
}

export interface AdjustLayer extends LayerBase {
  kind: "adjust";
  adjust: Adjust;
}

export type ShapeKind = "rectangle" | "ellipse" | "triangle" | "polygon" | "star" | "line" | "path";
export interface Point {
  x: number;
  y: number;
}
export interface Anchor extends Point {
  incoming?: Point;
  outgoing?: Point;
  smooth?: boolean;
}
export interface VectorStyle {
  shape: ShapeKind;
  width: number;
  height: number;
  radius: number;
  sides: number;
  innerRadius: number;
  fillOpacity?: number;
  fillColor: string | null;
  strokeColor: string | null;
  strokeWidth: number;
  strokeAlign: "inside" | "center" | "outside";
  closed: boolean;
  points: Anchor[];
}
export interface VectorLayer extends LayerBase {
  kind: "vector";
  vector: VectorStyle;
  transform: Transform;
}
export const DEFAULT_VECTOR: VectorStyle = {
  shape: "rectangle",
  width: 240,
  height: 160,
  radius: 24,
  sides: 5,
  innerRadius: 0.45,
  fillColor: "#ff7a45",
  strokeColor: "#ffffff",
  strokeWidth: 2,
  strokeAlign: "inside",
  closed: true,
  points: [],
};
export type Layer =
  | RasterLayer
  | SolidLayer
  | GradientLayer
  | TextLayer
  | AdjustLayer
  | VectorLayer;
export type LayerKind = Layer["kind"];

export interface Doc {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
}

export const IDENTITY: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

export const DEFAULT_ADJUST: Adjust = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  hue: 0,
  levels: { black: [0, 0, 0], white: [255, 255, 255], gamma: 1 },
  grayscale: false,
  invert: false,
};

export const DEFAULT_TEXT: TextStyle = {
  content: "Texto",
  font: "Inter Variable",
  size: 96,
  weight: 700,
  italic: false,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.15,
  letterSpacing: 0,
};

export const DEFAULT_GRADIENT: Gradient = {
  type: "linear",
  angle: 90,
  stops: [
    { color: "#ffb347", position: 0, opacity: 1 },
    { color: "#ff3d7f", position: 1, opacity: 1 },
  ],
  cx: 0.5,
  cy: 0.5,
  scale: 1,
};

export const KIND_LABEL: Record<LayerKind, string> = {
  vector: "Vetor",
  raster: "Imagem",
  solid: "Cor sólida",
  gradient: "Gradiente",
  text: "Texto",
  adjust: "Ajuste",
};

let counter = 0;
export const newId = (prefix = "l"): string =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function baseLayer(name: string): LayerBase {
  return {
    id: newId(),
    name,
    visible: true,
    locked: false,
    blendMode: "normal",
    opacity: 1,
    fill: 1,
  };
}

export const isNeutral = (a: Adjust): boolean =>
  JSON.stringify(a) === JSON.stringify(DEFAULT_ADJUST);

/** Which adjustment fields differ from neutral, for compact descriptions. */
export function adjustSummary(a: Adjust): string {
  const parts: string[] = [];
  const add = (label: string, v: number, unit = ""): void => {
    if (Math.abs(v) > 0.001)
      parts.push(`${label} ${v > 0 ? "+" : ""}${Math.round(v * 100) / 100}${unit}`);
  };
  add("exposição", a.exposure, " EV");
  add("brilho", a.brightness);
  add("contraste", a.contrast);
  add("realces", a.highlights);
  add("sombras", a.shadows);
  add("temperatura", a.temperature);
  add("tonalidade", a.tint);
  add("vibração", a.vibrance);
  add("saturação", a.saturation);
  add("matiz", a.hue, "°");
  const l = a.levels;
  if (l.black.some((v) => v > 0) || l.white.some((v) => v < 255) || l.gamma !== 1)
    parts.push("níveis");
  if (a.grayscale) parts.push("preto e branco");
  if (a.invert) parts.push("inverter");
  if (a.curves?.some((v, i) => Math.abs(v - i / 4) > 0.001)) parts.push("curvas");
  return parts.join(", ") || "neutro";
}

/** Rotates the document 90° clockwise (+1) or counter-clockwise (-1): returns new layer placements. */
export function rotatePoint(
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 1 | -1,
): [number, number] {
  return dir === 1 ? [h - y, x] : [y, w - x];
}

/** The visible area of a layer (axis-aligned bounding box), in document pixels. */
export function contentBounds(
  layer: Layer,
  docW: number,
  docH: number,
): { x: number; y: number; w: number; h: number } {
  if (layer.kind === "raster") {
    const t = layer.transform;
    const w = layer.width * t.scale;
    const h = layer.height * t.scale;
    const r = (t.rotation * Math.PI) / 180;
    const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
    const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
    return { x: t.x - bw / 2, y: t.y - bh / 2, w: bw, h: bh };
  }
  return { x: 0, y: 0, w: docW, h: docH };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
