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

export const DEVICES = ["laptop", "phone"] as const;
export type Device = (typeof DEVICES)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DeviceGeometry {
  /** Where the picture goes, the clip's own shape (same aspect), in pixels of the w × h box. */
  screen: Rect;
  screenRadius: number;
  /** The body: a laptop's lid or the phone. */
  body: Rect;
  bodyRadius: number;
  /** A laptop's base under the lid, and the groove to open it. */
  base?: Rect;
  groove?: Rect;
  /** The phone's camera notch. */
  notch?: Rect;
}

/** Colors of the frames, drawn by the app (no picture of a real product). */
export const DEVICE_COLORS = {
  body: "#17181B",
  base: "#C6C9CF",
  groove: "#9EA2A9",
};

/**
 * A device around a picture of w × h (the clip's visible box): the device fills the box as
 * far as it can and the picture goes on its screen, shrunk with its own aspect, so nothing is
 * stretched. Everything is a share of the screen's width, so it looks the same at any size.
 */
export function deviceGeometry(device: Device, w: number, h: number): DeviceGeometry {
  const ar = h / Math.max(1, w);
  if (device === "laptop") {
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
    const body = {
      x: ox + sw * overhang,
      y: oy,
      w: sw * (1 + 2 * bezel),
      h: sw * (ar + bezel + chin),
    };
    const baseRect = { x: ox, y: body.y + body.h, w: sw * unitW, h: sw * base };
    return {
      screen: { x: body.x + sw * bezel, y: body.y + sw * bezel, w: sw, h: sw * ar },
      screenRadius: sw * 0.006,
      body,
      bodyRadius: sw * 0.025,
      base: baseRect,
      groove: {
        x: baseRect.x + baseRect.w * 0.42,
        y: baseRect.y,
        w: baseRect.w * 0.16,
        h: baseRect.h * 0.32,
      },
    };
  }
  const bezel = 0.045;
  const unitW = 1 + 2 * bezel;
  const unitH = ar + 2 * bezel;
  const sw = Math.min(w / unitW, h / unitH);
  const body = {
    x: (w - sw * unitW) / 2,
    y: (h - sw * unitH) / 2,
    w: sw * unitW,
    h: sw * unitH,
  };
  const short = Math.min(body.w, body.h);
  return {
    screen: { x: body.x + sw * bezel, y: body.y + sw * bezel, w: sw, h: sw * ar },
    screenRadius: short * 0.09,
    body,
    bodyRadius: short * 0.13,
    notch: {
      x: body.x + body.w / 2 - short * 0.14,
      y: body.y + sw * bezel,
      w: short * 0.28,
      h: short * 0.05,
    },
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
