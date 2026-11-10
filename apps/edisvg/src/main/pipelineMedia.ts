import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
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
      /** What a recording made it: "narration", "mic", "screen", "system" (the page's sound). */
      recording: z.looseObject({ role: z.string().optional() }).optional(),
    }),
  ),
  tracks: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      muted: z.boolean().optional(),
      music: z.boolean().optional(),
      sfx: z.boolean().optional(),
      clicks: z.boolean().optional(),
    }),
  ),
  clips: z.array(
    z.looseObject({
      assetId: z.string(),
      trackId: z.string(),
      start: z.number(),
      in: z.number(),
      duration: z.number().positive(),
      speed: z.number().positive().nullish(),
      volume: z.number().nullish(),
      mutedFor: z.unknown().optional(),
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

/**
 * A path from inside a lesson (the person picked the lesson, not what it points to): a file on
 * this computer only. A URL or a network share would have FFmpeg reach out of the machine.
 */
const localPath = (path: string): boolean => isAbsolute(path) && !/^[\\/]{2}/.test(path);

/** Inputs of FFmpeg are files only (as the suite's probe and frame): never a URL. */
export const fileInput = (path: string): string[] => [
  "-protocol_whitelist",
  "file,pipe",
  "-i",
  path,
];

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

/** The words of a transcript, as EdiAula writes them (a word set aside has `dropped`). */
export type TranscriptWord = z.infer<typeof transcriptSchema>["words"][number];

/**
 * Hears the voice files that have no transcript (the run transcribes them): the words of each
 * path, on the file's own clock.
 */
export type HearVoices = (
  paths: readonly string[],
) => Promise<ReadonlyMap<string, readonly TranscriptWord[]>>;

type Lesson = z.infer<typeof lessonSchema>;
type LessonAsset = Lesson["assets"][number];
type LessonClip = Lesson["clips"][number];

async function readLesson(lessonPath: string): Promise<Lesson> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(lessonPath, "utf8"));
  } catch {
    raw = null;
  }
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) throw new Error("O arquivo não é uma aula do EdiAula que dê para ler.");
  return parsed.data;
}

/**
 * The clips someone is heard speaking in, in the lesson's order: track and clip not muted, volume
 * above zero, a file of this computer with sound. Not someone speaking, as EdiAula decides
 * (shared/audio.ts): a muted, music, sound effects or clicks track; a clip silenced while another
 * voice speaks (mutedFor); and the page's sound or the screen of a recording.
 */
/** The tracks whose sound is not the voice: muted, music, clicks and sound effects. */
export function silentTracks(
  tracks: readonly {
    id: string;
    muted?: boolean;
    music?: unknown;
    clicks?: unknown;
    sfx?: unknown;
    name?: string;
  }[],
): Set<string> {
  return new Set(
    tracks
      .filter(
        (t) =>
          t.muted || t.music || t.clicks || t.sfx || (t.name ?? "").startsWith("Efeitos sonoros"),
      )
      .map((t) => t.id),
  );
}

/**
 * Whether a clip of the lesson is voice that sounds: a media with sound (not the page's sound of a
 * guided take, nor a screen recording), on a track of voice, not muted. The run hears these and
 * mixes them; a package gives out the media of these (lessonPackage.ts) and of the screen.
 */
export const soundsAsVoice = (
  clip: { trackId: string; mutedFor?: unknown; volume?: number | null },
  asset: { hasAudio?: boolean; recording?: { role?: string } },
  silent: ReadonlySet<string>,
): boolean =>
  asset.hasAudio !== false &&
  asset.recording?.role !== "system" &&
  asset.recording?.role !== "screen" &&
  !silent.has(clip.trackId) &&
  !clip.mutedFor &&
  (clip.volume ?? 1) > 0;

function soundingClips(lesson: Lesson): { clip: LessonClip; asset: LessonAsset }[] {
  const silent = silentTracks(lesson.tracks);
  const assets = new Map(lesson.assets.map((a) => [a.id, a]));
  const out: { clip: LessonClip; asset: LessonAsset }[] = [];
  for (const clip of lesson.clips) {
    const asset = assets.get(clip.assetId);
    if (!asset || !localPath(asset.path) || !soundsAsVoice(clip, asset, silent)) continue;
    out.push({ clip, asset });
  }
  return out;
}

const voiceOf = (clip: LessonClip, asset: LessonAsset): VoiceClip => ({
  path: asset.path,
  start: clip.start,
  in: clip.in,
  duration: clip.duration,
  speed: clip.speed ?? 1,
});

/** The clips of an EdiAula lesson where someone is heard, for the narration of a stretch. */
export async function lessonVoices(lessonPath: string): Promise<VoiceClip[]> {
  return soundingClips(await readLesson(lessonPath)).map(({ clip, asset }) => voiceOf(clip, asset));
}

/** The words of a transcript file of this computer; null when it cannot be read. */
async function transcriptWords(path: string): Promise<TranscriptWord[] | null> {
  if (!localPath(path)) return null;
  try {
    const read = transcriptSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return read.success ? read.data.words : null;
  } catch {
    return null;
  }
}

/**
 * Every word heard in an EdiAula lesson, on the lesson's clock, and the clips they come from. The
 * words of a clip are its file's transcript when the lesson has one ready; a file without one is
 * given to `hear` (all of them in one call), or left without words when there is no `hear`.
 * Words the transcription set aside (hallucinations) are left out.
 */
export async function lessonWords(
  lessonPath: string,
  hear?: HearVoices,
): Promise<{ words: HeardWord[]; voices: VoiceClip[] }> {
  const sounding = soundingClips(await readLesson(lessonPath));
  // By asset: two media of the lesson may share a file with transcripts of their own.
  const known = new Map<string, readonly TranscriptWord[] | null>();
  for (const { asset } of sounding) {
    if (known.has(asset.id)) continue;
    known.set(
      asset.id,
      asset.transcript && asset.transcriptStatus === "ready"
        ? await transcriptWords(asset.transcript)
        : null,
    );
  }
  // A file is heard once, whatever number of media point at it.
  const unheard = [
    ...new Set(sounding.filter(({ asset }) => !known.get(asset.id)).map(({ asset }) => asset.path)),
  ];
  const heardFiles = hear && unheard.length ? await hear(unheard) : new Map();
  const words: HeardWord[] = [];
  for (const { clip, asset } of sounding) {
    const heard = known.get(asset.id) ?? heardFiles.get(asset.path) ?? [];
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
  }
  words.sort((a, b) => a.start - b.start);
  if (!words.length)
    throw new Error(
      hear
        ? "Não ouvi fala nas faixas de voz da aula. Confira no EdiAula se a narração está na aula."
        : "A aula não tem transcrição nas faixas que soam. Transcreva a narração no EdiAula e tente de novo.",
    );
  return { words, voices: sounding.map(({ clip, asset }) => voiceOf(clip, asset)) };
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
    ...fileInput(source),
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
    const index = chains.length;
    inputs.push(...fileInput(v.path));
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

/**
 * A Portuguese transcript EdiAula already made of this file (with or without its glossary terms,
 * with or without voice detection), the newest one; null when there is none.
 */
export function existingTranscript(dir: string): string | null {
  let best: { path: string; at: number } | null = null;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    // EdiAula never opened this file (or is not installed): nothing made yet.
    return null;
  }
  for (const name of names) {
    if (!/^transcript-.+-pt(?:-[0-9a-f]{8})?(?:-vad)?-b1\.json$/.test(name)) continue;
    const path = join(dir, name);
    const at = statSync(path).mtimeMs;
    if (!best || at > best.at) best = { path, at };
  }
  return best?.path ?? null;
}
