import { createHash } from "node:crypto";
import { rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUTPUT_COLOR_ARGS } from "../../shared/export/color.ts";
import { isEncoderFailure, segmentVideoArgs } from "../../shared/export/encoding.ts";
import { canonical, windowSignature } from "../../shared/export/fingerprint.ts";
import { type Rate, rateValue, trackTimescale } from "../../shared/export/frames.ts";
import {
  buildVideoWindowPlan,
  type MediaLookup,
  type VideoPlan,
  type VideoWindow,
} from "../../shared/export/videoPlan.ts";
import type { DerivedProject } from "../../shared/transitions.ts";
import type { Encoder, ExportSpec } from "../../shared/types.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { collectingProvider, type FxAssets } from "./fxAssets.ts";
import type { SegmentCache } from "./segmentCache.ts";

/**
 * Renders the picture of a lesson segment by segment: each segment reused from the cache when one
 * with the same signature exists, the others rendered a few at a time in the scheduler's segment
 * slots (they wait while a take records). A segment whose hardware encoder failed is rendered
 * again on its own once the others are done (the sessions may only have been taken for a moment);
 * any other failure, or that one again, stops the rest and is thrown, so the caller can tell an
 * encoder that failed (and try the next one) from anything else.
 */

export interface RunOptions {
  /** Seconds of output, for the progress ratio. */
  duration?: number;
  onProgress?: (ratio: number) => void;
  /** Suffix of the job id, so cancelling the export ends every process of it. */
  key?: string;
  /** Resolve with FFmpeg's messages instead of its output (measurements). */
  capture?: "stderr";
  signal?: AbortSignal;
}
export type RunFfmpeg = (args: string[], options?: RunOptions) => Promise<string>;

/**
 * Runs `work` in a scheduler slot (default: right away); `hardware` work also takes one of the
 * graphics card's encoder sessions.
 */
export type Slot = <T>(
  work: () => Promise<T>,
  signal: AbortSignal,
  hardware?: boolean,
) => Promise<T>;

/** The message and, for FFmpeg failures, the end of what it printed. */
export const failureText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const detail: unknown = Reflect.get(error, "detail");
  return typeof detail === "string" ? `${error.message}\n${detail}` : error.message;
};

export interface FilePrint {
  path: string;
  size: number;
  mtime: number;
}

