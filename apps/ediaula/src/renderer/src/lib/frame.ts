import {
  buildAss,
  buildCues,
  captionWords,
  cueLayout,
  DEFAULT_CAPTION_STYLE,
} from "@shared/captions";
import { buildTrack, cursorAt } from "@shared/cursor";
import {
  type FrameFacts,
  type FrameRegion,
  frameFacts,
  frameGeometry,
  MAX_IMAGE_SIDE,
  screenClipAt,
} from "@shared/frameGrab";
import { newId, sourceAt } from "@shared/timeline";
import type { ExportSpec, Project, ToolImage } from "@shared/types";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { drawCursorScene } from "./cursorDraw";
import { loadCursorImages } from "./cursorImages";
import { ensureCursorSprites } from "./cursorRender";
import { timelineKeys } from "./keysOnScreen";
import { loadProjectTranscripts } from "./transcripts";

/**
 * get_frame in the editor: a frame of the lesson as a picture for the AI, with the facts of what
 * is on it (shared/frameGrab.ts). Without composing, the screen recording's frame is read from
 * its file and the recorded pointer is drawn over it with the preview's own drawing; composed,
 * the main process renders the frame through the export plan (export:frame).
 */

/** A picture larger than this is sent as JPEG instead of PNG. */
const PNG_LIMIT = 1_500_000;

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** A canvas as the picture to send: PNG, or JPEG when the PNG would be large. */
async function encode(canvas: OffscreenCanvas): Promise<ToolImage> {
  const png = new Uint8Array(
    await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer(),
  );
  if (png.length <= PNG_LIMIT) return { mime: "image/png", data: base64(png) };
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  return { mime: "image/jpeg", data: base64(new Uint8Array(await jpeg.arrayBuffer())) };
}

async function canvasOf(png: Uint8Array<ArrayBuffer>): Promise<OffscreenCanvas> {
  const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui desenhar o quadro.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export interface FrameRequest {
  time: number;
  region?: FrameRegion;
  maxWidth?: number;
  composited?: boolean;
}

export interface FrameAnswer {
  facts: FrameFacts;
  image: ToolImage;
  /** What the picture is, in words for the model. */
  note: string;
  size: { width: number; height: number };
}

/** The frame of the screen recording at `time`, with the recorded pointer drawn. */
async function screenFrame(
  p: Project,
  req: FrameRequest,
  signal?: AbortSignal,
): Promise<FrameAnswer> {
  const clip = screenClipAt(p, req.time);
  const asset = clip && p.assets.find((a) => a.id === clip.assetId);
  if (!clip || !asset)
    throw new Error(
      "Não há gravação de tela nem vídeo nesse momento da aula. Use composited: true para ver o quadro da aula inteira.",
    );
  if (asset.missing)
    throw new Error(`O arquivo de ${asset.name} não foi encontrado: reconecte a mídia.`);
  const geometry = frameGeometry(
    { width: asset.width, height: asset.height },
    req.region,
    req.maxWidth,
  );
  const seconds = sourceAt(clip, req.time);
  const png = await window.api.frameImage(newId("job"), asset.path, seconds, geometry);
  signal?.throwIfAborted();
  const canvas = await canvasOf(png);
  let pointer = "";
  const fx = cursorFxOf(asset);
  if (asset.cursor && !asset.cursorMissing && !fx.hidden) {
    const data = await loadCursorData(asset.cursor);
    const track = buildTrack(data, fx, asset.duration);
    const state = cursorAt(track, seconds);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Picture pixels per recording pixel, and where the picture starts in the recording.
      const k = (asset.width / data.width) * geometry.scale;
      const images = await loadCursorImages(asset.cursor, data).catch(() => undefined);
      drawCursorScene(ctx, {
        data,
        track,
        fx,
        t: seconds,
        k,
        images,
        offset: { x: geometry.crop.x * geometry.scale, y: geometry.crop.y * geometry.scale },
      });
      pointer = ` O ponteiro está em x=${(state.x / data.width).toFixed(3)}, y=${(state.y / data.height).toFixed(3)} da gravação${state.alpha <= 0.01 ? " (escondido nesse momento)" : ""}.`;
    }
  }
  return {
    facts: frameFacts(p, req.time),
    image: await encode(canvas),
    note: `Quadro da gravação "${asset.name}" no segundo ${seconds.toFixed(2)} dela (sem anotações, zoom nem apresentador; as caixas do JSON dizem onde ficam), ${geometry.width}x${geometry.height} px${req.region ? ", recorte da região pedida" : ""}.${pointer}`,
    size: { width: geometry.width, height: geometry.height },
  };
}

