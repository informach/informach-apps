import {
  buildTrack,
  cursorAt,
  cursorFxId,
  cursorScale,
  ripplesAt,
  spritePositions,
  spriteSize,
} from "@shared/cursor";
import { newId } from "@shared/timeline";
import type { CursorSprite, Project } from "@shared/types";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { drawPointer, drawRipples } from "./cursorDraw";

/** Unique sprite frames sent to the main process per call. */
const BATCH = 48;

/**
 * Before exporting: the pointer of every screen recording in use, drawn frame by frame with the
 * same code as the preview into a small transparent video (cached), plus where it goes on
 * each frame. The export moves that sprite over the recording.
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
    if (fx.hidden) continue;
    const data = await loadCursorData(asset.cursor);
    const fps = asset.fps || 30;
    const track = buildTrack(data, fx, asset.duration);
    const size = spriteSize(data, fx);
    const positions = spritePositions(track, fps, asset.duration, size);
    const id = `${cursorFxId(fx)}_${size}_${fps}`;
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
        signal,
      );
    out[asset.id] = { sprite, size, fps, positions: Array.from(positions) };
  }
  return out;
}

async function renderSprite(
  path: string,
  name: string,
  id: string,
  data: Awaited<ReturnType<typeof loadCursorData>>,
  fx: ReturnType<typeof cursorFxOf>,
  track: ReturnType<typeof buildTrack>,
  positions: Int32Array,
  size: number,
  fps: number,
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
    const unit = cursorScale(data, fx) * 1.1;
    const frames = positions.length / 2;
    const bytes = size * size * 4;
    let batch = new Uint8Array(BATCH * bytes);
    let counts: number[] = [];
    let lastKey = "";
    const flush = async (): Promise<void> => {
      if (!counts.length) return;
      await window.api.cursorSprite.frames(jobId, batch.slice(0, counts.length * bytes), counts);
      batch = new Uint8Array(BATCH * bytes);
      counts = [];
    };
    for (let i = 0; i < frames; i++) {
      signal?.throwIfAborted();
      const t = i / fps;
      const ox = positions[i * 2];
      const oy = positions[i * 2 + 1];
      const s = cursorAt(track, t);
      const rips = fx.clicks ? ripplesAt(data, t, fx) : [];
      const key = `${s.shape}|${s.alpha.toFixed(3)}|${(s.x - ox).toFixed(2)}|${(s.y - oy).toFixed(2)}|${rips.map((r) => `${r.x - ox},${r.y - oy},${r.progress.toFixed(3)}`).join(";")}`;
      if (key === lastKey && counts.length) {
        counts[counts.length - 1]++;
        continue;
      }
      lastKey = key;
      ctx.clearRect(0, 0, size, size);
      drawRipples(ctx, rips, -ox, -oy, unit);
      drawPointer(ctx, s, s.x - ox, s.y - oy, unit, fx);
      batch.set(ctx.getImageData(0, 0, size, size).data, counts.length * bytes);
      counts.push(1);
      if (counts.length === BATCH) {
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
