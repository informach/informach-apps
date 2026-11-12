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
  | "line"
  /** A box with a role (action, reaction, instruction, notice): centered heavy text, an optional
   *  number in its corner and a small pointer on one side. */
  | "box"
  /** A row of a list: a card with a marker (number, letter, icon or check), a line of text and
   *  an optional line below it (objectives, steps, quiz options, what was learned). */
  | "item"
  /** Strokes drawn on the screen during a take (shared/drawing.ts): a video, not a picture. */
  | "drawing"
  /** A white or black board put over the screen while drawing, with its strokes: a video too. */
  | "board";
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

/** Length of a balloon's tail when it is not dragged, in 1080p pixels. */
export const BALLOON_TAIL = 40;

type Point = { x: number; y: number };

/** Corner radius of a balloon's body (never more than a quarter of a side). */
const bodyRadius = (w: number, h: number, radius: number): number => Math.min(radius, w / 4, h / 4);

/**
 * Half the width where the tail leaves the body: broad, growing with the tail's reach (`dist`),
 * never more than a third of the side it leaves (`along`, with its rounded corners `r`).
 */
export function tailHalfWidth(along: number, r: number, length: number, dist: number): number {
  return Math.max(
    0,
    Math.min(Math.max(length * 0.45, dist * 0.2), length * 2.4, (along - 2 * r) / 3.2),
  );
}

/**
 * Where a tail leaves the body and where it points: the middle of its base on that side and
 * its tip. Without a dragged tip, the tail of the preset direction, `length` long.
 */
export function balloonTail(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  length: number,
  tail: Tail,
  tip?: Point,
  straight = false,
): { base: Point; b: number; tip: Point } {
  const r = bodyRadius(w, h, radius);
  const across = tail.startsWith("top") || tail.startsWith("bottom");
  const along = across ? w : h;
  const side = tail.startsWith("top") ? y : tail.startsWith("bottom") ? y + h : 0;
  const edge = tail === "left" ? x : tail === "right" ? x + w : 0;
  // How far the tip reaches beyond the side (its reach without a dragged tip is the length).
  const dist = tip
    ? across
      ? Math.hypot(tip.x - Math.max(x + r, Math.min(x + w - r, tip.x)), tip.y - side)
      : Math.hypot(tip.y - Math.max(y + r, Math.min(y + h - r, tip.y)), tip.x - edge)
    : length;
  // Short, the base is the kit pointer's (36 px in 1080p); pulled far, it widens, never a needle.
  const b = tailHalfWidth(along, r, length, dist);
  // Without a dragged tip, a straight tail points square out of its side, short like the kit's.
  const short = length * 0.55;
  const clampAlong = (v: number, from: number, size: number): number =>
    Math.max(from + r + b, Math.min(from + size - r - b, v));
  if (across) {
    const cx = clampAlong(tip ? tip.x : x + w * (tail.endsWith("left") ? 0.28 : 0.72), x, w);
    return {
      base: { x: cx, y: side },
      b,
      // Leaning out past the base, so the tail sweeps toward its side.
      tip:
        tip ??
        (straight
          ? { x: cx, y: tail.startsWith("top") ? y - short : y + h + short }
          : {
              x: cx + (tail.endsWith("left") ? -length : length),
              y: tail.startsWith("top") ? y - length : y + h + length,
            }),
    };
  }
  const cy = clampAlong(tip ? tip.y : y + h / 2, y, h);
  return {
    base: { x: edge, y: cy },
    b,
    tip: tip ?? {
      x: tail === "left" ? x - (straight ? short : length) : x + w + (straight ? short : length),
      y: cy,
    },
  };
}

/** A straight tail: two lines from the base corners to the tip. */
const tailLines = (A: Point, B: Point, T: Point): string =>
  `L ${A.x} ${A.y} L ${T.x} ${T.y} L ${B.x} ${B.y}`;

/**
 * The tail between its base corners A and B (in the outline's order) and its tip T: each edge
 * leaves the body square and sweeps to the tip, narrowing as it goes, so the tail bends toward
 * where it points like a comic or Camtasia callout, and ends sharp.
 */
