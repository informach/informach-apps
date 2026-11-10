import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { LessonClip } from "../../../shared/lessonClips";
import { DELIVERY_LIMITS } from "../../../shared/lessonDelivery";
import type { Project } from "../../../shared/project";
import { timelineProject } from "../../../shared/raster/profile";
import { createRasterFrameSource } from "../raster/frameSource";

/**
 * Arquivo › Enviar animações para a aula: each animation a pipeline made of a lesson stretch
 * (lessonClips.ts) drawn frame by frame and handed to the main process, which encodes it into
 * EdiAula's folder for that lesson (src/main/lessonDelivery.ts). The full-screen scene goes
 * opaque (on black), the demonstration transparent, both at the artboard's size and the
 * animation's rate, as long as the animation. The manifest goes last, with every video in it.
 */

export interface LessonSendBridge {
  lessonSendStart(spec: {
    lessonId: string;
    clipId: string;
    kind: LessonClip["kind"];
    width: number;
    height: number;
    fps: number;
    frames: number;
  }): Promise<string>;
  lessonSendFrame(id: string, rgba: Uint8Array): Promise<void>;
  lessonSendFinish(id: string): Promise<string>;
  lessonSendCancel(id: string): Promise<void>;
  lessonSendManifest(manifest: unknown): Promise<void>;
}

export interface SendItem {
  stretch: LessonClip;
  artboardId: string;
  artboardName: string;
  name: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
}

/** A video side is at most maxSide (and at least minSide): a larger artboard goes scaled down. */
function videoSize(width: number, height: number) {
  const { minSide, maxSide } = DELIVERY_LIMITS;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(minSide, Math.round(width * scale)),
    height: Math.max(minSide, Math.round(height * scale)),
  };
}

/** Why an animation cannot be sent (its rate or length), or null. */
export function cannotSend(item: Pick<SendItem, "name" | "fps" | "frames">): string | null {
  const { maxFps, maxFrames } = DELIVERY_LIMITS;
  if (!Number.isInteger(item.fps) || item.fps < 1 || item.fps > maxFps)
    return `"${item.name}" tem ${item.fps} FPS: o envio para a aula aceita até ${maxFps}. Mude o FPS da animação.`;
  if (item.frames > maxFrames)
    return `"${item.name}" tem ${item.frames} quadros: o envio para a aula aceita até ${maxFrames}.`;
  return null;
}

/** The animations to send, by lesson, in the order of the lesson's seconds. */
export function sendPlan(project: Project): Map<string, SendItem[]> {
  const out = new Map<string, SendItem[]>();
  for (const board of project.artboards)
    for (const stretch of board.lessonClips ?? []) {
      const animation = project.motion.animations.find((a) => a.id === stretch.clipId);
      if (!animation) continue;
      const items = out.get(stretch.lessonId) ?? [];
      items.push({
        stretch,
        artboardId: board.id,
        artboardName: board.name,
        name: animation.name,
        fps: animation.fps,
        frames: Math.max(1, animation.frames),
        ...videoSize(board.scene.viewBox[2] ?? 16, board.scene.viewBox[3] ?? 16),
      });
      out.set(stretch.lessonId, items);
    }
  for (const items of out.values()) items.sort((a, b) => a.stretch.start - b.stretch.start);
  return out;
}

/**
 * Sends a lesson's animations. `onProgress` hears the animation being sent and its frames;
 * Cancelar (`signal`) stops between frames and leaves no half video.
 */
export async function sendLesson(
  project: Project,
  lessonId: string,
  bridge: LessonSendBridge,
  onProgress: (index: number, frame: number, item: SendItem) => void,
  signal: AbortSignal,
  now = Date.now(),
): Promise<number> {
  const items = sendPlan(project).get(lessonId) ?? [];
  if (!items.length) throw new Error("Nenhuma animação desta aula para enviar.");
  // Every animation checked first: a send never stops half way with videos no manifest lists.
  for (const item of items) {
    const reason = cannotSend(item);
    if (reason) throw new Error(`${reason} Nada foi enviado.`);
  }
  const sent: unknown[] = [];
  for (const [index, item] of items.entries()) {
    signal.throwIfAborted();
    const compiled = compileInteractiveArtboard(
      timelineProject(project, item.artboardId),
      item.artboardId,
      { animationId: item.stretch.clipId },
    );
    const source = await createRasterFrameSource(
      compiled.document,
      {
        width: item.width,
        height: item.height,
        background: item.stretch.kind === "screen-demo" ? "transparent" : "#000000",
      },
      signal,
    );
    let job: string | null = null;
    try {
      job = await bridge.lessonSendStart({
        lessonId,
        clipId: item.stretch.clipId,
        kind: item.stretch.kind,
        width: item.width,
        height: item.height,
        fps: item.fps,
        frames: item.frames,
      });
      for (let frame = 0; frame < item.frames; frame++) {
        signal.throwIfAborted();
        const context = await source.render(frame / item.fps);
        const { data } = context.getImageData(0, 0, item.width, item.height);
        await bridge.lessonSendFrame(
          job,
          new Uint8Array(data.buffer, data.byteOffset, data.length),
        );
        onProgress(index, frame + 1, item);
      }
      const file = await bridge.lessonSendFinish(job);
      job = null;
      sent.push({
        clipId: item.stretch.clipId,
        kind: item.stretch.kind,
        file,
        name: item.name.slice(0, 200),
        start: item.stretch.start,
        duration: item.frames / item.fps,
        section: item.stretch.section,
      });
    } finally {
      if (job) await bridge.lessonSendCancel(job);
      await source.destroy();
    }
  }
  await bridge.lessonSendManifest({ version: 1, lessonId, sentAt: now, items: sent });
  return sent.length;
}
