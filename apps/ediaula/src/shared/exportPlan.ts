import { atempo, buildAudioPlan, DENOISE } from "./export/audioPlan.ts";
import { OUTPUT_COLOR_ARGS } from "./export/color.ts";
import { encoderPixelFormat, exportVideoArgs, proxyVideoArgs } from "./export/encoding.ts";
import { exportProject, frameCount, frameRate } from "./export/frames.ts";
import type { FxProvider } from "./export/fx.ts";
import { buildVideoWindowPlan, cutFxFilter, type MediaLookup } from "./export/videoPlan.ts";
import { projectDuration } from "./timeline.ts";
import type { ExportSpec, Project } from "./types.ts";

export { atempo, cutFxFilter, DENOISE, encoderPixelFormat, exportVideoArgs, proxyVideoArgs };

export interface ExportPlan {
  /** ffmpeg arguments before the filter graph (inputs). */
  inputArgs: string[];
  /** Contents of the file-backed FFmpeg filter graph. */
  filter: string;
  /** ffmpeg arguments after the filter graph (maps, codecs, output). */
  outputArgs: string[];
  duration: number;
}

/** The loudness filter of a single pass, or nothing when the lesson keeps its own level. */
export function oneLoudnessPass(spec: Pick<ExportSpec, "normalizeLoudness" | "loudness">): string {
  if (!spec.normalizeLoudness) return "";
  return `loudnorm=I=${spec.loudness?.target ?? -14}:TP=-1.5:LRA=11,aresample=48000`;
}

const inputCount = (args: string[]): number => args.filter((a) => a === "-i").length;

/**
 * The whole lesson as one FFmpeg command: a single window of the segment plan
 * (shared/export/videoPlan.ts) with the sound of shared/export/audioPlan.ts. The app exports by
 * segments (main/export/); this one is the reference the tests compare against, and the podcast.
 */
export function buildExportPlan(
  source: Project,
  spec: ExportSpec,
  fx?: FxProvider,
  media?: MediaLookup,
): ExportPlan {
  const master = oneLoudnessPass(spec);
  if (spec.audioOnly) {
    const audio = buildAudioPlan(source, spec, { master });
    return {
      inputArgs: audio.inputArgs,
      filter: audio.filter,
      outputArgs: [
        "-map",
        "[aout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        spec.outPath,
      ],
      duration: audio.duration,
    };
  }
  const r = frameRate(spec.fps);
  const frames = frameCount(projectDuration(source), r);
  const video = buildVideoWindowPlan(
    exportProject(source, r),
    spec,
    r,
    { from: 0, frames },
    fx,
    media,
  );
  const audio = buildAudioPlan(source, spec, {
    master,
    firstInput: inputCount(video.inputArgs),
  });
  return {
    inputArgs: [...video.inputArgs, ...audio.inputArgs],
    filter: `${video.filter};\n${audio.filter}`,
    outputArgs: [
      "-map",
      `[${video.output}]`,
      "-map",
      `[${audio.output}]`,
      ...exportVideoArgs(spec.encoder, Math.round(spec.videoBitrate)),
      "-r",
      r.text,
      "-frames:v",
      String(frames),
      ...OUTPUT_COLOR_ARGS,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      spec.outPath,
    ],
    duration: audio.duration,
  };
}
