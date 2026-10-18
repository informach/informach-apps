import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desktopJobs } from "@informach/edi-desktop/jobs";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { app } from "electron";
import { z } from "zod";
import { drawingConcat } from "../shared/drawing.ts";
import { pruneCache, touch } from "./cachePrune.ts";
import { FFMPEG } from "./ffmpeg.ts";
import { scheduler } from "./scheduler.ts";

/**
 * The video of a drawing made on the screen during a take (shared/drawing.ts). The editor paints
 * each different picture of the drawing once, with the same code as the recorder window, and
 * sends it here as a PNG named by what it shows; FFmpeg then writes a transparent VP9 video with
 * each picture lasting until the next one (a variable frame rate, so a drawing standing still for
 * minutes is one frame). Pictures already made are kept by name: taking a stroke out redraws
 * only the pictures it was in. The work waits for a slot of the scheduler, like the other
 * background renders, and the videos and pictures are a cache kept under a size (the least used
 * go first; a video that goes is drawn again from the project, Asset.drawing).
 */

/** Size the drawing cache is kept under. */
export const DRAWING_CACHE_BYTES = 3 * 1024 ** 3;
/** A render the editor stopped feeding (its window reloaded or closed) ends after this long. */
const IDLE_MS = 120_000;
/** Most bytes of one picture. */
const MAX_PNG = 64 * 1024 * 1024;

interface Job {
  out: string;
  width: number;
  height: number;
  fps: number;
  /** Ends the scheduler slot and the desktop job. */
  release: () => void;
  idle?: ReturnType<typeof setTimeout>;
  cancelled: boolean;
}

const jobs = new Map<string, Job>();
/** Renders still waiting for their slot, so they can be called off. */
const waiting = new Map<string, AbortController>();
const id = z.string().regex(/^[\w-]{1,80}$/);
/** A picture's name: the SHA-256 of what it shows (lib/drawing.ts). */
const frameKey = z.string().regex(/^[0-9a-f]{64}$/);

const cacheRoot = (): string => {
  const dir = join(app.getPath("userData"), "cache", "desenho");
  mkdirSync(join(dir, "quadros"), { recursive: true });
  return dir;
};
const outPath = (key: string): string => join(cacheRoot(), `desenho-${key}.webm`);
const framePath = (key: string): string => join(cacheRoot(), "quadros", `${key}.png`);

async function finished(path: string): Promise<{ path: string; size: number }> {
  await desktopFiles.grantRead(path);
  return { path, size: (await stat(path)).size };
}

function end(jobId: string, job: Job): void {
  clearTimeout(job.idle);
  jobs.delete(jobId);
  job.release();
}

function keepAlive(jobId: string, job: Job): void {
  clearTimeout(job.idle);
  job.idle = setTimeout(() => {
    job.cancelled = true;
    end(jobId, job);
  }, IDLE_MS);
}

function jobOf(raw: unknown): { jobId: string; job: Job } {
  const jobId = id.parse(raw);
  const job = jobs.get(jobId);
  if (!job || job.cancelled) throw new Error("Cancelado");
  keepAlive(jobId, job);
  return { jobId, job };
}

/** Calls off a render, waiting for its slot or under way. */
function cancel(jobId: string): void {
  const pending = waiting.get(jobId);
  if (pending) {
    pending.abort(new Error("Cancelado"));
    return;
  }
  const job = jobs.get(jobId);
  if (!job) return;
  job.cancelled = true;
  end(jobId, job);
}

