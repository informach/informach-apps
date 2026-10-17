import type { Motion, Shadow } from "./compose.ts";

/**
 * Annotations drawn by EdiAula (arrows, speech balloons, notes, labels, titles, highlight boxes,
 * step numbers). Each one is rendered to a transparent PNG that the clip shows like any image,
 * so the preview and the export are the same picture. Sizes are pixels of a 1080p frame.
 */

export type AnnotationKind =
  | "arrow"
  | "balloon"
  | "note"
  | "label"
  | "title"
  | "highlight"
  | "step"
  | "card"
  | "lowerthird"
  | "panel"
  | "line";
export type Tail =
  | "none"
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right"
  | "left"
  | "right";

export interface BalloonGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  tipX: number;
  tipY: number;
}

/** Resizing the PNG for a longer tail must not move the balloon body. */
export function preserveBalloonBody<T extends { x: number; y: number; scale: number }>(
  value: T,
  oldImage: { width: number; height: number },
  newImage: { width: number; height: number },
  frame: { width: number; height: number },
  oldBody?: BalloonGeometry,
  newBody?: BalloonGeometry,
): T {
  const oldFit = Math.min(frame.width / oldImage.width, frame.height / oldImage.height);
  const newFit = Math.min(frame.width / newImage.width, frame.height / newImage.height);
  const density = value.scale * oldFit;
  const dx =
    oldBody && newBody
      ? ((oldBody.x +
          oldBody.w / 2 -
          oldImage.width / 2 -
          (newBody.x + newBody.w / 2 - newImage.width / 2)) *
          density) /
        frame.width
      : 0;
  const dy =
    oldBody && newBody
      ? ((oldBody.y +
          oldBody.h / 2 -
          oldImage.height / 2 -
          (newBody.y + newBody.h / 2 - newImage.height / 2)) *
          density) /
        frame.height
      : 0;
  return { ...value, x: value.x + dx, y: value.y + dy, scale: (value.scale * oldFit) / newFit };
}

/** Coordinates relative to the body; the attachment follows the nearest side. */
export function freeBalloonTip(point: { x: number; y: number }): {
  point: { x: number; y: number };
  tail: Tail;
} {
  let { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = 1.25;
    y = 0.5;
  }
  if (Math.abs(x - 0.5) >= Math.abs(y - 0.5)) {
    x = x >= 0.5 ? Math.max(1.02, x) : Math.min(-0.02, x);
    return { point: { x, y }, tail: x > 0.5 ? "right" : "left" };
  }
  y = y >= 0.5 ? Math.max(1.02, y) : Math.min(-0.02, y);
  return { point: { x, y }, tail: y > 0.5 ? "bottom-left" : "top-left" };
}

/** One closed outline, so the tail never leaves a stroke across the balloon's interior. */
export function balloonPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  length: number,
  tail: Tail,
  tip?: { x: number; y: number },
): string {
  const r = Math.min(radius, w / 4, h / 4);
  const b = Math.min(length * 0.42, (w - 2 * r) / 5, (h - 2 * r) / 3);
  const cx =
    x +
    Math.max(
      r + b,
      Math.min(w - r - b, tip ? tip.x - x : w * (tail.endsWith("left") ? 0.28 : 0.72)),
    );
  const cy = Math.max(y + r + b, Math.min(y + h - r - b, tip?.y ?? y + h / 2));
  const tipX = tip?.x ?? cx + (tail.endsWith("left") ? -length * 0.35 : length * 0.35);
  const parts = [`M ${x + r} ${y}`];
  if (tail.startsWith("top"))
    parts.push(
      `L ${cx - b} ${y} Q ${cx} ${y} ${tipX} ${tip?.y ?? y - length} Q ${cx + b * 0.45} ${y} ${cx + b} ${y}`,
    );
  parts.push(`L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r}`);
  if (tail === "right")
    parts.push(
      `L ${x + w} ${cy - b} Q ${x + w} ${cy - b * 0.4} ${tip?.x ?? x + w + length} ${tip?.y ?? cy} Q ${x + w} ${cy + b * 0.4} ${x + w} ${cy + b}`,
    );
  parts.push(`L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h}`);
  if (tail.startsWith("bottom"))
    parts.push(
      `L ${cx + b} ${y + h} Q ${cx + b * 0.45} ${y + h} ${tipX} ${tip?.y ?? y + h + length} Q ${cx} ${y + h} ${cx - b} ${y + h}`,
    );
  parts.push(`L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r}`);
  if (tail === "left")
    parts.push(
      `L ${x} ${cy + b} Q ${x} ${cy + b * 0.4} ${tip?.x ?? x - length} ${tip?.y ?? cy} Q ${x} ${cy - b * 0.4} ${x} ${cy - b}`,
    );
  parts.push(`L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`);
  return parts.join(" ");
}

