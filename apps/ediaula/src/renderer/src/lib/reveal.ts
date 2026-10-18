import { timelineWords } from "@shared/cleanup";
import {
  type RevealState,
  revealAt,
  revealDone,
  revealEnd,
  revealHash,
  revealKey,
  revealKind,
  revealTimes,
  revealWords,
} from "@shared/reveal";
import { newId } from "@shared/timeline";
import type { Clip, Project, RevealSprite } from "@shared/types";
import { useApp } from "@/state/app";
import { renderAnnotation } from "./annotations";
import { loadProjectTranscripts } from "./transcripts";

/**
 * Annotations that come in (shared/reveal.ts) in the renderer: the pictures of their states for
 * the preview, and for the export a transparent video of the whole clip, drawn with the same
 * function, frame by frame, and encoded by the main process the way the pointer sprite is
 * (cursor:begin with the picture's height), cached by a hash of what it shows.
 */

/** Unique frames sent to the main process per call. */
const BATCH = 24;

/** Clips whose annotation comes in. */
export const revealing = (c: Clip): boolean =>
  !!c.annotation?.reveal && revealKind(c.annotation) === c.annotation.reveal;

/** When each word of the clip's annotation comes in, from the words said while it shows. */
export async function clipRevealTimes(project: Project, clip: Clip): Promise<number[]> {
  const a = clip.annotation;
  if (a?.reveal !== "words") return [];
  const transcripts = await loadProjectTranscripts(project);
  const spoken = transcripts.size
    ? timelineWords(project, transcripts).filter((w) => !w.silent)
    : [];
  return revealTimes(a, clip, spoken);
}

const pictures = new Map<string, Promise<string>>();

/** The picture of a state of the clip's annotation, as an object URL (cached by its look). */
export function revealPicture(project: Project, clip: Clip, state: RevealState): Promise<string> {
  const a = clip.annotation;
  if (!a) return Promise.resolve("");
  const key = `${JSON.stringify(a)}|${project.settings.width}x${project.settings.height}|${revealKey(state)}`;
  let url = pictures.get(key);
  if (!url) {
    url = renderAnnotation(a, project.settings.height, project.settings.width, state).then((r) =>
      URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: "image/png" })),
    );
    pictures.set(key, url);
    // A long session does not keep every state ever drawn.
    if (pictures.size > 600) {
      const first = pictures.keys().next().value;
      if (first !== undefined) {
        void pictures.get(first)?.then((u) => URL.revokeObjectURL(u));
        pictures.delete(first);
      }
    }
  }
  return url;
}

/** The state shown at timeline second `t` of the clip, null when it is all there. */
export function revealStateAt(clip: Clip, times: readonly number[], t: number): RevealState | null {
  const a = clip.annotation;
  if (!a) return null;
  const s = revealAt(a, times, clip.duration, t - clip.start);
  return revealDone(s, revealWords(a).length) ? null : s;
}

/** Decodes a PNG into its RGBA pixels at the size of the canvas given. */
async function pixels(
  bytes: Uint8Array,
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }));
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * Before exporting: the transparent video of every annotation that comes in, by clip id, made
 * once and kept in the cache next to its picture.
 */
export async function ensureRevealSprites(
  project: Project,
  signal?: AbortSignal,
): Promise<Record<string, RevealSprite>> {
  const out: Record<string, RevealSprite> = {};
  const fps = project.settings.fps;
  for (const clip of project.clips) {
    signal?.throwIfAborted();
    const a = clip.annotation;
    const asset = project.assets.find((x) => x.id === clip.assetId);
    if (!a || !asset || asset.missing || !revealing(clip)) continue;
    const times = await clipRevealTimes(project, clip);
    const w = Math.max(2, Math.round(asset.width / 2) * 2);
    const h = Math.max(2, Math.round(asset.height / 2) * 2);
    // Only the frames while it comes in: then the export shows the sharp picture.
    const until = revealEnd(a, times, clip.duration);
    const length = Math.min(clip.duration, until + 2 / fps);
    const id = `rv_${revealHash(JSON.stringify({ a, times, fps, d: length, w, h }))}`;
    let sprite = await window.api.cursorSprite.cached(asset.path, id);
    if (!sprite)
      sprite = await renderSprite(project, clip, times, length, asset.path, id, w, h, signal);
    out[clip.id] = { sprite, fps, width: asset.width, height: asset.height, until };
  }
  return out;
}

async function renderSprite(
  project: Project,
  clip: Clip,
  times: number[],
  length: number,
  path: string,
  id: string,
  w: number,
  h: number,
  signal?: AbortSignal,
): Promise<string> {
  const a = clip.annotation;
  if (!a) throw new Error("Missing annotation");
  const { startJob, endJob } = useApp.getState();
  const fps = project.settings.fps;
  const jobId = newId("job");
  startJob(jobId, "Desenhando a anotação animada");
  try {
    await window.api.cursorSprite.begin(jobId, path, id, w, fps, h);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas indisponível");
    const frames = Math.max(1, Math.round(length * fps));
    const size = w * h * 4;
    let batch = new Uint8Array(BATCH * size);
    let counts: number[] = [];
    let last = "";
    const flush = async (): Promise<void> => {
      if (!counts.length) return;
      await window.api.cursorSprite.frames(jobId, batch.slice(0, counts.length * size), counts);
      batch = new Uint8Array(BATCH * size);
      counts = [];
    };
    for (let i = 0; i < frames; i++) {
      signal?.throwIfAborted();
      const state = revealAt(a, times, clip.duration, i / fps) ?? {};
      const key = revealKey(state);
      if (key === last && counts.length) {
        counts[counts.length - 1]++;
        continue;
      }
      last = key;
      const r = await renderAnnotation(a, project.settings.height, project.settings.width, state);
      batch.set(await pixels(r.bytes, ctx, w, h), counts.length * size);
      counts.push(1);
      if (counts.length === BATCH) await flush();
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
