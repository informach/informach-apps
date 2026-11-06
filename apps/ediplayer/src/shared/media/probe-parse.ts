import type { AudioTrack, MediaFacts, SubtitleTrack } from "../types.ts";

/** Subtitle codecs that are text (can be shown in the player and burned). */
const TEXT_SUBTITLES = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"]);

interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  pix_fmt?: string;
  time_base?: string;
  channels?: number;
  sample_rate?: string;
  tags?: Record<string, string>;
  disposition?: { attached_pic?: number };
  side_data_list?: { side_data_type?: string; rotation?: number }[];
}

interface ProbeJson {
  format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string };
  streams?: ProbeStream[];
}

const rate = (value?: string): number => {
  const [a = 0, b = 0] = (value ?? "0").split("/").map(Number);
  const v = b ? a / b : a;
  return Number.isFinite(v) ? v : 0;
};

const tag = (s: ProbeStream, name: string): string | undefined => {
  const value = s.tags?.[name] ?? s.tags?.[name.toUpperCase()];
  return value?.trim() ? value.trim() : undefined;
};

/** Clockwise degrees the picture is shown turned (phones store it as metadata). */
export function streamRotation(s: ProbeStream): number {
  const fromTag = Number(s.tags?.rotate);
  if (Number.isFinite(fromTag) && s.tags?.rotate !== undefined)
    return ((fromTag % 360) + 360) % 360;
  const matrix = s.side_data_list?.find((d) => typeof d.rotation === "number");
  if (matrix?.rotation !== undefined) return ((-matrix.rotation % 360) + 360) % 360;
  return 0;
}

/** MediaFacts from `ffprobe -show_format -show_streams -print_format json`. */
export function factsFromProbe(
  json: unknown,
  path: string,
  name: string,
  size: number,
): MediaFacts {
  if (!json || typeof json !== "object") throw new Error("Resposta do ffprobe inválida.");
  const probe: ProbeJson = json;
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio: AudioTrack[] = streams
    .filter((s) => s.codec_type === "audio")
    .map((s, index) => ({
      index,
      codec: s.codec_name ?? "desconhecido",
      language: tag(s, "language"),
      title: tag(s, "title"),
      channels: s.channels ?? 0,
      sampleRate: Number(s.sample_rate ?? 0),
    }));
  const subtitles: SubtitleTrack[] = streams
    .filter((s) => s.codec_type === "subtitle")
    .map((s, index) => ({
      index,
      codec: s.codec_name ?? "desconhecido",
      language: tag(s, "language"),
      title: tag(s, "title"),
      text: TEXT_SUBTITLES.has(s.codec_name ?? ""),
    }));
  if (!video && !audio.length) throw new Error("Arquivo sem vídeo ou som reconhecível.");
  const duration = Number(probe.format?.duration ?? 0);
  if (!(duration > 0) || duration > 86400 * 2)
    throw new Error("Não foi possível ler a duração deste arquivo.");
  const rotation = video ? streamRotation(video) : 0;
  const turned = rotation === 90 || rotation === 270;
  const width = video?.width ?? 0,
    height = video?.height ?? 0;
  return {
    path,
    name,
    container: probe.format?.format_name ?? "",
    duration,
    size,
    bitRate: Number(probe.format?.bit_rate ?? 0) || 0,
    hasVideo: !!video,
    videoCodec: video?.codec_name,
    videoProfile: video?.profile,
    // What the person sees: a portrait phone video is taller than wide.
    width: turned ? height : width,
    height: turned ? width : height,
    fps: Math.round((rate(video?.avg_frame_rate) || rate(video?.r_frame_rate)) * 100) / 100,
    pixFmt: video?.pix_fmt,
    timeBase: video?.time_base,
    rotation,
    audio,
    subtitles,
  };
}

/** Keyframe times from `ffprobe -show_entries packet=pts_time,flags -of csv=p=0` lines. */
export function keyframesFromPackets(lines: readonly string[]): number[] {
  const out: number[] = [];
  for (const line of lines) {
    const [pts = "", flags = ""] = line.split(",");
    const t = Number(pts);
    if (flags.includes("K") && Number.isFinite(t) && t >= 0) out.push(t);
  }
  out.sort((a, b) => a - b);
  return out.filter((t, i) => i === 0 || t - (out.at(i - 1) ?? -1) > 1e-4);
}

/** Bars of a waveform from 16-bit mono samples: the peak of each bucket, 0..1. */
export function peaks(samples: Int16Array, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (!samples.length) return out;
  const per = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const from = Math.floor(b * per),
      to = Math.min(samples.length, Math.floor((b + 1) * per));
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i] ?? 0);
      if (v > max) max = v;
    }
    out[b] = Math.min(1, max / 32768);
  }
  return out;
}
