import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { type ChromaKey, detectScreen, keyId, keySize } from "../shared/chroma.ts";
import { cacheDir, FFMPEG } from "./ffmpeg.ts";
import createKeyWorker from "./keyWorker?nodeWorker";
import { scheduler } from "./scheduler.ts";

const SCALE = "flags=lanczos+accurate_rnd+full_chroma_int";

/** Running renders, so they can be cancelled. */
const running = new Map<string, () => void>();

export function cancelKey(jobId: string): boolean {
  const stop = running.get(jobId);
  if (!stop) return false;
  stop();
  return true;
}

/** One RGB frame of `path` at `t` seconds, sized like the keyed video (or to fit `maxSide`). */
export function grabFrame(
  path: string,
  t: number,
  width: number,
  height: number,
  maxSide?: number,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const size = keySize(width, height);
  const s = maxSide ? Math.min(1, maxSide / Math.max(size.width, size.height)) : 1;
  const w = Math.max(2, Math.round((size.width * s) / 2) * 2);
  const h = Math.max(2, Math.round((size.height * s) / 2) * 2);
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      [
        "-v",
        "error",
        "-ss",
        String(Math.max(0, t)),
        "-i",
        path,
        "-frames:v",
        "1",
        "-vf",
        `scale=${w}:${h}:${SCALE},format=rgb24`,
        "-f",
        "rawvideo",
        "-",
      ],
      {
        windowsHide: true,
      },
    );
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => {
      const data = Buffer.concat(chunks);
      if (code !== 0 || data.length < w * h * 3)
        reject(new Error(err.trim() || "Não foi possível ler o quadro."));
      else
        resolve({
          width: w,
          height: h,
          data: new Uint8Array(data.buffer, data.byteOffset, w * h * 3),
        });
    });
  });
}

/** The solid screen color behind an avatar, or null when the video has a regular background. */
export async function detectScreenColor(
  path: string,
  duration: number,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const f = await grabFrame(path, Math.min(1, duration / 2), width, height, 320);
    return detectScreen(f.data, 3, f.width, f.height);
  } catch {
    return null;
  }
}

/**
 * Renders `path` with its background removed into a cached WebM (VP9 with alpha), which the
 * preview plays and the export composites. Frames are keyed in parallel worker threads.
 */
