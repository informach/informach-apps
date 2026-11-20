import { type LinkedAnimation, RENDER_VERSION } from "@informach/edi-link/contract";
import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";
import { timelineProject } from "../../../shared/raster/profile";
import { createRasterFrameSource } from "../raster/frameSource";

/**
 * The renders of the linked animations (packages/edi-link): after a save, each linked animation
 * whose picture changed is drawn frame by frame, transparent, at its artboard's size and its own
 * rate, and handed to the main process, which encodes it beside the project
 * (src/main/linkRender.ts). What changed is told by a hash of the compiled animation: a save
 * that did not touch it renders nothing.
 *
 * Saves go into a queue (src/main/linkQueue.ts) rendered one project at a time from the saved
 * file, in the background: the person opens the next lesson's project while the renders of the
 * one before go on. A new save of the project rendering now starts its render over.
 */

/** A project in the render queue, as the main process shows it (the path stays there). */
export interface QueueItem {
  id: string;
  name: string;
}

export interface LinkBridge {
  linkQueue(): Promise<QueueItem[]>;
  /** Queues the open project, when it has linked animations; its queue id, or null. */
  linkQueueAdd(): Promise<string | null>;
  linkQueueLoad(id: string): Promise<{ project: Project; links: LinkedAnimation[] }>;
  linkQueueRemove(id: string): Promise<void>;
  linkQueueRegister(
    id: string,
    input: { animationId: string; artboardId: string; name: string },
  ): Promise<LinkedAnimation>;
  linkError(id: string, animationId: string, message: string): Promise<void>;
  linkRenderStart(
    id: string,
    spec: {
      animationId: string;
      hash: string;
      width: number;
      height: number;
      fps: number;
      frames: number;
    },
  ): Promise<string>;
  linkRenderFrame(id: string, rgba: Uint8Array): Promise<void>;
  linkRenderFinish(id: string): Promise<LinkedAnimation>;
  linkRenderCancel(id: string): Promise<void>;
}

export interface LinkProgress {
  /** The queued project rendering, and the animation of it. */
  project: string;
  name: string;
  /** Which of the animations to render, and how many there are. */
  index: number;
  count: number;
  frame: number;
  frames: number;
}

const MAX_SIDE = 3840;
const MIN_SIDE = 16;
const MAX_FPS = 60;
const MAX_FRAMES = 72_000;
/** Seconds: a render longer than this is refused by the manifest (packages/edi-link). */
const MAX_DURATION = 1200;

/** A video side is at most 3840: a larger artboard renders scaled down, its proportion kept. */
export function renderSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(MIN_SIDE, Math.round(width * scale)),
    height: Math.max(MIN_SIDE, Math.round(height * scale)),
  };
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface LinkPlan {
  item: LinkedAnimation;
  artboardId: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  hash: string;
  /** The compiled animation the hash is of: what is drawn. */
  document: ReturnType<typeof compileInteractiveArtboard>["document"];
}

/** Why a linked animation cannot render as it is, or null. */
function cannotRender(fps: number, frames: number): string | null {
  if (!Number.isInteger(fps) || fps < 1 || fps > MAX_FPS)
    return `A animação tem ${fps} FPS: para a aula vale até ${MAX_FPS}. Mude o FPS da animação.`;
  if (frames > MAX_FRAMES)
    return `A animação tem ${frames} quadros: para a aula vale até ${MAX_FRAMES}.`;
  if (frames / fps > MAX_DURATION)
    return `A animação dura ${Math.round(frames / fps)} s: para a aula vale até ${MAX_DURATION} s.`;
  return null;
}

/**
 * What the linked animations of `project` need: the ones to render (picture changed, or never
 * rendered), the ones whose name or artboard changed (the manifest follows), and the ones that
 * cannot render (animation or artboard gone, rate or length over the limits).
 */
export async function planLinks(
  project: Project,
  items: readonly LinkedAnimation[],
): Promise<{
  stale: LinkPlan[];
  renamed: LinkPlan[];
  broken: { item: LinkedAnimation; reason: string }[];
}> {
  const stale: LinkPlan[] = [];
  const renamed: LinkPlan[] = [];
  const broken: { item: LinkedAnimation; reason: string }[] = [];
  for (const item of items) {
    const animation = project.motion.animations.find((a) => a.id === item.animationId);
    if (!animation) {
      broken.push({ item, reason: "A animação não está no projeto salvo." });
      continue;
    }
    const board =
      project.artboards.find((b) => b.id === item.artboardId) ??
      project.artboards.find((b) => b.id === project.defaultArtboardId) ??
      project.artboards[0];
    if (!board) {
      broken.push({ item, reason: "O projeto não tem prancheta." });
      continue;
    }
    const frames = Math.max(1, animation.frames);
    const reason = cannotRender(animation.fps, frames);
    if (reason) {
      broken.push({ item, reason });
      continue;
    }
    const size = renderSize(board.scene.viewBox[2] ?? MIN_SIDE, board.scene.viewBox[3] ?? MIN_SIDE);
    const compiled = compileInteractiveArtboard(timelineProject(project, board.id), board.id, {
      animationId: animation.id,
    });
    const hash = await sha(
      JSON.stringify({
        v: RENDER_VERSION,
        document: compiled.document,
        ...size,
        fps: animation.fps,
        frames,
      }),
    );
    const plan: LinkPlan = {
      item,
      artboardId: board.id,
      name: animation.name.slice(0, 200) || "Animação",
      ...size,
      fps: animation.fps,
      frames,
      hash,
      document: compiled.document,
    };
    if (plan.name !== item.name || plan.artboardId !== item.artboardId) renamed.push(plan);
    if (item.render?.hash !== hash) stale.push(plan);
  }
  return { stale, renamed, broken };
}

