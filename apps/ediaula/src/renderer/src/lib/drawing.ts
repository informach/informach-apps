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
  drawingChangeFrames,
  drawingFrameKey,
  drawingPartClips,
  drawingParts,
  drawingSpan,
  drawingVideoSize,
  groupWithScreens,
  shiftDrawing,
} from "@shared/drawing";
import type { RecordingResult } from "@shared/recording";
import type { RecordingLayout } from "@shared/recordingImport";
import { newId } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { type Commit, personCommit, useProject } from "@/state/project";
import { overlayTrack } from "./annotations";
import { drawPointer } from "./cursorDraw";
import { type CursorImages, loadCursorImages } from "./cursorImages";
import { paintBoard, paintStrokes } from "./drawingPaint";

/** Bump when the painting changes, so videos drawn before are drawn again. */
const DRAWING_VERSION = 2;
/** Most picture names asked about in one call. */
const ASK_BATCH = 20_000;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The pointer of the screen recording a drawing was made over, to draw it over its boards. */
interface PointerSource {
  data: CursorData;
  track: CursorTrack;
  fx: CursorFx;
  images?: CursorImages;
  /** The recording's second at the drawing's second 0. */
  offset: number;
  /** Everything about the pointer that shows in the pictures (file, effects, its own images). */
  look: string;
}

async function pointerOf(d: Drawing): Promise<PointerSource | undefined> {
  if (!d.pointer || !d.boards?.length) return undefined;
  const asset = useProject.getState().project?.assets.find((a) => a.id === d.pointer?.assetId);
  if (!asset?.cursor || asset.cursorMissing) return undefined;
  const fx = cursorFxOf(asset);
  if (fx.hidden && !fx.ranges?.some((r) => r.fx.hidden === false)) return undefined;
  const data = await loadCursorData(asset.cursor);
  // The recorded pointer images are optional: without them the standard shapes are drawn, and
  // the pictures say which one they are.
  const images = await loadCursorImages(asset.cursor, data).catch(() => undefined);
  return {
    data,
    track: buildTrack(data, fx, asset.duration),
    fx,
    ...(images ? { images } : {}),
    offset: d.pointer.offset,
    look: JSON.stringify([asset.cursor, fx, !!images]),
  };
}

/** The recording's pointer at the drawing's second `t`, with the effects of that moment. */
function pointerAt(p: PointerSource, t: number) {
  const source = t + p.offset;
  return { state: cursorAt(p.track, source), fx: fxAt(p.fx, source) };
}

/** What of the pointer shows in the picture at `t` (nothing when it is hidden then). */
function tipKey(p: PointerSource | undefined, d: Drawing, t: number): string {
  if (!p || !boardAt(d, t)) return "";
  const { state, fx } = pointerAt(p, t);
  if (fx.hidden) return "";
  const { ranges: _ranges, path: _path, pathEdits: _edits, ...look } = fx;
  return `${state.x.toFixed(1)},${state.y.toFixed(1)},${state.index},${state.alpha.toFixed(2)},${JSON.stringify(look)}`;
}

/**
 * The drawing as a transparent video of `duration` seconds (its own seconds), each picture
 * painted with the recorder window's own code: the board while one is up, the strokes as they
 * were made and, over a board, the recording's pointer as the tip of the pen. Only the frames
 * where the picture changes are looked at, each different picture is painted once (and only if
 * no earlier video made it already), and the video holds each one until the next. Waits for a
 * slot of the background work, with its progress in the jobs list.
 */
export async function renderDrawingVideo(
  d: Drawing,
  size: { width: number; height: number },
  fps: number,
  duration: number,
  label = "Desenhando o desenho da gravação",
): Promise<{ path: string; size: number }> {
  const rate = Math.max(1, Math.min(240, Math.round(fps)));
  const total = Math.max(1, Math.ceil(duration * rate - 1e-6));
  const pointer = await pointerOf(d);
  const id = (
    await sha256(
      JSON.stringify([DRAWING_VERSION, d, size.width, size.height, rate, total, pointer?.look]),
    )
  ).slice(0, 40);
  const cached = await window.api.drawingVideo.cached(id);
  if (cached) return cached;
  const { startJob, endJob } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, label);
  const progress = (ratio: number): void => {
    const job = useApp.getState().jobs[jobId];
    if (job) useApp.setState({ jobs: { ...useApp.getState().jobs, [jobId]: { ...job, ratio } } });
  };
  try {
    await window.api.drawingVideo.begin(jobId, id, size.width, size.height, rate);
    // The pictures, in order: each with the first frame it shows.
    const live: [number, number][] = pointer
      ? (d.boards ?? []).map((b): [number, number] => [b.start, b.end])
      : [];
    const scene = `${DRAWING_VERSION}|${size.width}x${size.height}|${pointer?.look ?? ""}`;
    const entries: { at: number; key: string; hash: string }[] = [];
    let last = "";
    for (const i of drawingChangeFrames(d, rate, total, live)) {
      const t = i / rate;
      const key = `${drawingFrameKey(d, t)}@${tipKey(pointer, d, t)}`;
      if (key === last) continue;
      last = key;
      entries.push({ at: i, key, hash: await sha256(`${scene}|${key}`) });
    }
    const unique = [...new Set(entries.map((e) => e.hash))];
    const missing = new Set<string>();
    for (let k = 0; k < unique.length; k += ASK_BATCH)
      for (const h of await window.api.drawingVideo.missing(jobId, unique.slice(k, k + ASK_BATCH)))
        missing.add(h);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não consegui desenhar o desenho da gravação.");
    let painted = 0;
    const toPaint = missing.size;
    for (const e of entries) {
      if (!missing.has(e.hash)) continue;
      missing.delete(e.hash);
      const t = e.at / rate;
      ctx.clearRect(0, 0, size.width, size.height);
      const board = boardAt(d, t);
      if (board) paintBoard(ctx, board.color, size.width, size.height);
      paintStrokes(ctx, drawingAt(d, t), size.width, size.height);
      const tip = pointer && board ? pointerAt(pointer, t) : null;
      if (tip && pointer && !tip.fx.hidden) {
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
      const png = new Uint8Array(
        await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer(),
      );
      await window.api.drawingVideo.frame(jobId, e.hash, png);
      painted++;
      if (painted % 10 === 0) progress((0.95 * painted) / toPaint);
    }
    progress(0.95);
    return await window.api.drawingVideo.end(
      jobId,
      entries.map((e): [string, number] => [e.hash, e.at]),
      total,
    );
  } catch (error) {
    await window.api.drawingVideo.cancel(jobId);
    throw error;
  } finally {
    endJob(jobId);
  }
}

