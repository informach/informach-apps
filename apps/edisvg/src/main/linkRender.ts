import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  animationIdSchema,
  artboardIdSchema,
  ediaulaLessonPathSchema,
  type LinkedAnimation,
  type RendersManifest,
  renderFileName,
  renderSchema,
} from "@informach/edi-link/contract";
import { readManifest, renderPath, rendersDir, writeManifest } from "@informach/edi-link/node";
import { z } from "zod";

/**
 * The renders of a project's linked animations (packages/edi-link): each linked animation, at
 * every save that changed it, drawn frame by frame by the window and encoded here into a WebM
 * with transparency (VP9 with alpha, as EdiAula plays and exports it), in the folder
 * `<project> · renders` beside the project. The manifest (`vinculos.json`) is written after the
 * video: an entry's render is always a whole file. The frames come one at a time, as RGBA,
 * straight into FFmpeg: a long animation never has to fit in memory.
 */

export const renderSpecSchema = z.strictObject({
  animationId: animationIdSchema,
  hash: renderSchema.shape.hash,
  width: renderSchema.shape.width,
  height: renderSchema.shape.height,
  fps: renderSchema.shape.fps,
  frames: renderSchema.shape.frames,
});
export type RenderSpec = z.infer<typeof renderSpecSchema>;

