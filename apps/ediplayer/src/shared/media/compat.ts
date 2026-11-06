import type { MediaFacts, PlaybackCaps } from "../types.ts";

/** Video codecs Chromium decodes everywhere; HEVC and AV1 depend on the machine. */
const VIDEO_ALWAYS = new Set(["h264", "vp8", "vp9"]);
/** Audio codecs Chromium decodes. AC-3, DTS, WMA and friends need conversion. */
export const PLAYABLE_AUDIO = new Set([
  "aac",
  "mp3",
  "opus",
  "vorbis",
  "flac",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_f32le",
  "pcm_u8",
  "alac",
]);

export function videoPlayable(codec: string | undefined, caps: PlaybackCaps): boolean {
  if (!codec) return true;
  if (VIDEO_ALWAYS.has(codec)) return true;
  if (codec === "hevc") return caps.hevc;
  if (codec === "av1") return caps.av1;
  return false;
}

const audioPlayable = (codec: string | undefined) => !codec || PLAYABLE_AUDIO.has(codec);

/** Containers Chromium opens by itself. Matroska is tried and falls back on error. */
function containerKind(container: string): "mp4" | "webm" | "mkv" | "audio" | "other" {
  if (/\bmov\b|\bmp4\b/.test(container)) return "mp4";
  if (/matroska|webm/.test(container)) return "mkv";
  if (/^(mp3|flac|wav|ogg|aac)$/.test(container)) return "audio";
  return "other";
}

/**
 * How the file can reach the <video>: as it is, by copying the streams into an MP4 the browser
 * opens (seconds, no loss), or through a converted preview (minutes, lighter picture).
 */
export function playbackPlan(
  facts: MediaFacts,
  caps: PlaybackCaps,
  audioIndex: number,
): "native" | "remux" | "preview" {
  const audio = facts.audio.at(audioIndex) ?? facts.audio.at(0);
  const video = facts.hasVideo ? facts.videoCodec : undefined;
  if (!videoPlayable(video, caps)) return "preview";
  const kind = containerKind(facts.container);
  const sound = audioPlayable(audio?.codec);
  // Another audio track than the first cannot be picked in Chromium: copy it into its own file.
  if (audioIndex > 0 && facts.audio.length > 1) return "remux";
  if (!sound) return "remux";
  if (kind === "mp4" || kind === "audio") return "native";
  if (kind === "mkv") {
    if (video === "h264" && !caps.mkvH264) return "remux";
    return "native";
  }
  return "remux";
}

/** Fields two files must share to be joined by copying the streams. */
export function concatCompatible(a: MediaFacts, b: MediaFacts): string | null {
  if (a.hasVideo !== b.hasVideo) return "Um arquivo tem imagem e o outro não.";
  if (a.hasVideo) {
    if (a.videoCodec !== b.videoCodec) return "Os vídeos usam formatos de imagem diferentes.";
    if (a.width !== b.width || a.height !== b.height) return "Os vídeos têm tamanhos diferentes.";
    if (a.pixFmt !== b.pixFmt) return "Os vídeos usam cores em formatos diferentes.";
    if (Math.abs(a.fps - b.fps) > 0.01) return "Os vídeos têm quadros por segundo diferentes.";
    if (a.rotation !== b.rotation) return "Os vídeos estão girados de formas diferentes.";
  }
  const x = a.audio.at(0),
    y = b.audio.at(0);
  if (!!x !== !!y) return "Um arquivo tem som e o outro não.";
  if (x && y) {
    if (x.codec !== y.codec) return "Os sons usam formatos diferentes.";
    if (x.sampleRate !== y.sampleRate || x.channels !== y.channels)
      return "Os sons têm qualidades diferentes.";
  }
  return null;
}

/** Why a set of files cannot be joined without conversion, or null when they can. */
export function joinBlocker(files: readonly MediaFacts[]): string | null {
  const first = files.at(0);
  if (!first) return "Escolha os arquivos.";
  for (const f of files.slice(1)) {
    const why = concatCompatible(first, f);
    if (why) return `${f.name}: ${why}`;
  }
  return null;
}
