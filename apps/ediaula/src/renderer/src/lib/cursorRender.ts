import {
  buildTrack,
  CURSOR_EFFECT_DEFAULTS,
  type CursorFx,
  type CursorTrack,
  clickSoundTimes,
  cursorAt,
  cursorFxId,
  cursorScale,
  fxAt,
  fxWhere,
  magnifierRadius,
  magnifierSide,
  magnifies,
  ripplesAt,
  spotlights,
  spritePositions,
  spriteSize,
} from "@shared/cursor";
import type { CursorData } from "@shared/cursorData";
import { newId } from "@shared/timeline";
import type { CursorSprite, Project } from "@shared/types";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import {
  drawMagnifierRing,
  drawPointer,
  drawRipples,
  paintSpotlightPicture,
  spotlightPictureSize,
} from "./cursorDraw";
import { type CursorImages, loadCursorImages } from "./cursorImages";

/** Most unique sprite frames sent to the main process per call. */
const BATCH = 48;
/**
 * Most bytes of frames held for one call: a large magnifier on a 4K screen makes a sprite of
 * more than a thousand pixels a side, and 48 of them would be hundreds of megabytes.
 */
const BATCH_BYTES = 32 * 1024 * 1024;

/** A short, stable key for a list of numbers (the cache name of the click sound). */
function numbersKey(values: readonly number[], extra: string): string {
  let hash = 2166136261;
  for (const char of `${extra}|${values.map((v) => v.toFixed(4)).join(",")}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${values.length}_${(hash >>> 0).toString(16)}`;
}

/**
 * The spotlight's picture: the recording's size (half of the twice-as-large area the export
 * moves with the pointer), dark with the lit circle in its middle, drawn by the preview's own
 * function. Saved in the app's cache (same picture, same file).
 */
async function spotlightPicture(data: CursorData, fx: CursorFx): Promise<string> {
  const { width, height } = spotlightPictureSize(data);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui desenhar o holofote.");
  paintSpotlightPicture(ctx, data, fx);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return window.api.saveGenerated(new Uint8Array(await blob.arrayBuffer()), "png");
}

/**
 * Before exporting: the pointer of every screen recording in use, drawn frame by frame with the
 * same code as the preview into a small transparent video (cached), plus where it goes on
 * each frame, and the effects the export draws around it: the magnifier, the spotlight's picture
 * and the click sound.
 */
export async function ensureCursorSprites(
  project: Project,
  signal?: AbortSignal,
): Promise<Record<string, CursorSprite>> {
  const used = new Set(project.clips.map((c) => c.assetId));
  const out: Record<string, CursorSprite> = {};
  for (const asset of project.assets) {
    signal?.throwIfAborted();
    if (!asset.cursor || !used.has(asset.id) || asset.missing) continue;
    const fx = cursorFxOf(asset);
    // Hidden everywhere: nothing to draw. Hidden but shown in a stretch: drawn there.
    if (!fxWhere(fx, (f) => !f.hidden, asset.duration).length) continue;
    const data = await loadCursorData(asset.cursor);
    const images = await loadCursorImages(asset.cursor, data).catch(() => undefined);
    const fps = asset.fps || 30;
    const track = buildTrack(data, fx, asset.duration);
    const size = spriteSize(data, fx);
    const positions = spritePositions(track, fps, asset.duration, size);
    // The recorded pointer images, or the standard shapes when they did not load: two sprites.
    const id = `${cursorFxId(fx)}_${size}_${fps}_${images ? "i" : "s"}`;
    let sprite = await window.api.cursorSprite.cached(asset.path, id);
    if (!sprite)
      sprite = await renderSprite(
        asset.path,
        asset.name,
        id,
        data,
        fx,
        track,
        positions,
        size,
        fps,
        images,
        signal,
      );
    const entry: CursorSprite = { sprite, size, fps, positions };
    const shown = (key: "magnifier" | "spotlight"): [number, number][] =>
      fxWhere(fx, (f) => !!f[key] && !f.hidden, asset.duration);
    if (magnifies(fx)) {
      const on = shown("magnifier");
      if (on.length)
        entry.magnifier = {
          radius: Math.round(magnifierRadius(data, fx)),
          side: magnifierSide(data, fx),
          on,
        };
    }
    if (spotlights(fx)) {
      const on = shown("spotlight");
      if (on.length)
        entry.spotlight = {
          picture: await spotlightPicture(data, fx),
          width: data.width,
          height: data.height,
          on,
        };
    }
    const times = clickSoundTimes(data, fx);
    const volume = fx.clickVolume ?? CURSOR_EFFECT_DEFAULTS.clickVolume;
    if (times.length && volume > 0)
      entry.clicks = await window.api.cursorSprite.clicks(
        asset.path,
        numbersKey(times, `stereo|${volume.toFixed(3)}|${asset.duration.toFixed(3)}`),
        Float64Array.from(times),
        volume,
        asset.duration,
      );
    // Kept typed: an Int32Array crosses IPC as one value, so a long recording fits the limit.
    out[asset.id] = entry;
  }
  return out;
}

async function renderSprite(
  path: string,
  name: string,
  id: string,
  data: CursorData,
  fx: CursorFx,
  track: CursorTrack,
  positions: Int32Array,
  size: number,
  fps: number,
  images: CursorImages | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const { startJob, endJob, set } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, `Desenhando cursor: ${name}`);
  try {
    signal?.throwIfAborted();
    await window.api.cursorSprite.begin(jobId, path, id, size, fps);
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const frames = positions.length / 2;
    const bytes = size * size * 4;
    const perBatch = Math.max(1, Math.min(BATCH, Math.floor(BATCH_BYTES / bytes)));
    const radius = Math.round(magnifierRadius(data, fx));
    const pixel = data.height / 1080;
    let batch = new Uint8Array(perBatch * bytes);
    let counts: number[] = [];
    let lastKey = "";
    const flush = async (): Promise<void> => {
      if (!counts.length) return;
      await window.api.cursorSprite.frames(jobId, batch.slice(0, counts.length * bytes), counts);
      batch = new Uint8Array(perBatch * bytes);
      counts = [];
    };
    for (let i = 0; i < frames; i++) {
      signal?.throwIfAborted();
      const t = i / fps;
      const ox = positions[i * 2];
      const oy = positions[i * 2 + 1];
      const f = fxAt(fx, t);
      const s = cursorAt(track, t);
      const unit = cursorScale(data, f) * 1.1;
      const rips = !f.hidden && f.clicks ? ripplesAt(data, t, fx) : [];
      // The magnifier's ring sits on the sprite's center, where the export puts the circle.
      const ring = !f.hidden && !!f.magnifier;
      const key = `${f.hidden ? "-" : s.index}|${+!!f.halo}|${+ring}|${s.alpha.toFixed(3)}|${(s.x - ox).toFixed(2)}|${(s.y - oy).toFixed(2)}|${rips.map((r) => `${r.x - ox},${r.y - oy},${r.progress.toFixed(3)}`).join(";")}`;
      if (key === lastKey && counts.length) {
        counts[counts.length - 1]++;
        continue;
      }
      lastKey = key;
      ctx.clearRect(0, 0, size, size);
      if (ring) drawMagnifierRing(ctx, size / 2, size / 2, radius, pixel);
      drawRipples(ctx, rips, -ox, -oy, unit);
      drawPointer(ctx, s, s.x - ox, s.y - oy, unit, f, images);
      batch.set(ctx.getImageData(0, 0, size, size).data, counts.length * bytes);
      counts.push(1);
      if (counts.length === perBatch) {
        await flush();
        set({
          jobs: {
            ...useApp.getState().jobs,
            [jobId]: { id: jobId, label: `Desenhando cursor: ${name}`, ratio: i / frames },
          },
        });
      }
    }
    await flush();
    signal?.throwIfAborted();
    return await window.api.cursorSprite.end(jobId);
  } catch (err) {
    await window.api.cursorSprite.cancel(jobId);
    throw err;
  } finally {
    endJob(jobId);
  }
}
