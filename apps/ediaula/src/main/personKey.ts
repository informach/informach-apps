import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { desktopJobs } from "@informach/edi-desktop/jobs";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { app } from "electron";
import { z } from "zod";
import { keyId } from "../shared/chroma.ts";
import {
  keyFrames,
  maskFramesArgs,
  maskSize,
  PERSON_KEY,
  personKeyArgs,
} from "../shared/personKey.ts";
import { cacheDir, FFMPEG } from "./ffmpeg.ts";
import { scheduler } from "./scheduler.ts";

/**
 * The main side of "Remover fundo com IA local" (shared/personKey.ts): FFmpeg decodes the small
 * frames the model needs, the renderer's worker turns them into masks, and FFmpeg writes the
 * camera at full size with each mask as its alpha. The work holds a "keying" slot of the
 * scheduler from the first frame to the last, so it waits for a take like the color key does.
 */

/** Decoded frames kept waiting for the renderer before the decoder is paused. */
const AHEAD = 48;
/** Most frames handed over in one call. */
const BATCH = 32;
/**
 * A render the editor stopped asking for (its window reloaded or closed) is ended after this
 * long, so it never keeps the scheduler's slot.
 */
const IDLE_MS = 60_000;

interface Job {
  dec: ChildProcessWithoutNullStreams;
  enc: ChildProcessWithoutNullStreams;
  tmp: string;
  out: string;
  frameBytes: number;
  maskBytes: number;
  /** Whole frames waiting for the renderer. */
  frames: Buffer[];
  partial: Buffer;
  filled: number;
  decoded: boolean;
  failure: Error | null;
  /** Wakes a `take` waiting for frames. */
  wake: (() => void) | null;
  /** Ends the scheduler slot and the desktop job. */
  release: () => void;
  encoded: Promise<void>;
  idle?: ReturnType<typeof setTimeout>;
}

const jobs = new Map<string, Job>();
/** Jobs still waiting for their slot, so they can be called off. */
const waiting = new Map<string, AbortController>();

const modelPath = (): string =>
  join(app.getAppPath(), "resources", "segmentation", "selfie_segmenter.tflite");

/** Cancels a person key render (job:cancel). */
export function cancelPersonKey(jobId: string): boolean {
  const pending = waiting.get(jobId);
  if (pending) {
    pending.abort(new Error("Cancelado"));
    return true;
  }
  const job = jobs.get(jobId);
  if (!job) return false;
  void stop(jobId, job, new Error("Cancelado"));
  return true;
}

/** The editor is still at it: the render's idle clock starts again. */
function touch(jobId: string, job: Job): void {
  clearTimeout(job.idle);
  job.idle = setTimeout(
    () => void stop(jobId, job, new Error("O editor parou de pedir os quadros.")),
    IDLE_MS,
  );
}

async function stop(jobId: string, job: Job, error: Error): Promise<void> {
  clearTimeout(job.idle);
  if (jobs.get(jobId) === job) jobs.delete(jobId);
  job.failure ??= error;
  job.wake?.();
  job.dec.kill("SIGKILL");
  job.enc.kill("SIGKILL");
  job.release();
  await job.encoded.catch(() => undefined);
  await rm(job.tmp, { force: true });
}

const request = z.object({
  path: z.string().min(1).max(32768),
  width: z.number().int().nonnegative().max(16384),
  height: z.number().int().nonnegative().max(16384),
  fps: z.number().nonnegative().max(1000),
  duration: z
    .number()
    .nonnegative()
    .max(7 * 86400),
});
const jobIdSchema = z.string().min(1).max(200);

