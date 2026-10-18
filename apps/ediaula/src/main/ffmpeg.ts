import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, extname, join } from "node:path";
import { app } from "electron";
import { sourceMatrix, sourceRange } from "../shared/export/color.ts";
import { ENCODER_CHAIN, nextAfterFailure } from "../shared/export/encoding.ts";
import { hasAlpha, type MediaFacts } from "../shared/export/videoPlan.ts";
import { exportVideoArgs, proxyVideoArgs } from "../shared/exportPlan.ts";
import type { AssetKind, Encoder, Filmstrip, ProbeResult } from "../shared/types.ts";
import { scheduler } from "./scheduler.ts";

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
  /** Every piece of stderr as it comes (the run keeps only its tail for the error message). */
  onStderr?: (text: string) => void;
  /** Resolve with the end of stderr instead of stdout (measurements that print there). */
  capture?: "stderr";
}

/** A failed FFmpeg run: the last lines as the message, the end of everything it said as detail. */
export class FfmpegError extends Error {
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = "FfmpegError";
    this.detail = detail;
  }
}

/**
 * Runs ffmpeg/ffprobe, resolving with stdout text (or stderr, with `capture`). Rejects with the
 * tail of stderr on failure. Jobs named `<id>:<part>` are cancelled together with `<id>`.
 */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    opts.signal?.throwIfAborted();
    const withProgress = !!opts.onProgress && bin === FFMPEG;
    const fullArgs = withProgress ? ["-progress", "pipe:2", "-nostats", ...args] : args;
    const child = spawn(bin, fullArgs, { windowsHide: true, signal: opts.signal });
    if (opts.jobId) {
      running.set(opts.jobId, child);
      // Background work (proxies, exports): low priority while a take is recording.
      scheduler.track(child);
    }
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    child.stdout.on("data", (d: Buffer) => {
      if (opts.onStdout) opts.onStdout(d);
      else stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      opts.onStderr?.(text);
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
      else if (code === 0) resolve(opts.capture === "stderr" ? stderr : stdout);
      else if (signal || code === null) reject(new Error("Cancelado"));
      else {
        const said = stderr.split("\n").filter((l) => !/^\w+=/.test(l));
        reject(
          new FfmpegError(
            said.slice(-6).join("\n") || `ffmpeg saiu com código ${code}`,
            said.join("\n"),
          ),
        );
      }
    });
  });
}

/** Ends the job and every process started under it (`<jobId>:segment-3`, `<jobId>:audio`, …). */
export function cancel(jobId: string): void {
  for (const [id, child] of running)
    if (id === jobId || id.startsWith(`${jobId}:`)) child.kill("SIGKILL");
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
      pix_fmt?: string;
      color_space?: string;
      color_range?: string;
      tags?: Record<string, string>;
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
    alpha: !!video && hasAlpha(video.pix_fmt, video.tags),
    colorSpace: video?.color_space,
    colorRange: video?.color_range,
    pixFmt: video?.pix_fmt,
  };
}

const facts = new Map<string, Promise<MediaFacts>>();

