import {
  buildTrack,
  type CursorFx,
  type CursorTrack,
  cursorAt,
  cursorScale,
  fxAt,
} from "@shared/cursor";
import type { CursorData } from "@shared/cursorData";
import {
  boardAt,
  type Drawing,
  drawingAt,
  drawingFrameKey,
  drawingPartClips,
  drawingParts,
  drawingSpan,
  drawingVideoSize,
  shiftDrawing,
} from "@shared/drawing";
import type { RecordingResult } from "@shared/recording";
import type { RecordingLayout } from "@shared/recordingImport";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { type Commit, personCommit, useProject } from "@/state/project";
import { overlayTrack } from "./annotations";
import { drawPointer } from "./cursorDraw";
import { type CursorImages, loadCursorImages } from "./cursorImages";
import { paintBoard, paintStrokes } from "./drawingPaint";

/** Bytes of frames sent to the main process per call. */
const BATCH_BYTES = 32 * 1024 * 1024;

/** A short id for a drawing and its video size: the same drawing is not drawn twice. */
function drawingId(d: Drawing, width: number, height: number, fps: number): string {
  let hash = 2166136261;
  for (const char of JSON.stringify([d, width, height, fps]))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${(hash >>> 0).toString(16)}-${width}x${height}`;
}

/** The pointer of the screen recording a drawing was made over, to draw it over its boards. */
interface PointerSource {
  data: CursorData;
  track: CursorTrack;
  fx: CursorFx;
  images?: CursorImages;
  /** The recording's second at the drawing's second 0. */
  offset: number;
}

async function pointerOf(d: Drawing): Promise<PointerSource | undefined> {
  if (!d.pointer || !d.boards?.length) return undefined;
  const asset = useProject.getState().project?.assets.find((a) => a.id === d.pointer?.assetId);
  if (!asset?.cursor || asset.cursorMissing) return undefined;
  const fx = cursorFxOf(asset);
  if (fx.hidden) return undefined;
  const data = await loadCursorData(asset.cursor);
  return {
    data,
    track: buildTrack(data, fx, asset.duration),
    fx,
    images: await loadCursorImages(asset.cursor, data).catch(() => undefined),
    offset: d.pointer.offset,
  };
}

/**
 * The drawing as a transparent video of `duration` seconds (its own seconds), each frame painted
 * with the recorder window's own code: the board while one is up, the strokes as they were made
 * and, over a board, the recording's pointer as the tip of the pen. Frames equal to the one
 * before are sent once with a count.
 */
export async function renderDrawingVideo(
  d: Drawing,
  size: { width: number; height: number },
  fps: number,
  duration: number,
  label = "Desenhando o desenho da gravação",
): Promise<{ path: string; size: number }> {
  const id = drawingId(d, size.width, size.height, fps);
  const cached = await window.api.drawingVideo.cached(id);
  if (cached) return cached;
  const pointer = await pointerOf(d);
  const { startJob, endJob } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, label);
  try {
    await window.api.drawingVideo.begin(jobId, id, size.width, size.height, fps);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Não consegui desenhar o desenho da gravação.");
    const bytes = size.width * size.height * 4;
    const perBatch = Math.max(1, Math.min(256, Math.floor(BATCH_BYTES / bytes)));
    let batch = new Uint8Array(perBatch * bytes);
    let counts: number[] = [];
    const flush = async (): Promise<void> => {
      if (!counts.length) return;
      await window.api.drawingVideo.frames(jobId, batch.slice(0, counts.length * bytes), counts);
      batch = new Uint8Array(perBatch * bytes);
      counts = [];
    };
    const frames = Math.max(1, Math.ceil(duration * fps));
    let last: string | null = null;
    let frame = new Uint8ClampedArray(0);
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      const board = boardAt(d, t);
      const tip = board && pointer ? pointerAt(pointer, t) : null;
      const key = `${drawingFrameKey(d, t)}@${tip ? `${tip.state.x.toFixed(1)},${tip.state.y.toFixed(1)},${tip.state.index},${tip.state.alpha.toFixed(2)}` : ""}`;
      if (key === last && counts.length) {
        counts[counts.length - 1]++;
        continue;
      }
      if (key !== last) {
        last = key;
        ctx.clearRect(0, 0, size.width, size.height);
        if (board) paintBoard(ctx, board.color, size.width, size.height);
        paintStrokes(ctx, drawingAt(d, t), size.width, size.height);
        if (tip && pointer) {
          const k = size.width / pointer.data.width;
          drawPointer(
            ctx,
            tip.state,
            tip.state.x * k,
            tip.state.y * k,
            cursorScale(pointer.data, tip.fx) * 1.1 * k,
            tip.fx,
            pointer.images,
          );
        }
        frame = ctx.getImageData(0, 0, size.width, size.height).data;
      }
      // A new picture, or the same one going on after the batch it was in went out.
      batch.set(frame, counts.length * bytes);
      counts.push(1);
      if (counts.length === perBatch) await flush();
    }
    await flush();
    return await window.api.drawingVideo.end(jobId);
  } catch (error) {
    await window.api.drawingVideo.cancel(jobId);
    throw error;
  } finally {
    endJob(jobId);
  }
}

/** The recording's pointer at the drawing's second `t`, with the effects of that moment. */
function pointerAt(p: PointerSource, t: number) {
  const source = t + p.offset;
  return { state: cursorAt(p.track, source), fx: fxAt(p.fx, source) };
}

/**
 * The strokes drawn on the screen during a take as annotation clips over the screen they were
 * drawn on: "desenho" where they are over the screen and "quadro" where a board was up (cut at
 * each new page), one per kept stretch of the take, on a free track above the lesson, laid like
 * the screen. They all show the same video. One undo step of its own, after the take's.
 */
export async function placeTakeDrawing(r: RecordingResult, layout: RecordingLayout): Promise<void> {
  const drawing = r.drawing;
  if (!drawing) return;
  const span = drawingSpan(drawing, r.duration);
  if (!span) return;
  const project = useProject.getState().project;
  const screenId = layout.roles.find((x) => x.role === "screen")?.assetId;
  const screen = project?.assets.find((a) => a.id === screenId);
  if (!project || !screen) return;
  // The pointer goes over the boards when the screen is one file on the take's clock.
  const own = shiftDrawing(
    {
      ...drawing,
      ...(r.screen && screen.cursor ? { pointer: { assetId: screen.id, offset: 0 } } : {}),
    },
    -span[0],
  );
  const size = drawingVideoSize(screen.width, screen.height);
  const fps = screen.fps > 0 ? screen.fps : project.settings.fps;
  const duration = span[1] - span[0];
  const video = await renderDrawingVideo(own, size, fps, duration);
  const asset: Asset = {
    id: newId("a"),
    name: own.boards?.length ? "Desenho e quadro" : "Desenho",
    path: video.path,
    kind: "video",
    duration,
    width: size.width,
    height: size.height,
    fps,
    hasVideo: true,
    hasAudio: false,
    size: video.size,
    proxyStatus: "none",
    generated: "annotation",
    alpha: true,
  };
  const parts = drawingParts(own, [0, duration]);
  useProject.getState().commit((p) => {
    const start = layout.at;
    const { tracks, track } = overlayTrack(p, start, start + layout.duration);
    const clips = drawingPartClips(layout.pieces, span, parts, asset.id, track.id, () =>
      newId("c"),
    ).map(({ clip, kind }) => ({
      ...clip,
      annotation: {
        kind,
        color:
          kind === "board"
            ? (boardAt(own, clip.in + 1e-3)?.color ?? "#FFFFFF")
            : (own.strokes[0]?.color ?? "#FFFFFF"),
        drawing: own,
      },
    }));
    if (!clips.length) return p;
    return { ...p, tracks, assets: [...p.assets, asset], clips: [...p.clips, ...clips] };
  });
}

/**
 * A drawing changed in the editor (a board's color, a stroke taken out): its video is drawn
 * again and every clip of it shows the new one, in one undo step.
 */
export async function changeDrawing(
  assetId: string,
  change: (d: Drawing) => Drawing,
  commit: Commit = personCommit,
): Promise<void> {
  const p = useProject.getState().project;
  const asset = p?.assets.find((a) => a.id === assetId);
  const before = p?.clips.find((c) => c.assetId === assetId && c.annotation?.drawing)?.annotation
    ?.drawing;
  if (!asset || !before) return;
  const after = change(before);
  const video = await renderDrawingVideo(
    after,
    { width: asset.width, height: asset.height },
    asset.fps > 0 ? asset.fps : 30,
    asset.duration,
    "Desenhando de novo o desenho da gravação",
  );
  commit((q) => ({
    ...q,
    assets: q.assets.map((a) =>
      a.id === assetId ? { ...a, path: video.path, size: video.size, thumb: undefined } : a,
    ),
    clips: q.clips.map((c) =>
      c.assetId === assetId && c.annotation
        ? {
            ...c,
            annotation: {
              ...c.annotation,
              drawing: after,
              ...(c.annotation.kind === "board"
                ? { color: boardAt(after, c.in + 1e-3)?.color ?? c.annotation.color }
                : {}),
            },
          }
        : c,
    ),
  }));
}

/** The video of a drawing clip made again (its file is gone), at the size it had. */
export async function redrawDrawing(
  asset: Pick<Asset, "width" | "height" | "fps" | "duration">,
  d: Drawing,
): Promise<{ path: string; size: number }> {
  return renderDrawingVideo(
    d,
    { width: asset.width, height: asset.height },
    asset.fps > 0 ? asset.fps : 30,
    asset.duration,
  );
}
