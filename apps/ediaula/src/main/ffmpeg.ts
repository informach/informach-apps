import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";
import { app } from "electron";
import type { AssetKind, Encoder, ProbeResult } from "../shared/types.ts";

function nativeMediaBinary(name: "ffmpeg" | "ffprobe"): string {
  // Release binaries and their complete corresponding source are signed together
  // in the installation inventory. Environment overrides apply only in development.
  if (app.isPackaged) return join(process.resourcesPath, "native-media", "bin", `${name}.exe`);
  const developmentRequire = createRequire(import.meta.url);
  const binary: unknown =
    name === "ffmpeg"
      ? developmentRequire("ffmpeg-static")
      : developmentRequire("@derhuerst/ffprobe-static");
  if (typeof binary !== "string") throw new Error(`${name} is unavailable for this platform`);
  return binary;
}
export const FFMPEG = nativeMediaBinary("ffmpeg");
export const FFPROBE = nativeMediaBinary("ffprobe");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);

const running = new Map<string, ChildProcess>();

export interface RunOptions {
  jobId?: string;
  signal?: AbortSignal;
  /** Total seconds of output, used to turn ffmpeg's out_time into a 0..1 ratio. */
  duration?: number;
  onProgress?: (ratio: number) => void;
  onStdout?: (chunk: Buffer) => void;
}

/** Runs ffmpeg/ffprobe, resolving with stdout text. Rejects with the tail of stderr on failure. */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    opts.signal?.throwIfAborted();
    const withProgress = !!opts.onProgress && bin === FFMPEG;
    const fullArgs = withProgress ? ["-progress", "pipe:2", "-nostats", ...args] : args;
    const child = spawn(bin, fullArgs, { windowsHide: true, signal: opts.signal });
    if (opts.jobId) running.set(opts.jobId, child);
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    child.stdout.on("data", (d: Buffer) => {
      if (opts.onStdout) opts.onStdout(d);
      else stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr = (stderr + text).slice(-8000);
      if (withProgress && opts.duration) {
        const m = /out_time_us=(\d+)/g;
        let last: RegExpExecArray | null = null;
        for (let r = m.exec(text); r; r = m.exec(text)) last = r;
        if (last) opts.onProgress!(Math.min(1, Number(last[1]) / 1e6 / opts.duration));
      }
    });
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code, signal) => {
      if (opts.jobId) running.delete(opts.jobId);
      // Wait until the file handles close before the caller removes staged output.
      if (failure) reject(failure);
      else if (opts.signal?.aborted) reject(opts.signal.reason);
      else if (code === 0) resolve(stdout);
      else if (signal || code === null) reject(new Error("Cancelado"));
      else
        reject(
          new Error(
            stderr
              .split("\n")
              .filter((l) => !/^\w+=/.test(l))
              .slice(-6)
              .join("\n") || `ffmpeg saiu com código ${code}`,
          ),
        );
    });
  });
}

export function cancel(jobId: string): void {
  running.get(jobId)?.kill("SIGKILL");
}

/** Per-file cache folder, keyed by path, size and modification time so edits invalidate it. */
export function cacheDir(path: string): string {
  const st = statSync(path);
  const key = createHash("sha1")
    .update(`${path}|${st.size}|${st.mtimeMs}`)
    .digest("hex")
    .slice(0, 16);
  const dir = join(app.getPath("userData"), "cache", key);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const parseRate = (r?: string): number => {
  if (!r) return 0;
  const [a, b] = r.split("/").map(Number);
  return b ? a / b : a;
};

function isVariableRate(nominal: number, average: number): boolean {
  if (!nominal || !average) return false;
  return Math.abs(nominal - average) / nominal > 0.02;
}

export async function probe(path: string): Promise<ProbeResult> {
  const out = await run(FFPROBE, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  const info = JSON.parse(out) as {
    format?: { duration?: string; size?: string; format_name?: string };
    streams?: {
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      duration?: string;
      disposition?: { attached_pic?: number };
    }[];
  };
  const streams = info.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === "audio");
  const isImage =
    IMAGE_EXT.has(extname(path).toLowerCase()) ||
    /image2|_pipe$/.test(info.format?.format_name ?? "");
  const kind: AssetKind = isImage ? "image" : video ? "video" : "audio";
  if (!video && !audio) throw new Error("Arquivo sem vídeo ou áudio reconhecível.");
  const duration = isImage
    ? 0
    : Number(info.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  return {
    kind,
    duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps:
      Math.round((parseRate(video?.avg_frame_rate) || parseRate(video?.r_frame_rate) || 0) * 100) /
      100,
    hasVideo: !!video,
    hasAudio: !!audio && !isImage,
    size: Number(info.format?.size ?? statSync(path).size),
    videoCodec: video?.codec_name,
    // Screen recorders often write variable frame rate; nominal and average rates then disagree.
    vfr:
      !isImage &&
      !!video &&
      isVariableRate(parseRate(video.r_frame_rate), parseRate(video.avg_frame_rate)),
  };
}

export async function thumbnail(path: string, kind: AssetKind, duration: number): Promise<string> {
  const out = join(cacheDir(path), "thumb.jpg");
  if (existsSync(out)) return out;
  if (kind === "audio") return "";
  const at = kind === "video" ? Math.min(Math.max(duration * 0.1, 0), 5) : 0;
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    ...(kind === "video" ? ["-ss", String(at)] : []),
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-2",
    "-q:v",
    "4",
    out,
  ]);
  return out;
}