/** Path, size and modification time of each file: what the cache keys add to the plan. */
export async function filePrints(paths: readonly string[]): Promise<FilePrint[]> {
  return Promise.all(
    [...new Set(paths)].sort().map(async (path) => {
      const info = await stat(path);
      return { path, size: info.size, mtime: Math.round(info.mtimeMs) };
    }),
  );
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Runs a render into `part`, removing what it left behind when it fails. */
export async function runOrRemove<T>(part: string, render: () => Promise<T>): Promise<T> {
  try {
    return await render();
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

export interface SegmentJob {
  project: DerivedProject;
  spec: ExportSpec;
  rate: Rate;
  windows: readonly VideoWindow[];
  encoder: Encoder;
  /** Segments rendered at once, and x264 threads for each. */
  concurrency: number;
  threads?: number;
  cache: SegmentCache;
  fx: FxAssets;
  /** Private folder for the filter scripts. */
  work: string;
  media: MediaLookup;
  filterScriptOption: FilterScriptOption;
  ffmpegVersion: string;
  /** The font files of these families (burned captions), whose contents are part of the key. */
  fontFiles?: (families: readonly string[]) => Promise<string[]>;
  run: RunFfmpeg;
  slot: Slot;
  /** The plan's inputs, checked: project media must be selected, the app's files in its folders. */
  checkInputs: (plan: VideoPlan) => Promise<string[]>;
  check: () => void;
  /** Frames ready (cached segments count whole), segments done and how many came from the cache. */
  progress: (state: { frames: number; done: number; cached: number }) => void;
  signal: AbortSignal;
}

/** Options of every segment of this export, which are part of its signature too. */
export function segmentOptions(job: Pick<SegmentJob, "encoder" | "spec" | "rate" | "threads">) {
  const { spec, rate } = job;
  return [
    ...segmentVideoArgs({
      encoder: job.encoder,
      kbps: Math.round(spec.videoBitrate),
      quality: spec.quality,
      width: spec.width,
      height: spec.height,
      gop: Math.max(1, Math.round(2 * rateValue(rate))),
      threads: job.encoder === "x264" ? job.threads : undefined,
    }),
    "-r",
    rate.text,
    "-video_track_timescale",
    String(trackTimescale(rate)),
    ...OUTPUT_COLOR_ARGS,
  ];
}

/** The cache key of every window. */
export async function segmentKeys(job: SegmentJob): Promise<string[]> {
  const options = segmentOptions(job);
  return Promise.all(
    job.windows.map(async (win) => {
      const sig = windowSignature(job.project, win, job.spec, job.rate, options);
      const fonts = sig.fonts.length && job.fontFiles ? await job.fontFiles(sig.fonts) : [];
      return sha256(
        canonical({
          key: sig.key,
          files: await filePrints(sig.files),
          fonts: await filePrints(fonts),
          ffmpeg: job.ffmpegVersion,
        }),
      );
    }),
  );
}

export async function renderSegments(job: SegmentJob): Promise<string[]> {
  const keys = await segmentKeys(job);
  const files: (string | null)[] = await Promise.all(keys.map((k) => job.cache.get(k, "mp4")));
  const fps = rateValue(job.rate);
  const partial = new Map<number, number>();
  let ready = 0;
  let done = 0;
  let cached = 0;
  files.forEach((file, i) => {
    if (!file) return;
    ready += job.windows[i].frames;
    done++;
    cached++;
  });
  const report = (): void => {
    let frames = ready;
    for (const f of partial.values()) frames += f;
    job.progress({ frames, done, cached });
  };
  report();

  const stop = new AbortController();
  const onAbort = (): void => stop.abort(job.signal.reason);
  job.signal.addEventListener("abort", onAbort, { once: true });
  const options = segmentOptions(job);
  let failure: unknown;
  // Windows that show the very same thing (a vignette used twice, the same still background
  // over a long narration) share one file: each key is rendered once, by its first window, and
  // the others take that file when it is ready.
  const copies = new Map<number, number[]>();
  const first = new Map<string, number>();
  const todo: number[] = [];
  files.forEach((file, i) => {
    if (file) return;
    const owner = first.get(keys[i]);
    if (owner === undefined) {
      first.set(keys[i], i);
      todo.push(i);
    } else copies.set(owner, [...(copies.get(owner) ?? []), i]);
  });
  let next = 0;

  const renderOne = async (i: number): Promise<void> => {
    const win = job.windows[i];
    // The effect pictures the plan asks for are made first, then the plan uses them.
    const wanted = collectingProvider();
    buildVideoWindowPlan(job.project, job.spec, job.rate, win, wanted.provider, job.media);
    await job.fx.ensure(wanted.wanted);
    const plan = buildVideoWindowPlan(
      job.project,
      job.spec,
      job.rate,
      win,
      job.fx.provider,
      job.media,
    );
    const inputs = await job.checkInputs(plan);
    const script = join(job.work, `segment-${i}.txt`);
    await writeFile(script, plan.filter, "utf8");
    job.check();
    const part = job.cache.partPath(keys[i], "mp4");
    await runOrRemove(part, () =>
      job.run(
        [
          "-y",
          "-v",
          "error",
          "-nostdin",
          ...inputs,
          job.filterScriptOption,
          script,
          "-map",
          `[${plan.output}]`,
          ...options,
          "-frames:v",
          String(win.frames),
          "-an",
          part,
        ],
        {
          key: `segment-${i}`,
          duration: win.frames / fps,
          signal: stop.signal,
          onProgress: (ratio) => {
            partial.set(i, Math.min(win.frames, ratio * win.frames));
            report();
          },
        },
      ),
    );
    files[i] = await job.cache.commit(keys[i], "mp4");
    partial.delete(i);
    ready += win.frames;
    done++;
    // The same file for every window with this key, each read held (pinned) on its own.
    for (const j of copies.get(i) ?? []) {
      files[j] = await job.cache.get(keys[j], "mp4");
      if (!files[j]) throw new Error("Missing export segment");
      ready += job.windows[j].frames;
      done++;
    }
    report();
  };

  const hardware = job.encoder !== "x264";
  /** Segments whose hardware encoder failed, to render again on their own. */
  const again: number[] = [];
  const worker = async (): Promise<void> => {
    while (!stop.signal.aborted && next < todo.length) {
      const i = todo[next++];
      try {
        await job.slot(() => renderOne(i), stop.signal, hardware);
      } catch (error) {
        if (hardware && !stop.signal.aborted && isEncoderFailure(failureText(error))) {
          partial.delete(i);
          again.push(i);
          continue;
        }
        // The first failure is the one to report; the others are its consequences.
        if (failure === undefined) failure = error;
        stop.abort(error);
      }
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(job.concurrency, todo.length)) }, worker),
    );
    // Alone now: nothing else of this export holds an encoder session.
    for (const i of again) {
      if (failure !== undefined || stop.signal.aborted) break;
      try {
        await job.slot(() => renderOne(i), stop.signal, hardware);
      } catch (error) {
        failure = error;
      }
    }
  } finally {
    job.signal.removeEventListener("abort", onAbort);
  }
  try {
    if (failure !== undefined) throw failure;
    job.signal.throwIfAborted();
    return files.map((f) => {
      if (!f) throw new Error("Missing export segment");
      return f;
    });
  } catch (error) {
    // The segments read or made so far may be pruned again.
    job.cache.release(files.filter((f): f is string => !!f));
    throw error;
  }
}