export function registerDrawingVideos(): void {
  ipcMain.handle("drawing:cached", async (_e, key: unknown) => {
    const out = outPath(id.parse(key));
    if (!existsSync(out)) return null;
    await touch(out);
    return finished(out);
  });

  /** Waits for a slot of the scheduler (and for a take to end, unless the teacher said not to). */
  ipcMain.handle(
    "drawing:begin",
    async (_e, jobId: unknown, key: unknown, width: unknown, height: unknown, fps: unknown) => {
      const job = id.parse(jobId);
      if (jobs.has(job) || waiting.has(job))
        throw new Error("Já existe um desenho sendo gravado com esse ID.");
      const size = z.int().min(2).max(4096);
      const w = size.parse(width);
      const h = size.parse(height);
      const rate = z.int().min(1).max(240).parse(fps);
      const out = outPath(id.parse(key));
      const cancellation = new AbortController();
      waiting.set(job, cancellation);
      let release = (): void => undefined;
      const holding = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await new Promise<void>((resolve, reject) => {
          scheduler
            .run(
              "drawing",
              async () => {
                const desktop = desktopJobs.begin({ stop: () => cancel(job) });
                resolve();
                try {
                  await holding;
                } finally {
                  desktop.finish();
                }
              },
              cancellation.signal,
            )
            .catch(reject);
        });
      } finally {
        waiting.delete(job);
      }
      const made: Job = { out, width: w, height: h, fps: rate, release, cancelled: false };
      jobs.set(job, made);
      keepAlive(job, made);
    },
  );

  /** The pictures of `keys` not made yet. */
  ipcMain.handle("drawing:missing", (_e, jobId: unknown, keys: unknown) => {
    jobOf(jobId);
    const list = z.array(frameKey).max(200_000).parse(keys);
    return list.filter((k) => !existsSync(framePath(k)));
  });

  /** One picture, a PNG of the video's size, named by what it shows. */
  ipcMain.handle("drawing:frame", async (_e, jobId: unknown, key: unknown, png: unknown) => {
    const { job } = jobOf(jobId);
    const name = frameKey.parse(key);
    if (!(png instanceof Uint8Array) || png.byteLength < 24 || png.byteLength > MAX_PNG)
      throw new Error("Quadro do desenho inválido.");
    // The PNG signature and the IHDR size: a picture of another size would stretch.
    const head = Buffer.from(png.buffer, png.byteOffset, 24);
    if (head.readUInt32BE(0) !== 0x89504e47 || head.toString("latin1", 12, 16) !== "IHDR")
      throw new Error("Quadro do desenho inválido.");
    if (head.readUInt32BE(16) !== job.width || head.readUInt32BE(20) !== job.height)
      throw new Error("Quadro do desenho com o tamanho errado.");
    const path = framePath(name);
    const tmp = `${path}.${randomUUID()}.partial`;
    await writeFile(tmp, png);
    await rename(tmp, path);
  });

  /**
   * The video: `frames` are [picture, first frame] in order, from frame 0, each lasting until
   * the next one; `total` frames in all at the rate given to begin.
   */
  ipcMain.handle("drawing:end", async (_e, jobId: unknown, frames: unknown, total: unknown) => {
    const { jobId: key, job } = jobOf(jobId);
    try {
      const count = z.int().min(1).max(50_000_000).parse(total);
      const list = z
        .array(z.tuple([frameKey, z.int().nonnegative()]))
        .min(1)
        .max(2_000_000)
        .parse(frames);
      const pictures = list.map(([k, at]) => ({ path: framePath(k), at }));
      for (const p of pictures)
        if (!existsSync(p.path)) throw new Error("Faltou um quadro do desenho.");
      const script = drawingConcat(pictures, count, job.fps);
      const listFile = job.out.replace(/\.webm$/, `.${key}.txt`);
      const tmp = job.out.replace(/\.webm$/, `.${key}.partial.webm`);
      await writeFile(listFile, script, "utf8");
      try {
        await encode(listFile, tmp, job.fps);
        if (job.cancelled) throw new Error("Cancelado");
        await rename(tmp, job.out);
      } finally {
        await rm(listFile, { force: true });
        await rm(tmp, { force: true });
      }
      // Every picture of this video was just used: the cache lets the least used ones go.
      await Promise.all([...new Set(pictures.map((p) => p.path))].map((p) => touch(p)));
      await pruneCache(cacheRoot(), DRAWING_CACHE_BYTES, job.out);
      return await finished(job.out);
    } finally {
      end(key, job);
    }
  });

  ipcMain.handle("drawing:cancel", (_e, jobId: unknown) => cancel(id.parse(jobId)));
}

/** FFmpeg reads the pictures with their durations and writes the transparent video. */
function encode(listFile: string, out: string, fps: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(
      FFMPEG,
      [
        ...["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile],
        ...["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-fps_mode", "vfr"],
        ...["-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "28", "-b:v", "0"],
        ...["-auto-alt-ref", "0", "-g", String(Math.max(1, fps)), "-f", "webm", out],
      ],
      { windowsHide: true },
    );
    scheduler.track(proc);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-2000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`)),
    );
  });
}