/** Use one audio-only source for listening, transcription and the saved narration. */
export async function prepareGuidedNarration(path: string): Promise<string> {
  const info = await probe(path);
  if (!info.hasAudio)
    throw new Error(
      "O arquivo selecionado não tem faixa de áudio. Exporte o MP4 do HeyGen com a voz incluída.",
    );
  if (!info.hasVideo) return path;
  const out = join(cacheDir(path), `${basename(path, extname(path))}-voz.wav`);
  if (existsSync(out)) return out;
  const temp = out + ".partial.wav";
  try {
    await run(FFMPEG, [
      "-y",
      "-v",
      "error",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-vn",
      "-af",
      "aresample=48000:async=1:first_pts=0",
      "-c:a",
      "pcm_s16le",
      temp,
    ]);
    await rename(temp, out);
    return out;
  } finally {
    await rm(temp, { force: true });
  }
}

/** Peaks per second stored in waveform files. */
export const PEAKS_PER_SECOND = 100;

export async function waveform(path: string): Promise<string> {
  const out = join(cacheDir(path), "waveform.json");
  if (existsSync(out)) return out;
  const rate = 8000;
  const window = rate / PEAKS_PER_SECOND;
  const peaks: number[] = [];
  let peak = 0;
  let count = 0;
  let carry: Buffer | null = null;
  await run(
    FFMPEG,
    ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(rate), "-f", "s16le", "pipe:1"],
    {
      onStdout: (chunk) => {
        const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
        const even = buf.length - (buf.length % 2);
        carry = even < buf.length ? buf.subarray(even) : null;
        for (let i = 0; i < even; i += 2) {
          const v = Math.abs(buf.readInt16LE(i));
          if (v > peak) peak = v;
          if (++count === window) {
            peaks.push(peak);
            peak = 0;
            count = 0;
          }
        }
      },
    },
  );
  if (count) peaks.push(peak);
  let max = 1;
  for (const p of peaks) if (p > max) max = p;
  const norm = peaks.map((p) => Math.round((p / max) * 1000) / 1000);
  await writeFile(out, JSON.stringify({ peaksPerSecond: PEAKS_PER_SECOND, peaks: norm }));
  return out;
}

let encoder: Encoder | null = null;

/** Detects whether NVENC actually works on this machine (being listed is not enough). */
export async function detectEncoder(): Promise<Encoder> {
  if (encoder) return encoder;
  try {
    await run(FFMPEG, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=256x256:d=0.2",
      "-c:v",
      "h264_nvenc",
      "-f",
      "null",
      "-",
    ]);
    encoder = "nvenc";
  } catch {
    encoder = "x264";
  }
  return encoder;
}

/** 720p, short-GOP proxy so 4K sources scrub smoothly in the preview. */
export async function proxy(
  jobId: string,
  path: string,
  duration: number,
  onProgress: (r: number) => void,
  cfrFps?: number,
  signal?: AbortSignal,
): Promise<string> {
  const out = join(cacheDir(path), "proxy.mp4");
  if (existsSync(out)) return out;
  const tmp = out.replace(".mp4", ".part.mp4");
  const enc = await detectEncoder();
  const video =
    enc === "nvenc"
      ? ["-c:v", "h264_nvenc", "-preset", "p2", "-cq", "28", "-g", "15"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "15"];
  // Variable frame rate sources get a constant-rate working copy so frame stepping is exact.
  const rate = cfrFps ? ["-fps_mode", "cfr", "-r", String(cfrFps)] : [];
  await run(
    FFMPEG,
    [
      "-y",
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      "scale=-2:720",
      ...rate,
      ...video,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmp,
    ],
    {
      jobId,
      duration,
      onProgress,
      signal,
    },
  );
  signal?.throwIfAborted();
  await rename(tmp, out);
  return out;
}

/** A still PNG of `path` at `t` seconds (full resolution), cached; used to hold the screen during an insert. */
export async function stillFrame(path: string, t: number, alpha = false): Promise<string> {
  const out = join(cacheDir(path), `still-${alpha ? "alpha-" : ""}${Math.round(t * 1000)}.png`);
  if (existsSync(out)) return out;
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-ss",
    String(Math.max(0, t)),
    ...(alpha ? ["-c:v", "libvpx-vp9"] : []),
    "-i",
    path,
    "-frames:v",
    "1",
    out,
  ]);
  return out;
}

export async function writeFilterScript(text: string, ext = "txt"): Promise<string> {
  const dir = join(app.getPath("temp"), "ediaula");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
  await writeFile(file, text, "utf8");
  return file;
}