export interface Annotation {
  kind: AnnotationKind;
  text?: string;
  color: string;
  /** Arrow: degrees, 0 = pointing right, 90 = pointing down. */
  angle?: number;
  /** Arrow length. */
  length?: number;
  /** Text boxes: maximum width before wrapping. */
  width?: number;
  fontSize?: number;
  /** Balloon: where its tail points. */
  tail?: Tail;
  /** Free tail tip, in fractions of the balloon body (may lie outside 0..1). */
  tailPoint?: { x: number; y: number };
  /** Body and tip in the generated PNG, including its transparent padding. */
  balloonGeometry?: BalloonGeometry;
  /** Highlight box and panel size (a panel of 1920x1080 or more fills the frame). */
  boxWidth?: number;
  boxHeight?: number;
  /** Opening/closing card: small line above the title (course) and line below it. */
  kicker?: string;
  subtitle?: string;
  /** Opening/closing card layout; titles: how the lines line up. */
  layout?: "left" | "center";
  /** Typeface of the text (default: Plus Jakarta Sans). */
  fontFamily?: string;
  /** Outline around the shape or the letters; absent = the kind's usual look, width 0 = none. */
  outline?: Outline;
  /** Drop shadow; absent = the kind's usual soft shadow, null = none. */
  shadow?: Shadow | null;
  /** Arrow and line: thickness and head size in px, straight or curved (−1..1), 0, 1 or 2 heads. */
  thickness?: number;
  headSize?: number;
  arrowStyle?: "solid" | "line" | "dashed" | "dotted";
  heads?: 0 | 1 | 2;
  curve?: number;
  /** Highlight and shapes: form, fill inside (#RRGGBB, absent = none) and its opacity. Balloon: its color inside (absent = white). */
  shape?: "rounded" | "rect" | "ellipse" | "triangle";
  fill?: string;
  fillOpacity?: number;
  /** Palette colors: text on light backgrounds (default #12140A) and the card's accent (default lime). */
  ink?: string;
  accent?: string;
}

export interface Outline {
  color: string;
  /** 0 = no outline. */
  width: number;
  /** Solid when absent; `true` is the old way of saying dashed. */
  dash?: boolean | "dashed" | "dotted";
}

export type OutlineStyle = "none" | "solid" | "dashed" | "dotted";

export function outlineStyle(o: Outline): OutlineStyle {
  if (o.width <= 0) return "none";
  return o.dash === true || o.dash === "dashed"
    ? "dashed"
    : o.dash === "dotted"
      ? "dotted"
      : "solid";
}

/** The usual outline of each kind (what absent `outline` means). */
export function defaultOutline(a: Pick<Annotation, "kind" | "color" | "ink">): Outline {
  const light = (hex: string): boolean => {
    const v = parseInt(hex.replace("#", "").slice(0, 6), 16);
    return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 150;
  };
  switch (a.kind) {
    case "arrow":
      return { color: "#FFFFFF", width: 4 };
    case "balloon":
      return { color: a.color, width: 3 };
    case "title":
      return { color: light(a.color) ? (a.ink ?? "#12140A") : "#FFFFFF", width: 5 };
    case "highlight":
      return { color: a.color, width: 8 };
    case "step":
      return { color: "#FFFFFF", width: 3 };
    default:
      return { color: "#FFFFFF", width: 0 };
  }
}

