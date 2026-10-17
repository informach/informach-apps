import type { Clip, Project } from "./types.ts";
import type { View } from "./zoom.ts";

/**
 * A zoom layer is a clip that zooms every track below it while it lasts (the tracks above it are
 * left alone): the composite of the lower tracks is viewed around (x, y) at `scale`.
 * Like Camtasia's zoom animations, going in and coming out are each optional: a layer can start
 * already zoomed, or stay zoomed until it ends. A layer that starts where another one (on the
 * same track) ends and stays zoomed continues from that one's view — zoom and pan to a new spot
 * without going back out; a layer at 1× after it is the "restore".
 * The export zooms the composite at that point of the layer stack; the preview gives each lower
 * layer the same view, from the same curve.
 */
export interface ZoomLayer {
  scale: number;
  /** Center of the view, fractions of the frame. */
  x: number;
  y: number;
  /** Animate in (default true) and out (default true). */
  zoomIn?: boolean;
  zoomOut?: boolean;
  /** Seconds of the way in and out (default `ease`, then 0.6). */
  easeIn?: number;
  easeOut?: number;
  /** Older projects: one duration for both. */
  ease?: number;
}

export const DEFAULT_ZOOM_LAYER: ZoomLayer = {
  scale: 1.6,
  x: 0.5,
  y: 0.5,
  zoomIn: true,
  zoomOut: true,
  easeIn: 0.6,
  easeOut: 0.6,
};

const NORMAL: View = { scale: 1, cx: 0.5, cy: 0.5 };
const TOUCH = 0.02;
const n = (v: number): string => (Math.round(v * 10000) / 10000).toString();

type LayerClip = Pick<Clip, "id" | "start" | "duration" | "trackId" | "zoomLayer">;

export const viewOf = (c: Pick<Clip, "zoomLayer">): View => ({
  scale: c.zoomLayer!.scale,
  cx: c.zoomLayer!.x,
  cy: c.zoomLayer!.y,
});

/** Seconds of the way in and out, 0 when switched off, at most half the layer each. */
export function zoomTimes(c: Pick<Clip, "duration" | "zoomLayer">): { inT: number; outT: number } {
  const z = c.zoomLayer!;
  const half = c.duration / 2;
  return {
    inT: z.zoomIn === false ? 0 : Math.min(half, z.easeIn ?? z.ease ?? 0.6),
    outT: z.zoomOut === false ? 0 : Math.min(half, z.easeOut ?? z.ease ?? 0.6),
  };
}

/** The zoom layer ending where this one starts, on the same track. */
export function previousZoom(p: Pick<Project, "clips">, c: LayerClip): Clip | undefined {
  return p.clips.find(
    (o) =>
      o.id !== c.id &&
      o.zoomLayer &&
      o.trackId === c.trackId &&
      Math.abs(o.start + o.duration - c.start) < TOUCH,
  );
}

/** Where the way in starts: the previous layer's view when it stays zoomed up to here, else normal. */
export function entryView(p: Pick<Project, "clips">, c: LayerClip): View {
  const prev = previousZoom(p, c);
  return prev && prev.zoomLayer!.zoomOut === false ? viewOf(prev) : NORMAL;
}

const smooth = (p: number): number => {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
};
const mix = (a: View, b: View, k: number): View => ({
  scale: a.scale + (b.scale - a.scale) * k,
  cx: a.cx + (b.cx - a.cx) * k,
  cy: a.cy + (b.cy - a.cy) * k,
});
/** The view never shows past the frame's edges. */
const clampView = (v: View): View => ({
  scale: v.scale,
  cx: Math.min(1 - 0.5 / v.scale, Math.max(0.5 / v.scale, v.cx)),
  cy: Math.min(1 - 0.5 / v.scale, Math.max(0.5 / v.scale, v.cy)),
});

