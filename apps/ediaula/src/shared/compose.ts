import type { Asset, Clip, ProjectSettings } from "./types.ts";

/**
 * The composition model shared by the preview and the export: where each clip is drawn, how big,
 * which part of it, and how opaque at a given time. Both sides call these functions, so the
 * scene is assembled the same way on screen and in the exported file.
 */

/** Fractions of the source cut from each side. */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Transform {
  /** Center of the whole (uncropped) image, as fractions of the frame width and height. */
  x: number;
  y: number;
  /** 1 = as large as fits the frame without cutting anything off. */
  scale: number;
  /** 0..1. */
  opacity: number;
  crop?: Crop;
  /** Shape of the visible part: rounded corners or a circle (the webcam). */
  mask?: "rounded" | "circle";
  /** Border color inside the shape edge, '#RRGGBB'. */
  border?: string;
  /** Drop shadow behind the visible shape. */
  shadow?: Shadow;
}

/**
 * Drop shadow, in pixels of a 1080p frame: how far it falls and in which direction
 * (degrees, 0 = right, 90 = down), how soft it is (blur ≈ two standard deviations, as in CSS)
 * and how dark.
 */
export interface Shadow {
  distance: number;
  angle: number;
  blur: number;
  opacity: number;
  color: string;
}

export const DEFAULT_SHADOW: Shadow = {
  distance: 14,
  angle: 60,
  blur: 28,
  opacity: 0.5,
  color: "#000000",
};

export const SHADOW_PRESETS: { id: string; label: string; shadow: Shadow }[] = [
  { id: "soft", label: "Suave", shadow: DEFAULT_SHADOW },
  {
    id: "strong",
    label: "Forte",
    shadow: { distance: 10, angle: 60, blur: 14, opacity: 0.8, color: "#000000" },
  },
  {
    id: "long",
    label: "Longa",
    shadow: { distance: 36, angle: 45, blur: 24, opacity: 0.45, color: "#000000" },
  },
  {
    id: "glow",
    label: "Brilho",
    shadow: { distance: 0, angle: 0, blur: 40, opacity: 0.9, color: "#C8F031" },
  },
];

/** Offset of the shadow in 1080p pixels. */
export function shadowOffset(s: Shadow): { dx: number; dy: number } {
  const a = (s.angle * Math.PI) / 180;
  return {
    dx: Math.round(Math.cos(a) * s.distance * 100) / 100,
    dy: Math.round(Math.sin(a) * s.distance * 100) / 100,
  };
}

/** Room the shadow needs around the shape, in 1080p pixels. */
export const shadowReach = (s: Shadow): number => Math.ceil(s.blur * 1.5 + s.distance + 2);

/** Border width and corner radius in pixels of a 1080p frame. */
export const BORDER_WIDTH = 6;
export const ROUNDED_RADIUS = 28;

/** Corner radius in output pixels for a visible box of w × h (half the short side = circle). */
export const maskRadius = (
  t: Pick<Transform, "mask">,
  w: number,
  h: number,
  frameHeight: number,
): number =>
  t.mask === "circle"
    ? Math.min(w, h) / 2
    : t.mask === "rounded"
      ? Math.min((ROUNDED_RADIUS * frameHeight) / 1080, Math.min(w, h) / 2)
      : 0;

/** Crop that keeps a centered square, for a circle on a non-square picture. */
export function squareCrop(width: number, height: number): Crop {
  if (width > height) {
    const side = (1 - height / width) / 2;
    return { left: side, right: side, top: 0, bottom: 0 };
  }
  const side = (1 - width / height) / 2;
  return { left: 0, right: 0, top: side, bottom: side };
}

export const DEFAULT_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, opacity: 1 };
export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClipLayout {
  /** Where the whole source image lands, in output pixels (may extend past the frame). */
  full: Box;
  /** The visible part after cropping, in output pixels. */
  visible: Box;
  /** The visible part, as fractions of the source image. */
  crop: Crop;
  opacity: number;
}

