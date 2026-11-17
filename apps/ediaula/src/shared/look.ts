import type { Project } from "./types.ts";

/**
 * The visual effects of Lote 13, shared by the preview and the export so both draw the same:
 * color correction of a clip (clip.color), device frames (transform.device), the lesson's
 * background (project.background) and the region effects (clip.regionFx: blur, pixelate and
 * spotlight over a part of the frame).
 */

// ---- Color of a clip ----

export interface ClipColor {
  /** −1..1 added to the light (FFmpeg eq brightness). */
  brightness?: number;
  /** 0..2, 1 = as it is (eq contrast). */
  contrast?: number;
  /** 0..3, 1 = as it is, 0 = gray (eq saturation). */
  saturation?: number;
  /** Kelvin, 6500 = neutral; lower is warmer (FFmpeg colortemperature). */
  temperature?: number;
}

export const NEUTRAL_TEMPERATURE = 6500;

/** Whether the color changes anything. */
export const hasColor = (c: ClipColor | undefined): c is ClipColor =>
  !!c &&
  ((c.brightness ?? 0) !== 0 ||
    (c.contrast ?? 1) !== 1 ||
    (c.saturation ?? 1) !== 1 ||
    (c.temperature ?? NEUTRAL_TEMPERATURE) !== NEUTRAL_TEMPERATURE);

/**
 * The color a black body of `kelvin` lights with, as FFmpeg's colortemperature computes it
 * (vf_colortemperature.c, Tanner Helland's fit): each channel of the picture is multiplied by it.
 */
export function kelvinRgb(kelvin: number): [number, number, number] {
  const k = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (k <= 66) {
    r = 1;
    g = 0.3900815787690196 * Math.log(k) - 0.6318414437886275;
  } else {
    const t = Math.max(k - 60, 0);
    r = 1.292936186062745 * t ** -0.1332047592;
    g = 1.129890860895294 * t ** -0.0755148492;
  }
  if (k >= 66) b = 1;
  else if (k <= 19) b = 0;
  else b = 0.5432067891101962 * Math.log(k - 10) - 1.19625408914;
  const clip = (v: number): number => Math.min(1, Math.max(0, v));
  return [clip(r), clip(g), clip(b)];
}

const n = (v: number): string => (Math.round(v * 10000) / 10000).toString();

/** FFmpeg filters for the color on a YUV picture (eq), and the temperature on an RGB one. */
export function colorFilters(c: ClipColor): { eq: string | null; temperature: string | null } {
  const eq =
    (c.brightness ?? 0) !== 0 || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1
      ? `eq=brightness=${n(c.brightness ?? 0)}:contrast=${n(c.contrast ?? 1)}:saturation=${n(c.saturation ?? 1)}`
      : null;
  const k = c.temperature ?? NEUTRAL_TEMPERATURE;
  return {
    eq,
    temperature: k !== NEUTRAL_TEMPERATURE ? `colortemperature=temperature=${Math.round(k)}` : null,
  };
}

/** Rec. 709 luma weights: the light of a pixel as the video's Y holds it. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * The same correction as an SVG filter for the preview. eq works on the video's YUV: contrast
 * and brightness change only Y (Y' = c·(Y − ½) + ½ + b) and saturation scales the color around
 * it (C' = s·C). In RGB that is RGB' = s·RGB + (c − s)·Y + ½(1 − c) + b, one color matrix
 * (`matrix`, the 20 values of feColorMatrix); then each channel multiplied by the temperature's
 * color, in that order (eq before colortemperature).
 */
export function colorSvg(c: ClipColor): {
  matrix: number[];
  rgb: [number, number, number];
} {
  const s = c.saturation ?? 1;
  const contrast = c.contrast ?? 1;
  const offset = 0.5 * (1 - contrast) + (c.brightness ?? 0);
  const matrix: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++)
      matrix.push((row === col ? s : 0) + (contrast - s) * LUMA[col]);
    matrix.push(0, offset);
  }
  matrix.push(0, 0, 0, 1, 0);
  const k = c.temperature ?? NEUTRAL_TEMPERATURE;
  return { matrix, rgb: k === NEUTRAL_TEMPERATURE ? [1, 1, 1] : kelvinRgb(k) };
}