/** The layer's view at timeline time t (inside the layer). */
export function layerViewAt(c: LayerClip, t: number, from: View = NORMAL): View {
  const { inT, outT } = zoomTimes(c);
  const end = c.start + c.duration;
  const target = viewOf(c);
  if (inT > 0 && t < c.start + inT)
    return clampView(mix(from, target, smooth((t - c.start) / inT)));
  if (outT > 0 && t > end - outT) return clampView(mix(NORMAL, target, smooth((end - t) / outT)));
  return clampView(target);
}

/** The same view as ffmpeg expressions of the time `T`. */
export function layerViewExprs(
  c: LayerClip,
  from: View,
  T: string,
): { scale: string; cx: string; cy: string } {
  const { inT, outT } = zoomTimes(c);
  const end = c.start + c.duration;
  const target = viewOf(c);
  const sm = (x: string): string => `(clip(${x},0,1)*clip(${x},0,1)*(3-2*clip(${x},0,1)))`;
  const kIn = inT > 0 ? sm(`(${T}-${n(c.start)})/${n(inT)}`) : "1";
  const kOut = outT > 0 ? sm(`(${n(end)}-${T})/${n(outT)}`) : "1";
  const part = (key: keyof View): string => {
    const a = `(${n(from[key])}+(${n(target[key] - from[key])})*${kIn})`;
    const b = `(${n(NORMAL[key])}+(${n(target[key] - NORMAL[key])})*${kOut})`;
    const steady = n(target[key]);
    return `if(lt(${T},${n(c.start + inT)}),${inT > 0 ? a : steady},if(gt(${T},${n(end - outT)}),${outT > 0 ? b : steady},${steady}))`;
  };
  const scale = `(${part("scale")})`;
  const center = (key: "cx" | "cy"): string => `clip(${part(key)},0.5/${scale},1-0.5/${scale})`;
  return { scale, cx: center("cx"), cy: center("cy") };
}

/** Views (in order, outermost last) applied at time t to a layer on track index `trackIndex`. */
export function zoomsOver(
  p: Pick<Project, "clips" | "tracks">,
  trackIndex: number,
  t: number,
  skip?: string,
): View[] {
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]));
  return p.clips
    .filter(
      (c) =>
        c.zoomLayer &&
        c.id !== skip &&
        t >= c.start &&
        t < c.start + c.duration &&
        (order.get(c.trackId) ?? -1) < trackIndex &&
        !p.tracks[order.get(c.trackId)!]?.hidden,
    )
    .sort((a, b) => order.get(b.trackId)! - order.get(a.trackId)!)
    .map((c) => layerViewAt(c, t, entryView(p, c)))
    .filter((v) => v.scale !== 1 || v.cx !== 0.5 || v.cy !== 0.5);
}

/**
 * The composed zoom as p → s·p + t in pixels of a W × H frame: each view maps its center to the
 * middle of the frame and magnifies around it.
 */
export function zoomAffine(
  views: View[],
  W: number,
  H: number,
): { s: number; tx: number; ty: number } {
  let s = 1;
  let tx = 0;
  let ty = 0;
  for (const v of views) {
    // q = v.scale·(p − C) + O, applied after what came before.
    const cx = v.cx * W;
    const cy = v.cy * H;
    s = v.scale * s;
    tx = v.scale * (tx - cx) + W / 2;
    ty = v.scale * (ty - cy) + H / 2;
  }
  return { s, tx, ty };
}

/** ffmpeg perspective filter zooming a W × H composite as the layer says, frame by frame. */
export function zoomLayerFilter(c: LayerClip, fps: number, from: View = NORMAL): string {
  const e = layerViewExprs(c, from, `(in/${fps})`);
  const x0 = `(${e.cx}-0.5/${e.scale})*W`;
  const y0 = `(${e.cy}-0.5/${e.scale})*H`;
  const w = `W/${e.scale}`;
  const h = `H/${e.scale}`;
  return `perspective=x0='${x0}':y0='${y0}':x1='${x0}+${w}':y1='${y0}':x2='${x0}':y2='${y0}+${h}':x3='${x0}+${w}':y3='${y0}+${h}':eval=frame:interpolation=linear:enable='between(t,${n(c.start)},${n(c.start + c.duration)})'`;
}