export function clipLayout(
  clip: Pick<Clip, "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<ProjectSettings, "width" | "height">,
): ClipLayout {
  const t = clip.transform ?? DEFAULT_TRANSFORM;
  const W = frame.width;
  const H = frame.height;
  const sw = asset.width || W;
  const sh = asset.height || H;
  const fit = Math.min(W / sw, H / sh) * t.scale;
  const fw = sw * fit;
  const fh = sh * fit;
  const full = { x: t.x * W - fw / 2, y: t.y * H - fh / 2, w: fw, h: fh };
  const c = t.crop ?? NO_CROP;
  const visible = {
    x: full.x + c.left * fw,
    y: full.y + c.top * fh,
    w: Math.max(0, fw * (1 - c.left - c.right)),
    h: Math.max(0, fh * (1 - c.top - c.bottom)),
  };
  return { full, visible, crop: c, opacity: t.opacity };
}

export interface Placement {
  id: string;
  label: string;
  transform: Omit<Transform, "opacity">;
}

/**
 * Ready-made spots for a full-body portrait avatar over a landscape lesson (the avatar stands on
 * the bottom edge, beside the content, without covering the center of the screen).
 */
export const AVATAR_PLACEMENTS: Placement[] = [
  { id: "right", label: "Direita", transform: { x: 0.84, y: 0.545, scale: 0.92 } },
  { id: "left", label: "Esquerda", transform: { x: 0.16, y: 0.545, scale: 0.92 } },
  { id: "bust-right", label: "Busto à direita", transform: { x: 0.84, y: 0.86, scale: 1.7 } },
  { id: "corner-right", label: "Canto", transform: { x: 0.9, y: 0.7, scale: 0.6 } },
  { id: "full", label: "Centro", transform: { x: 0.5, y: 0.5, scale: 1 } },
];

export const placementTransform = (id: string, base?: Transform): Transform => {
  const p = AVATAR_PLACEMENTS.find((x) => x.id === id) ?? AVATAR_PLACEMENTS[0];
  return { ...DEFAULT_TRANSFORM, ...base, ...p.transform };
};

/** An avatar recorded standing (portrait) placed in a landscape lesson goes to the side by default. */
export function defaultTransformFor(
  asset: Pick<Asset, "width" | "height" | "screen">,
  frame: Pick<ProjectSettings, "width" | "height">,
): Transform | undefined {
  if (!asset.screen) return undefined;
  if (asset.height > asset.width && frame.width > frame.height) return placementTransform("right");
  return undefined;
}

/** Default fade for avatar inserts: a short dissolve in and out. */
export const AVATAR_FADE = 0.3;

// ---- Entrance and exit animations (any visual clip). ----

/** How a clip comes in or goes out; the duration is fadeIn / fadeOut. */
export type Motion =
  | "fade"
  | "pop"
  | "grow"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "push-left"
  | "push-right"
  | "zoom";

export const MOTIONS: { id: Motion; label: string }[] = [
  { id: "fade", label: "Dissolver" },
  { id: "pop", label: "Pop" },
  { id: "grow", label: "Aproximar" },
  { id: "slide-up", label: "De baixo" },
  { id: "slide-down", label: "De cima" },
  { id: "slide-left", label: "Da direita" },
  { id: "slide-right", label: "Da esquerda" },
  { id: "push-left", label: "Atravessar ←" },
  { id: "push-right", label: "Atravessar →" },
  { id: "zoom", label: "Zoom" },
];

/** Distance (fraction of the frame) a sliding clip travels. */
const SLIDE = 0.08;
const BACK = 1.70158;

export interface Anim {
  opacity: number;
  /** Multiplies the clip size, around its center. */
  scale: number;
  /** Offset as fractions of the frame. */
  dx: number;
  dy: number;
}

type Animated = Pick<Clip, "start" | "duration" | "fadeIn" | "fadeOut" | "enter" | "exit">;

const motionOf = (m: Motion | undefined, d: number | undefined): Motion | undefined =>
  d && d > 0 ? (m ?? "fade") : undefined;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const backOut = (p: number): number => 1 + (BACK + 1) * (p - 1) ** 3 + BACK * (p - 1) ** 2;
const cubicOut = (p: number): number => 1 - (1 - p) ** 3;

const smooth = (p: number): number => p * p * (3 - 2 * p);

