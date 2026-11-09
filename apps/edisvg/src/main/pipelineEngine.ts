import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { NativeMedia, resolveNativeMedia } from "@informach/edi-desktop/native-media";
import { createWhisper } from "@informach/edi-speech/node/whisper";
import type { HeardWord } from "@informach/edi-speech/piece";
import { app, type BrowserWindow, dialog } from "electron";
import { unzipSync } from "fflate";
import { suggestedNameSchema } from "./exportPayload.ts";
import { cutNarrationArgs, lessonWords, mixNarrationArgs } from "./pipelineMedia.ts";
import { pickedPath } from "./pipelines.ts";
import {
  alphaWebmArgs,
  findCursorFile,
  frameArgs,
  previewArgs,
  type RecordedClick,
  readClicks,
} from "./pipelineVideo.ts";

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

/** What a run needs to know about the demonstration video, and the clicks saved with it. */
export async function pipelineVideoFacts(token: unknown): Promise<{
  width: number;
  height: number;
  duration: number;
  clicks: RecordedClick[] | null;
}> {
  const path = pickedPath(token, "video");
  const facts = await machine().media.probe(path);
  if (!facts.hasVideo || !facts.width || !facts.height)
    throw new Error("O arquivo não tem imagem de vídeo.");
  const cursor = findCursorFile(path);
  return {
    width: facts.width,
    height: facts.height,
    duration: facts.duration,
    clicks: cursor ? await readClicks(cursor, facts) : null,
  };
}

/** The first `seconds` of the demonstration as a light MP4 (bytes) for the preview. */
export async function pipelineVideoPreview(token: unknown, seconds: number): Promise<Uint8Array> {
  const path = pickedPath(token, "video");
  const { paths, media } = machine();
  const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-demo-"));
  try {
    const out = join(dir, "previa.mp4");
    await media.run(paths.ffmpeg, previewArgs(path, seconds, out));
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Frames of the demonstration at `times` (seconds), as JPEG for the assistant. */
export async function pipelineVideoFrames(
  token: unknown,
  times: unknown,
): Promise<{ mediaType: "image/jpeg"; data: string }[]> {
  if (!Array.isArray(times) || times.length > 4 || !times.every((t) => Number.isFinite(t)))
    throw new Error("Quadros pedidos inválidos.");
  const path = pickedPath(token, "video");
  const { paths, media } = machine();
  const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-frames-"));
  try {
    const out: { mediaType: "image/jpeg"; data: string }[] = [];
    for (const [index, at] of (times as number[]).entries()) {
      const file = join(dir, `quadro-${index}.jpg`);
      await media.run(paths.ffmpeg, frameArgs(path, at, file));
      out.push({ mediaType: "image/jpeg", data: (await readFile(file)).toString("base64") });
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Bounded: a transparent layer is a PNG sequence of at most this many bytes. */
const ALPHA_ZIP_BYTES = 512 * 1024 ** 2;

/**
 * The transparent layer: the PNG sequence (ZIP, as the PNG export makes it) encoded as WebM with
 * alpha, then saved where the person chooses. Returns whether it was saved.
 */
export async function exportAlphaWebm(
  win: BrowserWindow,
  input: unknown,
  defaultFolder: string | undefined,
  /** The suite's access check, before anything is written (as every export). */
  assertAccess: () => void,
): Promise<{ saved: boolean }> {
  const value = input as { bytes?: unknown; name?: unknown };
  if (!(value?.bytes instanceof Uint8Array) || value.bytes.byteLength > ALPHA_ZIP_BYTES)
    throw new Error("Sequência de quadros inválida.");
  const files = unzipSync(value.bytes);
  const manifest = files["sequence.json"];
  if (!manifest) throw new Error("A sequência não tem o manifesto.");
  const { fps, frames } = JSON.parse(new TextDecoder().decode(manifest)) as {
    fps: number;
    frames: number;
  };
  const name = suggestedNameSchema.safeParse(value.name).data ?? "camada";
  const { paths, media } = machine();
  const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-alpha-"));
  try {
    for (let index = 0; index < frames; index++) {
      const file = `quadro-${String(index).padStart(5, "0")}.png`;
      const bytes = files[file];
      if (!bytes) throw new Error(`Falta o quadro ${index} na sequência.`);
      await writeFile(join(dir, file), bytes);
    }
    const out = join(dir, "camada.webm");
    await media.run(paths.ffmpeg, alphaWebmArgs(dir, fps, out));
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: join(defaultFolder ?? "", `${name}.webm`),
      properties: ["dontAddToRecent"],
      filters: [{ name: "Camada transparente (WebM)", extensions: ["webm"] }],
    });
    if (canceled || !filePath) return { saved: false };
    assertAccess();
    await copyFile(out, filePath);
    return { saved: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
