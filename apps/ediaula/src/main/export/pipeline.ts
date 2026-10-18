import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { encoderName } from "../../shared/encoderChoice.ts";
import {
  chaptersInRange,
  concatList,
  cuesInRange,
  ffmetadata,
} from "../../shared/export/assemble.ts";
import { fallbackEncoders, isEncoderFailure } from "../../shared/export/encoding.ts";
import { exportProject, frameRate, frameTime, trackTimescale } from "../../shared/export/frames.ts";
import { planSegments } from "../../shared/export/segments.ts";
import type { MediaFacts, VideoPlan } from "../../shared/export/videoPlan.ts";
import { chaptersOf } from "../../shared/markers.ts";
import { buildPlatformPackage } from "../../shared/platformPackage.ts";
import { withRevealSprites } from "../../shared/reveal.ts";
import { projectDuration } from "../../shared/timeline.ts";
import type { Encoder, ExportSpec, JobProgress, Project } from "../../shared/types.ts";
import { subRip, webVtt } from "../../shared/webvtt.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { fontResolver } from "./fonts.ts";
import { FxAssets } from "./fxAssets.ts";
import { renderAudio, renderStems, type Sound, soundFilter } from "./renderAudio.ts";
import {
  failureText,
  type RunFfmpeg,
  renderSegments,
  type Slot,
  segmentOptions,
} from "./renderSegments.ts";
import { SegmentCache } from "./segmentCache.ts";

/**
 * One export, from the checked project and spec to the staged files: the picture by segments
 * (reused from the cache, the rest rendered in parallel, falling back to the next encoder when
 * one fails), the sound in one pass at the same time, then both joined without encoding the
 * picture again, with the title and chapters, the captions and the thumbnail. Every FFmpeg run
 * of it (probes, measurements and the assembly too) goes through the scheduler's slots.
 */

export interface ExportDeps {
  assertRead: (path: string) => Promise<string>;
  assertWrite: (path: string) => Promise<string>;
  assertRelatedExport: (primary: string, path: string) => Promise<string>;
  run: RunFfmpeg;
  filterScriptOption: FilterScriptOption;
  fontsDirectory: string;
  /**
   * The font files of these families, for the segments' keys (main/export/fonts.ts); by default
   * the files of the fonts folder named after them.
   */
  fontFiles?: (families: readonly string[]) => Promise<string[]>;
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
  /** Translated captions, by language (staged paths). */
  translations?: { lang: string; srt: string; vtt: string }[];
  /** <aula>.plataforma.json (staged path). */
  platform?: string;
  /** How the files are called beside the video, for the platform package. */
  names?: {
    video: string;
    thumbnail?: string;
    captions: { lang: string; srt?: string; vtt?: string }[];
  };
  /** The voice and the music as WAV files (checked destinations in the folder picked). */
  stems?: { voice: string; music: string };
}

/** SHA-256 of a file, read as a stream (an export may be gigabytes). */
export function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** The second of the lesson the thumbnail shows: the one chosen, or 30% into it. */
export const thumbnailSecond = (spec: Pick<ExportSpec, "thumbnailAt">, duration: number): number =>
  spec.thumbnailAt !== undefined
    ? Math.min(Math.max(0, duration - 0.05), Math.max(0, spec.thumbnailAt))
    : Math.max(0, duration * 0.3);

