import { type Annotation, defaultOutline } from "./annotation.ts";
import {
  clipLayout,
  mirrorPolygon,
  type Polygon,
  type PolygonPoint,
  polygonPath,
  shadowReach,
  usablePolygon,
} from "./compose.ts";
import { SHAPE_LIMITS } from "./shapeResize.ts";
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
  /**
   * A polygon drawn with the pen: its corners as fractions of the box (before the turn), already
   * mirrored as the clip is.
   */
  polygon?: Polygon;
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

/**
 * Where a Destaque's box is on the frame: its center (after the clip's turn), its size in frame
 * pixels (before the turn) and the clip's turn and flips.
 */
function placedBox(
  clip: Pick<Clip, "annotation" | "transform">,
  a: Annotation,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
) {
  const lay = clipLayout(clip, asset, frame);
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
  return {
    lay,
    radius: b.radius * lay.full.w,
    cx: vx + dx * Math.cos(turn) - dy * Math.sin(turn),
    cy: vy + dx * Math.sin(turn) + dy * Math.cos(turn),
    w: b.w * lay.full.w,
    h: b.h * lay.full.h,
    angle: lay.rotation,
    flipH: !!t?.flipH,
    flipV: !!t?.flipV,
  };
}

/**
 * A polygon drawn with the pen over the frame (corners as fractions of it) as the Destaque's
 * shape: the box around it, in the box's own (turned) directions and in the annotation's 1080p
 * pixels at the size the clip shows now; the corners as fractions of that box, in the picture's
 * directions (mirrored back when the clip is flipped); and how far the clip goes (fractions of
 * the frame) so the box lands where the polygon was drawn.
 */
export function drawnHighlight(
  polygon: readonly (readonly PolygonPoint[])[],
  clip: Pick<Clip, "annotation" | "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
): { boxWidth: number; boxHeight: number; polygon: Polygon; dx: number; dy: number } | null {
  const a = clip.annotation;
  const shapes = polygon.filter((outline) => outline.length >= 3);
  if (a?.kind !== "highlight" || !shapes.length || !asset.width || !asset.height) return null;
  const at = placedBox(clip, a, asset, frame);
  /** Frame pixels per 1080p pixel of the box, as the clip shows it now. */
  const unit = at.w / (a.boxWidth ?? 360);
  if (!(unit > 0)) return null;
  const turn = (at.angle * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const local = shapes.map((outline) =>
    outline.map(([fx, fy]): PolygonPoint => {
      const x = fx * frame.width - at.cx;
      const y = fy * frame.height - at.cy;
      return [x * cos + y * sin, -x * sin + y * cos];
    }),
  );
  const xs = local.flat().map((p) => p[0]);
  const ys = local.flat().map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x0);
  const h = Math.max(1, Math.max(...ys) - y0);
  const mx = x0 + w / 2;
  const my = y0 + h / 2;
  const r = (v: number): number => Math.round(v * 1e5) / 1e5;
  const L = SHAPE_LIMITS;
  return {
    boxWidth: Math.round(Math.min(L.maxW, Math.max(L.minW, w / unit))),
    boxHeight: Math.round(Math.min(L.maxH, Math.max(L.minH, h / unit))),
    polygon: mirrorPolygon(
      local.map((outline) =>
        outline.map(([x, y]): PolygonPoint => [r((x - x0) / w), r((y - y0) / h)]),
      ),
      at.flipH,
      at.flipV,
    ),
    dx: (mx * cos - my * sin) / frame.width,
    dy: (mx * sin + my * cos) / frame.height,
  };
}

/**
 * The shapes of a Destaque drawn with the pen where they are on the frame (fractions of it), as
 * the pen takes them to draw more (drawnHighlight turns them back into the same Destaque).
 */
export function highlightPolygonOnFrame(
  clip: Pick<Clip, "annotation" | "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
): Polygon | undefined {
  const a = clip.annotation;
  const drawn =
    a?.kind === "highlight" && a.shape === "polygon" ? usablePolygon(a.polygon) : undefined;
  if (!a || !drawn || !asset.width || !asset.height) return undefined;
  const at = placedBox(clip, a, asset, frame);
  const turn = (at.angle * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return mirrorPolygon(drawn, at.flipH, at.flipV).map((outline) =>
    outline.map(([x, y]): PolygonPoint => {
      const lx = (x - 0.5) * at.w;
      const ly = (y - 0.5) * at.h;
      return [
        (at.cx + lx * cos - ly * sin) / frame.width,
        (at.cy + lx * sin + ly * cos) / frame.height,
      ];
    }),
  );
}

/** The clear hole of a Destaque that darkens the rest, or null when it does not. */
export function dimHole(
  clip: Pick<Clip, "annotation" | "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
): DimHole | null {
  const a = clip.annotation;
  if (a?.kind !== "highlight" || !a.dim || a.dim <= 0 || !asset.width || !asset.height) return null;
  const at = placedBox(clip, a, asset, frame);
  const opacity = at.lay.opacity ?? 1;
  if (opacity <= 0) return null;
  const drawn = a.shape === "polygon" ? usablePolygon(a.polygon) : undefined;
  // A polygon not drawn yet is the rounded box, as its picture is (lib/annotations.ts).
  const shape = a.shape === "polygon" && !drawn ? "rounded" : (a.shape ?? "rounded");
  const { cx, cy, w, h } = at;
  return {
    shape,
    cx,
    cy,
    w,
    h,
    radius: shape === "rounded" ? Math.min(at.radius, w / 2, h / 2) : 0,
    angle: at.angle,
    flipV: at.flipV,
    // The picture shows its polygon mirrored with the clip; the hole is where it shows.
    ...(drawn ? { polygon: mirrorPolygon(drawn, at.flipH, at.flipV) } : {}),
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
  const shape = hole.polygon
    ? `<path fill-rule="evenodd" transform="translate(${r(cx - w / 2)} ${r(cy - h / 2)})" d="${polygonPath(hole.polygon, w, h)}"/>`
    : hole.shape === "ellipse"
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
