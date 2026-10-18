import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { encoderName } from "../../shared/encoderChoice.ts";
import { concatList, ffmetadata } from "../../shared/export/assemble.ts";
import { fallbackEncoders, isEncoderFailure } from "../../shared/export/encoding.ts";
import { exportProject, frameRate, frameTime, trackTimescale } from "../../shared/export/frames.ts";
import { lessonFrames, planSegments } from "../../shared/export/segments.ts";
import type { MediaFacts, VideoPlan } from "../../shared/export/videoPlan.ts";
import { projectDuration } from "../../shared/timeline.ts";
import type { Encoder, ExportSpec, JobProgress, Project } from "../../shared/types.ts";
import { subRip, webVtt } from "../../shared/webvtt.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { FxAssets } from "./fxAssets.ts";
import { renderAudio, type Sound, soundFilter } from "./renderAudio.ts";
import { type RunFfmpeg, renderSegments, type Slot } from "./renderSegments.ts";
import { SegmentCache } from "./segmentCache.ts";

/**
 * One export, from the checked project and spec to the staged files: the picture by segments
 * (reused from the cache, the rest rendered in parallel, falling back to the next encoder when
 * one fails), the sound in one pass at the same time, then both joined without encoding the
 * picture again, with the title and chapters, the captions and the thumbnail.
 */

export interface ExportDeps {
  assertRead: (path: string) => Promise<string>;
  assertWrite: (path: string) => Promise<string>;
  assertRelatedExport: (primary: string, path: string) => Promise<string>;
  run: RunFfmpeg;
  filterScriptOption: FilterScriptOption;
  fontsDirectory: string;
  check: () => void;
  /** userData/cache: segments, sounds and effect pictures live under it. */
  cacheDirectory: string;
  /** Where each export makes its private work folder (removed at the end). */
  workDirectory: string;
  ffmpegVersion: string;
  /** Folders of files the app wrote itself (keyed avatars, cursor sprites): no selection needed. */
  internalRoots?: readonly string[];
  /** The app's cache of segments (one for the whole app; tests make their own). */
  cache?: SegmentCache;
  probe?: (path: string) => Promise<MediaFacts | undefined>;
  slot?: Slot;
  cores?: number;
  /** The encoder to try after `failed` broke (the detector's chain); null when none is left. */
  nextEncoder?: (failed: Encoder) => Promise<Encoder | null> | Encoder | null;
  progress?: (progress: Omit<JobProgress, "id">) => void;
  signal?: AbortSignal;
  /** Keeps the destination folder, where an interrupted export may leave its staging folder. */
  rememberFolder?: (folder: string) => Promise<void>;
}

export interface ExportOutputs {
  primary: string;
  captions?: string;
  subtitles?: string;
  thumbnail?: string;
}

const inside = (path: string, root: string): boolean => {
  const child = relative(resolve(root).toLowerCase(), resolve(path).toLowerCase());
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
};

/** The message and, for FFmpeg failures, the end of what it printed. */
const failureText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const detail: unknown = Reflect.get(error, "detail");
  return typeof detail === "string" ? `${error.message}\n${detail}` : error.message;
};

