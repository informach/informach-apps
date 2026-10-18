import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { buildAudioPlan } from "../../shared/export/audioPlan.ts";
import { canonical, PLAN_VERSION } from "../../shared/export/fingerprint.ts";
import { clipEnd } from "../../shared/timeline.ts";
import type { Asset, ExportSpec, Project } from "../../shared/types.ts";
import { treatedPath } from "../../shared/voiceChain.ts";
import type { FilterScriptOption } from "../ffmpeg-arguments.ts";
import { filePrints, type RunFfmpeg, runOrRemove, type Slot, sha256 } from "./renderSegments.ts";
import type { SegmentCache } from "./segmentCache.ts";

/**
 * The lesson's sound as one PCM file, cached by the signature of its plan and files. With loudness
 * normalisation the voices are first levelled with a fixed gain each (avatar and microphone sound
 * alike), then the mix is measured, and the assembly applies that measurement in a single linear
 * gain (two passes): the target is met exactly and nothing pumps. When the measurement fails, the
 * assembly falls back to one dynamic pass.
 */

const loudnessSchema = z.object({
  input_i: z.number(),
  input_tp: z.number(),
  input_lra: z.number(),
  input_thresh: z.number(),
  target_offset: z.number(),
});
export type Loudness = z.infer<typeof loudnessSchema>;

/** The JSON loudnorm prints at the end of its run, or null. */
export function parseLoudness(stderr: string): Loudness | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stderr.slice(start, end + 1));
  } catch {
    return null; // not loudnorm's summary: measured as failed
  }
  if (!raw || typeof raw !== "object") return null;
  const value = (key: string): number => Number(Reflect.get(raw, key));
  const out: Loudness = {
    input_i: value("input_i"),
    input_tp: value("input_tp"),
    input_lra: value("input_lra"),
    input_thresh: value("input_thresh"),
    target_offset: value("target_offset"),
  };
  return Object.values(out).every(Number.isFinite) ? out : null;
}

/** Loudness target and the filter that reaches it in one dynamic pass. */
export const target = (spec: Pick<ExportSpec, "loudness">): number => spec.loudness?.target ?? -14;
export const onePass = (spec: Pick<ExportSpec, "loudness">): string =>
  `loudnorm=I=${target(spec)}:TP=-1.5:LRA=11,aresample=48000`;

/**
 * The measured second pass. When the whole lesson fits the target with one gain (its true peak
 * stays under −1.5 dBTP and its range within 11 LU, the conditions of loudnorm's linear mode),
 * that gain is applied directly: the same result as `linear=true` without loudnorm's 192 kHz round
 * trip, which took most of the assembly of a long lesson. Otherwise loudnorm, with the
 * measurement, levels it dynamically.
 */
