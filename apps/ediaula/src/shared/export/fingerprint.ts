import { cursorFrame } from "../cursor-expressions.ts";
import { clipSpeed } from "../timeline.ts";
import { cutFxWindow, type DerivedProject } from "../transitions.ts";
import type { ExportSpec } from "../types.ts";
import { zoomsIn } from "../zoom.ts";
import { entryView } from "../zoomLayer.ts";
import { frameTime, type Rate, rateValue } from "./frames.ts";
import { clipFrames, composeSize, drawOrder, keyedPath, type VideoWindow } from "./videoPlan.ts";

/**
 * What a segment of the export shows, as canonical JSON: the key of its cached file. Times are
 * counted from the segment's first frame, so a segment whose content only moved on the timeline
 * (an edit before it) has the same key. The main process adds the files it reads (path, size and
 * modification time) and the FFmpeg version before hashing.
 */

/** Bumped whenever the export draws the same project differently. */
export const PLAN_VERSION = 2;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Numbers to microseconds (floating noise of `start - from` disappears), keys sorted. */
function normalize(value: unknown): Json {
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 || 0 : String(value);
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      if (v !== undefined) out[k] = normalize(v);
    return out;
  }
  return null;
}

export const canonical = (value: unknown): string => JSON.stringify(normalize(value));

export interface Signature {
  /** Everything that decides the pixels, without the files' contents. */
  key: Json;
  /** Files whose contents decide them too. */
  files: string[];
  /** Font families the burned captions of the segment are drawn with (their files decide too). */
  fonts: string[];
}

const DIALOGUE =
  /^Dialogue:\s*([^,]*),(\d+):(\d\d):(\d\d)\.(\d\d),(\d+):(\d\d):(\d\d)\.(\d\d),(.*)$/;
const assSeconds = (h: string, m: string, s: string, cs: string): number =>
  Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100;

/** The font families an ASS file draws with: its styles' and the ones its events switch to. */
export function assFonts(ass: string): string[] {
  const fonts = new Set<string>();
  for (const line of ass.split(/\r?\n/)) {
    const style = /^Style:\s*[^,]*,([^,]+),/.exec(line);
    if (style) fonts.add(style[1].trim());
    for (const m of line.matchAll(/\\fn([^\\}]+)/g)) fonts.add(m[1].trim());
  }
  return [...fonts].filter(Boolean).sort();
}

/** The ASS file's styles and the events on screen in [t0, t1), timed from t0. */
export function assWindow(
  ass: string,
  t0: number,
  t1: number,
): { header: string[]; events: Json[] } {
  const header: string[] = [];
  const events: Json[] = [];
  for (const line of ass.split(/\r?\n/)) {
    const m = DIALOGUE.exec(line);
    if (!m) {
      if (!line.startsWith("Dialogue:")) header.push(line);
      continue;
    }
    const start = assSeconds(m[2], m[3], m[4], m[5]);
    const end = assSeconds(m[6], m[7], m[8], m[9]);
    if (end <= t0 || start >= t1) continue;
    events.push([m[1], start - t0, end - t0, m[10]]);
  }
  return { header, events };
}

/** The key of one segment of the picture. `encoding` is the encoder's whole list of options. */
export function windowSignature(
  project: DerivedProject,
  win: VideoWindow,
  spec: ExportSpec,
  r: Rate,
  encoding: string[],
): Signature {
  const fps = rateValue(r);
  const t0 = frameTime(win.from, r);
  const t1 = frameTime(win.from + win.frames, r);
  const { W, H } = composeSize(project, spec);
  const files = new Set<string>();
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const used = new Map<string, number>();
  const media: Json[] = [];
  const clips: Json[] = [];
  for (const c of drawOrder(project)) {
    if (tracks.get(c.trackId)?.hidden) continue;
    const frames = clipFrames(c, r, win);
    const asset = assets.get(c.assetId);
    // Sound has no part in the picture (the music running under every segment least of all).
    if (!frames || !asset || (asset.kind === "audio" && !c.zoomLayer)) continue;
    if (!used.has(asset.id)) {
      const cutOut = keyedPath(asset);
      const keyed = !!cutOut;
      const path = cutOut ?? asset.path;
      if (asset.kind !== "audio" && !c.zoomLayer) files.add(path);
      const sprite = asset.cursor ? spec.cursors?.[asset.id] : undefined;
      if (sprite) files.add(sprite.sprite);
      used.set(asset.id, media.length);
      media.push(
        normalize({
          kind: asset.kind,
          width: asset.width,
          height: asset.height,
          fps: asset.fps,
          duration: asset.duration,
          alpha: asset.alpha,
          path,
          keyed,
          sprite: sprite ? { path: sprite.sprite, size: sprite.size, fps: sprite.fps } : undefined,
        }),
      );
    }
    const speed = clipSpeed(c);
    const cursor = asset.cursor ? spec.cursors?.[asset.id] : undefined;
    let pointer: number[] | undefined;
    if (cursor) {
      pointer = [];
      for (let k = frames.k0; k < frames.k1; k++) {
        const f = cursorFrame(cursor, c, fps, k);
        pointer.push(cursor.positions[f * 2], cursor.positions[f * 2 + 1]);
      }
    }
    const reads = c.in + (frames.k0 / fps) * speed;
    clips.push(
      normalize({
        media: used.get(asset.id),
        start: c.start - t0,
        in: c.in,
        duration: c.duration,
        speed: c.speed,
        frames: [frames.k0, frames.k1],
        transform: c.transform,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        enter: c.enter,
        exit: c.exit,
        keyframes: c.keyframes,
        zoomLayer: c.zoomLayer,
        entry: c.zoomLayer ? entryView(project, c) : undefined,
        tail: c.tail,
        tailFx: c.tailFx,
        drawAfter: c.drawAfter,
        zooms: zoomsIn(asset.zooms, reads, c.in + (frames.k1 / fps + 0.1) * speed),
        pointer,
      }),
    );
  }
  const cutFx = (project.cutFx ?? [])
    .filter((fx) => {
      const [a, b] = cutFxWindow(fx);
      return b >= t0 && a <= t1;
    })
    .map((fx) => normalize({ ...fx, at: fx.at - t0 }));
  const captions = spec.burnAss ? assWindow(spec.burnAss, t0, t1) : undefined;
  return {
    key: normalize({
      plan: PLAN_VERSION,
      frames: win.frames,
      rate: r.text,
      compose: [W, H],
      output: [spec.width, spec.height],
      vertical: spec.vertical,
      encoding,
      media,
      clips,
      cutFx,
      captions,
    }),
    files: [...files],
    // The fonts decide only where captions show.
    fonts: spec.burnAss && captions?.events.length ? assFonts(spec.burnAss) : [],
  };
}
