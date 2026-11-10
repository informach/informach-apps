import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import { DELIVERY_LIMITS } from "../shared/lessonDelivery";

/**
 * Sending a lesson's animations back to EdiAula. EdiSVG never writes the lesson: it leaves each
 * animation as a video in EdiAula's profile, `recebidos/<lesson id>/`, with `envio.json` written
 * last (a manifest there means every file it lists is whole). EdiAula reads that folder for the
 * open lesson and puts each video on a track of its own above the screen recording, at its
 * second of the lesson. A full-screen scene goes as an MP4; a demonstration, a layer over the
 * screen, as a WebM with transparency (VP9 with alpha, as EdiAula plays and exports it).
 *
 * The frames come from the window one at a time, as RGBA, straight into FFmpeg: a long stretch
 * (two minutes of 1080p) never has to fit in memory, as the export of a file does.
 */

export const DELIVERY_FOLDER = "recebidos";
export const DELIVERY_MANIFEST = "envio.json";
const LESSON_ID = /^[\w-]{1,100}$/;
const CLIP_ID = /^animation-[\w-]{1,100}$/;
const { minSide, maxSide, maxFps, maxFrames } = DELIVERY_LIMITS;

export const deliverySpecSchema = z.strictObject({
  lessonId: z.string().regex(LESSON_ID),
  clipId: z.string().regex(CLIP_ID),
  /** "game-scene" covers the screen (MP4); "screen-demo" is a layer over it (WebM with alpha). */
  kind: z.enum(["game-scene", "screen-demo"]),
  width: z.int().min(minSide).max(maxSide),
  height: z.int().min(minSide).max(maxSide),
  fps: z.int().min(1).max(maxFps),
  frames: z.int().min(1).max(maxFrames),
});
export type DeliverySpec = z.infer<typeof deliverySpecSchema>;

export const deliveryItemSchema = z.strictObject({
  clipId: z.string().regex(CLIP_ID),
  kind: z.enum(["game-scene", "screen-demo"]),
  /** The video, a file of the lesson's folder. */
  file: z.string().regex(/^animation-[\w-]{1,100}-\d{13}\.(mp4|webm)$/),
  /** The animation's name, for the clip in EdiAula. */
  name: z.string().min(1).max(200),
  /** Lesson second its first frame plays at, and how long it is. */
  start: z.number().min(0).max(360_000),
  duration: z.number().positive().max(36_000),
  section: z.int().min(0).max(10_000),
});
export type DeliveryItem = z.infer<typeof deliveryItemSchema>;
export const deliveryManifestSchema = z.strictObject({
  version: z.literal(1),
  lessonId: z.string().regex(LESSON_ID),
  /** When it was sent (ms): EdiAula offers a manifest it has not put in the lesson yet. */
  sentAt: z.number().int().positive(),
  items: z.array(deliveryItemSchema).min(1).max(200),
});
export type DeliveryManifest = z.infer<typeof deliveryManifestSchema>;

/** FFmpeg reading RGBA frames from stdin: VP9 with alpha in WebM, or H.264 in MP4. */
export function deliveryArgs(spec: DeliverySpec, out: string): string[] {
  const input = [
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
    // 4:2:0 needs even sides: an odd artboard gets one transparent (or black) line.
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
  ];
  return spec.kind === "screen-demo"
    ? [
        ...input,
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
      ]
    : [
        ...input,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-preset",
        "veryfast",
        "-movflags",
        "+faststart",
        out,
      ];
}

interface Job {
  spec: DeliverySpec;
  process: ChildProcessWithoutNullStreams;
  folder: string;
  part: string;
  file: string;
  frames: number;
  errors: string;
  done: Promise<number | null>;
}
const jobs = new Map<string, Job>();

export const lessonFolder = (inbox: string, lessonId: string): string => {
  if (!LESSON_ID.test(lessonId)) throw new Error("Aula inválida.");
  return join(inbox, lessonId);
};

/** Starts encoding one animation; the frames follow with deliveryFrame. Returns the job's id. */
export async function startDelivery(
  ffmpeg: string,
  inbox: string,
  input: unknown,
  now = Date.now(),
): Promise<string> {
  const spec = deliverySpecSchema.parse(input);
  const folder = lessonFolder(inbox, spec.lessonId);
  await mkdir(folder, { recursive: true });
  const file = `${spec.clipId}-${now}.${spec.kind === "screen-demo" ? "webm" : "mp4"}`;
  const part = join(folder, `${file}.part.${spec.kind === "screen-demo" ? "webm" : "mp4"}`);
  const child = spawn(ffmpeg, deliveryArgs(spec, part), { windowsHide: true });
  const job: Job = {
    spec,
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
  const id = `entrega-${now}-${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(id, job);
  return id;
}

const jobOf = (id: unknown): Job => {
  const job = typeof id === "string" ? jobs.get(id) : undefined;
  if (!job) throw new Error("Envio para a aula não encontrado.");
  return job;
};

/** One frame (RGBA, width × height × 4 bytes), written when FFmpeg can take it. */
export async function deliveryFrame(id: unknown, bytes: unknown): Promise<void> {
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

/** Ends an animation: every frame in, the video moved to its name. Returns the file's name. */
export async function finishDelivery(id: unknown): Promise<string> {
  const job = jobOf(id);
  jobs.delete(id as string);
  job.process.stdin.end();
  const code = await job.done;
  try {
    if (job.frames !== job.spec.frames) throw new Error("Faltaram quadros da animação.");
    if (code !== 0) {
      console.warn("[edisvg] FFmpeg (envio para a aula):", job.errors);
      throw new Error("Não consegui codificar a animação para a aula.");
    }
    await rename(job.part, join(job.folder, job.file));
  } catch (error) {
    await rm(job.part, { force: true });
    throw error;
  }
  return job.file;
}

/** Stops an animation half sent: nothing of it stays. */
export async function cancelDelivery(id: unknown): Promise<void> {
  const job = typeof id === "string" ? jobs.get(id) : undefined;
  if (!job) return;
  jobs.delete(id as string);
  job.process.kill();
  await job.done;
  await rm(job.part, { force: true });
}

/**
 * Writes the manifest of what was sent, last: the files it lists are whole. Videos of earlier
 * sends stay (the lesson may use them); a half-written one a crash left behind goes.
 */
export async function writeDelivery(inbox: string, input: unknown): Promise<void> {
  const manifest = deliveryManifestSchema.parse(input);
  const folder = lessonFolder(inbox, manifest.lessonId);
  for (const item of manifest.items) {
    const st = await stat(join(folder, item.file)).catch(() => null);
    if (!st?.isFile()) throw new Error(`O vídeo de ${item.name} não está na pasta da aula.`);
  }
  await atomicWrite(join(folder, DELIVERY_MANIFEST), JSON.stringify(manifest));
  const sending = new Set([...jobs.values()].map((job) => job.part));
  for (const name of await readdir(folder).catch(() => [] as string[]))
    if (/\.part\.(mp4|webm)$/.test(name) && !sending.has(join(folder, name)))
      await rm(join(folder, name), { force: true });
}
