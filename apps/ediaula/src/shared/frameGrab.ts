import { clipLayout } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { clipEnd, sourceAt } from "./timeline.ts";
import type { Asset, Clip, Project } from "./types.ts";
import { zoomAt } from "./zoom.ts";

/**
 * What get_frame shows the AI: a frame of the lesson, a region of it and its size, and the boxes
 * of what is drawn over it, so the model can check where an arrow, a balloon or a zoom lands and
 * that nothing covers the controls the child has to see. The picture itself is made elsewhere
 * (the screen media by FFmpeg with the pointer drawn by the editor, or the lesson as the export
 * composes it); this module only decides what to cut out and how big.
 */

/** Longest side of an image sent to the model: Claude reads images up to this size. */
export const MAX_IMAGE_SIDE = 1568;
/** Smallest region, in pixels of the source, so a tiny region is still something to look at. */
export const MIN_REGION = 16;

export interface FrameRegion {
  /** Top-left corner and size, fractions of the frame (0 to 1). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameGeometry {
  /** What is cut out of the source frame, in its pixels. */
  crop: { x: number; y: number; width: number; height: number };
  /** Size of the image sent, in pixels (even, longest side at most MAX_IMAGE_SIDE). */
  width: number;
  height: number;
  /** Pixels of the image per pixel of the source. */
  scale: number;
}

const even = (v: number): number => Math.max(2, Math.round(v / 2) * 2);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The crop and the size of the image for a frame of `source` pixels: `region` (fractions of the
 * frame, clamped inside it, at least MIN_REGION pixels) or the whole frame, scaled down so it is
 * at most `maxWidth` wide and its longest side at most MAX_IMAGE_SIDE. Never scaled up.
 */
export function frameGeometry(
  source: { width: number; height: number },
  region?: FrameRegion,
  maxWidth?: number,
): FrameGeometry {
  const W = Math.max(2, Math.round(source.width));
  const H = Math.max(2, Math.round(source.height));
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  if (region) {
    const x0 = clamp(region.x, 0, 1) * W;
    const y0 = clamp(region.y, 0, 1) * H;
    const x1 = clamp(region.x + region.width, 0, 1) * W;
    const y1 = clamp(region.y + region.height, 0, 1) * H;
    w = Math.max(Math.min(MIN_REGION, W), Math.round(x1 - x0));
    h = Math.max(Math.min(MIN_REGION, H), Math.round(y1 - y0));
    // A region pushed against an edge keeps its size and moves inside the frame.
    x = clamp(Math.round(x0), 0, W - w);
    y = clamp(Math.round(y0), 0, H - h);
  }
  const widest = Math.min(MAX_IMAGE_SIDE, Math.max(2, Math.round(maxWidth ?? MAX_IMAGE_SIDE)));
  const scale = Math.min(1, widest / w, MAX_IMAGE_SIDE / Math.max(w, h));
  const width = Math.min(even(w * scale), Math.max(2, Math.floor(widest / 2) * 2));
  const height = Math.min(even(h * scale), MAX_IMAGE_SIDE);
  return { crop: { x, y, width: w, height: h }, width, height, scale: width / w };
}

/** A box on the frame, fractions of the lesson frame (x, y = top-left). */
export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What is drawn over the lesson at a moment, with where it sits. */
export interface FrameOverlay {
  clip: string;
  kind: string;
  text?: string;
  box: FrameBox;
  /** A zoom layer: how much and toward where it zooms what is below it. */
  zoom?: { scale: number; x: number; y: number };
  start: number;
  end: number;
}

export interface FrameFacts {
  time: number;
  /** The lesson frame, pixels. */
  frame: { width: number; height: number };
  /** The screen media shown at that moment (the one get_frame reads without composing). */
  screen?: {
    clip: string;
    media: string;
    name: string;
    /** Second of the media shown. */
    sourceTime: number;
    /** Where the media sits on the lesson frame. */
    box: FrameBox;
    /** The zoom of the recording at that moment (1 = none), and its center (fractions). */
    zoom?: { scale: number; x: number; y: number };
  };
  /** Annotations, pictures, the presenter and zoom layers on screen, top first. */
  overlays: FrameOverlay[];
}

