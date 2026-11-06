import { z } from "zod";
import type { MediaFacts } from "./types.ts";

/**
 * Edits EdiPlayer runs. A job always writes new files: the source is never changed. Paths come
 * from the person's own dialogs; the main process re-checks every one of them.
 */

const path = z.string().min(1).max(32768);
const range = z.strictObject({
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400),
});

export const PRESET_IDS = ["original", "whatsapp", "email", "youtube", "mp3", "gif"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface Preset {
  id: PresetId;
  name: string;
  detail: string;
  /** Short side of the picture, never above the source's. */
  maxShort?: number;
  /** Size the file aims at, in MB; the bitrate follows from the duration. */
  targetMB?: number;
  /** Constant quality when there is no size target (CRF for x264). */
  crf?: number;
  audioKbps: number;
}

export const PRESETS: readonly Preset[] = [
  { id: "original", name: "Original", detail: "Sem perda, em segundos", crf: 18, audioKbps: 192 },
  {
    id: "whatsapp",
    name: "WhatsApp",
    detail: "Leve, para o chat",
    maxShort: 720,
    targetMB: 15,
    audioKbps: 96,
  },
  {
    id: "email",
    name: "E-mail",
    detail: "Bem leve, para anexar",
    maxShort: 480,
    targetMB: 10,
    audioKbps: 64,
  },
  {
    id: "youtube",
    name: "YouTube",
    detail: "1080p, alta qualidade",
    maxShort: 1080,
    crf: 20,
    audioKbps: 192,
  },
  { id: "mp3", name: "Só áudio", detail: "MP3 da fala", audioKbps: 192 },
  { id: "gif", name: "GIF", detail: "Sem som, em loop", maxShort: 480, audioKbps: 0 },
];

export const presetOf = (id: PresetId): Preset =>
  PRESETS.find((p) => p.id === id) ?? (PRESETS.at(0) as Preset);

/** GIF frames per second and the length past which a GIF gets heavy. */
export const GIF_FPS = 15;
export const GIF_LONG = 30;

export const transformSchema = z.strictObject({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  flipH: z.boolean(),
  flipV: z.boolean(),
  /** Normalized to the picture as shown (after the file's own rotation). */
  crop: z
    .strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0.02).max(1),
      h: z.number().min(0.02).max(1),
    })
    .nullable(),
  speed: z.number().min(0.5).max(4),
  /** Linear volume, 1 = unchanged. */
  gain: z.number().min(0).max(4),
  normalize: z.boolean(),
  removeAudio: z.boolean(),
  audioIndex: z.int().min(0).max(63),
  replaceAudio: path.nullable(),
  burnSubtitles: path.nullable(),
  /** Seconds added to every cue of an external subtitle file before burning it. */
  subtitleDelay: z.number().min(-600).max(600),
});
export type Transform = z.infer<typeof transformSchema>;

export const NO_TRANSFORM: Transform = {
  rotate: 0,
  flipH: false,
  flipV: false,
  crop: null,
  speed: 1,
  gain: 1,
  normalize: false,
  removeAudio: false,
  audioIndex: 0,
  replaceAudio: null,
  burnSubtitles: null,
  subtitleDelay: 0,
};

export const editJobSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("export"),
    source: path,
    ranges: z.array(range).min(1).max(500),
    precise: z.boolean(),
    transform: transformSchema,
    preset: z.enum(PRESET_IDS),
    output: path,
  }),
  z.strictObject({
    kind: z.literal("split"),
    source: path,
    pieces: z.array(range).min(2).max(500),
    folder: path,
    // A plain file name: no folders, drive letters, streams or reserved device names.
    baseName: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^<>:"/\\|?*]+$/)
      .refine(
        (name) =>
          [...name].every((c) => c.charCodeAt(0) >= 32) &&
          !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) &&
          !/[. ]$/.test(name),
      ),
  }),
  z.strictObject({
    kind: z.literal("join"),
    sources: z.array(path).min(2).max(50),
    preset: z.enum(["original", "youtube", "whatsapp", "email"]),
    output: path,
  }),
  z.strictObject({
    kind: z.literal("audio"),
    source: path,
    ranges: z.array(range).min(1).max(500),
    audioIndex: z.int().min(0).max(63),
    format: z.enum(["copy", "mp3"]),
    output: path,
  }),
]);
export type EditJob = z.infer<typeof editJobSchema>;

/**
 * Whether an export can copy the picture (fast, no quality loss). A sound-only file copies its
 * sound when the codec has a container to go in and the sound itself is not changed.
 */