function comicTail(A: Point, B: Point, T: Point, out: Point): string {
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const depth = Math.max(1, (T.x - M.x) * out.x + (T.y - M.y) * out.y);
  const control = (P: Point): Point => {
    // Halfway between the straight edge and a line square out of the body...
    const straight = { x: (P.x + T.x) / 2, y: (P.y + T.y) / 2 };
    const square = { x: P.x + out.x * depth * 0.55, y: P.y + out.y * depth * 0.55 };
    // ...pulled toward the middle of the base, so it narrows.
    return {
      x: straight.x * 0.45 + square.x * 0.55 + (M.x - P.x) * 0.35,
      y: straight.y * 0.45 + square.y * 0.55 + (M.y - P.y) * 0.35,
    };
  };
  const a = control(A);
  const b = control(B);
  return `L ${A.x} ${A.y} Q ${a.x} ${a.y} ${T.x} ${T.y} Q ${b.x} ${b.y} ${B.x} ${B.y}`;
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
  tip?: Point,
  straight = false,
): string {
  const r = bodyRadius(w, h, radius);
  const t = tail === "none" ? null : balloonTail(x, y, w, h, radius, length, tail, tip, straight);
  const tailCurve = (A: Point, B: Point, T: Point, out: Point): string =>
    straight ? tailLines(A, B, T) : comicTail(A, B, T, out);
  const parts = [`M ${x + r} ${y}`];
  if (t && tail.startsWith("top"))
    parts.push(
      tailCurve({ x: t.base.x - t.b, y }, { x: t.base.x + t.b, y }, t.tip, { x: 0, y: -1 }),
    );
  parts.push(`L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r}`);
  if (t && tail === "right")
    parts.push(
      tailCurve({ x: x + w, y: t.base.y - t.b }, { x: x + w, y: t.base.y + t.b }, t.tip, {
        x: 1,
        y: 0,
      }),
    );
  parts.push(`L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h}`);
  if (t && tail.startsWith("bottom"))
    parts.push(
      tailCurve({ x: t.base.x + t.b, y: y + h }, { x: t.base.x - t.b, y: y + h }, t.tip, {
        x: 0,
        y: 1,
      }),
    );
  parts.push(`L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r}`);
  if (t && tail === "left")
    parts.push(
      tailCurve({ x, y: t.base.y + t.b }, { x, y: t.base.y - t.b }, t.tip, { x: -1, y: 0 }),
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
  /** The "Na tela" direction of the script this annotation was made from (directionId), so
   *  the same direction is not annotated twice. */
  direction?: string;
  /** Opening/closing card layout; titles: how the lines line up. */
  layout?: "left" | "center";
  /** Typeface of the text (default: DEFAULT_FONT of shared/fonts.ts, Baloo 2). */
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
  /**
   * Highlight: darkens what is drawn below it, outside its box, at this opacity (0..1; absent or 0
   * = not darkened). See shared/dim.ts.
   */
  dim?: number;
  /** Palette colors: text on light backgrounds (default #12140A) and the card's accent (default lime). */
  ink?: string;
  accent?: string;
  /** Comes in word by word (with the words' times when they are said) or drawn like a stroke. */
  reveal?: "words" | "draw";
  /** Box and balloon in the kit's look: a number in its corner; item: the number or letter of its
   *  marker (at most 3 characters). */
  badge?: string;
  /**
   * Balloon: "comic" (the usual: an outline in its color and a curved tail) or "kit" (the kit's
   * box: no outline, heavy centered text, corners of 30 px and a short straight tail).
   */
  look?: "comic" | "kit";
  /** Box: a small pointer on one side, at `pointerAt` along it (0..1, absent = the middle). */
  pointer?: Pointer;
  pointerAt?: number;
  /** Box and item: color of the main text (absent: the palette's ink or white, by the background). */
  textColor?: string;
  /** Label and item: a small drawing beside the text (item: inside its marker). */
  icon?: AnnotationIcon;
  /** Item: its marker: a circle, a rounded square (quiz letters), a check, or none. */
  marker?: ItemMarker;
  /** Item: no card behind it, only the marker and the text (a check list over the background). */
  bare?: boolean;
  /** Item: typeface of the line below (absent: the title's). */
  bodyFont?: string;
  /** Which of the theme's fonts the text takes (absent: the kind's own, see palettes.ts). */
  textRole?: "heading" | "body";
}

export type Pointer = "none" | "up" | "down" | "left" | "right";
export type ItemMarker = "circle" | "square" | "check" | "none";

/** Small drawings of labels and items (lucide icons, drawn into the picture). */
export const ANNOTATION_ICONS = {
  pause: "Pausa",
  play: "Play",
  check: "Certo",
  sparkles: "Brilho",
  star: "Estrela",
  flag: "Bandeira",
  gamepad: "Controle",
  key: "Chave",
  clock: "Relógio",
  flame: "Foguinho",
  compass: "Bússola",
  lightbulb: "Ideia",
  target: "Alvo",
  rocket: "Foguete",
  trophy: "Troféu",
  help: "Dúvida",
  code: "Código",
  pencil: "Lápis",
} as const;
export type AnnotationIcon = keyof typeof ANNOTATION_ICONS;
export const ICON_IDS = Object.keys(ANNOTATION_ICONS) as AnnotationIcon[];

/**
 * Sizes of the boxes and list items, in 1080p pixels (the lesson slide kit, drawn at 1280×720,
 * times 1.5): heavy text 45 px in boxes, 48 px in items, corners of 30 px.
 */
export const KIT = {
  boxText: 45,
  itemText: 48,
  itemSub: 36,
  itemKicker: 30,
  itemWidth: 1140,
  radius: 30,
  marker: 96,
  badge: 54,
  pointer: { base: 36, height: 21 },
} as const;

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

const isLightHex = (hex: string): boolean => {
  const v = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 150;
};

/** The usual outline of each kind (what absent `outline` means). */
export function defaultOutline(
  a: Pick<Annotation, "kind" | "color" | "ink"> & Pick<Annotation, "look">,
): Outline {
  switch (a.kind) {
    case "arrow":
      return { color: "#FFFFFF", width: 4 };
    case "balloon":
      return { color: a.color, width: a.look === "kit" ? 0 : 3 };
    case "title":
      return { color: isLightHex(a.color) ? (a.ink ?? "#12140A") : "#FFFFFF", width: 5 };
    case "highlight":
      return { color: a.color, width: 8 };
    case "step":
      return { color: "#FFFFFF", width: 3 };
    default:
      return { color: "#FFFFFF", width: 0 };
  }
}

/**
 * Text size of balloons, notes and labels in 1080p pixels: 3.3% of the frame height, what a child
 * of 9 to 14 reads on a phone (the check before exporting asks at least this much).
 */
export const ANNOTATION_TEXT = 36;

/** The text box of balloons, notes and labels, in 1080p pixels: drawn this way and edited this way. */
export interface TextBoxLayout {
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  /** Width the text wraps at (labels never wrap). */
  maxWidth: number;
  wraps: boolean;
  align: "center" | "left";
  /** Inside of the box and the color of the letters on it. */
  fill: string;
  textColor: string;
}

export function textBoxLayout(
  a: Pick<
    Annotation,
    | "kind"
    | "fontSize"
    | "width"
    | "layout"
    | "fill"
    | "color"
    | "ink"
    | "textColor"
    | "boxWidth"
    | "look"
  >,
): TextBoxLayout {
  // The kit's box, and a balloon in the kit's look (the same box with a tail that can be moved).
  const box = kitBox(a);
  const fontSize = a.fontSize ?? (box ? KIT.boxText : ANNOTATION_TEXT);
  const label = a.kind === "label";
  const fill = a.kind === "balloon" ? (a.fill ?? "#FFFFFF") : a.color;
  const padX = label ? 20 : box ? 42 : 26;
  return {
    fontSize,
    lineHeight: fontSize * (box ? 1.12 : 1.3),
    padX,
    padY: label ? 12 : box ? 24 : 20,
    // A box of a set width wraps inside it.
    maxWidth:
      a.kind === "box" && a.boxWidth
        ? Math.max(40, a.boxWidth - padX * 2)
        : (a.width ?? (box ? 450 : 420)),
    wraps: !label,
    align: (a.kind === "balloon" || box) && a.layout !== "left" ? "center" : "left",
    fill,
    textColor: a.textColor ?? (isLightHex(fill) ? (a.ink ?? "#12140A") : "#FFFFFF"),
  };
}

/** Drawn like the kit's box: a box, or a balloon in the kit's look. */
export const kitBox = (a: Pick<Annotation, "kind" | "look">): boolean =>
  a.kind === "box" || (a.kind === "balloon" && a.look === "kit");

/** A balloon's corners and tail: the comic's, or the kit's (round corners, short straight tail). */
export function balloonLook(a: Pick<Annotation, "look">): { radius: number; straight: boolean } {
  return a.look === "kit"
    ? { radius: KIT.radius, straight: true }
    : { radius: 16, straight: false };
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
      fontSize: ANNOTATION_TEXT,
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
      fontSize: ANNOTATION_TEXT,
    },
    duration: 4,
    enter: "slide-up",
    exit: "fade",
  },
  {
    kind: "label",
    label: "Rótulo",
    spec: { kind: "label", color: "#12140A", text: "Ao iniciar", fontSize: ANNOTATION_TEXT },
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
    kind: "box",
    label: "Caixa",
    spec: {
      kind: "box",
      color: "#FFFFFF",
      text: "Esse é o personagem",
      badge: "1",
      pointer: "down",
      width: 380,
    },
    duration: 4,
    enter: "pop",
    exit: "fade",
  },
  {
    kind: "item",
    label: "Item",
    spec: {
      kind: "item",
      color: "#3D6BFF",
      fill: "#FFFFFF",
      text: "Mover o personagem com as setas",
      badge: "1",
      marker: "circle",
    },
    duration: 5,
    enter: "slide-up",
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
  drawing: "Desenho",
  board: "Quadro",
};

/** The annotations made of a take's drawing (a video of its strokes, not a picture of fields). */
export const isDrawingKind = (kind: AnnotationKind): boolean =>
  kind === "drawing" || kind === "board";

/** Full-screen opening and closing cards. */
export const CARD = {
  duration: 4,
  color: "#12140A",
  enter: "grow" as Motion,
  exit: "fade" as Motion,
};