/** The burned captions and on-screen keys of the lesson, as the export draws them. */
async function burned(p: Project, spec: ExportSpec): Promise<string | undefined> {
  const keys = await timelineKeys(p);
  if (p.captions?.burn) {
    const transcripts = await loadProjectTranscripts(p);
    if (transcripts.size)
      return buildAss(
        buildCues(captionWords(p, transcripts), 42, 2, cueLayout(p)),
        { ...DEFAULT_CAPTION_STYLE, ...p.captions },
        spec.width,
        spec.height,
        keys,
      );
  }
  return keys.length
    ? buildAss([], DEFAULT_CAPTION_STYLE, spec.width, spec.height, keys)
    : undefined;
}

/** The lesson at `time` exactly as the export composes it. */
async function composedFrame(
  p: Project,
  req: FrameRequest,
  signal?: AbortSignal,
): Promise<FrameAnswer> {
  const used = new Set(p.clips.map((c) => c.assetId));
  const missing = p.assets.filter((a) => used.has(a.id) && a.missing);
  if (missing.length)
    throw new Error(`Mídias ausentes: ${missing.map((a) => a.name).join(", ")}. Reconecte antes.`);
  const { width, height, fps } = p.settings;
  const spec: ExportSpec = {
    outPath: "quadro.png",
    width,
    height,
    fps,
    videoBitrate: 1000,
    normalizeLoudness: false,
    encoder: "x264",
  };
  const ass = await burned(p, spec);
  if (ass) spec.burnAss = ass;
  // The pointer of the recordings on screen at that moment only (drawn once, then cached).
  const screen = new Set(
    p.clips
      .filter((c) => c.start <= req.time && c.start + c.duration > req.time)
      .map((c) => c.assetId),
  );
  const sprites = await ensureCursorSprites(
    { ...p, clips: p.clips.filter((c) => screen.has(c.assetId)) },
    signal,
  );
  if (Object.keys(sprites).length) spec.cursors = sprites;
  const geometry = frameGeometry({ width, height }, req.region, req.maxWidth);
  const jobId = newId("job");
  const { startJob, endJob } = useApp.getState();
  const stop = (): void => {
    void window.api.cancelJob(jobId);
  };
  signal?.addEventListener("abort", stop, { once: true });
  startJob(jobId, "Montando o quadro para a IA");
  let png: Uint8Array<ArrayBuffer>;
  try {
    png = await window.api.composeFrame(jobId, JSON.stringify(p), spec, req.time, geometry);
  } finally {
    signal?.removeEventListener("abort", stop);
    endJob(jobId);
  }
  const keyed = p.assets.filter((a) => used.has(a.id) && a.key && a.keyStatus !== "ready");
  return {
    facts: frameFacts(p, req.time),
    image: await encode(await canvasOf(png)),
    note: `Quadro da aula composto como na exportação, ${geometry.width}x${geometry.height} px${req.region ? ", recorte da região pedida" : ""}.${keyed.length ? ` O fundo de ${keyed.map((a) => a.name).join(", ")} ainda está sendo removido: aparece como foi gravado.` : ""}`,
    size: { width: geometry.width, height: geometry.height },
  };
}

export function frameForAi(
  p: Project,
  req: FrameRequest,
  signal?: AbortSignal,
): Promise<FrameAnswer> {
  const capped = { ...req, maxWidth: Math.min(MAX_IMAGE_SIDE, req.maxWidth ?? MAX_IMAGE_SIDE) };
  return capped.composited ? composedFrame(p, capped, signal) : screenFrame(p, capped, signal);
}
