import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  applyFilter,
  chainFilter,
  chainKey,
  chooseNoiseReduction,
  type FfmpegCaps,
  ffmpegMajor,
  type LoudnormStats,
  levelFilter,
  limiterFor,
  linearFits,
  measureFilter,
  type NoiseReduction,
  parseFilterList,
  parseLoudnorm,
  quietestStretch,
  VOICE_CHAIN_VERSION,
  type VoicePreset,
  withWarmup,
} from "../shared/voiceChain.ts";
import { pruneCache, touch, VOICE_CACHE_BYTES } from "./cachePrune.ts";

/**
 * Runs the voice chain of shared/voiceChain.ts on a media file and keeps the result: a mono
 * 48 kHz WAV under `cacheRoot/voz/<hash of the source's bytes>/`, named by the preset, the hash
 * of what the chain covers and the chain's version. Asking again for the same source and preset
 * gives the same file without running FFmpeg. Three passes: the level (and the quietest stretch,
 * for the FFT denoiser), the chain with loudnorm measuring, and the linear loudnorm.
 */

export interface TreatOptions {
  ffmpeg: string;
  source: string;
  preset: Exclude<VoicePreset, "off">;
  /** Folder the cache lives in (userData/cache in the app). */
  cacheRoot: string;
  /** Most bytes the treated voices may take (the least recently used go first). */
  cacheBytes?: number;
  /** RNNoise model file, null when it is not shipped. */
  model: string | null;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
  /** Each FFmpeg child (the scheduler lowers its priority during a take). */
  track?: (child: ChildProcess) => void;
}

export interface TreatResult {
  path: string;
  preset: VoicePreset;
  version: number;
  /** Which noise reduction ran. */
  noise: NoiseReduction["kind"];
  /** loudnorm's last word: "linear" when one gain did it. */
  normalization?: string;
  /** Integrated loudness loudnorm expects at the output. */
  loudness?: number;
  /** The file was already in the cache. */
  cached: boolean;
}

const capsCache = new Map<string, Promise<FfmpegCaps>>();

/** Version and filters of an FFmpeg binary, read once. */
export function ffmpegCaps(ffmpeg: string): Promise<FfmpegCaps> {
  let caps = capsCache.get(ffmpeg);
  if (!caps) {
    caps = Promise.all([
      pass(ffmpeg, ["-hide_banner", "-version"], { stdout: true }),
      pass(ffmpeg, ["-hide_banner", "-filters"], { stdout: true }),
    ]).then(([version, filters]) => ({
      major: ffmpegMajor(version.stdout),
      filters: parseFilterList(filters.stdout),
    }));
    caps.catch(() => capsCache.delete(ffmpeg));
    capsCache.set(ffmpeg, caps);
  }
  return caps;
}

/** sha256 of a file's bytes, 20 hex digits. */
export function fileHash(path: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path, { signal });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex").slice(0, 20)));
  });
}

const short = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 10);

/** Where the treated file of this source and chain goes. */
export function treatedFile(cacheRoot: string, sourceHash: string, key: string, preset: string) {
  return join(cacheRoot, "voz", sourceHash, `${preset}-${short(key)}-v${VOICE_CHAIN_VERSION}.wav`);
}

interface PassResult {
  stdout: string;
  stderr: string;
}

/**
 * One FFmpeg run; resolves with what it printed (stderr keeps its last 64 kB, where loudnorm
 * writes its JSON). `onBytes` takes stdout as it comes instead of keeping it.
 */
export function pass(
  ffmpeg: string,
  args: string[],
  o: {
    stdout?: boolean;
    onBytes?: (chunk: Buffer) => void;
    signal?: AbortSignal;
    duration?: number;
    onProgress?: (ratio: number) => void;
    track?: (child: ChildProcess) => void;
  } = {},
): Promise<PassResult> {
  return new Promise((resolve, reject) => {
    o.signal?.throwIfAborted();
    const progress = !!o.onProgress && !!o.duration;
    const child = spawn(ffmpeg, progress ? ["-progress", "pipe:2", ...args] : args, {
      windowsHide: true,
      signal: o.signal,
    });
    o.track?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      if (o.onBytes) o.onBytes(d);
      else if (o.stdout) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr = (stderr + text).slice(-65536);
      if (progress) {
        const all = [...text.matchAll(/out_time_us=(\d+)/g)];
        const last = all.at(-1);
        if (last) o.onProgress?.(Math.min(1, Number(last[1]) / 1e6 / (o.duration ?? 1)));
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (o.signal?.aborted) reject(o.signal.reason);
      else if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            stderr
              .split(/\r?\n/)
              .filter((l) => l.trim() && !/^\w+=/.test(l))
              .slice(-6)
              .join("\n") || `o FFmpeg saiu com código ${code}`,
          ),
        );
    });
  });
}

/**
 * Mono 48 kHz before anything else (every pass hears the same thing), from the file's second 0:
 * a sound that starts later in its file (an MP4 whose audio begins after the picture) is padded
 * with silence, so the treated voice keeps the source's timing.
 */
const PREPARE = "aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=mono";
/** Levels for the quietest stretch: 8 kHz 16-bit, RMS per 50 ms. */
const LEVEL_RATE = 8000;
const LEVEL_FRAME = 400;