export function canCopy(
  transform: Transform,
  preset: PresetId,
  precise: boolean,
  facts?: Pick<MediaFacts, "hasVideo" | "audio">,
): boolean {
  const picture =
    preset === "original" &&
    !precise &&
    !transform.flipH &&
    !transform.flipV &&
    !transform.crop &&
    transform.speed === 1 &&
    transform.gain === 1 &&
    !transform.normalize &&
    !transform.burnSubtitles;
  if (!picture || !facts || facts.hasVideo) return picture;
  const codec = (facts.audio.at(transform.audioIndex) ?? facts.audio.at(0))?.codec ?? "";
  return !transform.removeAudio && !transform.replaceAudio && !!audioCopyExtension(codec);
}

// WebM takes no AAC: the cut's matching sound is AAC, so WebM results go in Matroska.
const COPY_CONTAINERS: Record<string, string> = {
  mp4: "mp4",
  m4v: "mp4",
  mov: "mov",
  mkv: "mkv",
  webm: "mkv",
  mp3: "mp3",
  m4a: "m4a",
  aac: "m4a",
  wav: "wav",
  ogg: "ogg",
  oga: "ogg",
  opus: "ogg",
};

/** Extension of a copied (lossless) result: the source's own container, else Matroska. */
export function copyExtension(sourcePath: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(sourcePath)?.[1]?.toLowerCase() ?? "";
  return COPY_CONTAINERS[ext] ?? "mkv";
}

/** Extension of an export's file. */
export function exportExtension(
  sourcePath: string,
  preset: PresetId,
  copy: boolean,
  hasVideo = true,
  audioCodec = "",
): string {
  if (!hasVideo)
    return preset === "original" && copy ? (audioCopyExtension(audioCodec) ?? "mp3") : "mp3";
  if (preset === "mp3") return "mp3";
  if (preset === "gif") return "gif";
  if (preset === "original" && copy) return copyExtension(sourcePath);
  return "mp4";
}

/** Extension for an audio stream copied out of a video. */
export function audioCopyExtension(codec: string): string | null {
  const map: Record<string, string> = {
    aac: "m4a",
    alac: "m4a",
    mp3: "mp3",
    vorbis: "ogg",
    opus: "ogg",
    pcm_s16le: "wav",
    pcm_s24le: "wav",
    pcm_f32le: "wav",
  };
  return map[codec] ?? null;
}

/** Video bitrate that makes `seconds` of output land near `targetMB`, within sane bounds. */
export function bitrateForTarget(seconds: number, targetMB: number, audioKbps: number): number {
  const totalKbps = (targetMB * 8 * 1024) / Math.max(1, seconds);
  return Math.round(Math.min(8000, Math.max(250, totalKbps * 0.96 - audioKbps)));
}

/** Output size of the picture: the preset's short side, never upscaled, even numbers. */
export function outputSize(
  width: number,
  height: number,
  maxShort: number | undefined,
): [number, number] {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const short = Math.min(width, height);
  if (!maxShort || short <= maxShort) return [even(width), even(height)];
  const k = maxShort / short;
  return [even(width * k), even(height * k)];
}

/** Rough size in bytes, shown before saving. */
export function estimateBytes(
  facts: Pick<MediaFacts, "duration" | "size" | "hasVideo" | "audio">,
  seconds: number,
  preset: PresetId,
  copy: boolean,
  removeAudio: boolean,
): number {
  const p = presetOf(preset);
  if (copy) {
    const share = facts.duration > 0 ? seconds / facts.duration : 1;
    const audioShare = removeAudio && facts.audio.length ? 0.9 : 1;
    return facts.size * share * audioShare;
  }
  if (preset === "mp3") return (192 * 1000 * seconds) / 8;
  if (preset === "gif") return seconds * 180_000;
  if (p.targetMB)
    return Math.min(
      p.targetMB * 1024 * 1024,
      ((bitrateForTarget(seconds, p.targetMB, p.audioKbps) + p.audioKbps) * 1000 * seconds) / 8,
    );
  return ((p.id === "youtube" ? 8000 : 10000) * 1000 * seconds) / 8;
}

/** "aula (editado).mp4" style names; split pieces get " (parte N)". */
export function editedName(sourceName: string, suffix: string, extension: string): string {
  const stem =
    sourceName
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*]/g, "")
      .trim() || "video";
  return `${stem} (${suffix}).${extension}`;
}
