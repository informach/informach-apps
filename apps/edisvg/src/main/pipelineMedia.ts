import { readFile } from "node:fs/promises";
import type { HeardWord } from "@informach/edi-speech/piece";
import { z } from "zod";

/**
 * The narration of a pipeline run, on the main process: the words of an EdiAula lesson on its own
 * clock, and the stretch of narration the preview plays (cut from an audio file, or mixed from the
 * lesson's voice clips). FFmpeg comes from the caller (the suite's native media), so the tests use
 * the same binary as the app.
 */

/** A lesson as far as its voice goes; everything else in the file is left alone. */
const lessonSchema = z.looseObject({
  assets: z.array(
    z.looseObject({
      id: z.string(),
      path: z.string(),
      transcript: z.string().optional(),
      transcriptStatus: z.string().optional(),
      hasAudio: z.boolean().optional(),
    }),
  ),
  tracks: z.array(z.looseObject({ id: z.string(), muted: z.boolean().optional() })),
  clips: z.array(
    z.looseObject({
      assetId: z.string(),
      trackId: z.string(),
      start: z.number(),
      in: z.number(),
      duration: z.number().positive(),
      speed: z.number().positive().nullish(),
      volume: z.number().nullish(),
      muted: z.boolean().nullish(),
    }),
  ),
});

const transcriptSchema = z.looseObject({
  words: z.array(
    z.looseObject({
      text: z.string(),
      start: z.number(),
      end: z.number(),
      p: z.number().optional(),
      dropped: z.string().optional(),
    }),
  ),
});

/** A clip whose voice is heard in the lesson: its file and where it plays. */
export interface VoiceClip {
  path: string;
  /** Lesson second it starts at. */
  start: number;
  /** Source second it starts from. */
  in: number;
  /** Lesson seconds it lasts. */
  duration: number;
  speed: number;
}

/**
 * Every word heard in an EdiAula lesson, on the lesson's clock, from the transcripts of the clips
 * that sound (track and clip not muted, volume above zero), and those clips. Words the
 * transcription set aside (hallucinations) are left out.
 */
export async function lessonWords(
  lessonPath: string,
): Promise<{ words: HeardWord[]; voices: VoiceClip[] }> {
  const parsed = lessonSchema.safeParse(JSON.parse(await readFile(lessonPath, "utf8")));
  if (!parsed.success) throw new Error("O arquivo não é uma aula do EdiAula que dê para ler.");
  const lesson = parsed.data;
  const muted = new Set(lesson.tracks.filter((t) => t.muted).map((t) => t.id));
  const assets = new Map(lesson.assets.map((a) => [a.id, a]));
  const transcripts = new Map<string, z.infer<typeof transcriptSchema>["words"]>();
  const words: HeardWord[] = [];
  const voices: VoiceClip[] = [];
  for (const clip of lesson.clips) {
    const asset = assets.get(clip.assetId);
    if (!asset?.transcript || asset.transcriptStatus !== "ready") continue;
    if (muted.has(clip.trackId) || clip.muted || (clip.volume ?? 1) <= 0) continue;
    let heard = transcripts.get(asset.transcript);
    if (!heard) {
      try {
        const read = transcriptSchema.safeParse(
          JSON.parse(await readFile(asset.transcript, "utf8")),
        );
        heard = read.success ? read.data.words : [];
      } catch {
        // A transcript that is gone: this clip's words are not known.
        heard = [];
      }
      transcripts.set(asset.transcript, heard);
    }
    const speed = clip.speed ?? 1;
    const to = clip.in + clip.duration * speed;
    for (const w of heard) {
      if (w.dropped || w.start < clip.in || w.start >= to) continue;
      words.push({
        text: w.text,
        start: clip.start + (w.start - clip.in) / speed,
        end: clip.start + (Math.min(w.end, to) - clip.in) / speed,
        p: w.p ?? 1,
      });
    }
    voices.push({
      path: asset.path,
      start: clip.start,
      in: clip.in,
      duration: clip.duration,
      speed,
    });
  }
  words.sort((a, b) => a.start - b.start);
  if (!words.length)
    throw new Error(
      "A aula não tem transcrição nas faixas que soam. Transcreva a narração no EdiAula e tente de novo.",
    );
  return { words, voices };
}

/** The narration plays in the preview from a small mono WAV (any player decodes it). */
const NARRATION_RATE = 22050;
/** Longer than this is not a scene. */
export const NARRATION_MAX_SECONDS = 15 * 60;

const pcmOut = (out: string) => [
  "-ac",
  "1",
  "-ar",
  String(NARRATION_RATE),
  "-c:a",
  "pcm_s16le",
  out,
];

/** Arguments that cut [start, end) of an audio (or video) file into the narration WAV. */
export function cutNarrationArgs(
  source: string,
  start: number,
  end: number,
  out: string,
): string[] {
  if (!(end > start) || end - start > NARRATION_MAX_SECONDS)
    throw new Error("Trecho de narração inválido.");
  return [
    "-y",
    "-v",
    "error",
    "-ss",
    Math.max(0, start).toFixed(3),
    "-to",
    end.toFixed(3),
    "-i",
    source,
    "-vn",
    ...pcmOut(out),
  ];
}

/** atempo takes 0.5–2 per stage: a speed outside it is chained. */
function tempo(speed: number): string[] {
  const out: string[] = [];
  let left = speed;
  while (left > 2) {
    out.push("atempo=2");
    left /= 2;
  }
  while (left < 0.5) {
    out.push("atempo=0.5");
    left /= 0.5;
  }
  if (Math.abs(left - 1) > 1e-6) out.push(`atempo=${left.toFixed(6)}`);
  return out;
}

/**
 * Arguments that mix the lesson's voice clips over [start, end) of the lesson into the narration
 * WAV: each clip's overlap, at its speed, delayed to where it plays. Null when no clip sounds
 * there.
 */
export function mixNarrationArgs(
  voices: readonly VoiceClip[],
  start: number,
  end: number,
  out: string,
): string[] | null {
  if (!(end > start) || end - start > NARRATION_MAX_SECONDS)
    throw new Error("Trecho de narração inválido.");
  const inputs: string[] = [];
  const chains: string[] = [];
  for (const v of voices) {
    const from = Math.max(start, v.start);
    const to = Math.min(end, v.start + v.duration);
    if (to - from < 0.02) continue;
    const srcFrom = v.in + (from - v.start) * v.speed;
    const srcTo = v.in + (to - v.start) * v.speed;
    const index = inputs.length / 2;
    inputs.push("-i", v.path);
    const delay = Math.round((from - start) * 1000);
    chains.push(
      `[${index}:a]${[
        `atrim=start=${srcFrom.toFixed(3)}:end=${srcTo.toFixed(3)}`,
        "asetpts=PTS-STARTPTS",
        ...tempo(v.speed),
        `aresample=${NARRATION_RATE}`,
        "aformat=channel_layouts=mono",
        `adelay=${delay}:all=1`,
      ].join(",")}[v${index}]`,
    );
  }
  if (!chains.length) return null;
  const count = chains.length;
  const labels = Array.from({ length: count }, (_, i) => `[v${i}]`).join("");
  const length = (end - start).toFixed(3);
  const graph = [
    ...chains,
    `${labels}amix=inputs=${count}:normalize=0:dropout_transition=0,apad,atrim=end=${length}[mix]`,
  ].join(";");
  return [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[mix]",
    ...pcmOut(out),
  ];
}
