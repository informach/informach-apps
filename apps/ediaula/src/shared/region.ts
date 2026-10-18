/**
 * The part of a monitor a screen take records. The recorder window draws the region in its own
 * pixels (DIP); the capture needs physical pixels of the monitor, in even sizes (the encoders work
 * in 2 × 2 blocks). Presets come in physical pixels (1920 × 1080 is exactly that on screen,
 * whatever the Windows scaling), and a window picked with "Janela…" gives its rectangle on the
 * virtual desktop, cut to the monitor.
 */

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionSize {
  width: number;
  height: number;
}

/** "window" is a rectangle taken from a window; it is kept as "custom" once saved. */
export const REGION_PRESETS = ["full", "1080p", "720p", "16:9", "lesson", "custom"] as const;
export type RegionPreset = (typeof REGION_PRESETS)[number];

/** The smallest region worth recording, physical pixels. */
export const MIN_REGION = 80;

const even = (v: number): number => Math.max(2, Math.floor(v / 2) * 2);

/**
 * A region drawn in window pixels as physical pixels of a monitor of `monitor` size whose window
 * is `dip` wide and tall: whole pixels, even sizes, inside the monitor. undefined when it covers
 * the whole monitor (the capture then needs no crop).
 */
export function dipToPhysical(
  region: RegionRect,
  monitor: RegionSize,
  dip: RegionSize,
): RegionRect | undefined {
  const k = monitor.width / dip.width;
  // Rounded first: a size that came from physical pixels comes back the same (1280 at 150%
  // is 853.33 window pixels, and 853.33 × 1.5 must give 1280 again, not 1278).
  const x = Math.min(Math.max(0, Math.round(region.x * k)), monitor.width - 2);
  const y = Math.min(Math.max(0, Math.round(region.y * k)), monitor.height - 2);
  const room = (total: number, at: number): number => even(total - at);
  const out = {
    x,
    y,
    width: Math.min(even(Math.round(region.width * k)), room(monitor.width, x)),
    height: Math.min(even(Math.round(region.height * k)), room(monitor.height, y)),
  };
  if (
    out.x === 0 &&
    out.y === 0 &&
    out.width >= monitor.width - 1 &&
    out.height >= monitor.height - 1
  )
    return undefined;
  return out;
}

/** Physical pixels of the monitor back in window pixels (fractions kept: the round trip is exact). */
export function physicalToDip(
  region: RegionRect,
  monitor: RegionSize,
  dip: RegionSize,
): RegionRect {
  const k = dip.width / monitor.width;
  return {
    x: region.x * k,
    y: region.y * k,
    width: region.width * k,
    height: region.height * k,
  };
}

/** `want` made smaller to fit `within`, keeping its proportion, in even sizes. */
export function fitSize(want: RegionSize, within: RegionSize): RegionSize {
  const s = Math.min(1, within.width / want.width, within.height / want.height);
  return { width: even(want.width * s), height: even(want.height * s) };
}

const centered = (size: RegionSize, monitor: RegionSize): RegionRect => {
  const fit = fitSize(size, monitor);
  return {
    x: Math.floor((monitor.width - fit.width) / 2),
    y: Math.floor((monitor.height - fit.height) / 2),
    ...fit,
  };
};

/**
 * A preset's rectangle on a monitor, physical pixels: the whole screen, exactly 1920 × 1080 or
 * 1280 × 720 in the middle (smaller, in the same proportion, on a smaller screen), the largest
 * 16:9 in the middle, or the lesson's own size and proportion. Null for "custom".
 */
export function presetRegion(
  preset: RegionPreset,
  monitor: RegionSize,
  lesson?: RegionSize,
): RegionRect | null {
  switch (preset) {
    case "full":
      return { x: 0, y: 0, width: even(monitor.width), height: even(monitor.height) };
    case "1080p":
      return centered({ width: 1920, height: 1080 }, monitor);
    case "720p":
      return centered({ width: 1280, height: 720 }, monitor);
    case "16:9": {
      const height = Math.min(monitor.height, (monitor.width * 9) / 16);
      return centered({ width: (height * 16) / 9, height }, monitor);
    }
    case "lesson":
      return lesson && lesson.width > 0 && lesson.height > 0 ? centered(lesson, monitor) : null;
    default:
      return null;
  }
}