export function renderKeyed(
  jobId: string,
  path: string,
  width: number,
  height: number,
  fps: number,
  duration: number,
  key: ChromaKey,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const out = join(cacheDir(path), `key-${keyId(key)}.webm`);
  if (existsSync(out)) return Promise.resolve(out);
  const tmp = out.replace(".webm", `.${randomUUID()}.part.webm`);
  const { width: w, height: h } = keySize(width, height);
  const rate = fps > 0 ? String(Math.round(fps * 1000) / 1000) : "30";
  const frameBytes = w * h * 3;
  const total = Math.max(1, Math.round(duration * (fps || 30)));
  const poolSize = Math.max(1, Math.min(6, Math.floor(cpus().length / 3)));

  return new Promise((resolve, reject) => {
    const workers: Worker[] = Array.from({ length: poolSize }, () => createKeyWorker({}));
    const idle = [...workers];
    const dec = spawn(
      FFMPEG,
      [
        "-v",
        "error",
        "-i",
        path,
        "-an",
        "-sn",
        "-vf",
        `scale=${w}:${h}:${SCALE},format=rgb24`,
        "-r",
        rate,
        "-f",
        "rawvideo",
        "-",
      ],
      { windowsHide: true },
    );
    scheduler.track(dec);
    // A keyframe every second keeps scrubbing in the preview responsive.
    const enc = spawn(
      FFMPEG,
      [
        "-v",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        `${w}x${h}`,
        "-r",
        rate,
        "-i",
        "-",
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-deadline",
        "realtime",
        "-cpu-used",
        "5",
        "-row-mt",
        "1",
        "-crf",
        "18",
        "-b:v",
        "0",
        "-auto-alt-ref",
        "0",
        "-g",
        String(Math.max(1, Math.round(fps || 30))),
        "-f",
        "webm",
        tmp,
      ],
      { windowsHide: true },
    );
    scheduler.track(enc);

    let finished = false;
    let decoded = false;
    let seq = 0;
    let nextOut = 0;
    let inflight = 0;
    let encErr = "";
    let decErr = "";
    const waiting: { seq: number; data: Uint8Array }[] = [];
    const done = new Map<number, Uint8Array>();
    let frame = Buffer.allocUnsafeSlow(frameBytes);
    let filled = 0;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", abort);
      running.delete(jobId);
      for (const wk of workers) void wk.terminate();
    };
    const fail = (err: Error): void => {
      if (finished) return;
      finished = true;
      cleanup();
      dec.kill("SIGKILL");
      enc.kill("SIGKILL");
      void rm(tmp, { force: true });
      reject(err);
    };
    running.set(jobId, () => fail(new Error("Cancelado")));
    const abort = (): void => fail(new Error("edi_job_preservation_expired"));
    signal?.addEventListener("abort", abort, { once: true });

    const busy = (): boolean =>
      inflight + waiting.length + done.size >= poolSize * 3 ||
      enc.stdin.writableLength > 64 * 1024 * 1024;
    const maybeResume = (): void => {
      if (!finished && dec.stdout.isPaused() && !busy()) dec.stdout.resume();
    };
    const dispatch = (): void => {
      while (idle.length && waiting.length) {
        const job = waiting.shift()!;
        const wk = idle.pop()!;
        inflight++;
        wk.postMessage({ seq: job.seq, data: job.data, width: w, height: h, key }, [
          job.data.buffer as ArrayBuffer,
        ]);
      }
    };
    const flush = (): void => {
      while (done.has(nextOut)) {
        const data = done.get(nextOut)!;
        done.delete(nextOut);
        enc.stdin.write(data);
        nextOut++;
        if (nextOut % 10 === 0) onProgress(Math.min(0.99, nextOut / total));
      }
      if (decoded && nextOut === seq && inflight === 0 && !finished) enc.stdin.end();
      maybeResume();
    };

    for (const wk of workers) {
      wk.on("message", (m: { seq: number; data: Uint8Array }) => {
        inflight--;
        idle.push(wk);
        done.set(m.seq, m.data);
        dispatch();
        flush();
      });
      wk.on("error", (e) => fail(e as Error));
    }

    dec.stdout.on("data", (chunk: Buffer) => {
      let off = 0;
      while (off < chunk.length) {
        const n = Math.min(frameBytes - filled, chunk.length - off);
        chunk.copy(frame, filled, off, off + n);
        filled += n;
        off += n;
        if (filled === frameBytes) {
          // Each frame owns its memory, so it can be handed to a worker without copying.
          waiting.push({
            seq: seq++,
            data: new Uint8Array(frame.buffer, frame.byteOffset, frameBytes),
          });
          frame = Buffer.allocUnsafeSlow(frameBytes);
          filled = 0;
        }
      }
      dispatch();
      if (busy()) dec.stdout.pause();
    });
    enc.stdin.on("drain", maybeResume);
    enc.stdin.on("error", () => undefined);
    dec.stderr.on("data", (d: Buffer) => (decErr = (decErr + d.toString()).slice(-2000)));
    enc.stderr.on("data", (d: Buffer) => (encErr = (encErr + d.toString()).slice(-2000)));
    dec.on("error", fail);
    enc.on("error", fail);
    dec.on("close", (code) => {
      if (finished) return;
      if (code !== 0)
        return fail(new Error(decErr.trim() || `Falha ao ler o vídeo (código ${code}).`));
      decoded = true;
      flush();
    });
    enc.on("close", async (code) => {
      if (finished) return;
      if (code !== 0)
        return fail(
          new Error(encErr.trim() || `Falha ao gravar o vídeo recortado (código ${code}).`),
        );
      finished = true;
      cleanup();
      try {
        signal?.throwIfAborted();
        if (existsSync(out)) await rm(tmp, { force: true });
        else await rename(tmp, out);
        onProgress(1);
        resolve(out);
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}