export async function treatVoice(o: TreatOptions): Promise<TreatResult> {
  const caps = await ffmpegCaps(o.ffmpeg);
  const sourceHash = await fileHash(o.source, o.signal);
  // The key depends on the method, not on the measured values: those come from the source.
  const method = chooseNoiseReduction(caps, o.model);
  const key = chainKey(o.preset, method);
  const out = treatedFile(o.cacheRoot, sourceHash, key, o.preset);
  if (existsSync(out)) {
    // Used again: the cache cleanup keeps what is in use.
    await touch(out);
    return {
      path: out,
      preset: o.preset,
      version: VOICE_CHAIN_VERSION,
      noise: method.kind,
      cached: true,
    };
  }
  mkdirSync(join(out, ".."), { recursive: true });
  const progress = (from: number, to: number) => (r: number) =>
    o.onProgress?.(from + (to - from) * r);

  // 1. Level, length and the quietest stretch.
  const levels: number[] = [];
  let carry: Buffer | null = null;
  let squares = 0;
  let count = 0;
  const first = await pass(
    o.ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-y",
      "-i",
      o.source,
      "-filter_complex",
      `[0:a:0]${PREPARE},asplit[a][b];[a]${levelFilter(o.preset)}[x];[b]aresample=${LEVEL_RATE},aformat=sample_fmts=s16:channel_layouts=mono[y]`,
      "-map",
      "[x]",
      "-f",
      "null",
      "-",
      "-map",
      "[y]",
      "-f",
      "s16le",
      "pipe:1",
    ],
    {
      signal: o.signal,
      track: o.track,
      onBytes: (chunk) => {
        const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
        const even = buf.length - (buf.length % 2);
        carry = even < buf.length ? buf.subarray(even) : null;
        for (let i = 0; i < even; i += 2) {
          const v = buf.readInt16LE(i) / 32768;
          squares += v * v;
          if (++count === LEVEL_FRAME) {
            levels.push(Math.sqrt(squares / count));
            squares = 0;
            count = 0;
          }
        }
      },
    },
  );
  o.onProgress?.(0.15);
  const duration = (levels.length * LEVEL_FRAME) / LEVEL_RATE;
  const level = parseLoudnorm(first.stderr).input_i;
  const quiet = quietestStretch(levels, LEVEL_RATE / LEVEL_FRAME) ?? undefined;
  // Up to a second of warm-up before the source (withWarmup): the noise profile's times move.
  const warm = duration >= 0.5 ? Math.min(1, duration) : 0;
  const nr = chooseNoiseReduction(caps, o.model, quiet && [quiet[0] + warm, quiet[1] + warm]);
  const chain = chainFilter(o.preset, nr, level);
  if (!chain) throw new Error("Este ajuste não trata a voz.");

  // 2. The chain, kept in floating point, while loudnorm measures it.
  const staged = `${out}.chain.partial.wav`;
  const partial = `${out}.partial.wav`;
  try {
    const second = await pass(
      o.ffmpeg,
      [
        "-hide_banner",
        "-nostats",
        "-y",
        "-i",
        o.source,
        "-filter_complex",
        // The rate stays 48 kHz along the chain (its sample counts are at 48 kHz): loudnorm's own
        // 192 kHz is made on the measuring branch only.
        `[0:a:0]${PREPARE},${withWarmup(chain, Math.round(warm * 48000))},aformat=sample_rates=48000,asplit[o][m];[m]aresample=192000,${measureFilter()}[mm]`,
        "-map",
        "[o]",
        "-c:a",
        "pcm_f32le",
        "-f",
        "wav",
        staged,
        "-map",
        "[mm]",
        "-f",
        "null",
        "-",
      ],
      { signal: o.signal, track: o.track, duration, onProgress: progress(0.15, 0.85) },
    );
    let measured: LoudnormStats = parseLoudnorm(second.stderr);
    // A peak that one gain would push over the target is limited first (from the staged file,
    // without running the denoiser again), and loudnorm measures that.
    const limiter = linearFits(measured) ? null : limiterFor(measured);
    if (limiter)
      measured = parseLoudnorm(
        (
          await pass(
            o.ffmpeg,
            [
              "-hide_banner",
              "-nostats",
              "-i",
              staged,
              "-af",
              `${limiter},${measureFilter()}`,
              "-f",
              "null",
              "-",
            ],
            { signal: o.signal, track: o.track },
          )
        ).stderr,
      );

    // 3. One linear gain to the target loudness.
    const third = await pass(
      o.ffmpeg,
      [
        "-hide_banner",
        "-nostats",
        "-y",
        "-i",
        staged,
        "-af",
        limiter ? `${limiter},${applyFilter(measured)}` : applyFilter(measured),
        "-ar",
        "48000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        partial,
      ],
      { signal: o.signal, track: o.track, duration, onProgress: progress(0.85, 1) },
    );
    o.signal?.throwIfAborted();
    await rename(partial, out);
    await pruneCache(join(o.cacheRoot, "voz"), o.cacheBytes ?? VOICE_CACHE_BYTES, out);
    const final = /"input_i"/.test(third.stderr) ? parseLoudnorm(third.stderr) : null;
    o.onProgress?.(1);
    return {
      path: out,
      preset: o.preset,
      version: VOICE_CHAIN_VERSION,
      noise: nr.kind,
      ...(final?.normalization_type ? { normalization: final.normalization_type } : {}),
      ...(final?.output_i !== undefined ? { loudness: final.output_i } : {}),
      cached: false,
    };
  } finally {
    await rm(staged, { force: true });
    await rm(partial, { force: true });
  }
}