export async function renderLesson(
  project: Project,
  spec: ExportSpec,
  outputs: ExportOutputs,
  deps: ExportDeps,
): Promise<void> {
  // Stopped by the person (deps.signal) or by a failure, so nothing keeps running behind it.
  const stop = new AbortController();
  const signal = stop.signal;
  const onAbort = (): void => stop.abort(deps.signal?.reason);
  if (deps.signal?.aborted) onAbort();
  deps.signal?.addEventListener("abort", onAbort, { once: true });
  const slot: Slot = deps.slot ?? ((work) => work());
  const progress = deps.progress ?? (() => {});
  const cache = deps.cache ?? new SegmentCache(join(deps.cacheDirectory, "segments"));
  await mkdir(deps.workDirectory, { recursive: true });
  const work = await mkdtemp(join(deps.workDirectory, "export-"));
  const internal = [...(deps.internalRoots ?? []), deps.cacheDirectory, work];
  const read: string[] = [];
  let audio: Promise<Sound> | undefined;
  let failed = false;
  let failure: unknown;
  try {
    progress({ ratio: 0, phase: "preparing" });
    // Project media are checked against the selection once; the app's own files by their folder.
    const assets = new Map(project.assets.map((a) => [a.id, a]));
    const media = new Map<string, string>();
    for (const c of project.clips) {
      const asset = assets.get(c.assetId);
      if (!asset || media.has(asset.path) || c.zoomLayer) continue;
      media.set(asset.path, await deps.assertRead(asset.path));
    }
    const checkFile = async (path: string): Promise<string> => {
      const known = media.get(path);
      if (known) return known;
      if (internal.some((root) => inside(path, root))) return path;
      const checked = await deps.assertRead(path);
      media.set(path, checked);
      return checked;
    };
    const checkInputs = async (args: string[]): Promise<string[]> => {
      const out = [...args];
      for (let i = 0; i < out.length; i++)
        if (out[i] === "-i") {
          const path = out[i + 1];
          if (!path) throw new Error("Missing export input");
          out[i + 1] = await checkFile(path);
        }
      return out;
    };
    // What each picture source is (colour matrix, alpha), from FFprobe when the app can ask.
    const facts = new Map<string, MediaFacts>();
    if (deps.probe && !spec.audioOnly) {
      const pictures = new Set<string>();
      for (const c of project.clips) {
        const a = assets.get(c.assetId);
        if (!a || a.kind === "audio" || c.zoomLayer) continue;
        pictures.add(a.path);
        if (a.keyed) pictures.add(a.keyed);
      }
      for (const path of pictures) {
        const known = await deps.probe(await checkFile(path));
        if (known) facts.set(path, known);
      }
    }
    const run: RunFfmpeg = (args, options) => deps.run(args, { signal, ...options });
    const job = {
      cache,
      work,
      filterScriptOption: deps.filterScriptOption,
      ffmpegVersion: deps.ffmpegVersion,
      run,
      slot,
      check: deps.check,
      signal,
    };
    const exportSpec: ExportSpec = { ...spec, outPath: outputs.primary };
    if (spec.burnAss && !spec.audioOnly) {
      exportSpec.assFile = join(work, "captions.ass");
      exportSpec.fontsDir = deps.fontsDirectory;
      await writeFile(exportSpec.assFile, spec.burnAss, "utf8");
    }
    audio = renderAudio({
      ...job,
      project,
      spec: exportSpec,
      checkInputs,
      checkFile,
    }).then((result) => {
      read.push(result.wav);
      return result;
    });
    // The sound renders while the picture does; a failure of it is thrown where it is awaited
    // (a failure of the picture first stops it, below).
    audio.catch((error: unknown) => stop.abort(error));

    let assemble: string[];
    let duration: number;
    if (spec.audioOnly) {
      progress({ ratio: 0.1, phase: "audio" });
      const sound = await audio;
      duration = projectDuration(project);
      const title = project.publish?.title?.trim();
      assemble = [
        "-i",
        sound.wav,
        ...soundFilter(sound),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        ...(title ? ["-metadata", `title=${title}`] : []),
        outputs.primary,
      ];
    } else {
      const r = frameRate(spec.fps);
      const derived = exportProject(project, r);
      const windows = planSegments(derived, spec);
      const total = lessonFrames(derived, r);
      const cores = Math.max(1, deps.cores ?? 4);
      // Encoders that failed to open in this export, left out of the fallback chain.
      const broken = new Set<Encoder>();
      let encoder = spec.encoder;
      let files: string[] = [];
      for (;;) {
        const x264 = encoder === "x264";
        const concurrency = x264 ? Math.max(1, Math.min(3, Math.floor(cores / 4))) : 2;
        try {
          files = await renderSegments({
            ...job,
            project: derived,
            spec: { ...exportSpec, encoder },
            rate: r,
            windows,
            encoder,
            concurrency,
            threads: x264 ? Math.max(1, Math.floor(cores / concurrency)) : undefined,
            fx: new FxAssets(join(deps.cacheDirectory, "fx"), run),
            media: (path) => facts.get(path),
            checkInputs: (plan: VideoPlan) => checkInputs(plan.inputArgs),
            progress: (state) =>
              progress({
                ratio: (0.9 * state.frames) / total,
                phase: "segments",
                segments: { done: state.done, cached: state.cached, total: windows.length },
              }),
          });
          break;
        } catch (error) {
          if (signal.aborted || x264 || !isEncoderFailure(failureText(error))) throw error;
          broken.add(encoder);
          const next =
            (await deps.nextEncoder?.(encoder)) ?? fallbackEncoders(encoder, broken)[0] ?? null;
          if (!next) throw error;
          progress({
            ratio: 0,
            phase: "segments",
            message: `${encoderName(encoder)} falhou neste computador. Continuando com ${encoderName(next)}.`,
          });
          encoder = next;
        }
      }
      read.push(...files);
      progress({ ratio: 0.9, phase: "audio" });
      const sound = await audio;
      duration = frameTime(total, r);
      const list = join(work, "segments.txt");
      await writeFile(
        list,
        concatList(
          files.map((path, i) => ({ path, frames: windows[i].frames })),
          r,
        ),
        "utf8",
      );
      const meta = ffmetadata(project.publish, duration);
      const metaFile = join(work, "metadata.txt");
      if (meta) await writeFile(metaFile, meta, "utf8");
      assemble = [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-i",
        sound.wav,
        ...(meta ? ["-f", "ffmetadata", "-i", metaFile] : []),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        ...soundFilter(sound),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        ...(meta ? ["-map_metadata", "2", "-map_chapters", "2"] : []),
        "-video_track_timescale",
        String(trackTimescale(r)),
        "-movflags",
        "+faststart",
        outputs.primary,
      ];
    }
    deps.check();
    progress({ ratio: 0.92, phase: "assembling" });
    await run(["-y", "-v", "error", "-nostdin", ...(await checkInputs(assemble))], {
      key: "assemble",
      duration,
      onProgress: (ratio) => progress({ ratio: 0.92 + 0.06 * ratio, phase: "assembling" }),
    });
    deps.check();
    if (outputs.thumbnail) {
      progress({ ratio: 0.98, phase: "assembling" });
      await run(
        [
          "-y",
          "-v",
          "error",
          "-nostdin",
          "-ss",
          String(Math.max(0, duration * 0.3)),
          "-i",
          outputs.primary,
          "-frames:v",
          "1",
          "-vf",
          "scale=1280:-2",
          "-q:v",
          "3",
          outputs.thumbnail,
        ],
        { key: "thumbnail" },
      );
    }
    const cues = spec.captionCues ?? [];
    if (outputs.captions) await writeFile(outputs.captions, subRip(cues) ?? "", "utf8");
    if (outputs.subtitles) await writeFile(outputs.subtitles, webVtt(cues) ?? "", "utf8");
    progress({ ratio: 0.99, phase: "assembling" });
  } catch (error) {
    failed = true;
    failure = error;
    stop.abort(error);
    // Wait for the sound to stop before its folder goes; the export's own error is the answer.
    if (audio) await Promise.allSettled([audio]);
  }
  deps.signal?.removeEventListener("abort", onAbort);
  cache.release(read);
  const cleanup: unknown[] = [];
  for (const step of [() => rm(work, { recursive: true, force: true }), () => cache.prune()])
    try {
      await step();
    } catch (error) {
      cleanup.push(error);
    }
  if (cleanup.length)
    throw new AggregateError(failed ? [failure, ...cleanup] : cleanup, "Export cleanup failed");
  if (failed) throw failure;
}