// ---- Device frames ----

export const DEVICES = ["laptop", "tablet", "phone"] as const;
export type Device = (typeof DEVICES)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rounded box of one color. */
export interface DevicePart {
  rect: Rect;
  radius: number;
  color: string;
}

export interface DeviceGeometry {
  /** Where the picture goes, the clip's own shape (same aspect), in pixels of the w × h box. */
  screen: Rect;
  screenRadius: number;
  /** Drawn in order under the picture; the screen is then cut out of them. */
  frame: DevicePart[];
  /** Drawn in order over the picture: a phone's camera. */
  over: DevicePart[];
}

/** Colors of the frames, drawn by the app (no picture of a real product). */
export const DEVICE_COLORS = {
  body: "#17181B",
  base: "#C6C9CF",
  groove: "#9EA2A9",
  /** A phone's side frame and its buttons. */
  phoneEdge: "#4A4D55",
  phoneButton: "#3A3D44",
  /** A tablet's aluminium edge and its buttons. */
  tabletEdge: "#B4B8BF",
  tabletButton: "#9A9EA6",
  camera: "#060607",
  lens: "#26304A",
};

/** Every part of a frame, under and over the picture, in drawing order. */
export function deviceParts(g: DeviceGeometry): DevicePart[] {
  return [...g.frame, ...g.over];
}

/**
 * A device around a picture of w × h (the clip's visible box): the device fills the box as
 * far as it can and the picture goes on its screen, shrunk with its own aspect, so nothing is
 * stretched. Everything is a share of the screen's size, so it looks the same at any size.
 */
export function deviceGeometry(device: Device, w: number, h: number): DeviceGeometry {
  return device === "laptop" ? laptopGeometry(w, h) : handheldGeometry(device, w, h);
}

function laptopGeometry(w: number, h: number): DeviceGeometry {
  const ar = h / Math.max(1, w);
  const bezel = 0.03;
  const chin = 0.045;
  const base = 0.05;
  const overhang = 0.06;
  // Box in units of the screen's width: lid = screen + bezels, base wider than the lid.
  const unitW = 1 + 2 * bezel + 2 * overhang;
  const unitH = ar + bezel + chin + base;
  const sw = Math.min(w / unitW, h / unitH);
  const ox = (w - sw * unitW) / 2;
  const oy = (h - sw * unitH) / 2;
  const lid = {
    x: ox + sw * overhang,
    y: oy,
    w: sw * (1 + 2 * bezel),
    h: sw * (ar + bezel + chin),
  };
  const baseRect = { x: ox, y: lid.y + lid.h, w: sw * unitW, h: sw * base };
  return {
    screen: { x: lid.x + sw * bezel, y: lid.y + sw * bezel, w: sw, h: sw * ar },
    screenRadius: sw * 0.006,
    frame: [
      { rect: lid, radius: sw * 0.025, color: DEVICE_COLORS.body },
      { rect: baseRect, radius: baseRect.h * 0.35, color: DEVICE_COLORS.base },
      {
        rect: {
          x: baseRect.x + baseRect.w * 0.42,
          y: baseRect.y,
          w: baseRect.w * 0.16,
          h: baseRect.h * 0.32,
        },
        radius: baseRect.h * 0.16,
        color: DEVICE_COLORS.groove,
      },
    ],
    over: [],
  };
}

/** Proportions of the handheld devices, in units of the screen's short side. */
const HANDHELD = {
  phone: { bezel: 0.042, edge: 0.012, screenRadius: 0.12, button: 0.009, camera: 0.032 },
  tablet: { bezel: 0.05, edge: 0.008, screenRadius: 0.035, button: 0.006, camera: 0.016 },
} as const;

/**
 * A phone or a tablet. It is drawn upright (portrait) and, for a wide picture, turned a quarter to
 * the left: the phone's camera ends on the left, the tablet's on the long top side, the buttons
 * where the hand expects them. The bezel follows the screen's short side, so a wide picture does
 * not get a thick frame.
 */