export const PALETTE = [
  "#C8F031",
  "#FFD60A",
  "#FF4D4D",
  "#3D6BFF",
  "#9B7BFF",
  "#FFFFFF",
  "#12140A",
];

export interface AnnotationPreset {
  kind: AnnotationKind;
  label: string;
  spec: Annotation;
  /** Default seconds on screen. */
  duration: number;
  enter: Motion;
  exit: Motion;
}

export const ANNOTATION_PRESETS: AnnotationPreset[] = [
  {
    kind: "arrow",
    label: "Seta",
    spec: { kind: "arrow", color: "#FF4D4D", angle: 135, length: 200 },
    duration: 3,
    enter: "pop",
    exit: "fade",
  },
  {
    kind: "balloon",
    label: "Balão",
    spec: {
      kind: "balloon",
      color: "#12140A",
      text: "Olha aqui!",
      width: 380,
      fontSize: 32,
      tail: "bottom-left",
    },
    duration: 3.5,
    enter: "pop",
    exit: "fade",
  },
  {
    kind: "note",
    label: "Nota",
    spec: {
      kind: "note",
      color: "#C8F031",
      text: "Dica: arraste o bloco até o encaixe.",
      width: 420,
      fontSize: 30,
    },
    duration: 4,
    enter: "slide-up",
    exit: "fade",
  },
  {
    kind: "label",
    label: "Rótulo",
    spec: { kind: "label", color: "#12140A", text: "Ao iniciar", fontSize: 28 },
    duration: 3,
    enter: "grow",
    exit: "fade",
  },
  {
    kind: "title",
    label: "Título",
    spec: { kind: "title", color: "#FFFFFF", text: "Seção 1", fontSize: 72, width: 1400 },
    duration: 3,
    enter: "slide-up",
    exit: "fade",
  },
  {
    kind: "highlight",
    label: "Destaque",
    spec: { kind: "highlight", color: "#FFD60A", boxWidth: 360, boxHeight: 200 },
    duration: 3,
    enter: "grow",
    exit: "fade",
  },
  {
    kind: "lowerthird",
    label: "Faixa de nome",
    spec: {
      kind: "lowerthird",
      color: "#C8F031",
      text: "Professora Helena",
      subtitle: "Sistema Zero",
    },
    duration: 5,
    enter: "slide-right",
    exit: "fade",
  },
  {
    kind: "step",
    label: "Passo",
    spec: { kind: "step", color: "#C8F031", text: "1" },
    duration: 3,
    enter: "pop",
    exit: "fade",
  },
  {
    kind: "panel",
    label: "Forma",
    spec: { kind: "panel", color: "#3D6BFF", boxWidth: 420, boxHeight: 260, shape: "rounded" },
    duration: 4,
    enter: "grow",
    exit: "fade",
  },
  {
    kind: "line",
    label: "Linha",
    spec: {
      kind: "line",
      color: "#FFFFFF",
      length: 360,
      thickness: 8,
      arrowStyle: "line",
      heads: 0,
    },
    duration: 4,
    enter: "grow",
    exit: "fade",
  },
];

/** Seconds the entrance and exit take for annotations. */
export const ANNOTATION_MOTION = { enter: 0.35, exit: 0.25 };

/** Memes and quick images: 2–3 s, popping in at the side, never over the middle of the screen. */
export const MEME = {
  duration: 2.5,
  transform: { x: 0.17, y: 0.72, scale: 0.4, opacity: 1 },
  enter: "pop" as Motion,
  exit: "fade" as Motion,
};

export const KIND_LABEL: Record<AnnotationKind, string> = {
  ...(Object.fromEntries(ANNOTATION_PRESETS.map((p) => [p.kind, p.label])) as Record<
    AnnotationKind,
    string
  >),
  card: "Cartela",
};

/** Full-screen opening and closing cards. */
export const CARD = {
  duration: 4,
  color: "#12140A",
  enter: "grow" as Motion,
  exit: "fade" as Motion,
};
