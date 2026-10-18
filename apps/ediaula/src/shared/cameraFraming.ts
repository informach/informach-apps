import { type Crop, DEFAULT_TRANSFORM, squareCrop, type Transform } from "./compose.ts";
import type { Asset, Project, ProjectSettings } from "./types.ts";

/**
 * How the webcam of a take is framed in the lesson: a circle in the corner, a rounded rectangle
 * in the corner, side by side with the screen (each with half the frame) or filling the frame.
 * Each is a plain transform of the camera's clips (position, size, crop and shape), so the
 * preview and the export draw it as any other clip, and it can be adjusted by hand afterwards.
 */

export const CAMERA_FRAMINGS = ["circle", "rounded", "side", "full"] as const;
export type CameraFraming = (typeof CAMERA_FRAMINGS)[number];

export const CAMERA_FRAMING_LABELS: Record<CameraFraming, string> = {
  circle: "Círculo no canto",
  rounded: "Arredondado no canto",
  side: "Lado a lado",
  full: "Tela cheia",
};

type Size = Pick<Asset, "width" | "height">;
type Frame = Pick<ProjectSettings, "width" | "height">;

/** The circle's diameter and the corner's margin, as fractions of the frame's short side. */
const CIRCLE = 0.28;
const MARGIN = 0.05;
/** Width of the rounded camera, as a fraction of the frame's width (landscape, portrait). */
const ROUNDED_WIDE = 0.3;
const ROUNDED_TALL = 0.5;

const round = (v: number): number => Math.round(v * 10000) / 10000;

/** The crop that makes a picture of `size` fill a box of aspect `aspect` (width / height). */
function coverCrop(size: Size, aspect: number): Crop {
  const own = size.width / size.height;
  if (own > aspect) {
    const side = round((1 - aspect / own) / 2);
    return { left: side, right: side, top: 0, bottom: 0 };
  }
  const side = round((1 - own / aspect) / 2);
  return { left: 0, right: 0, top: side, bottom: side };
}

/** The scale (shared/compose.ts clipLayout) that shows the visible part `width` pixels wide. */
function scaleFor(size: Size, frame: Frame, crop: Crop, width: number): number {
  const fit = Math.min(frame.width / size.width, frame.height / size.height);
  return round(width / (size.width * (1 - crop.left - crop.right) * fit));
}

/** Half of the frame for each, beside each other (landscape) or one over the other (portrait). */
function halves(frame: Frame): {
  box: { width: number; height: number };
  camera: { x: number; y: number };
  screen: { x: number; y: number };
} {
  return frame.width >= frame.height
    ? {
        box: { width: frame.width / 2, height: frame.height },
        camera: { x: 0.75, y: 0.5 },
        screen: { x: 0.25, y: 0.5 },
      }
    : {
        box: { width: frame.width, height: frame.height / 2 },
        camera: { x: 0.5, y: 0.75 },
        screen: { x: 0.5, y: 0.25 },
      };
}

/**
 * The camera's transform for a framing. `base` keeps what the framing does not decide (the
 * opacity, the shadow, a mirror, and the border of the shapes in the corner).
 */
export function cameraFraming(
  framing: CameraFraming,
  camera: Size,
  frame: Frame,
  base: Transform = DEFAULT_TRANSFORM,
): Transform {
  const size = {
    width: camera.width > 0 ? camera.width : 1280,
    height: camera.height > 0 ? camera.height : 720,
  };
  const { crop: _crop, mask: _mask, border, rotation: _rotation, ...kept } = base;
  const short = Math.min(frame.width, frame.height);
  const margin = MARGIN * short;
  const corner = (w: number, h: number) => ({
    x: round((frame.width - margin - w / 2) / frame.width),
    y: round((frame.height - margin - h / 2) / frame.height),
  });
  if (framing === "circle") {
    const crop = squareCrop(size.width, size.height);
    const d = CIRCLE * short;
    return {
      ...kept,
      ...corner(d, d),
      scale: scaleFor(size, frame, crop, d),
      crop,
      mask: "circle",
      ...(border ? { border } : {}),
    };
  }
  if (framing === "rounded") {
    const crop = { left: 0, top: 0, right: 0, bottom: 0 };
    const w = (frame.width >= frame.height ? ROUNDED_WIDE : ROUNDED_TALL) * frame.width;
    const h = (w * size.height) / size.width;
    return {
      ...kept,
      ...corner(w, h),
      scale: scaleFor(size, frame, crop, w),
      mask: "rounded",
      ...(border ? { border } : {}),
    };
  }
  if (framing === "side") {
    const half = halves(frame);
    const crop = coverCrop(size, half.box.width / half.box.height);
    return {
      ...kept,
      ...half.camera,
      scale: scaleFor(size, frame, crop, half.box.width),
      crop,
    };
  }
  const crop = coverCrop(size, frame.width / frame.height);
  return { ...kept, x: 0.5, y: 0.5, scale: scaleFor(size, frame, crop, frame.width), crop };
}

