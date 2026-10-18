import { clipEnd, sourceAt } from "./clipTime.ts";
import { clipLayout } from "./compose.ts";
import { transformAt } from "./keyframes.ts";
import { blockSize, blurRadius, type Rect, type RegionFx } from "./look.ts";
import type { Asset, Clip, Project } from "./types.ts";
import { type View, zoomAt, zoomsIn } from "./zoom.ts";
import { entryView, layerViewAt, zoomAffine } from "./zoomLayer.ts";

/**
 * "Seguir a gravação" (RegionFx.follow): a region effect stuck to the screen recording under
 * it. Its rectangle is drawn over the recording at rest; when the recording zooms (its own
 * zooms, asset.zooms) or a zoom layer between them magnifies it, the region goes with what it
 * covers, frame by frame. The export applies the effect inside the recording's own picture,
 * before its zooms (shared/export/videoPlan.ts), so they carry it; the preview places the
 * region with regionRectAt(), the same numbers.
 *
 * A region that does not follow stays where it is on the frame: a zoom layer above it still
 * magnifies it with the rest of the picture, as in the export.
 */

type Lesson = Pick<Project, "clips" | "tracks" | "assets" | "settings">;

/** Clips that are a picture of their own (not effects, notes or pictures the editor draws). */
const recording = (c: Clip, asset: Asset | undefined): asset is Asset =>
  !!asset &&
  asset.kind === "video" &&
  !asset.generated &&
  !c.annotation &&
  !c.zoomLayer &&
  !c.regionFx;

/**
 * The recording a region follows: the media and track of the first video clip under it (the
 * nearest track below that has one while the region lasts). Null when there is none.
 */
export function followTarget(
  p: Pick<Project, "clips" | "tracks" | "assets">,
  region: Pick<Clip, "trackId" | "start" | "duration">,
): { assetId: string; trackId: string } | null {
  const order = new Map(p.tracks.map((t, i) => [t.id, i]));
  const own = order.get(region.trackId) ?? -1;
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  let best: Clip | undefined;
  for (const c of p.clips) {
    const index = order.get(c.trackId) ?? -1;
    if (index <= own || p.tracks[index]?.hidden) continue;
    if (c.start >= clipEnd(region) || clipEnd(c) <= region.start) continue;
    if (!recording(c, assets.get(c.assetId))) continue;
    const bestIndex = best ? (order.get(best.trackId) ?? -1) : Number.POSITIVE_INFINITY;
    if (index < bestIndex || (index === bestIndex && best && c.start < best.start)) best = c;
  }
  return best ? { assetId: best.assetId, trackId: best.trackId } : null;
}

/** The region's rectangle in pixels of the recording's own picture (its source), at rest. */
export function regionInSource(
  fx: RegionFx,
  clip: Pick<Clip, "transform">,
  asset: Pick<Asset, "width" | "height">,
  frame: Pick<Project["settings"], "width" | "height">,
): Rect {
  const lay = clipLayout(clip, asset, frame);
  const sw = asset.width || frame.width;
  const sh = asset.height || frame.height;
  const toSource = (x: number, y: number): [number, number] => {
    let u = (x * frame.width - lay.full.x) / Math.max(1e-9, lay.full.w);
    let v = (y * frame.height - lay.full.y) / Math.max(1e-9, lay.full.h);
    // A mirrored clip shows its picture the other way round.
    if (clip.transform?.flipH) u = 1 - u;
    if (clip.transform?.flipV) v = 1 - v;
    return [u * sw, v * sh];
  };
  const [ax, ay] = toSource(fx.rect.x, fx.rect.y);
  const [bx, by] = toSource(fx.rect.x + fx.rect.w, fx.rect.y + fx.rect.h);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** regionInSource in whole even pixels inside the picture (chroma planes stay whole). */
export function sourcePixels(rect: Rect, sw: number, sh: number): Rect | null {
  const even = (v: number): number => Math.round(v / 2) * 2;
  const x = Math.max(0, Math.min(sw - 2, even(rect.x)));
  const y = Math.max(0, Math.min(sh - 2, even(rect.y)));
  const w = Math.min(even(rect.w), sw - x - ((sw - x) % 2));
  const h = Math.min(even(rect.h), sh - y - ((sh - y) % 2));
  return w >= 2 && h >= 2 ? { x, y, w, h } : null;
}

/**
 * Blur radius and pixel block of a region, in pixels of the picture it is applied to: `H`
 * tall for the frame, `scale` the size of one of those pixels on the frame (a source shown
 * bigger or smaller). The radius stops at half the region, as boxblur requires.
 */
export function regionStrength(
  fx: RegionFx,
  H: number,
  box: Pick<Rect, "w" | "h">,
  scale = 1,
): { radius: number; block: number } {
  const most = Math.max(1, Math.floor(Math.min(box.w, box.h) / 2) - 1);
  return {
    radius: Math.min(most, Math.max(1, Math.round(blurRadius(fx, H) / scale))),
    block: Math.max(2, Math.round(blockSize(fx, H) / scale)),
  };
}

/** Zoom layers between the region's track and the recording's, outermost last. */
export function zoomsBetween(
  p: Pick<Project, "clips" | "tracks">,
  above: number,
  below: number,
  t: number,
): View[] {
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  return p.clips
    .filter((c) => {
      const index = order.get(c.trackId) ?? -1;
      return (
        !!c.zoomLayer &&
        t >= c.start &&
        t < clipEnd(c) &&
        index > above &&
        index < below &&
        !p.tracks[index]?.hidden
      );
    })
    .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0))
    .map((c) => layerViewAt(c, t, entryView(p, c)))
    .filter((v) => v.scale !== 1 || v.cx !== 0.5 || v.cy !== 0.5);
}