/** What the export needs to know of a picture source, probed once per version of the file. */
export function mediaFacts(path: string): Promise<MediaFacts> {
  const st = statSync(path);
  const key = `${path}|${st.size}|${st.mtimeMs}`;
  let known = facts.get(key);
  if (!known) {
    known = probe(path).then((p) => ({
      matrix: sourceMatrix(p.colorSpace),
      range: sourceRange(p.colorRange, p.pixFmt),
      alpha: p.alpha,
      codec: p.videoCodec,
    }));
    // A file that could not be probed is probed again next time.
    known.catch(() => facts.delete(key));
    facts.set(key, known);
  }
  return known;
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

/** Bump when the analysis changes so cached motion files are made again. */
const MOTION_VERSION = 1;

/**
 * Where the picture of a screen recording stands still (FFmpeg freezedetect over 5 frames a
 * second at 480 px: a change of more than -50 dB for half a second is movement), cached beside
 * the media as motion.json ({version, frozen: [[from, to], …]} in seconds of the video). The
 * cleanup only cuts a pause where the screen is frozen (shared/activity.ts). `input` is what is
 * decoded: the proxy when it is ready, otherwise the media itself.
 */
export async function screenMotion(
  jobId: string,
  path: string,
  input: string,
  duration: number,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const out = join(cacheDir(path), `motion-v${MOTION_VERSION}.json`);
  if (existsSync(out)) return out;
  const frozen: [number, number][] = [];
  let from: number | null = null;
  let pending = "";
  const read = (line: string): void => {
    const start = /freeze_start:\s*([\d.]+)/.exec(line);
    if (start) from = Number(start[1]);
    const end = /freeze_end:\s*([\d.]+)/.exec(line);
    if (end && from !== null) {
      frozen.push([from, Number(end[1])]);
      from = null;
    }
  };
  await run(
    FFMPEG,
    [
      "-hide_banner",
      "-nostdin",
      "-threads",
      "2",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-vf",
      "fps=5,scale=480:-2,freezedetect=n=-50dB:d=0.5",
      "-an",
      "-f",
      "null",
      "-",
    ],
    {
      jobId,
      signal,
      duration,
      onProgress,
      onStderr: (text) => {
        const lines = (pending + text).split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) read(line);
      },
    },
  );
  read(pending);
  // Frozen to the end of the video.
  if (from !== null) frozen.push([from, duration]);
  const temp = `${out}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ version: MOTION_VERSION, frozen }));
  await rename(temp, out);
  return out;
}

let encoder: Promise<Encoder> | null = null;
/** Encoders that failed in a real export and on a test picture: the detector passes them over. */
const failedEncoders = new Set<Encoder>();

async function encodes(candidate: Encoder): Promise<boolean> {
  try {
    await run(FFMPEG, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=256x256:d=0.2",
      ...exportVideoArgs(candidate, 2000),
      "-f",
      "null",
      "-",
    ]);
    return true;
  } catch {
    return false; // missing, or this GPU and driver refuse it: the next one is tried
  }
}

/** The first encoder of the chain that works now (x264 always does). */
async function firstWorking(): Promise<Encoder> {
  for (const candidate of ENCODER_CHAIN)
    if (candidate === "x264" || (!failedEncoders.has(candidate) && (await encodes(candidate))))
      return candidate;
  return "x264";
}

/**
 * The export and proxy encoder: the first of NVENC, AMF and Media Foundation hardware that
 * actually encodes on this machine (being listed is not enough), otherwise x264.
 */
export function detectEncoder(): Promise<Encoder> {
  encoder ??= firstWorking();
  return encoder;
}

/**
 * An encoder failed in a real export, its segment again on its own: the next one of the chain
 * that encodes is returned. It is left out for the rest of the session only when it does not
 * encode a test picture either (shared/export/encoding.ts).
 */
export async function nextExportEncoder(failed: Encoder): Promise<Encoder> {
  const next = await nextAfterFailure(failed, encodes, failedEncoders);
  if (failedEncoders.has(failed)) encoder = null;
  return next;
}

/** VP9 with alpha for the working copy of transparent media (the browser plays it). */
const ALPHA_PROXY = [
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
  "30",
  "-b:v",
  "0",
  "-auto-alt-ref",
  "0",
  "-g",
  "15",
];

/** FFmpeg's own VP8/VP9 decoders drop the alpha plane; libvpx keeps it. */
export const alphaDecoder = (codec: string | undefined): string[] =>
  codec === "vp9" ? ["-c:v", "libvpx-vp9"] : codec === "vp8" ? ["-c:v", "libvpx"] : [];

/**
 * 720p, short-GOP proxy so 4K sources scrub smoothly in the preview. Media with transparency get
 * a VP9 WebM that keeps it, since an H.264 copy would lose it.
 */
export async function proxy(
  jobId: string,
  path: string,
  duration: number,
  onProgress: (r: number) => void,
  cfrFps?: number,
  signal?: AbortSignal,
  alpha = false,
): Promise<string> {
  const out = join(cacheDir(path), alpha ? "proxy-alpha.webm" : "proxy.mp4");
  if (existsSync(out)) return out;
  const tmp = alpha ? out.replace(".webm", ".part.webm") : out.replace(".mp4", ".part.mp4");
  const decoder = alpha ? alphaDecoder((await mediaFacts(path)).codec) : [];
  const video = alpha ? ALPHA_PROXY : proxyVideoArgs(await detectEncoder());
  const sound = alpha
    ? ["-c:a", "libopus", "-b:a", "128k"]
    : ["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"];
  // Variable frame rate sources get a constant-rate working copy so frame stepping is exact.
  const rate = cfrFps ? ["-fps_mode", "cfr", "-r", String(cfrFps)] : [];
  await run(
    FFMPEG,
    [
      "-y",
      "-v",
      "error",
      ...decoder,
      "-i",
      path,
      "-vf",
      "scale=-2:720",
      ...rate,
      ...video,
      ...sound,
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

/** Bump when the sheets change so cached filmstrips are made again. */
const FILMSTRIP_VERSION = 2;
/**
 * One picture every 2 s, 160 × 90, 30 to a row, ten minutes to a sheet (a 4800 × 900 JPEG at
 * most), so a long recording never makes one giant image; very long videos take a picture less
 * often.
 */
const FILMSTRIP = { step: 2, width: 160, height: 90, columns: 30, most: 2400, sheet: 600 };

/** The sheets of a filmstrip: where each one is and which pictures it holds. */
export function filmstripLayout(
  dir: string,
  duration: number,
): Filmstrip & { sheets: string[]; perSheet: number } {
  const step = Math.max(FILMSTRIP.step, duration / FILMSTRIP.most);
  const count = Math.max(1, Math.ceil(duration / step));
  const perSheet = Math.min(count, Math.max(1, Math.round(FILMSTRIP.sheet / step)));
  const columns = Math.min(FILMSTRIP.columns, perSheet);
  const sheets = Array.from({ length: Math.ceil(count / perSheet) }, (_, i) =>
    join(dir, `filmstrip-v${FILMSTRIP_VERSION}-${Math.round(step * 1000)}-${i}.jpg`),
  );
  return {
    path: sheets[0],
    sheets,
    perSheet,
    step,
    width: FILMSTRIP.width,
    height: FILMSTRIP.height,
    columns,
    count,
  };
}

/**
 * The filmstrip of a video (shared/types.ts Filmstrip): small pictures along it on JPEG sheets
 * of ten minutes each, cached beside the media; a sheet whose file is gone is made again.
 * `input` is what is decoded: the proxy when it is ready (smaller and quick to seek), otherwise
 * the media itself. Only key frames are decoded (-skip_frame nokey): a small picture every two
 * seconds does not need the frames between them, and a long recording is read many times faster.
 */
export function filmstrip(
  jobId: string,
  path: string,
  input: string,
  duration: number,
  signal?: AbortSignal,
): Promise<Filmstrip> {
  const strip = filmstripLayout(cacheDir(path), duration);
  // The same media asked twice at once (two lessons, two assets of one file) is made once.
  const known = makingStrips.get(strip.path);
  if (known) return known;
  const making = makeSheets(jobId, input, strip, signal).finally(() =>
    makingStrips.delete(strip.path),
  );
  makingStrips.set(strip.path, making);
  return making;
}

/** Filmstrips being made, by their first sheet. */
const makingStrips = new Map<string, Promise<Filmstrip>>();

async function makeSheets(
  jobId: string,
  input: string,
  strip: ReturnType<typeof filmstripLayout>,
  signal?: AbortSignal,
): Promise<Filmstrip> {
  const { width: w, height: h, step, columns, perSheet, count } = strip;
  for (const [i, out] of strip.sheets.entries()) {
    if (existsSync(out)) continue;
    const pictures = Math.min(perSheet, count - i * perSheet);
    const rows = Math.ceil(pictures / columns);
    const from = i * perSheet * step;
    const temp = out.replace(/\.jpg$/, `.${randomUUID()}.part.jpg`);
    try {
      await run(
        FFMPEG,
        [
          ...["-y", "-v", "error", "-nostdin", "-threads", "2", "-skip_frame", "nokey"],
          ...["-ss", from.toFixed(3), "-t", (pictures * step).toFixed(3)],
          ...["-i", input, "-map", "0:v:0", "-an"],
          "-vf",
          // Only key frames come out of the decoder: the last one is held to the end of the
          // sheet, or a video with few of them would never fill its tiles.
          `tpad=stop_mode=clone:stop_duration=${(pictures * step).toFixed(3)},fps=1/${step}:start_time=0:round=down,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,tile=${columns}x${rows}`,
          ...["-frames:v", "1", "-q:v", "5", temp],
        ],
        { jobId, signal, duration: pictures * step },
      );
      signal?.throwIfAborted();
      await rename(temp, out);
    } finally {
      await rm(temp, { force: true });
    }
  }
  return strip;
}

/** Sound for scrubbing: mono 16-bit PCM at this rate. */
export const SNIPPET_RATE = 24000;
const SNIPPETS_KEPT = 96;
/** Grains still worth reading: the newest one and the one before it. */
const TICKETS_KEPT = 2;

interface Snippet {
  /** The PCM, or null when a newer grain made the read pointless and it was stopped. */
  reading: Promise<Uint8Array | null>;
  /** The newest grain that asked for it. */
  ticket: number;
  settled: boolean;
  stop: AbortController;
}
const snippets = new Map<string, Snippet>();
let newestTicket = 0;

/**
 * `seconds` of the sound of `path` from `t`, as raw PCM (SNIPPET_RATE, mono, s16le), for the
 * sound of J, K, L, frame stepping and dragging the playhead. Reads take the scheduler's scrub
 * slots (two at a time); `ticket` is the grain asking, and reads only older grains still wait
 * for are stopped, so a fast drag never piles up FFmpeg processes. The last ones read are kept,
 * so going back and forth over the same stretch reads the file once.
 */
export function audioSnippet(
  path: string,
  t: number,
  seconds: number,
  ticket = 0,
): Promise<Uint8Array | null> {
  newestTicket = Math.max(newestTicket, ticket);
  const key = `${path}|${t.toFixed(3)}|${seconds.toFixed(3)}`;
  const known = snippets.get(key);
  if (known && !known.stop.signal.aborted) {
    known.ticket = Math.max(known.ticket, ticket);
    snippets.delete(key);
    snippets.set(key, known);
    return known.reading;
  }
  const stop = new AbortController();
  const chunks: Buffer[] = [];
  const reading = scheduler
    .run(
      "scrub",
      () =>
        run(
          FFMPEG,
          [
            ...["-v", "error", "-nostdin", "-ss", t.toFixed(3), "-t", seconds.toFixed(3)],
            ...["-i", path, "-vn", "-ac", "1", "-ar", String(SNIPPET_RATE), "-f", "s16le"],
            "pipe:1",
          ],
          { onStdout: (chunk) => chunks.push(chunk), signal: stop.signal },
        ),
      stop.signal,
    )
    .then(
      () => new Uint8Array(Buffer.concat(chunks)),
      (error: unknown) => {
        if (snippets.get(key)?.reading === reading) snippets.delete(key);
        // Stopped on purpose: nothing went wrong, there is just no sound to give.
        if (stop.signal.aborted) return null;
        throw error;
      },
    );
  const entry: Snippet = { reading, ticket, settled: false, stop };
  void reading.then(
    () => {
      entry.settled = true;
    },
    () => {
      entry.settled = true;
    },
  );
  snippets.set(key, entry);
  for (const other of snippets.values())
    if (!other.settled && other.ticket <= newestTicket - TICKETS_KEPT) other.stop.abort();
  while (snippets.size > SNIPPETS_KEPT) {
    const oldest = snippets.keys().next().value;
    if (oldest === undefined) break;
    snippets.delete(oldest);
  }
  return reading;
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
