import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { cursorSpritePath } from "./cursor-sprite-path.ts";
import { cacheDir, FFMPEG } from "./ffmpeg.ts";

/**
 * Encodes the pointer sprite frames drawn by the renderer (same drawing as the preview) into a
 * small transparent video, cached per recording and pointer settings. Frames that repeat (a
 * still pointer) are sent once with a count.
 */

interface Job {
  proc: ChildProcessWithoutNullStreams;
  tmp: string;
  out: string;
  done: Promise<void>;
}

const jobs = new Map<string, Job>();
const spritePath = (path: string, id: string): string => cursorSpritePath(cacheDir(path), id);

export function registerCursorSprites(): void {
  ipcMain.handle("cursor:cached", (_e, path: string, id: string) => {
    const out = spritePath(path, id);
    return existsSync(out) ? out : null;
  });

  ipcMain.handle(
    "cursor:begin",
    (_e, jobId: string, path: string, id: string, size: number, fps: number) => {
      if (jobs.has(jobId)) throw new Error("Já existe um processamento de cursor com esse ID.");
      const out = spritePath(path, id);
      const tmp = out.replace(".webm", ".part.webm");
      const proc = spawn(
        FFMPEG,
        [
          "-y",
          "-v",
          "error",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "-s",
          `${size}x${size}`,
          "-r",
          String(fps),
          "-i",
          "-",
          "-c:v",
          "libvpx-vp9",
          "-pix_fmt",
          "yuva420p",
          "-deadline",
          "realtime",
          "-cpu-used",
          "8",
          "-row-mt",
          "1",
          "-crf",
          "24",
          "-b:v",
          "0",
          "-auto-alt-ref",
          "0",
          "-g",
          String(Math.round(fps)),
          tmp,
        ],
        { windowsHide: true },
      );
      let err = "";
      proc.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
      proc.stdin.on("error", () => undefined);
      const done = new Promise<void>((resolve, reject) =>
        proc.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(err.trim() || `ffmpeg saiu com código ${code}`)),
        ),
      );
      jobs.set(jobId, { proc, tmp, out, done });
    },
  );

  /** `frames` holds `counts.length` frames back to back; frame k is written counts[k] times. */
  ipcMain.handle(
    "cursor:frames",
    async (_e, jobId: string, frames: Uint8Array, counts: number[]) => {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Cancelado");
      const size = frames.length / counts.length;
      for (let k = 0; k < counts.length; k++) {
        const f = Buffer.from(frames.buffer, frames.byteOffset + k * size, size);
        for (let r = 0; r < counts[k]; r++)
          if (!job.proc.stdin.write(f))
            await new Promise((res) => job.proc.stdin.once("drain", res));
      }
    },
  );

  ipcMain.handle("cursor:end", async (_e, jobId: string) => {
    const job = jobs.get(jobId);
    if (!job) throw new Error("Cancelado");
    jobs.delete(jobId);
    job.proc.stdin.end();
    await job.done;
    await rename(job.tmp, job.out);
    return job.out;
  });

  ipcMain.handle("cursor:cancel", async (_e, jobId: string) => {
    const job = jobs.get(jobId);
    jobs.delete(jobId);
    if (!job) return;
    job.proc.kill("SIGKILL");
    await job.done.catch(() => undefined);
    await rm(job.tmp, { force: true });
  });
}