/** FFmpeg reading RGBA frames from stdin: VP9 with alpha in WebM. */
export function renderArgs(spec: RenderSpec, out: string): string[] {
  return [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${spec.width}x${spec.height}`,
    "-framerate",
    String(spec.fps),
    "-i",
    "-",
    // 4:2:0 needs even sides: an odd artboard gets one transparent line.
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-b:v",
    "0",
    "-crf",
    "30",
    "-deadline",
    "good",
    "-cpu-used",
    "4",
    "-row-mt",
    "1",
    "-auto-alt-ref",
    "0",
    out,
  ];
}

/** Manifest changes one at a time: two renders finishing together never lose an entry. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/** The project's manifest, or a new one; its id kept as the project's. */
async function manifestOf(project: string, projectId: string): Promise<RendersManifest> {
  const current = await readManifest(rendersDir(project));
  return current ? { ...current, projectId } : { version: 1, projectId, items: [] };
}

/** The linked animations of a project (none when it has no manifest). */
export async function linkedAnimations(project: string): Promise<LinkedAnimation[]> {
  return (await readManifest(rendersDir(project)))?.items ?? [];
}

export const registerSchema = z.strictObject({
  animationId: animationIdSchema,
  artboardId: artboardIdSchema,
  name: z.string().trim().min(1).max(200),
  requestId: z
    .string()
    .regex(/^[\w-]{8,64}$/)
    .optional(),
  /** The lesson it is for (the request's), and where a pipeline placed it in that lesson. */
  lesson: ediaulaLessonPathSchema.optional(),
  start: z.number().min(0).max(360_000).optional(),
});

/** Links an animation of the project (or updates its artboard and name): it renders from now on. */
export function registerLink(
  project: string,
  projectId: string,
  input: unknown,
  now = Date.now(),
): Promise<LinkedAnimation> {
  const value = registerSchema.parse(input);
  return serial(async () => {
    const manifest = await manifestOf(project, projectId);
    const before = manifest.items.find((i) => i.animationId === value.animationId);
    const item: LinkedAnimation = {
      ...before,
      animationId: value.animationId,
      artboardId: value.artboardId,
      name: value.name,
      ...(value.requestId ? { requestId: value.requestId } : {}),
      ...(value.lesson ? { lesson: value.lesson } : {}),
      ...(value.start !== undefined ? { start: value.start } : {}),
      updatedAt: now,
    };
    manifest.items = [...manifest.items.filter((i) => i !== before), item];
    await writeManifest(rendersDir(project), manifest);
    return item;
  });
}

/** Records why an animation could not render (its last render, if any, stays). */
export function markLinkError(
  project: string,
  projectId: string,
  animationId: unknown,
  message: unknown,
  now = Date.now(),
): Promise<void> {
  const id = animationIdSchema.parse(animationId);
  const text = String(message ?? "").slice(0, 500) || "O render falhou.";
  return serial(async () => {
    const manifest = await manifestOf(project, projectId);
    const item = manifest.items.find((i) => i.animationId === id);
    if (!item || item.error === text) return;
    Object.assign(item, { error: text, updatedAt: now });
    await writeManifest(rendersDir(project), manifest);
  });
}

interface Job {
  spec: RenderSpec;
  project: string;
  projectId: string;
  process: ChildProcessWithoutNullStreams;
  folder: string;
  part: string;
  file: string;
  frames: number;
  errors: string;
  done: Promise<number | null>;
}
const jobs = new Map<string, Job>();

/** Starts encoding one linked animation of `project`; the frames follow with renderFrame. */
export async function startRender(
  ffmpeg: string,
  project: string,
  projectId: string,
  input: unknown,
): Promise<string> {
  const spec = renderSpecSchema.parse(input);
  const folder = rendersDir(project);
  const linked = await linkedAnimations(project);
  if (!linked.some((i) => i.animationId === spec.animationId))
    throw new Error("Esta animação não está vinculada a uma aula.");
  await mkdir(folder, { recursive: true });
  const file = renderFileName(spec.animationId, spec.hash);
  // Its own name: a render of the same picture stopped meanwhile never removes this one.
  const part = join(folder, `${file}.${randomUUID()}.part.webm`);
  const child = spawn(ffmpeg, renderArgs(spec, part), { windowsHide: true });
  const job: Job = {
    spec,
    project,
    projectId,
    process: child,
    folder,
    part,
    file,
    frames: 0,
    errors: "",
    done: new Promise((resolve) => {
      child.on("close", (code) => resolve(code));
      child.on("error", () => resolve(-1));
    }),
  };
  child.stderr.on("data", (chunk: Buffer) => {
    job.errors = (job.errors + chunk.toString()).slice(-4000);
  });
  // A closed stdin (FFmpeg gone) is said when the next frame or the finish asks.
  child.stdin.on("error", () => undefined);
  const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(id, job);
  return id;
}

const jobOf = (id: unknown): Job => {
  const job = typeof id === "string" ? jobs.get(id) : undefined;
  if (!job) throw new Error("Render não encontrado.");
  return job;
};

/** One frame (RGBA, width × height × 4 bytes), written when FFmpeg can take it. */
export async function renderFrame(id: unknown, bytes: unknown): Promise<void> {
  const job = jobOf(id);
  const size = job.spec.width * job.spec.height * 4;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size)
    throw new Error("Quadro com tamanho errado.");
  if (job.frames >= job.spec.frames) throw new Error("Quadros demais para a animação.");
  if (job.process.exitCode !== null || job.process.stdin.destroyed)
    throw new Error("O FFmpeg parou no meio da animação.");
  job.frames++;
  if (!job.process.stdin.write(bytes))
    await new Promise<void>((resolve) => {
      const go = () => {
        job.process.stdin.off("drain", go);
        job.process.off("close", go);
        resolve();
      };
      job.process.stdin.once("drain", go);
      job.process.once("close", go);
    });
}

/** Renders kept for an animation: the new one and the one before (still playing somewhere). */
const KEEP_RENDERS = 2;

/**
 * Ends a render: every frame in, the video moved to its name, the manifest written with it, and
 * the animation's renders older than the one before removed. Returns the manifest entry.
 */
export async function finishRender(id: unknown, now = Date.now()): Promise<LinkedAnimation> {
  const job = jobOf(id);
  jobs.delete(id as string);
  job.process.stdin.end();
  const code = await job.done;
  try {
    if (job.frames !== job.spec.frames) throw new Error("Faltaram quadros da animação.");
    if (code !== 0) {
      console.warn("[edisvg] FFmpeg (render do vínculo):", job.errors);
      throw new Error("Não consegui codificar a animação.");
    }
    await rename(job.part, renderPath(job.folder, job.file));
  } catch (error) {
    await rm(job.part, { force: true });
    throw error;
  }
  const { spec } = job;
  return serial(async () => {
    const manifest = await manifestOf(job.project, job.projectId);
    const item = manifest.items.find((i) => i.animationId === spec.animationId);
    // Unlinked while it rendered: the video goes too.
    if (!item) {
      await rm(renderPath(job.folder, job.file), { force: true });
      throw new Error("A animação deixou de estar vinculada.");
    }
    const previous = item.render?.file;
    item.render = {
      file: job.file,
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      frames: spec.frames,
      duration: spec.frames / spec.fps,
      hash: spec.hash,
    };
    delete item.error;
    item.updatedAt = now;
    await writeManifest(job.folder, manifest);
    const keep = new Set(
      [job.file, previous].filter((f): f is string => !!f).slice(0, KEEP_RENDERS),
    );
    // Exactly this animation's renders: `animation-intro-` must never take `animation-intro-2`'s.
    const prefix = `${spec.animationId}-`;
    for (const name of await readdir(job.folder).catch(() => [] as string[]))
      if (
        name.startsWith(prefix) &&
        /^[0-9a-f]{16}\.webm$/.test(name.slice(prefix.length)) &&
        !keep.has(name)
      )
        // A render another app still plays (Windows keeps an open file) goes the next time.
        await rm(join(job.folder, name), { force: true }).catch(() => undefined);
    return item;
  });
}

/** Stops a render half made: nothing of it stays. */
export async function cancelRender(id: unknown): Promise<void> {
  const job = typeof id === "string" ? jobs.get(id) : undefined;
  if (!job) return;
  jobs.delete(id as string);
  job.process.kill();
  await job.done;
  await rm(job.part, { force: true });
}
