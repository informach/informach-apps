import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { app } from "electron";
import { z } from "zod";
import { FFMPEG } from "./ffmpeg.ts";

/**
 * The video of a drawing made on the screen during a take (shared/drawing.ts): the editor draws
 * each frame with the same code as the recorder window and sends it here, frames that repeat (the
 * drawing standing still) once with a count, and FFmpeg writes a transparent VP9 video the clip
 * shows, in the preview and in the export alike. Cached by the drawing's own id.
 */

interface Job {
  proc: ChildProcessWithoutNullStreams;
  tmp: string;
  out: string;
  frameBytes: number;
  done: Promise<void>;
}

const jobs = new Map<string, Job>();
const id = z.string().regex(/^[\w-]{1,80}$/);

const outPath = (key: string): string => {
  const dir = join(app.getPath("userData"), "cache", "generated");
  mkdirSync(dir, { recursive: true });
  return join(dir, `desenho-${key}.webm`);
};

async function finished(path: string): Promise<{ path: string; size: number }> {
  await desktopFiles.grantRead(path);
  return { path, size: (await stat(path)).size };
}

export function registerDrawingVideos(): void {
  ipcMain.handle("drawing:cached", async (_e, key: unknown) => {
    const out = outPath(id.parse(key));
    return existsSync(out) ? finished(out) : null;
  });

  ipcMain.handle(
    "drawing:begin",
    (_e, jobId: unknown, key: unknown, width: unknown, height: unknown, fps: unknown) => {
      const job = id.parse(jobId);
      if (jobs.has(job)) throw new Error("Já existe um desenho sendo gravado com esse ID.");
      const size = z.int().min(2).max(4096);
      const w = size.parse(width);
      const h = size.parse(height);
      const rate = z.number().positive().max(240).parse(fps);
      const out = outPath(id.parse(key));
      const tmp = out.replace(/\.webm$/, `.${job}.part.webm`);
      const proc = spawn(
        FFMPEG,
        [
          ...["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba"],
          ...["-s", `${w}x${h}`, "-r", String(rate), "-i", "-"],
          ...["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime"],
          ...["-cpu-used", "8", "-row-mt", "1", "-crf", "28", "-b:v", "0"],
          ...["-auto-alt-ref", "0", "-g", String(Math.max(1, Math.round(rate)))],
          ...["-f", "webm", tmp],
        ],
        { windowsHide: true },
      );
      let err = "";
      proc.stderr.on("data", (d: Buffer) => {
        err = (err + d.toString()).slice(-2000);
      });
      proc.stdin.on("error", () => undefined);
      const done = new Promise<void>((resolve, reject) => {
        proc.on("error", reject);
        proc.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`)),
        );
      });
      // Failures are read by end or cancel; until then nothing waits on it.
      done.catch(() => undefined);
      jobs.set(job, { proc, tmp, out, frameBytes: w * h * 4, done });
    },
  );

  /** `frames` holds `counts.length` frames back to back; frame k is written counts[k] times. */
  ipcMain.handle("drawing:frames", async (_e, jobId: unknown, frames: unknown, counts: unknown) => {
    const job = jobs.get(id.parse(jobId));
    if (!job) throw new Error("Cancelado");
    if (!(frames instanceof Uint8Array)) throw new Error("Quadros do desenho inválidos.");
    const repeat = z.array(z.int().positive().max(1_000_000)).min(1).max(256).parse(counts);
    if (frames.byteLength !== repeat.length * job.frameBytes)
      throw new Error("Quadros do desenho com o tamanho errado.");
    for (let k = 0; k < repeat.length; k++) {
      const f = Buffer.from(frames.buffer, frames.byteOffset + k * job.frameBytes, job.frameBytes);
      for (let r = 0; r < repeat[k]; r++)
        if (!job.proc.stdin.write(f))
          await new Promise((resolve) => job.proc.stdin.once("drain", resolve));
    }
  });

  ipcMain.handle("drawing:end", async (_e, jobId: unknown) => {
    const key = id.parse(jobId);
    const job = jobs.get(key);
    if (!job) throw new Error("Cancelado");
    jobs.delete(key);
    job.proc.stdin.end();
    await job.done;
    await rename(job.tmp, job.out);
    return finished(job.out);
  });

  ipcMain.handle("drawing:cancel", async (_e, jobId: unknown) => {
    const key = id.parse(jobId);
    const job = jobs.get(key);
    jobs.delete(key);
    if (!job) return;
    job.proc.kill("SIGKILL");
    await job.done.catch(() => undefined);
    await rm(job.tmp, { force: true });
  });
}