/** Draws one linked animation and hands its frames to the main process. */
async function renderOne(
  queueId: string,
  plan: LinkPlan,
  bridge: LinkBridge,
  signal: AbortSignal,
  onFrame: (frame: number) => void,
): Promise<void> {
  const source = await createRasterFrameSource(
    plan.document,
    { width: plan.width, height: plan.height, background: "transparent" },
    signal,
  );
  let job: string | null = null;
  try {
    job = await bridge.linkRenderStart(queueId, {
      animationId: plan.item.animationId,
      hash: plan.hash,
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      frames: plan.frames,
    });
    for (let frame = 0; frame < plan.frames; frame++) {
      signal.throwIfAborted();
      const context = await source.render(frame / plan.fps);
      const { data } = context.getImageData(0, 0, plan.width, plan.height);
      await bridge.linkRenderFrame(job, new Uint8Array(data.buffer, data.byteOffset, data.length));
      onFrame(frame + 1);
    }
    const id = job;
    job = null;
    await bridge.linkRenderFinish(id);
  } finally {
    if (job) await bridge.linkRenderCancel(job).catch(() => undefined);
    await source.destroy();
  }
}

export interface QueueView {
  items: QueueItem[];
  /** The id of the item rendering now, and how far. */
  running: string | null;
  progress: LinkProgress | null;
}

/**
 * The window's side of the render queue. `add` (after a save, or when a linked project opens)
 * queues the open project; `start` renders what the last session left. One project renders at a
 * time; an item leaves the queue when its renders end, whether they all went well or not (the
 * failures go to the manifest and to `onError`).
 */
export function createRenderQueue(
  bridge: LinkBridge,
  onChange: (view: QueueView) => void,
  onError: (message: string) => void,
) {
  let items: QueueItem[] = [];
  let running: { id: string; control: AbortController } | null = null;
  let progress: LinkProgress | null = null;
  let working = false;
  const emit = () => onChange({ items, running: running?.id ?? null, progress });
  const refresh = async () => {
    items = await bridge.linkQueue();
    emit();
  };

  async function renderItem(item: QueueItem, signal: AbortSignal): Promise<void> {
    const { project, links } = await bridge.linkQueueLoad(item.id);
    signal.throwIfAborted();
    const { stale, renamed, broken } = await planLinks(project, links);
    for (const plan of renamed) {
      signal.throwIfAborted();
      await bridge.linkQueueRegister(item.id, {
        animationId: plan.item.animationId,
        artboardId: plan.artboardId,
        name: plan.name,
      });
    }
    for (const { item: link, reason } of broken)
      if (link.error !== reason) await bridge.linkError(item.id, link.animationId, reason);
    for (const [index, plan] of stale.entries()) {
      signal.throwIfAborted();
      const report = (frame: number) => {
        progress = {
          project: item.name,
          name: plan.name,
          index,
          count: stale.length,
          frame,
          frames: plan.frames,
        };
        emit();
      };
      report(0);
      try {
        await renderOne(item.id, plan, bridge, signal, report);
      } catch (error) {
        if (signal.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        await bridge.linkError(item.id, plan.item.animationId, message).catch(() => undefined);
        onError(`"${plan.name}" (${item.name}) não foi renderizada para a aula: ${message}`);
      }
    }
  }

  async function work(): Promise<void> {
    if (working) return;
    working = true;
    try {
      for (;;) {
        await refresh();
        const item = items[0];
        if (!item) break;
        const control = new AbortController();
        running = { id: item.id, control };
        emit();
        try {
          await renderItem(item, control.signal);
        } catch (error) {
          if (!control.signal.aborted)
            onError(
              `O render de ${item.name} para a aula falhou: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
          running = null;
          progress = null;
        }
        // Stopped, it was taken out of the queue (gone) or saved again (renders over, first).
        if (!control.signal.aborted) await bridge.linkQueueRemove(item.id);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      working = false;
      emit();
    }
  }

  return {
    /** Renders the queue the last session left. */
    start: () => work(),
    /** Queues the open project (after a save): a render of it going starts over. */
    async add(): Promise<void> {
      try {
        const id = await bridge.linkQueueAdd();
        if (!id) return;
        if (running?.id === id) running.control.abort();
        await refresh();
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        return;
      }
      await work();
    },
    /** Takes a project out of the queue, stopping its render if it is the one going. */
    async cancel(id: string): Promise<void> {
      try {
        await bridge.linkQueueRemove(id);
        if (running?.id === id) running.control.abort();
        await refresh();
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    },
    busy: () => running !== null,
  };
}
