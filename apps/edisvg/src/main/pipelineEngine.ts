import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { NativeMedia, resolveNativeMedia } from "@informach/edi-desktop/native-media";
import { createWhisper } from "@informach/edi-speech/node/whisper";
import type { HeardWord } from "@informach/edi-speech/piece";
import { app } from "electron";
import { cutNarrationArgs, lessonWords, mixNarrationArgs } from "./pipelineMedia.ts";
import { pickedPath } from "./pipelines.ts";

/**
 * What the pipelines need from the machine: the suite's FFmpeg, and the transcription engine of
 * EdiAula. The engine, its models and the transcripts are EdiAula's folders (the same files, never
 * downloaded twice): a lesson audio transcribed in EdiAula is not transcribed again here.
 */

const developmentRequire = createRequire(import.meta.url);
let engine: ReturnType<typeof build> | null = null;

function build() {
  const paths = resolveNativeMedia({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    developmentRoot: app.getAppPath(),
    developmentBinary: (name) =>
      developmentRequire(name === "ffmpeg" ? "ffmpeg-static" : "@derhuerst/ffprobe-static"),
  });
  const media = new NativeMedia(paths, {
    maxRunning: 2,
    maxTimeoutMs: null,
    maxStdoutBytes: 16 * 1024 ** 2,
    exclusiveJobIds: false,
    cancelledMessage: "Cancelado",
  });
  // EdiAula's profile folder; in development a test can point it elsewhere (as EDISVG_USER_DATA).
  const ediaula =
    !app.isPackaged && process.env.EDISVG_EDIAULA_DATA
      ? process.env.EDISVG_EDIAULA_DATA
      : join(app.getPath("appData"), "ediaula");
  const whisper = createWhisper({
    root: () => join(ediaula, "whisper"),
    ffmpeg: () => paths.ffmpeg,
    run: (bin, args, opts) => media.run(bin, args, opts),
    // EdiAula's cache folder for the file (same key): its transcript is found there.
    cacheDir: (path) => {
      const st = statSync(path);
      const key = createHash("sha1")
        .update(`${path}|${st.size}|${st.mtimeMs}`)
        .digest("hex")
        .slice(0, 16);
      const dir = join(ediaula, "cache", key);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    // Only the recommendation of which engine to install looks at it; EdiAula installs it.
    gpu: async () => false,
  });
  return { paths, media, whisper };
}

const machine = () => {
  engine ??= build();
  return engine;
};

/**
 * The words of the audio a run picked: a lesson's transcripts on its clock, or a file transcribed
 * now (Portuguese) with EdiAula's engine. Progress goes to `onProgress` (0..1).
 */
export async function pipelineWords(
  token: unknown,
  kind: unknown,
  jobId: string,
  onProgress: (ratio: number) => void,
): Promise<HeardWord[]> {
  if (kind === "lesson") return (await lessonWords(pickedPath(token, "lesson"))).words;
  const path = pickedPath(token, "audio");
  const { media, whisper } = machine();
  const status = await whisper.engineStatus();
  if (!status.bin || !status.model)
    throw new Error(
      "A transcrição ainda não está instalada. Instale o motor e um modelo no EdiAula (painel Transcrição): o EdiSVG usa os mesmos.",
    );
  const facts = await media.probe(path);
  if (!facts.duration) throw new Error("Não consegui ler a duração do áudio.");
  const out = await whisper.transcribe(jobId, path, facts.duration, "pt", [], onProgress);
  const transcript = JSON.parse(await readFile(out, "utf8")) as {
    words: (HeardWord & { dropped?: string })[];
  };
  return transcript.words.filter((w) => !w.dropped);
}

/** The narration of [start, end) of the picked audio, as WAV bytes for the preview. */
export async function pipelineNarration(
  token: unknown,
  kind: unknown,
  start: number,
  end: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Trecho inválido.");
  const { paths, media } = machine();
  const dir = join(app.getPath("temp"), "edisvg-narration");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${randomUUID()}.wav`);
  try {
    if (kind === "lesson") {
      const { voices } = await lessonWords(pickedPath(token, "lesson"));
      const args = mixNarrationArgs(voices, start, end, out);
      if (!args) throw new Error("Nenhuma voz soa nesse trecho da aula.");
      await media.run(paths.ffmpeg, args);
    } else
      await media.run(paths.ffmpeg, cutNarrationArgs(pickedPath(token, "audio"), start, end, out));
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(out, { force: true });
  }
}

/** Stops the transcription (or FFmpeg run) of a job. */
export function cancelPipelineJob(jobId: string): void {
  if (!engine) return;
  engine.whisper.cancelWhisper(jobId);
  engine.media.cancel(jobId);
}