/** The screen beside the camera ("Lado a lado"): whole, in the other half of the frame. */
export function screenBesideCamera(screen: Size, frame: Frame): Transform {
  const half = halves(frame);
  const size = {
    width: screen.width > 0 ? screen.width : frame.width,
    height: screen.height > 0 ? screen.height : frame.height,
  };
  const fit = Math.min(frame.width / size.width, frame.height / size.height);
  const inBox = Math.min(half.box.width / size.width, half.box.height / size.height);
  return { ...DEFAULT_TRANSFORM, ...half.screen, scale: round(inBox / fit) };
}

const close = (a: number | undefined, b: number | undefined): boolean =>
  Math.abs((a ?? 0) - (b ?? 0)) < 0.002;

/** Whether `t` is exactly what a framing gives (moved or resized by hand, it is none). */
function same(t: Transform | undefined, want: Transform): boolean {
  if (!t) return false;
  const c = t.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const w = want.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  return (
    close(t.x, want.x) &&
    close(t.y, want.y) &&
    close(t.scale, want.scale) &&
    (t.mask ?? null) === (want.mask ?? null) &&
    close(c.left, w.left) &&
    close(c.right, w.right) &&
    close(c.top, w.top) &&
    close(c.bottom, w.bottom)
  );
}

/** The framing a camera clip has now, or null when it was placed some other way. */
export function framingOf(
  t: Transform | undefined,
  camera: Size,
  frame: Frame,
): CameraFraming | null {
  return CAMERA_FRAMINGS.find((f) => same(t, cameraFraming(f, camera, frame, t))) ?? null;
}

/**
 * Frames every clip of the camera `cameraId`. "Lado a lado" also puts the screen of the same
 * take in the other half, with what was drawn over it (the take's drawing clips go where the
 * screen goes); leaving it puts back the clips still where it put them, each in the place it had
 * before (Clip.besideFrom). `border` is the corner shapes' border when the clip has none yet
 * (the course's accent).
 */
export function frameCamera(
  project: Project,
  cameraId: string,
  framing: CameraFraming,
  border?: string,
): Project {
  const camera = project.assets.find((a) => a.id === cameraId);
  if (!camera) return project;
  const frame = project.settings;
  const take = camera.recording?.id;
  const screens = new Map(
    project.assets
      .filter(
        (a) =>
          take &&
          a.recording?.id === take &&
          (a.recording.role === "screen" || a.recording.role === "drawing"),
      )
      .map((a) => [a.id, a]),
  );
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.assetId === cameraId) {
        const base = c.transform ?? DEFAULT_TRANSFORM;
        const corner = framing === "circle" || framing === "rounded";
        return {
          ...c,
          transform: cameraFraming(framing, camera, frame, {
            ...base,
            ...(corner && !base.border && border ? { border } : {}),
          }),
        };
      }
      const screen = screens.get(c.assetId);
      if (!screen) return c;
      const beside = screenBesideCamera(screen, frame);
      if (framing === "side") {
        if (same(c.transform, beside)) return c;
        // The place it had, to go back to (null: fit to the frame).
        return { ...c, transform: beside, besideFrom: c.transform ?? null };
      }
      const { transform: _transform, besideFrom, ...rest } = c;
      // Moved by hand since: it stays where the person put it.
      if (!same(c.transform, beside))
        return besideFrom === undefined
          ? c
          : { ...rest, ...(c.transform ? { transform: c.transform } : {}) };
      return besideFrom ? { ...rest, transform: besideFrom } : rest;
    }),
  };
}