/** Where a following region is on the frame at `t`, and how much bigger its pixels show. */
export interface FollowedRect {
  rect: Rect;
  /** Frame pixels per source pixel of the recording (its fit, its zoom, the layers). */
  scale: number;
  /** The recording clip it is on at `t`. */
  clip: Clip;
  /** Blur radius, block and soft edge in source pixels, as the export draws them. */
  radius: number;
  block: number;
  feather: number;
}

/**
 * A following region's rectangle at timeline time `t`, in pixels of the frame: the rectangle
 * in the recording's picture (regionInSource, through the clip's own size), through the
 * recording's zoom at that moment and the zoom layers between them. Null when the recording
 * is not on screen then.
 */
export function regionRectAt(p: Lesson, region: Clip, t: number): FollowedRect | null {
  const fx = region.regionFx;
  if (!fx) return null;
  const target = followTarget(p, region);
  if (!target) return null;
  const asset = p.assets.find((a) => a.id === target.assetId);
  const clip = p.clips.find(
    (c) =>
      c.assetId === target.assetId &&
      c.trackId === target.trackId &&
      t >= c.start &&
      t < clipEnd(c),
  );
  if (!asset || !clip) return null;
  const W = p.settings.width;
  const H = p.settings.height;
  const sw = asset.width || W;
  const sh = asset.height || H;
  const src = sourcePixels(regionInSource(fx, clip, asset, p.settings), sw, sh);
  if (!src) return null;
  // The export's sizes: frame pixels of the clip at rest to source pixels.
  const rest = clipLayout(clip, asset, p.settings).full.w / sw;
  const { radius, block } = regionStrength(fx, H, src, rest);
  // The recording's zoom: source u shows at (u − cx)·s + ½ of its box.
  const view = zoomAt(asset.zooms, sourceAt(clip, t));
  const lay = clipLayout({ transform: transformAt(clip, t) }, asset, p.settings);
  const flipH = !!clip.transform?.flipH;
  const flipV = !!clip.transform?.flipV;
  const place = (x: number, y: number): [number, number] => {
    let u = (x / sw - view.cx) * view.scale + 0.5;
    let v = (y / sh - view.cy) * view.scale + 0.5;
    if (flipH) u = 1 - u;
    if (flipV) v = 1 - v;
    return [lay.full.x + u * lay.full.w, lay.full.y + v * lay.full.h];
  };
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  const A = zoomAffine(
    zoomsBetween(p, order.get(region.trackId) ?? -1, order.get(clip.trackId) ?? 0, t),
    W,
    H,
  );
  const [ax, ay] = place(src.x, src.y);
  const [bx, by] = place(src.x + src.w, src.y + src.h);
  const x0 = A.s * Math.min(ax, bx) + A.tx;
  const y0 = A.s * Math.min(ay, by) + A.ty;
  return {
    rect: { x: x0, y: y0, w: A.s * Math.abs(bx - ax), h: A.s * Math.abs(by - ay) },
    scale: (lay.full.w / sw) * view.scale * A.s,
    clip,
    radius,
    block,
    feather: (fx.feather * H) / 1080 / rest,
  };
}

/**
 * Whether something zooms under a region that stays on the frame: the recording's zooms over
 * the time the region lasts, or a zoom layer between them. The panel then offers to follow.
 */
export function zoomUnder(p: Lesson, region: Clip): boolean {
  if (region.regionFx?.follow) return false;
  const target = followTarget(p, region);
  if (!target) return false;
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  const above = order.get(region.trackId) ?? -1;
  const below = order.get(target.trackId) ?? 0;
  const layer = p.clips.some((c) => {
    const index = order.get(c.trackId) ?? -1;
    return (
      !!c.zoomLayer &&
      index > above &&
      index < below &&
      c.start < clipEnd(region) &&
      clipEnd(c) > region.start
    );
  });
  if (layer) return true;
  const asset = p.assets.find((a) => a.id === target.assetId);
  if (!asset?.zooms?.length) return false;
  return p.clips.some((c) => {
    if (c.assetId !== target.assetId || c.trackId !== target.trackId) return false;
    const from = Math.max(c.start, region.start);
    const to = Math.min(clipEnd(c), clipEnd(region));
    return to > from && zoomsIn(asset.zooms, sourceAt(c, from), sourceAt(c, to)).length > 0;
  });
}