function apply(a: Anim, m: Motion, p: number): void {
  // Crossing the whole frame (push): no fade, the picture slides fully in or out.
  if (m === "push-left" || m === "push-right") {
    a.dx += (m === "push-left" ? -1 : 1) * (1 - smooth(p));
    return;
  }
  if (m === "pop") {
    a.scale *= 0.3 + 0.7 * backOut(p);
    a.opacity *= clamp01(p * 3);
    return;
  }
  a.opacity *= p;
  if (m === "grow") a.scale *= 0.85 + 0.15 * cubicOut(p);
  if (m === "zoom") a.scale *= 1 + 0.6 * (1 - p);
  const off = SLIDE * (1 - cubicOut(p));
  if (m === "slide-up") a.dy += off;
  else if (m === "slide-down") a.dy -= off;
  else if (m === "slide-left") a.dx += off;
  else if (m === "slide-right") a.dx -= off;
}

/** The clip's entrance/exit state at timeline time `t`. */
export function animAt(clip: Animated, t: number): Anim {
  const a: Anim = { opacity: 1, scale: 1, dx: 0, dy: 0 };
  const enter = motionOf(clip.enter, clip.fadeIn);
  const exit = motionOf(clip.exit, clip.fadeOut);
  if (enter) apply(a, enter, clamp01((t - clip.start) / clip.fadeIn!));
  if (exit) apply(a, exit, clamp01((clip.start + clip.duration - t) / clip.fadeOut!));
  return a;
}

/** Opacity multiplier from the clip's entrance and exit at timeline time `t`. */
export const fadeAt = (clip: Animated, t: number): number => animAt(clip, t).opacity;

/** True when the clip moves or changes size (needs per-frame work in the export, not just a fade). */
export const isMoving = (clip: Animated): boolean => {
  const moves = (m: Motion | undefined): boolean => !!m && m !== "fade";
  return moves(motionOf(clip.enter, clip.fadeIn)) || moves(motionOf(clip.exit, clip.fadeOut));
};

/**
 * The same curves as ffmpeg expressions of the timeline time `t`: size multiplier and offset.
 * Opacity is left to fade filters (linear: over the whole duration, or the first third for pop).
 */
export function motionExprs(clip: Animated): {
  scale: string;
  dx: string;
  dy: string;
  fades: { kind: "in" | "out"; start: number; duration: number }[];
} {
  const n = (v: number): string => (Math.round(v * 10000) / 10000).toString();
  let scale = "1";
  let dx = "0";
  let dy = "0";
  const fades: { kind: "in" | "out"; start: number; duration: number }[] = [];
  const end = clip.start + clip.duration;
  const part = (m: Motion | undefined, d: number | undefined, kind: "in" | "out"): void => {
    if (!m || !d) return;
    const p =
      kind === "in" ? `clip((t-${n(clip.start)})/${n(d)},0,1)` : `clip((${n(end)}-t)/${n(d)},0,1)`;
    const fd = m === "pop" ? d / 3 : d;
    if (m === "push-left" || m === "push-right") {
      dx += `${m === "push-left" ? "-" : "+"}(1-${p}*${p}*(3-2*${p}))`;
      return;
    }
    fades.push({ kind, start: kind === "in" ? clip.start : end - fd, duration: fd });
    const off = `${SLIDE}*pow(1-${p},3)`;
    if (m === "pop") scale += `*(0.3+0.7*(1+${BACK + 1}*pow(${p}-1,3)+${BACK}*pow(${p}-1,2)))`;
    else if (m === "grow") scale += `*(0.85+0.15*(1-pow(1-${p},3)))`;
    else if (m === "zoom") scale += `*(1+0.6*(1-${p}))`;
    else if (m === "slide-up") dy += `+${off}`;
    else if (m === "slide-down") dy += `-${off}`;
    else if (m === "slide-left") dx += `+${off}`;
    else if (m === "slide-right") dx += `-${off}`;
  };
  part(motionOf(clip.enter, clip.fadeIn), clip.fadeIn, "in");
  part(motionOf(clip.exit, clip.fadeOut), clip.fadeOut, "out");
  return { scale, dx, dy, fades };
}
