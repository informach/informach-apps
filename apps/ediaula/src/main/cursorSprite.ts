import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { z } from "zod";
import { SOUND_EFFECT_IDS } from "../shared/soundEffects.ts";
import { cursorClicksPath, cursorSpritePath } from "./cursor-sprite-path.ts";
import { cacheDir, FFMPEG } from "./ffmpeg.ts";
import { samplesOf, writeSoundTrack } from "./soundTrack.ts";

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

/** Most clicks in one recording's sound, and its longest length (a week, like the project). */
const clickTimes = z
  .instanceof(Float64Array)
  .refine((times) => times.length <= 200_000 && times.every((t) => Number.isFinite(t) && t >= 0));
const clickVolume = z.number().min(0).max(1);
const clickSound = z.enum(SOUND_EFFECT_IDS);
const clickDuration = z
  .number()
  .positive()
  .max(7 * 86400);

const spritePath = (path: string, id: string): string => cursorSpritePath(cacheDir(path), id);

export function registerCursorSprites(): void {
  ipcMain.handle("cursor:cached", (_e, path: string, id: string) => {
    const out = spritePath(path, id);
    return existsSync(out) ? out : null;
  });

  ipcMain.handle(
    "cursor:begin",
    (_e, jobId: string, path: string, id: string, size: number, fps: number, height?: unknown) => {
      if (jobs.has(jobId)) throw new Error("Já existe um processamento de cursor com esse ID.");
      // An animated annotation is as tall as its picture; the pointer sprite is square.
      const tall =
        height === undefined || height === null ? size : z.int().min(2).max(8192).parse(height);
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
          `${size}x${tall}`,
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

  ipcMain.handle(
    "cursor:clicks",
    async (
      _e,
      path: unknown,
      id: unknown,
      times: unknown,
      volume: unknown,
      duration: unknown,
      sound: unknown,
    ) => {
      const media = z.string().min(1).max(32768).parse(path);
      // The cache sits beside a media the editor was given, never beside any path.
      await desktopFiles.assertRead(media);
      const out = cursorClicksPath(cacheDir(media), id);
      if (existsSync(out)) return out;
      const sorted = [...clickTimes.parse(times)].sort((a, b) => a - b);
      const level = clickVolume.parse(volume);
      const samples = samplesOf(clickSound.parse(sound ?? "clique"));
      await writeSoundTrack(
        FFMPEG,
        out,
        sorted.map((at) => ({ at, samples, volume: level })),
        clickDuration.parse(duration),
      );
      return out;
    },
  );

  ipcMain.handle("cursor:cancel", async (_e, jobId: string) => {
    const job = jobs.get(jobId);
    jobs.delete(jobId);
    if (!job) return;
    job.proc.kill("SIGKILL");
    await job.done.catch(() => undefined);
    await rm(job.tmp, { force: true });
  });
}