const inside = (path: string, root: string): boolean => {
  const child = relative(resolve(root).toLowerCase(), resolve(path).toLowerCase());
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
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
      if (!asset || media.has(asset.path) || c.zoomLayer || c.regionFx) continue;
      media.set(asset.path, await deps.assertRead(asset.path));
    }
    // The lesson's background picture is a project media too.
    const background =
      project.background?.kind === "image" ? assets.get(project.background.assetId) : undefined;
    if (background && !media.has(background.path))
      media.set(background.path, await deps.assertRead(background.path));
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
        if (!a || a.kind === "audio" || c.zoomLayer || c.regionFx) continue;
        pictures.add(a.path);
        if (a.keyed) pictures.add(a.keyed);
      }
      if (background) pictures.add(background.path);
      const probe = deps.probe;
      for (const path of pictures) {
        const checked = await checkFile(path);
        // Even a probe waits for its slot: nothing of an export starts while a take records.
        const known = await slot(() => probe(checked), signal);
        if (known) facts.set(path, known);
      }
    }
    const run: RunFfmpeg = (args, options) => deps.run(args, { signal, ...options });
    const job = {
      cache,
      work,
      filterScriptOption: deps.filterScriptOption,
      ffmpegVersion: deps.ffmpegVersion,
      fontFiles:
        deps.fontFiles ??
        fontResolver({
          bundled: async () => ({ dir: deps.fontsDirectory, families: [] }),
          system: [deps.fontsDirectory],
        }),
      run,
      slot,
      check: deps.check,
      signal,
    };
    const exportSpec: ExportSpec = { ...spec, outPath: outputs.primary };
    // The chapters: the markers set as chapters, else the publishing texts' (shared/markers.ts).
    const publish = { ...project.publish, chapters: chaptersOf(project) };
    const range = spec.range;
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
    /** What the assembly tells while it runs (when it encodes the picture again). */
    let note: string | undefined;
    /** The assembly encodes on the graphics card (it takes an encoder session). */
    let onCard = false;
    /** Where the exported stretch starts, in seconds of the lesson (0 for the whole lesson). */
    let offset = 0;
    if (spec.audioOnly) {
      progress({ ratio: 0.1, phase: "audio" });
      const sound = await audio;
      const total = projectDuration(project);
      offset = range ? Math.min(range.from, total) : 0;
      duration = (range ? Math.min(range.to, total) : total) - offset;
      if (duration <= 0) throw new Error("O intervalo escolhido fica fora da aula.");
      const title = project.publish?.title?.trim();
      assemble = [
        "-i",
        sound.wav,
        ...soundFilter(sound, range && { start: offset, length: duration }),
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
      // Animated annotations play their transparent videos (shared/reveal.ts).
      const derived = exportProject(withRevealSprites(project, spec.reveals), r);
      const windows = planSegments(derived, spec, range);
      if (!windows.length) throw new Error("O intervalo escolhido fica fora da aula.");
      const total = windows.reduce((n, w) => n + w.frames, 0);
      const cores = Math.max(1, deps.cores ?? 4);
      // Encoders that failed in this export (a segment failed again on its own), left out of the
      // fallback chain. Whether one is left out for the whole session is the detector's call.
      const broken = new Set<Encoder>();
      let encoder = spec.encoder;
      let threads: number | undefined;
      let files: string[] = [];
      for (;;) {
        const x264 = encoder === "x264";
        const concurrency = x264 ? Math.max(1, Math.min(3, Math.floor(cores / 4))) : 2;
        threads = x264 ? Math.max(1, Math.floor(cores / concurrency)) : undefined;
        try {
          files = await renderSegments({
            ...job,
            project: derived,
            spec: { ...exportSpec, encoder },
            rate: r,
            windows,
            encoder,
            concurrency,
            threads,
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
      // Segments joined by copying must carry the same H.264 parameter sets (one set per track):
      // ones from another driver or build of the same encoder are joined by encoding the picture
      // once more instead, with the same options.
      const headers = new Set<string>();
      for (const file of files) {
        const header = await cache.header(file);
        if (header) headers.add(header);
      }
      const video =
        headers.size > 1
          ? segmentOptions({ encoder, spec: { ...exportSpec, encoder }, rate: r, threads })
          : ["-c:v", "copy"];
      if (headers.size > 1) {
        note = "Trechos de versões diferentes do codificador: o vídeo é refeito na montagem.";
        onCard = encoder !== "x264";
      }
      progress({ ratio: 0.9, phase: "audio" });
      const sound = await audio;
      duration = frameTime(total, r);
      offset = frameTime(windows[0].from, r);
      const list = join(work, "segments.txt");
      await writeFile(
        list,
        concatList(
          files.map((path, i) => ({ path, frames: windows[i].frames })),
          r,
        ),
        "utf8",
      );
      const meta = ffmetadata(
        range
          ? { ...publish, chapters: chaptersInRange(publish.chapters, offset, offset + duration) }
          : publish,
        duration,
      );
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
        ...video,
        ...soundFilter(sound, range && { start: offset, length: duration }),
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
    const told = note ? { message: note } : {};
    progress({ ratio: 0.92, phase: "assembling", ...told });
    const assembleArgs = await checkInputs(assemble);
    await slot(
      () =>
        run(["-y", "-v", "error", "-nostdin", ...assembleArgs], {
          key: "assemble",
          duration,
          onProgress: (ratio) =>
            progress({ ratio: 0.92 + 0.06 * ratio, phase: "assembling", ...told }),
        }),
      signal,
      onCard,
    );
    deps.check();
    const thumbnail = outputs.thumbnail;
    const thumbAt = thumbnailSecond(spec, duration);
    if (thumbnail) {
      progress({ ratio: 0.98, phase: "assembling" });
      await slot(
        () =>
          run(
            [
              "-y",
              "-v",
              "error",
              "-nostdin",
              "-ss",
              String(thumbAt),
              "-i",
              outputs.primary,
              "-frames:v",
              "1",
              "-vf",
              "scale=1280:-2",
              "-q:v",
              "3",
              thumbnail,
            ],
            { key: "thumbnail" },
          ),
        signal,
      );
    }
    const cues = range
      ? cuesInRange(spec.captionCues ?? [], offset, offset + duration)
      : (spec.captionCues ?? []);
    if (outputs.captions) await writeFile(outputs.captions, subRip(cues) ?? "", "utf8");
    if (outputs.subtitles) await writeFile(outputs.subtitles, webVtt(cues) ?? "", "utf8");
    for (const t of outputs.translations ?? []) {
      const translated = spec.translations?.find((x) => x.lang === t.lang)?.cues ?? [];
      await writeFile(t.srt, subRip(translated) ?? "", "utf8");
      await writeFile(t.vtt, webVtt(translated) ?? "", "utf8");
    }
    if (outputs.platform && spec.platform && outputs.names) {
      progress({ ratio: 0.99, phase: "assembling", message: "Preparando o pacote da plataforma" });
      const pack = buildPlatformPackage(spec.platform, {
        video: outputs.names.video,
        sha256: await fileSha256(outputs.primary),
        seconds: duration,
        width: spec.width,
        height: spec.height,
        ...(outputs.names.thumbnail
          ? { thumbnail: { file: outputs.names.thumbnail, time: thumbAt } }
          : {}),
        captions: outputs.names.captions,
        now: new Date(),
      });
      await writeFile(outputs.platform, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    }
    // Stems last: the same mix, the voice and the music on their own, over the same stretch.
    if (outputs.stems) {
      progress({ ratio: 0.99, phase: "audio", message: "Gravando a voz e a música separadas…" });
      const sound = await audio;
      await renderStems(
        { ...job, project, spec: exportSpec, checkInputs, checkFile },
        sound,
        outputs.stems,
        range ? { start: offset, length: duration } : undefined,
      );
    }
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