/**
 * The strokes drawn on the screen during a take as annotation clips over the screen they were
 * drawn on: "desenho" where they are over the screen and "quadro" where a board was up (cut at
 * each new page), one per kept stretch of the take, on a free track above the lesson, laid like
 * the screen and grouped with the screen clip each one lies over. They all show the same video,
 * whose media keeps the drawing once (Asset.drawing). The video is drawn in the background (the
 * import does not wait for it) and the clips come in their own undo step when it is ready, where
 * the take still is: an import undone meanwhile gets nothing.
 */
export async function placeTakeDrawing(
  r: RecordingResult,
  layout: RecordingLayout,
  take: string,
): Promise<void> {
  const drawing = r.drawing;
  if (!drawing) return;
  const span = drawingSpan(drawing, r.duration);
  if (!span) return;
  const before = useProject.getState().project;
  const screenId = layout.roles.find((x) => x.role === "screen")?.assetId;
  const screen = before?.assets.find((a) => a.id === screenId);
  if (!before || !screen) return;
  // The pointer goes over the boards when the screen is one file on the take's clock.
  const own = shiftDrawing(
    {
      ...drawing,
      ...(r.screen && screen.cursor ? { pointer: { assetId: screen.id, offset: 0 } } : {}),
    },
    -span[0],
  );
  const size = drawingVideoSize(screen.width, screen.height);
  const fps = Math.max(1, Math.round(screen.fps > 0 ? screen.fps : before.settings.fps));
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
    recording: { id: take, role: "drawing" },
    drawing: own,
  };
  const parts = drawingParts(own, [0, duration]);
  const laid = new Map(layout.pieces.flatMap((piece) => piece.screen.map((c) => [c.id, c])));
  useProject.getState().commit((p) => {
    // Another lesson open now, or the take undone: the drawing has nowhere to go.
    if (p.id !== before.id || !p.assets.some((a) => a.id === screen.id)) return p;
    const now = new Map(p.clips.map((c) => [c.id, c]));
    const placed = drawingPartClips(layout.pieces, span, parts, asset.id, "", () =>
      newId("c"),
    ).flatMap(({ clip, kind, screen: under }) => {
      // Each clip follows the screen clip it was laid over, wherever that one is now.
      const was = under ? laid.get(under) : undefined;
      const is = under ? now.get(under) : undefined;
      if (!was || !is) return [];
      const annotation = {
        kind,
        color:
          kind === "board"
            ? (boardAt(own, clip.in + 1e-3)?.color ?? "#FFFFFF")
            : (own.strokes[0]?.color ?? "#FFFFFF"),
      };
      return [
        { clip: { ...clip, start: clip.start + is.start - was.start, annotation }, screen: under },
      ];
    });
    if (!placed.length) return p;
    const from = Math.min(...placed.map(({ clip }) => clip.start));
    const to = Math.max(...placed.map(({ clip }) => clip.start + clip.duration));
    const { tracks, track } = overlayTrack(p, from, to);
    const grouped = groupWithScreens(
      p.clips,
      placed.map(({ clip, screen: under }) => ({
        clip: { ...clip, trackId: track.id },
        screen: under,
      })),
      () => newId("g"),
    );
    const clips: Clip[] = [...grouped.clips, ...grouped.placed];
    return { ...p, tracks, assets: [...p.assets, asset], clips };
  });
}

/**
 * A drawing changed in the editor (a board's color, a stroke taken out): its video is drawn
 * again (only the pictures that changed are painted) and every clip of it shows the new one, in
 * one undo step.
 */
export async function changeDrawing(
  assetId: string,
  change: (d: Drawing) => Drawing,
  commit: Commit = personCommit,
): Promise<void> {
  const asset = useProject.getState().project?.assets.find((a) => a.id === assetId);
  const before = asset?.drawing;
  if (!asset || !before) return;
  const after = change(before);
  const video = await renderDrawingVideo(
    after,
    { width: asset.width, height: asset.height },
    asset.fps > 0 ? asset.fps : 30,
    asset.duration,
    "Desenhando de novo o desenho da gravação",
  );
  commit((q) => {
    if (!q.assets.some((a) => a.id === assetId)) return q;
    return {
      ...q,
      assets: q.assets.map((a) =>
        a.id === assetId
          ? { ...a, drawing: after, path: video.path, size: video.size, thumb: undefined }
          : a,
      ),
      clips: q.clips.map((c) =>
        c.assetId === assetId && c.annotation?.kind === "board"
          ? {
              ...c,
              annotation: {
                ...c.annotation,
                color: boardAt(after, c.in + 1e-3)?.color ?? c.annotation.color,
              },
            }
          : c,
      ),
    };
  });
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