/**
 * The region with a new width or height typed in (physical pixels), around the same center and
 * inside the monitor. With `lock`, the other side follows in the region's proportion.
 */
export function resizeRegion(
  region: RegionRect,
  change: Partial<RegionSize>,
  lock: boolean,
  monitor: RegionSize,
): RegionRect {
  const ratio = region.width / region.height;
  let width = change.width ?? region.width;
  let height = change.height ?? region.height;
  if (lock && change.width !== undefined && change.height === undefined) height = width / ratio;
  if (lock && change.height !== undefined && change.width === undefined) width = height * ratio;
  const clampTo = (v: number, max: number): number => Math.min(Math.max(MIN_REGION, v), max);
  // Too large for the screen: both sides shrink together when the proportion is locked.
  if (lock && (width > monitor.width || height > monitor.height)) {
    const fit = fitSize({ width, height }, monitor);
    width = fit.width;
    height = fit.height;
  }
  width = even(clampTo(width, monitor.width));
  height = even(clampTo(height, monitor.height));
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const x = Math.min(Math.max(0, Math.round(cx - width / 2)), monitor.width - width);
  const y = Math.min(Math.max(0, Math.round(cy - height / 2)), monitor.height - height);
  return { x, y, width, height };
}

/**
 * A window's rectangle (physical pixels of the virtual desktop) as a region of the monitor at
 * `monitor` (also on the virtual desktop): the part of the window on that monitor, relative to
 * its corner, in even sizes. Null when too little of the window is on it.
 */
export function snapToWindow(window: RegionRect, monitor: RegionRect): RegionRect | null {
  const left = Math.max(window.x, monitor.x);
  const top = Math.max(window.y, monitor.y);
  const right = Math.min(window.x + window.width, monitor.x + monitor.width);
  const bottom = Math.min(window.y + window.height, monitor.y + monitor.height);
  const width = Math.floor((right - left) / 2) * 2;
  const height = Math.floor((bottom - top) / 2) * 2;
  if (width < MIN_REGION || height < MIN_REGION) return null;
  return { x: left - monitor.x, y: top - monitor.y, width, height };
}

/** The monitor most of a window is on (index into `monitors`), or -1 when it is on none. */
export function monitorOfWindow(window: RegionRect, monitors: readonly RegionRect[]): number {
  let best = -1;
  let most = 0;
  monitors.forEach((m, i) => {
    const w = Math.min(window.x + window.width, m.x + m.width) - Math.max(window.x, m.x);
    const h = Math.min(window.y + window.height, m.y + m.height) - Math.max(window.y, m.y);
    const area = Math.max(0, w) * Math.max(0, h);
    if (area > most) {
      most = area;
      best = i;
    }
  });
  return best;
}

/** What the recorder says about the window it follows (the helper's "win" events). */
export type WindowProblem = "gone" | "minimized" | "outside" | null;

/**
 * Whether the followed window still shows in the recorded rectangle (both physical pixels of the
 * virtual desktop): closed, minimized, or moved so that less than 90% of it is inside.
 */
export function windowProblem(
  state: { gone?: boolean; min?: boolean; rect?: { x: number; y: number; w: number; h: number } },
  capture: RegionRect,
): WindowProblem {
  if (state.gone) return "gone";
  if (state.min) return "minimized";
  const r = state.rect;
  if (!r || r.w <= 0 || r.h <= 0) return null;
  const w = Math.min(r.x + r.w, capture.x + capture.width) - Math.max(r.x, capture.x);
  const h = Math.min(r.y + r.h, capture.y + capture.height) - Math.max(r.y, capture.y);
  const inside = (Math.max(0, w) * Math.max(0, h)) / (r.w * r.h);
  // A window bigger than the region (maximized over it) still fills it: what matters is the region.
  const covered = (Math.max(0, w) * Math.max(0, h)) / (capture.width * capture.height);
  return inside >= 0.9 || covered >= 0.98 ? null : "outside";
}

/** The warning for each problem, as the recorder shows it. */
export const WINDOW_PROBLEMS: Record<Exclude<WindowProblem, null>, string> = {
  gone: "A janela escolhida foi fechada.",
  minimized: "A janela escolhida foi minimizada: ela não aparece na gravação.",
  outside: "A janela escolhida saiu da região gravada.",
};