export function secondPass(spec: Pick<ExportSpec, "loudness">, m: Loudness): string {
  const gain = target(spec) - m.input_i;
  if (m.input_tp + gain <= -1.5 && m.input_lra <= 11)
    return `volume=${Math.round(gain * 1000) / 1000}dB`;
  return `loudnorm=I=${target(spec)}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
}

export interface AudioJob {
  project: Project;
  spec: ExportSpec;
  cache: SegmentCache;
  work: string;
  filterScriptOption: FilterScriptOption;
  ffmpegVersion: string;
  run: RunFfmpeg;
  slot: Slot;
  /** The plan's inputs with each project file checked against the selection. */
  checkInputs: (args: string[]) => Promise<string[]>;
  /** One project file, checked. */
  checkFile: (path: string) => Promise<string>;
  check: () => void;
  signal: AbortSignal;
}

/** Voices that are levelled against each other: sound on tracks that are not music, nor the PC. */
function voices(project: Project): { asset: Asset; seconds: number }[] {
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const used = new Map<string, { asset: Asset; seconds: number }>();
  for (const c of project.clips) {
    const track = tracks.get(c.trackId);
    const asset = assets.get(c.assetId);
    if (
      !track ||
      !asset ||
      track.muted ||
      track.music ||
      c.volume <= 0 ||
      !asset.hasAudio ||
      asset.kind === "image" ||
      asset.recording?.role === "system" ||
      c.mutedFor
    )
      continue;
    const seconds = (used.get(asset.id)?.seconds ?? 0) + (clipEnd(c) - c.start);
    used.set(asset.id, { asset, seconds });
  }
  return [...used.values()];
}

/** A loudness measurement kept in the cache next to the files it describes. */
async function cachedLoudness(
  cache: SegmentCache,
  key: string,
  make: () => Promise<Loudness | null>,
): Promise<Loudness | null> {
  const known = await cache.get(key, "json");
  if (known) {
    cache.release([known]);
    const saved = loudnessSchema.safeParse(JSON.parse(await readFile(known, "utf8")));
    if (saved.success) return saved.data;
  }
  const value = await make();
  if (value === null) return null;
  await writeFile(cache.partPath(key, "json"), JSON.stringify(value));
  cache.release([await cache.commit(key, "json")]);
  return value;
}

/** A loudness measurement, in a slot like every other run of the export. */
const measure = (job: AudioJob, path: string): Promise<Loudness | null> =>
  job.slot(
    () =>
      job
        .run(
          [
            "-hide_banner",
            "-nostdin",
            "-nostats",
            "-v",
            "info",
            "-i",
            path,
            "-vn",
            "-af",
            `loudnorm=I=${target(job.spec)}:TP=-1.5:LRA=11:print_format=json`,
            "-f",
            "null",
            "-",
          ],
          { key: "loudness", capture: "stderr", signal: job.signal },
        )
        .then(parseLoudness),
    job.signal,
  );

/** Fixed gains (dB) that bring every voice to the level of the main one. */
async function levels(job: AudioJob): Promise<Record<string, number>> {
  if (!job.spec.normalizeLoudness) return {};
  const list = voices(job.project);
  if (list.length < 2) return {};
  const measured = new Map<string, number>();
  for (const { asset } of list) {
    // Measured on what plays: the treated voice when there is one.
    const played = treatedPath(asset) ?? asset.path;
    const [print] = await filePrints([played]);
    const key = sha256(canonical({ loudness: 1, file: print, ffmpeg: job.ffmpegVersion }));
    const m = await cachedLoudness(job.cache, key, async () =>
      measure(job, await job.checkFile(played)),
    );
    if (m && m.input_i > -70) measured.set(asset.id, m.input_i);
  }
  // The voice heard the longest (the main narration) keeps its level; the others meet it.
  let main: { id: string; loudness: number } | undefined;
  for (const v of [...list].sort((a, b) => b.seconds - a.seconds)) {
    const loudness = measured.get(v.asset.id);
    if (loudness === undefined) continue;
    main = { id: v.asset.id, loudness };
    break;
  }
  if (!main) return {};
  const gains: Record<string, number> = {};
  for (const [id, loudness] of measured)
    if (id !== main.id)
      gains[id] = Math.round(Math.max(-12, Math.min(12, main.loudness - loudness)) * 100) / 100;
  return gains;
}

export interface Sound {
  wav: string;
  /** Filters of the loudness pass in the assembly ("" when the lesson keeps its own level). */
  master: string;
  /** Samples of the lesson, which the assembly keeps exactly (loudnorm pads to 100 ms). */
  samples: number;
}

/** The assembly's filter: the loudness pass, then exactly the lesson's samples. */
export const soundFilter = (sound: Sound): string[] =>
  sound.master ? ["-af", `${sound.master},atrim=end_sample=${sound.samples}`] : [];

export async function renderAudio(job: AudioJob): Promise<Sound> {
  const gains = await levels(job);
  // A treated voice (asset.treated, shared/voiceChain.ts) is read instead of denoising every clip.
  const plan = buildAudioPlan(job.project, job.spec, { gains });
  const key = sha256(
    canonical({
      audio: PLAN_VERSION,
      filter: plan.filter,
      inputs: plan.inputArgs,
      files: await filePrints(plan.media),
      ffmpeg: job.ffmpegVersion,
    }),
  );
  let wav = await job.cache.get(key, "wav");
  if (!wav) {
    const inputs = await job.checkInputs(plan.inputArgs);
    const script = join(job.work, "audio.txt");
    await writeFile(script, plan.filter, "utf8");
    job.check();
    const part = job.cache.partPath(key, "wav");
    await job.slot(
      () =>
        runOrRemove(part, () =>
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
              "-c:a",
              "pcm_f32le",
              "-rf64",
              "auto",
              part,
            ],
            { key: "audio", duration: plan.duration, signal: job.signal },
          ),
        ),
      job.signal,
    );
    wav = await job.cache.commit(key, "wav");
  }
  const { samples } = plan;
  if (!job.spec.normalizeLoudness) return { wav, master: "", samples };
  if (job.spec.loudness?.mode === "one-pass") return { wav, master: onePass(job.spec), samples };
  const file = wav;
  try {
    const m = await cachedLoudness(job.cache, sha256(`${key}:loudness:${target(job.spec)}`), () =>
      measure(job, file),
    );
    return { wav, master: m ? secondPass(job.spec, m) : onePass(job.spec), samples };
  } catch (error) {
    // The export never gets the sound: it may be pruned again.
    job.cache.release([file]);
    throw error;
  }
}
