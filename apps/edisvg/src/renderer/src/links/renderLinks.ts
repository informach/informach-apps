import { type LinkedAnimation, RENDER_VERSION } from "@informach/edi-link/contract";
import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";
import { timelineProject } from "../../../shared/raster/profile";
import { createRasterFrameSource } from "../raster/frameSource";

/**
 * The renders of the project's linked animations (packages/edi-link): after a save, each linked
 * animation whose picture changed is drawn frame by frame, transparent, at its artboard's size
 * and its own rate, and handed to the main process, which encodes it beside the project
 * (src/main/linkRender.ts). What changed is told by a hash of the compiled animation: a save
 * that did not touch it renders nothing. A new save stops the renders going and starts over.
 */

export interface LinkBridge {
  linkList(): Promise<LinkedAnimation[]>;
  linkRegister(
    projectId: string,
    input: { animationId: string; artboardId: string; name: string; requestId?: string },
  ): Promise<LinkedAnimation>;
  linkError(projectId: string, animationId: string, message: string): Promise<void>;
  linkRenderStart(
    projectId: string,
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
      broken.push({ item, reason: "A animação foi apagada do projeto." });
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
  projectId: string,
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
    job = await bridge.linkRenderStart(projectId, {
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

/**
 * The project's link renderer. `run` (after a save, or when a project opens) renders what
 * changed; a `run` while another goes stops it and starts over with the newer project.
 */
export function createLinkRenderer(
  bridge: LinkBridge,
  onProgress: (progress: LinkProgress | null) => void,
  onError: (message: string) => void,
) {
  let current: AbortController | null = null;
  async function run(project: Project): Promise<void> {
    current?.abort();
    const control = new AbortController();
    current = control;
    const { signal } = control;
    try {
      const items = await bridge.linkList();
      if (!items.length || signal.aborted) return;
      const { stale, renamed, broken } = await planLinks(project, items);
      for (const plan of renamed) {
        signal.throwIfAborted();
        await bridge.linkRegister(project.id, {
          animationId: plan.item.animationId,
          artboardId: plan.artboardId,
          name: plan.name,
        });
      }
      for (const { item, reason } of broken)
        if (item.error !== reason) await bridge.linkError(project.id, item.animationId, reason);
      for (const [index, plan] of stale.entries()) {
        signal.throwIfAborted();
        onProgress({ name: plan.name, index, count: stale.length, frame: 0, frames: plan.frames });
        try {
          await renderOne(project.id, plan, bridge, signal, (frame) =>
            onProgress({ name: plan.name, index, count: stale.length, frame, frames: plan.frames }),
          );
        } catch (error) {
          if (signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          await bridge.linkError(project.id, plan.item.animationId, message).catch(() => undefined);
          onError(`"${plan.name}" não foi renderizada para a aula: ${message}`);
        }
      }
    } catch (error) {
      if (!signal.aborted) onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === control) {
        current = null;
        onProgress(null);
      }
    }
  }
  return {
    run,
    busy: () => current !== null,
    stop: () => current?.abort(),
  };
}
