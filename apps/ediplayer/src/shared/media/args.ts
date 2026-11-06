import type { Range } from "../ranges.ts";

/**
 * Pure builders of FFmpeg arguments. The recipes follow the ones already proven in the suite:
 * the concat demuxer and GIF palette of EdiAula's export pipeline
 * (apps/ediaula/src/main/export/pipeline.ts), its two-pass loudnorm
 * (apps/ediaula/src/main/export/renderAudio.ts) and its Windows path escaping for the subtitles
 * filter (apps/ediaula/src/shared/export/videoPlan.ts).
 */

/** A path inside a filter argument (`subtitles=filename='…'`). */
export function filterPath(p: string): string {
  // Two escaping levels, no quotes: first the option value (\ ' :), then the filter graph
  // (\ ' [ ] , ;). A folder named D'Avila or x',[a];b stays a path and never becomes graph.
  const option = p.replace(/\\/g, "/").replace(/[\\':]/g, (c) => `\\${c}`);
  return option.replace(/[\\'[\],;]/g, (c) => `\\${c}`);
}

/** A concat demuxer list; single quotes are closed, escaped and reopened. */
export const concatList = (files: readonly string[]): string =>
  `ffconcat version 1.0\n${files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n")}\n`;

const n = (v: number, digits = 3) => String(Math.round(v * 10 ** digits) / 10 ** digits);

/** atempo takes 0.5–2 per instance: chain them for 4×. */
export function atempoChain(speed: number): string[] {
  const out: string[] = [];
  let left = speed;
  while (left > 2 + 1e-9) {
    out.push("atempo=2");
    left /= 2;
  }
  while (left < 0.5 - 1e-9) {
    out.push("atempo=0.5");
    left /= 0.5;
  }
  if (Math.abs(left - 1) > 1e-9) out.push(`atempo=${n(left, 4)}`);
  return out;
}

/** Counter-clockwise degrees for `-display_rotation` from a clockwise turn. */
export const displayRotation = (clockwise: number): number => (360 - (clockwise % 360)) % 360;

const BASE = ["-hide_banner", "-nostdin", "-y", "-v", "error", "-protocol_whitelist", "file,pipe"];

/** Lets an input read only local files (no network, no nested protocols). */
export const LOCAL_INPUT = ["-protocol_whitelist", "file,pipe"];

export interface CutPoint {
  /** Demuxer timestamps of the source (its start time included). */
  inpoint: number;
  outpoint: number;
}

/**
 * A concat demuxer list that cuts one source by points. Each stretch then lasts exactly
 * outpoint − inpoint for every stream, so cuts never drift apart; with the inpoint on a keyframe
 * the picture is copied without re-encoding.
 */
export function pointsList(source: string, points: readonly CutPoint[]): string {
  const file = `file '${source.replace(/'/g, "'\\''")}'`;
  const entries = points.map(
    (p) => `${file}\ninpoint ${p.inpoint.toFixed(6)}\noutpoint ${p.outpoint.toFixed(6)}`,
  );
  return `ffconcat version 1.0\n${entries.join("\n")}\n`;
}

/**
 * The chosen sound streams of input `input`, cut to the same stretches with sample accuracy and
 * joined: labels [a0], [a1]… in the order of `tracks`. The copied picture keeps the exact stretch
 * lengths, so the sound is cut (and encoded) to match instead of copied packet by packet.
 */
export function audioCutGraph(
  input: number,
  tracks: readonly number[],
  ranges: readonly Range[],
): string {
  const parts: string[] = [];
  for (const [k, track] of tracks.entries()) {
    const label = `[${input}:a:${track}]`;
    const trim = (r: Range) =>
      `atrim=start=${r.start.toFixed(6)}:end=${r.end.toFixed(6)},asetpts=PTS-STARTPTS`;
    const only = ranges.at(0);
    if (ranges.length === 1 && only) {
      parts.push(`${label}${trim(only)}[a${k}]`);
      continue;
    }
    parts.push(`${label}asplit=${ranges.length}${ranges.map((_, i) => `[s${k}_${i}]`).join("")}`);
    for (const [i, r] of ranges.entries()) parts.push(`[s${k}_${i}]${trim(r)}[c${k}_${i}]`);
    parts.push(
      `${ranges.map((_, i) => `[c${k}_${i}]`).join("")}concat=n=${ranges.length}:v=0:a=1[a${k}]`,
    );
  }
  return parts.join(";\n");
}

/** Joins whole files listed in a concat file, picture and sound only (no data or timecode). */
export function concatCopyArgs(list: string, output: string, faststart: boolean): string[] {
  return [
    ...BASE,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-map",
    "0:V?",
    "-map",
    "0:a?",
    "-dn",
    "-sn",
    "-c",
    "copy",
    ...(faststart ? ["-movflags", "+faststart"] : []),
    output,
  ];
}

export type VideoEncoder = "x264" | "nvenc";

/** H.264 at constant quality, or at a bitrate when the file has a size target. */
export function videoEncodeArgs(
  encoder: VideoEncoder,
  quality: { crf: number } | { kbps: number },
): string[] {
  if (encoder === "nvenc")
    return "crf" in quality
      ? [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "p5",
          "-rc",
          "vbr",
          "-cq",
          String(quality.crf + 1),
          "-b:v",
          "0",
        ]
      : [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "p5",
          "-b:v",
          `${quality.kbps}k`,
          "-maxrate",
          `${Math.round(quality.kbps * 1.5)}k`,
          "-bufsize",
          `${quality.kbps * 2}k`,
        ];
  return "crf" in quality
    ? ["-c:v", "libx264", "-preset", "medium", "-crf", String(quality.crf)]
    : [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-b:v",
        `${quality.kbps}k`,
        "-maxrate",
        `${Math.round(quality.kbps * 1.5)}k`,
        "-bufsize",
        `${quality.kbps * 2}k`,
      ];
}

export const LOUDNESS_TARGET = { I: -16, TP: -1.5, LRA: 11 };

export interface Loudness {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** The JSON loudnorm prints in its measuring pass. */
export function parseLoudness(stderr: string): Loudness {
  const start = stderr.lastIndexOf("{"),
    end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("A medição de volume não terminou.");
  const data: unknown = JSON.parse(stderr.slice(start, end + 1));
  const read = (key: keyof Loudness): string => {
    const value = data && typeof data === "object" ? Reflect.get(data, key) : undefined;
    if (typeof value !== "string" || !Number.isFinite(Number(value)))
      throw new Error("Medição de volume inválida.");
    return value;
  };
  return {
    input_i: read("input_i"),
    input_tp: read("input_tp"),
    input_lra: read("input_lra"),
    input_thresh: read("input_thresh"),
    target_offset: read("target_offset"),
  };
}

/** loudnorm measuring (no measure given) or applying the measured values in one linear pass. */
export function loudnormFilter(measured: Loudness | null): string {
  const base = `loudnorm=I=${LOUDNESS_TARGET.I}:TP=${LOUDNESS_TARGET.TP}:LRA=${LOUDNESS_TARGET.LRA}`;
  if (!measured) return `${base}:print_format=json`;
  return `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
}

export interface GraphOptions {
  /** Stretches of the source; with `seeked` the input already starts at the only one. */
  ranges: readonly Range[];
  seeked: boolean;
  video: boolean;
  /** Input label of the sound (`0:a:1`, `1:a:0`), or null for none. */
  audio: string | null;
  /** The sound comes from another file: it is not cut with the picture. */
  audioUncut: boolean;
  burn: string | null;
  crop: { x: number; y: number; w: number; h: number } | null;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  speed: number;
  gain: number;
  loudnorm: string | null;
  size: [number, number] | null;
  gif: { fps: number } | null;
}

/**
 * One filter graph for a re-encoded export: burn subtitles on the source timeline, cut and join
 * the stretches, then crop, turn, flip, change speed, scale. Outputs `[v]` and `[a]`.
 */
export function exportGraph(o: GraphOptions): { graph: string; video: boolean; audio: boolean } {
  const parts: string[] = [];
  const cut = !o.seeked && (o.ranges.length > 1 || (o.ranges.at(0)?.start ?? 0) > 0);
  const count = cut ? o.ranges.length : 1;
  const videoStreams: string[] = [];
  const audioStreams: string[] = [];
  if (o.video) {
    const head = o.burn ? `[0:v:0]subtitles=filename=${filterPath(o.burn)}` : "[0:v:0]null";
    if (count > 1) {
      parts.push(`${head},split=${count}${o.ranges.map((_, i) => `[vs${i}]`).join("")}`);
      o.ranges.forEach((r, i) => {
        parts.push(`[vs${i}]trim=start=${n(r.start)}:end=${n(r.end)},setpts=PTS-STARTPTS[vt${i}]`);
        videoStreams.push(`[vt${i}]`);
      });
    } else if (cut) {
      const r = o.ranges.at(0) as Range;
      parts.push(`${head},trim=start=${n(r.start)}:end=${n(r.end)},setpts=PTS-STARTPTS[vt0]`);
      videoStreams.push("[vt0]");
    } else {
      parts.push(`${head}[vt0]`);
      videoStreams.push("[vt0]");
    }
  }
  const sound = o.audio;
  if (sound && !o.audioUncut) {
    if (count > 1) {
      parts.push(`[${sound}]asplit=${count}${o.ranges.map((_, i) => `[as${i}]`).join("")}`);
      o.ranges.forEach((r, i) => {
        parts.push(
          `[as${i}]atrim=start=${n(r.start)}:end=${n(r.end)},asetpts=PTS-STARTPTS[at${i}]`,
        );
        audioStreams.push(`[at${i}]`);
      });
    } else if (cut) {
      const r = o.ranges.at(0) as Range;
      parts.push(`[${sound}]atrim=start=${n(r.start)}:end=${n(r.end)},asetpts=PTS-STARTPTS[at0]`);
      audioStreams.push("[at0]");
    } else {
      parts.push(`[${sound}]anull[at0]`);
      audioStreams.push("[at0]");
    }
  }
  let v = videoStreams.at(0) ?? "",
    a = audioStreams.at(0) ?? "";
  if (count > 1) {
    const both = videoStreams.length && audioStreams.length;
    const inputs = o.ranges
      .map((_, i) => `${videoStreams.at(i) ?? ""}${audioStreams.at(i) ?? ""}`)
      .join("");
    const outs = `${videoStreams.length ? "[vc]" : ""}${audioStreams.length ? "[ac]" : ""}`;
    parts.push(
      `${inputs}concat=n=${count}:v=${videoStreams.length ? 1 : 0}:a=${audioStreams.length ? 1 : 0}${outs}`,
    );
    v = videoStreams.length ? "[vc]" : "";
    a = audioStreams.length ? "[ac]" : "";
    if (!both && !v && !a) throw new Error("Nada para exportar.");
  }
  if (o.video && v) {
    const chain: string[] = [];
    if (o.crop) chain.push(`crop=${o.crop.w}:${o.crop.h}:${o.crop.x}:${o.crop.y}`);
    if (o.rotate === 90) chain.push("transpose=1");
    if (o.rotate === 270) chain.push("transpose=2");
    if (o.rotate === 180) chain.push("hflip,vflip");
    if (o.flipH) chain.push("hflip");
    if (o.flipV) chain.push("vflip");
    if (o.speed !== 1) chain.push(`setpts=PTS/${n(o.speed, 4)}`);
    if (o.gif) {
      const width = o.size?.[0] ?? -2;
      chain.push(`fps=${o.gif.fps}`, `scale=${width}:-2:flags=lanczos`);
      parts.push(
        `${v}${chain.join(",")},split[g1][g2]`,
        "[g1]palettegen=stats_mode=diff[gp]",
        "[g2][gp]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]",
      );
    } else {
      if (o.size) chain.push(`scale=${o.size[0]}:${o.size[1]}:flags=lanczos`);
      chain.push("format=yuv420p");
      parts.push(`${v}${chain.join(",")}[v]`);
    }
  }
  const soundOut = o.audioUncut && sound ? `[${sound}]` : a;
  if (soundOut && !o.gif) {
    const chain = [
      ...(o.audioUncut ? [] : atempoChain(o.speed)),
      ...(o.gain !== 1 ? [`volume=${n(o.gain)}`] : []),
      ...(o.loudnorm ? [o.loudnorm] : []),
      "aresample=48000",
    ];
    parts.push(`${soundOut}${chain.join(",")}[a]`);
  }
  return { graph: parts.join(";\n"), video: o.video && !!v, audio: !!soundOut && !o.gif };
}