function handheldGeometry(device: "phone" | "tablet", w: number, h: number): DeviceGeometry {
  const P = HANDHELD[device];
  const wide = w > h;
  // The upright box, and the picture's aspect in it (height over width, at least 1 when wide).
  const BW = wide ? h : w;
  const BH = wide ? w : h;
  const ar = (wide ? w : h) / Math.max(1, wide ? h : w);
  const unitW = 1 + 2 * P.bezel + 2 * P.button;
  const unitH = ar + 2 * P.bezel + 2 * P.button;
  const s = Math.min(BW / unitW, BH / unitH);
  const body = {
    x: (BW - s * (1 + 2 * P.bezel)) / 2,
    y: (BH - s * (ar + 2 * P.bezel)) / 2,
    w: s * (1 + 2 * P.bezel),
    h: s * (ar + 2 * P.bezel),
  };
  const screen = { x: body.x + s * P.bezel, y: body.y + s * P.bezel, w: s, h: s * ar };
  // Concentric corners: the body's follows the screen's at the bezel's distance.
  const screenRadius = s * P.screenRadius;
  const bodyRadius = screenRadius + s * P.bezel;
  const edge = s * P.edge;
  const inner = { x: body.x + edge, y: body.y + edge, w: body.w - 2 * edge, h: body.h - 2 * edge };
  const d = s * P.button;
  const phone = device === "phone";
  const buttonColor = phone ? DEVICE_COLORS.phoneButton : DEVICE_COLORS.tabletButton;
  // Buttons stick out of the body by d and go under it (drawn first), from the body's top.
  const side = (left: boolean, from: number, length: number): DevicePart => ({
    rect: {
      x: left ? body.x - d : body.x + body.w - d,
      y: body.y + s * from,
      w: 2 * d,
      h: s * length,
    },
    radius: d,
    color: buttonColor,
  });
  const top = (from: number, length: number): DevicePart => ({
    rect: { x: body.x + body.w - s * (from + length), y: body.y - d, w: s * length, h: 2 * d },
    radius: d,
    color: buttonColor,
  });
  const buttons = phone
    ? [side(true, 0.3, 0.14), side(true, 0.48, 0.14), side(false, 0.38, 0.22)]
    : [top(0.1, 0.12), side(false, 0.1, 0.1), side(false, 0.23, 0.1)];
  const frame: DevicePart[] = [
    ...buttons,
    {
      rect: body,
      radius: bodyRadius,
      color: phone ? DEVICE_COLORS.phoneEdge : DEVICE_COLORS.tabletEdge,
    },
    { rect: inner, radius: bodyRadius - edge, color: DEVICE_COLORS.body },
  ];
  // The camera: a phone's in the screen near the top; a tablet's in the bezel, on the long side
  // that is on top when the tablet is held as the picture is.
  const c = s * P.camera;
  const at = phone
    ? { x: screen.x + screen.w / 2, y: screen.y + c * 1.1 }
    : wide
      ? { x: body.x + body.w - (s * P.bezel + edge) / 2, y: body.y + body.h / 2 }
      : { x: body.x + body.w / 2, y: body.y + (s * P.bezel + edge) / 2 };
  const dot = (size: number, color: string): DevicePart => ({
    rect: { x: at.x - size / 2, y: at.y - size / 2, w: size, h: size },
    radius: size / 2,
    color,
  });
  const camera = [dot(c, DEVICE_COLORS.camera), dot(c * 0.45, DEVICE_COLORS.lens)];
  const upright: DeviceGeometry = {
    screen,
    screenRadius,
    frame: phone ? frame : [...frame, ...camera],
    over: phone ? camera : [],
  };
  if (!wide) return upright;
  // A quarter turn to the left: the upright top goes to the left, its right side to the top.
  const turn = (r: Rect): Rect => ({ x: r.y, y: BW - r.x - r.w, w: r.h, h: r.w });
  const part = (p: DevicePart): DevicePart => ({ ...p, rect: turn(p.rect) });
  return {
    screen: turn(upright.screen),
    screenRadius,
    frame: upright.frame.map(part),
    over: upright.over.map(part),
  };
}

// ---- Background of the lesson ----

export type Background =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; assetId: string };