const box = (
  r: { x: number; y: number; w: number; h: number },
  W: number,
  H: number,
): FrameBox => ({
  x: round(r.x / W),
  y: round(r.y / H),
  width: round(r.w / W),
  height: round(r.h / H),
});
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Whether a media is a screen recording (it was recorded as the screen, or has cursor data). */
export const isScreenMedia = (a: Asset): boolean =>
  a.kind === "video" && !a.generated && (a.recording?.role === "screen" || !!a.cursor);

/**
 * The video clip get_frame reads at `time` without composing: the topmost visible screen
 * recording, else the topmost visible video that is not the presenter nor drawn by the editor.
 */
export function screenClipAt(project: Project, time: number): Clip | undefined {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
  const at = project.clips
    .filter(
      (c) =>
        !hidden.has(c.trackId) &&
        !c.annotation &&
        !c.zoomLayer &&
        c.start <= time + 1e-6 &&
        clipEnd(c) > time + 1e-6 &&
        assets.get(c.assetId)?.kind === "video",
    )
    .sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
  const media = (c: Clip): Asset | undefined => assets.get(c.assetId);
  return (
    at.find((c) => {
      const a = media(c);
      return !!a && isScreenMedia(a);
    }) ??
    at.find((c) => {
      const a = media(c);
      return !!a && !a.generated && !a.key && !a.screen && a.origin !== "presenter" && !c.insertId;
    })
  );
}

/** What is on the lesson frame at `time`: the screen media and the boxes drawn over it. */
export function frameFacts(project: Project, time: number): FrameFacts {
  const { width: W, height: H } = project.settings;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
  const screen = screenClipAt(project, time);
  const facts: FrameFacts = { time: round(time), frame: { width: W, height: H }, overlays: [] };
  if (screen) {
    const a = assets.get(screen.assetId);
    if (a) {
      const src = sourceAt(screen, time);
      const layout = clipLayout({ transform: transformAt(screen, time) }, a, project.settings);
      const view = zoomAt(a.zooms, src);
      facts.screen = {
        clip: screen.id,
        media: a.id,
        name: a.name,
        sourceTime: round(src),
        box: box(layout.visible, W, H),
        ...(view.scale > 1.001
          ? { zoom: { scale: round(view.scale), x: round(view.cx), y: round(view.cy) } }
          : {}),
      };
    }
  }
  const over = project.clips
    .filter(
      (c) =>
        c.id !== screen?.id &&
        !hidden.has(c.trackId) &&
        c.start <= time + 1e-6 &&
        clipEnd(c) > time + 1e-6,
    )
    .sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
  for (const c of over) {
    const a = assets.get(c.assetId);
    if (!a || a.kind === "audio") continue;
    const kind = c.zoomLayer
      ? "zoom"
      : c.annotation
        ? c.annotation.kind
        : c.insertId || a.key || a.screen || a.origin === "presenter"
          ? "presenter"
          : a.kind === "image"
            ? "image"
            : "video";
    const layout = c.zoomLayer
      ? { visible: { x: 0, y: 0, w: W, h: H } }
      : clipLayout({ transform: transformAt(c, time) }, a, project.settings);
    facts.overlays.push({
      clip: c.id,
      kind,
      ...(c.annotation?.text ? { text: c.annotation.text } : {}),
      box: box(layout.visible, W, H),
      ...(c.zoomLayer
        ? { zoom: { scale: c.zoomLayer.scale, x: c.zoomLayer.x, y: c.zoomLayer.y } }
        : {}),
      start: round(c.start),
      end: round(clipEnd(c)),
    });
  }
  return facts;
}
