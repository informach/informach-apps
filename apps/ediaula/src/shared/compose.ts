import type { Device } from "./look.ts";
import type { Asset, Clip, Project, ProjectSettings } from "./types.ts";

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
  /**
   * Degrees, clockwise, around the center of the visible part: the shape, its border and its
   * shadow turn together (CSS in the preview, the rotate filter in the export).
   */
  rotation?: number;
  /** Mirrored left to right, or top to bottom: the visible part, before the shape and shadow. */
  flipH?: boolean;
  flipV?: boolean;
  /** Shown on the screen of a laptop or a phone drawn around it (shared/look.ts). */
  device?: Device;
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
  /** The visible part after cropping, in output pixels (before rotation). */
  visible: Box;
  /** The visible part, as fractions of the source image. */
  crop: Crop;
  opacity: number;
  /** Degrees, clockwise, around the center of `visible`. */
  rotation: number;
  /** What the visible part covers once rotated: the box guides, selection and safe areas use. */
  bounds: Box;
}

/** Rotation normalized to (-180, 180]; 0 when absent. */
export const rotationOf = (t: Pick<Transform, "rotation"> | undefined): number => {
  const r = t?.rotation ?? 0;
  if (!Number.isFinite(r)) return 0;
  const n = ((((r + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
};

/** Width and height of the box that holds w × h turned by `degrees`. */
export function rotatedSize(w: number, h: number, degrees: number): { w: number; h: number } {
  const a = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // Rounding noise of right angles (cos 90° is 6e-17) would add a pixel.
  const r = (v: number): number => Math.round(v * 1e9) / 1e9;
  return { w: r(w * c + h * s), h: r(w * s + h * c) };
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
  const rotation = rotationOf(t);
  const turned = rotatedSize(visible.w, visible.h, rotation);
  const cx = visible.x + visible.w / 2;
  const cy = visible.y + visible.h / 2;
  const bounds = rotation
    ? { x: cx - turned.w / 2, y: cy - turned.h / 2, w: turned.w, h: turned.h }
    : visible;
  return { full, visible, crop: c, opacity: t.opacity, rotation, bounds };
}

/** Where the old frame lands in the new one: "fit" shows all of it, "fill" covers the new one. */
export type ReframeMode = "fit" | "fill";

/**
 * The lesson moved to another format (Mudar formato): every picture keeps its place and size
 * against the old frame, and the old frame is fitted inside the new one (bars where it does not
 * reach) or made to fill it (the edges cut off). Positions, sizes, movement keyframes and the
 * points zoom layers aim at are mapped; crops, shapes, shadows and captions stay as they are.
 * A clip left exactly as it would be by default gets no transform.
 */
export function reframeProject(
  project: Project,
  settings: ProjectSettings,
  mode: ReframeMode,
): Project {
  const W0 = project.settings.width;
  const H0 = project.settings.height;
  const W1 = settings.width;
  const H1 = settings.height;
  const k = mode === "fit" ? Math.min(W1 / W0, H1 / H0) : Math.max(W1 / W0, H1 / H0);
  const point = (x: number, y: number): { x: number; y: number } => ({
    x: (W1 / 2 + (x * W0 - W0 / 2) * k) / W1,
    y: (H1 / 2 + (y * H0 - H0 / 2) * k) / H1,
  });
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  const clips = project.clips.map((c): Clip => {
    if (c.zoomLayer) {
      const p = point(c.zoomLayer.x, c.zoomLayer.y);
      return { ...c, zoomLayer: { ...c.zoomLayer, x: p.x, y: p.y } };
    }
    const a = assets.get(c.assetId);
    if (!a || a.kind === "audio" || !a.width || !a.height) return c;
    // The picture's size against each frame, at scale 1.
    const ratio =
      (Math.min(W0 / a.width, H0 / a.height) * k) / Math.min(W1 / a.width, H1 / a.height);
    const map = <T extends { x: number; y: number; scale: number }>(t: T): T => ({
      ...t,
      ...point(t.x, t.y),
      scale: t.scale * ratio,
    });
    const before = c.transform ?? DEFAULT_TRANSFORM;
    const after = map(before);
    const { transform: _old, ...rest } = c;
    const plain = !c.transform && same(after.x, 0.5) && same(after.y, 0.5) && same(after.scale, 1);
    return {
      ...rest,
      ...(plain ? {} : { transform: after }),
      ...(c.keyframes?.length ? { keyframes: c.keyframes.map(map) } : {}),
    };
  });
  return { ...project, settings: { ...settings }, clips };
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

/**
 * Where the presenter's video sits: a portrait video, or one on a solid screen, beside the
 * content (or the whole frame of a portrait lesson); anything else fills the frame.
 */
export function presenterTransform(
  asset: Pick<Asset, "width" | "height" | "screen">,
  frame: Pick<ProjectSettings, "width" | "height">,
): Transform | undefined {
  return asset.height > asset.width || asset.screen
    ? placementTransform(frame.width > frame.height ? "right" : "full")
    : defaultTransformFor(asset, frame);
}

/**
 * Where the camera of a "Voz e câmera" take sits. Without its background removed it is a
 * rectangle with the room behind the teacher: in a landscape lesson it goes to the corner, over
 * the bottom right of the screen recorded later, never over the whole frame; in a portrait
 * lesson it takes the lower part. A camera on a solid screen (background removed) or a portrait
 * one stands beside the content, as the presenter's video does.
 */
export function cameraPresenterTransform(
  asset: Pick<Asset, "width" | "height" | "screen">,
  frame: Pick<ProjectSettings, "width" | "height">,
): Transform {
  if (asset.height > asset.width || asset.screen)
    return placementTransform(frame.width > frame.height ? "right" : "full");
  return frame.width > frame.height
    ? { ...DEFAULT_TRANSFORM, ...CAMERA_CORNER }
    : { ...DEFAULT_TRANSFORM, x: 0.5, y: 0.8, scale: 0.9 };
}

/** A landscape camera in the corner of a landscape lesson: a third of the frame, inside it. */
export const CAMERA_CORNER = { x: 0.8, y: 0.78, scale: 0.34 } as const;

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