/** CSS of the background, the same picture the export draws (image: the asset's url). */
export function backgroundCss(bg: Background | undefined, imageUrl?: string): string {
  if (!bg) return "#000000";
  if (bg.kind === "color") return bg.color;
  if (bg.kind === "gradient") return `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
  return imageUrl ? `#000000 center / cover no-repeat url("${imageUrl}")` : "#000000";
}

/**
 * Where pixel (x, y) of a w × h frame falls along a CSS linear-gradient of `angle` degrees
 * (0 = toward the top, 90 = toward the right), 0..1: the line through the center whose length
 * reaches the corners, as CSS draws it.
 */
export function gradientAt(angle: number, w: number, h: number, x: number, y: number): number {
  const a = (angle * Math.PI) / 180;
  const length = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const p = ((x - w / 2) * Math.sin(a) - (y - h / 2) * Math.cos(a)) / length + 0.5;
  return Math.min(1, Math.max(0, p));
}

/** The background's own media (an image), to be read by the export and shown in the preview. */
export const backgroundAsset = (p: Pick<Project, "background">): string | undefined =>
  p.background?.kind === "image" ? p.background.assetId : undefined;

// ---- Region effects ----

export const REGION_KINDS = ["blur", "pixelate", "spotlight"] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

export interface RegionFx {
  kind: RegionKind;
  /** Fractions of the frame. */
  rect: Rect;
  /** Soft edge, pixels of a 1080p frame. */
  feather: number;
  /** 0..1: how blurred, how coarse, or how dark around the spotlight. */
  strength: number;
  /**
   * Seguir a gravação: the rectangle sticks to the recording under it and goes with its zooms
   * and the zoom layers between them (shared/regionFollow.ts). Off, it stays on the frame.
   */
  follow?: boolean;
}

export const DEFAULT_REGION: RegionFx = {
  kind: "blur",
  rect: { x: 0.35, y: 0.4, w: 0.3, h: 0.12 },
  feather: 8,
  strength: 0.6,
};

/** The region in whole pixels of a W × H frame, with an even size (chroma planes stay whole). */
export function regionPixels(r: RegionFx, W: number, H: number): Rect {
  const even = (v: number): number => Math.max(2, Math.round(v / 2) * 2);
  const x = Math.max(0, Math.min(W - 2, Math.round((r.rect.x * W) / 2) * 2));
  const y = Math.max(0, Math.min(H - 2, Math.round((r.rect.y * H) / 2) * 2));
  return {
    x,
    y,
    w: Math.min(even(r.rect.w * W), W - x - ((W - x) % 2)),
    h: Math.min(even(r.rect.h * H), H - y - ((H - y) % 2)),
  };
}

/** Blur radius (boxblur, two passes) in pixels of an H-tall frame. */
export const blurRadius = (r: RegionFx, H: number): number =>
  Math.max(1, Math.round((2 + r.strength * 30) * (H / 1080)));

/**
 * The Gaussian blur that looks like boxblur at `radius` with two passes (luma_power=2): the
 * spread of two boxes of 2r + 1 pixels, for the preview's CSS blur.
 */
export const boxBlurSigma = (radius: number): number => Math.sqrt((2 * radius * (radius + 1)) / 3);

/** Side of a pixelated block, in pixels of an H-tall frame. */
export const blockSize = (r: RegionFx, H: number): number =>
  Math.max(2, Math.round((6 + r.strength * 34) * (H / 1080)));

/** Darkness around the spotlight: 0.2 to 0.9 of black. */
export const spotlightDarkness = (r: RegionFx): number => 0.2 + 0.7 * r.strength;

/**
 * The spotlight's darkness at a distance `d` pixels outside its rectangle (0 inside): half at
 * the edge, all of it `feather` pixels out, as the preview's soft box-shadow fades.
 */
export function spotlightAlpha(d: number, feather: number): number {
  if (d <= 0) return 0;
  if (feather <= 0) return 1;
  return Math.min(1, 0.5 + d / (2 * feather));
}

/** Rounding of the spotlight's corners, in the same pixels as the rectangle. */
export const spotlightRadius = (box: Pick<Rect, "w" | "h">): number =>
  Math.min(box.w, box.h) * 0.12;