export function registerPersonKey(): void {
  /** The segmentation model, read once per render by the worker. */
  ipcMain.handle("personKey:model", async () => new Uint8Array(await readFile(modelPath())));

  /**
   * Starts a render once a "keying" slot is free (and no take holds work back). Answers the
   * cached video when there is one, or the size and number of the frames to come.
   */
  ipcMain.handle("personKey:begin", async (_e, rawId: unknown, raw: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    const o = request.parse(raw);
    await desktopFiles.assertRead(o.path);
    if (jobs.has(jobId) || waiting.has(jobId))
      throw new Error("Já existe um processamento com esse ID.");
    const out = join(cacheDir(o.path), `key-${keyId(PERSON_KEY)}.webm`);
    if (existsSync(out)) {
      // The preview reads it through media://, which serves only files the editor was given.
      await desktopFiles.grantRead(out);
      return { cached: out };
    }
    const cancellation = new AbortController();
    waiting.set(jobId, cancellation);
    let release = (): void => undefined;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve, reject) => {
      scheduler
        .run(
          "keying",
          async () => {
            const job = desktopJobs.begin({
              stop: () => {
                cancelPersonKey(jobId);
              },
            });
            resolve();
            try {
              await holding;
            } finally {
              job.finish();
            }
          },
          cancellation.signal,
        )
        .catch(reject);
    });
    try {
      await started;
    } finally {
      waiting.delete(jobId);
    }
    const m = maskSize(o.width, o.height);
    const tmp = out.replace(".webm", `.${randomUUID()}.part.webm`);
    const dec = spawn(FFMPEG, maskFramesArgs(o), { windowsHide: true });
    const enc = spawn(FFMPEG, personKeyArgs({ ...o, out: tmp }), { windowsHide: true });
    scheduler.track(dec);
    scheduler.track(enc);
    const frameBytes = m.width * m.height * 4;
    let encErr = "";
    let decErr = "";
    const encoded = new Promise<void>((resolve, reject) =>
      enc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(encErr.trim() || `Falha ao gravar o vídeo recortado (código ${code}).`),
            ),
      ),
    );
    const job: Job = {
      dec,
      enc,
      tmp,
      out,
      frameBytes,
      maskBytes: m.width * m.height,
      frames: [],
      partial: Buffer.allocUnsafe(frameBytes),
      filled: 0,
      decoded: false,
      failure: null,
      wake: null,
      release,
      encoded,
    };
    jobs.set(jobId, job);
    touch(jobId, job);
    const fail = (error: Error): void => {
      if (jobs.get(jobId) === job) void stop(jobId, job, error);
    };
    dec.stdout.on("data", (chunk: Buffer) => {
      let off = 0;
      while (off < chunk.length) {
        const n = Math.min(frameBytes - job.filled, chunk.length - off);
        chunk.copy(job.partial, job.filled, off, off + n);
        job.filled += n;
        off += n;
        if (job.filled === frameBytes) {
          job.frames.push(job.partial);
          job.partial = Buffer.allocUnsafe(frameBytes);
          job.filled = 0;
        }
      }
      if (job.frames.length >= AHEAD) dec.stdout.pause();
      job.wake?.();
    });
    dec.stderr.on("data", (d: Buffer) => (decErr = (decErr + d.toString()).slice(-2000)));
    enc.stderr.on("data", (d: Buffer) => (encErr = (encErr + d.toString()).slice(-2000)));
    enc.stdin.on("error", () => undefined);
    encoded.catch((error: Error) => fail(error));
    dec.on("error", fail);
    enc.on("error", fail);
    dec.on("close", (code) => {
      if (code !== 0)
        fail(new Error(decErr.trim() || `Falha ao ler o vídeo da câmera (código ${code}).`));
      job.decoded = true;
      job.wake?.();
    });
    return { width: m.width, height: m.height, total: keyFrames(o.duration, o.fps) };
  });

  /**
   * The next frames for the model (up to BATCH, RGBA back to back); none once the video is over.
   * One typed array crosses the IPC as a single value.
   */
  ipcMain.handle("personKey:frames", async (_e, rawId: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    const job = jobs.get(jobId);
    if (!job) throw new Error("Cancelado");
    touch(jobId, job);
    while (!job.frames.length && !job.decoded && !job.failure)
      await new Promise<void>((resolve) => {
        job.wake = resolve;
      });
    job.wake = null;
    if (job.failure) throw job.failure;
    const taken = job.frames.splice(0, BATCH);
    if (job.frames.length < AHEAD / 2) job.dec.stdout.resume();
    const data = new Uint8Array(taken.length * job.frameBytes);
    taken.forEach((frame, i) => {
      data.set(frame, i * job.frameBytes);
    });
    return { count: taken.length, data };
  });

  /** The masks of the frames handed over, in order (one byte per pixel). */
  ipcMain.handle("personKey:masks", async (_e, rawId: unknown, masks: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    const job = jobs.get(jobId);
    if (!job) throw new Error("Cancelado");
    if (!(masks instanceof Uint8Array) || masks.length % job.maskBytes !== 0)
      throw new Error("Máscaras inválidas.");
    touch(jobId, job);
    if (job.failure) throw job.failure;
    if (job.enc.stdin.write(masks)) return;
    // Room again, or the encoder is gone (then its failure is the answer).
    const stdin = job.enc.stdin;
    await new Promise<void>((resolve) => {
      const done = (): void => {
        stdin.off("drain", done);
        stdin.off("close", done);
        resolve();
      };
      stdin.once("drain", done);
      stdin.once("close", done);
    });
    if (job.failure) throw job.failure;
  });

  /** Every mask was written: the video is finished and goes into the cache. */
  ipcMain.handle("personKey:end", async (_e, rawId: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    const job = jobs.get(jobId);
    if (!job) throw new Error("Cancelado");
    clearTimeout(job.idle);
    try {
      if (job.failure) throw job.failure;
      job.enc.stdin.end();
      await job.encoded;
      if (existsSync(job.out)) await rm(job.tmp, { force: true });
      else await rename(job.tmp, job.out);
      // The preview reads it through media://, which serves only files the editor was given.
      await desktopFiles.grantRead(job.out);
      return job.out;
    } catch (error) {
      await rm(job.tmp, { force: true });
      throw error;
    } finally {
      jobs.delete(jobId);
      job.release();
    }
  });

  ipcMain.handle("personKey:cancel", (_e, rawId: unknown) => {
    cancelPersonKey(jobIdSchema.parse(rawId));
  });
}
