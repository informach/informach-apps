import { type Annotation, defaultOutline } from "./annotation.ts";
import { clipLayout, shadowReach } from "./compose.ts";
import type { Asset, Clip, ProjectSettings } from "./types.ts";

/**
 * "Escurecer o resto" of a Destaque (Annotation.dim): everything drawn below it (the tracks under
 * its own, never the ones above) darkens, except the inside of its box. The preview
 * (editor/Preview.tsx) and the export (shared/export/videoPlan.ts) both place the clear hole from
 * here, where the box sits when the clip is still: its entrance and exit fade the darkening in and
 * out with the box, and a movement by keyframes leaves the hole where the clip was placed.
 */
export interface DimHole {
  shape: NonNullable<Annotation["shape"]>;
  /** Center of the box in frame pixels, after the clip's turn. */
  cx: number;
  cy: number;
  /** Size of the box in frame pixels (before the turn). */
  w: number;
  h: number;
  /** Corner radius of a rounded box, frame pixels. */
  radius: number;
  /** Degrees clockwise, as the clip turns. */
  angle: number;
  /** A triangle flipped upside down (the clip's vertical flip). */
  flipV: boolean;
  /** Black at this opacity around the box (the clip's own opacity included). */
  darkness: number;
}

/** Corner radius of a rounded Destaque, in frame pixels at 1080p (lib/annotations.ts). */
export const HIGHLIGHT_RADIUS = 18;
/** Room around the Destaque's shape before its outline, at 1080p (lib/annotations.ts sizing). */
const HIGHLIGHT_PAD = 24;
/** Opacity of the darkening when it is turned on. */
export const DEFAULT_DIM = 0.6;

/**
 * Where the Destaque's shape is in its picture, as fractions of the picture, and its corner
 * radius as a fraction of the picture's width. The picture is the box with the same room on
 * every side: the pad and the outline, or the reach of a chosen shadow when it goes farther
 * (lib/annotations.ts renderAnnotation). Picture pixels per 1080p pixel come from its width.
 */
export function highlightBox(
  a: Pick<
    Annotation,
    "kind" | "color" | "ink" | "look" | "outline" | "shadow" | "boxWidth" | "boxHeight"
  >,
  picture: Pick<Asset, "width" | "height">,
): { x: number; y: number; w: number; h: number; radius: number } {
  const bw = a.boxWidth ?? 360;
  const bh = a.boxHeight ?? 200;
  const ow = Math.max(0, (a.outline ?? defaultOutline(a)).width);
  const reach = a.shadow && a.shadow.opacity > 0 ? shadowReach(a.shadow) : 0;
  const room = Math.max(HIGHLIGHT_PAD + ow, reach);
  const k = picture.width / (bw + room * 2);
  const w = (bw * k) / picture.width;
  const h = Math.min(1, (bh * k) / picture.height);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h, radius: (HIGHLIGHT_RADIUS * k) / picture.width };
}

/** The clear hole of a Destaque that darkens the rest, or null when it does not. */
export function dimHole(
  clip: Pick<Clip, "annotation" | "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
): DimHole | null {
  const a = clip.annotation;
  if (a?.kind !== "highlight" || !a.dim || a.dim <= 0 || !asset.width || !asset.height) return null;
  const lay = clipLayout(clip, asset, frame);
  const opacity = lay.opacity ?? 1;
  if (opacity <= 0) return null;
  const b = highlightBox(a, asset);
  const t = clip.transform;
  // The box's center in the picture, mirrored with it, then turned around the visible part's
  // center (how the preview and the export turn the clip).
  const vx = lay.visible.x + lay.visible.w / 2;
  const vy = lay.visible.y + lay.visible.h / 2;
  let x = lay.full.x + (b.x + b.w / 2) * lay.full.w;
  let y = lay.full.y + (b.y + b.h / 2) * lay.full.h;
  if (t?.flipH) x = 2 * vx - x;
  if (t?.flipV) y = 2 * vy - y;
  const turn = (lay.rotation * Math.PI) / 180;
  const dx = x - vx;
  const dy = y - vy;
  const shape = a.shape ?? "rounded";
  const w = b.w * lay.full.w;
  const h = b.h * lay.full.h;
  return {
    shape,
    cx: vx + dx * Math.cos(turn) - dy * Math.sin(turn),
    cy: vy + dx * Math.sin(turn) + dy * Math.cos(turn),
    w,
    h,
    radius: shape === "rounded" ? Math.min(b.radius * lay.full.w, w / 2, h / 2) : 0,
    angle: lay.rotation,
    flipV: !!t?.flipV,
    darkness: Math.min(1, a.dim) * opacity,
  };
}

/**
 * The preview's mask of the darkening: an SVG (in frame pixels, W × H) white everywhere but
 * the box, read by luminance, so the dark layer shows only around the box.
 */
export function dimMaskSvg(hole: DimHole, W: number, H: number): string {
  const r = (v: number): string => (Math.round(v * 100) / 100).toString();
  const { cx, cy, w, h } = hole;
  const shape =
    hole.shape === "ellipse"
      ? `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(w / 2)}" ry="${r(h / 2)}"/>`
      : hole.shape === "triangle"
        ? `<polygon points="${triangleCorners(hole)
            .map(([x, y]) => `${r(cx + x)},${r(cy + y)}`)
            .join(" ")}"/>`
        : `<rect x="${r(cx - w / 2)}" y="${r(cy - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(hole.radius)}"/>`;
  const turn = hole.angle ? ` transform="rotate(${r(hole.angle)} ${r(cx)} ${r(cy)})"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000"${turn}>${shape}</g></svg>`;
}

/** The triangle's corners around its center (top, bottom right, bottom left), upside down when flipped. */
export function triangleCorners(h: Pick<DimHole, "w" | "h" | "flipV">): [number, number][] {
  const s = h.flipV ? -1 : 1;
  return [
    [0, (-s * h.h) / 2],
    [h.w / 2, (s * h.h) / 2],
    [-h.w / 2, (s * h.h) / 2],
  ];
}
