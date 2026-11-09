import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { NativeMedia, resolveNativeMedia } from "@informach/edi-desktop/native-media";
import { createWhisper } from "@informach/edi-speech/node/whisper";
import type { HeardWord } from "@informach/edi-speech/piece";
import { app, type BrowserWindow, dialog } from "electron";
import { type UnzipOptions, type Unzipped, unzip } from "fflate";
import { suggestedNameSchema } from "./exportPayload.ts";
import {
  cutNarrationArgs,
  existingTranscript,
  lessonWords,
  mixNarrationArgs,
} from "./pipelineMedia.ts";
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

/** The running jobs of the pipelines: Cancelar aborts the signal every step of the job hears. */
const jobs = new Map<string, AbortController>();
function jobSignal(jobId: string): AbortSignal {
  const control = new AbortController();
  jobs.get(jobId)?.abort();
  jobs.set(jobId, control);
  return control.signal;
}
const endJob = (jobId: string, signal: AbortSignal): void => {
  if (jobs.get(jobId)?.signal === signal) jobs.delete(jobId);
};
const validJobId = (jobId: unknown): jobId is string =>
  typeof jobId === "string" && /^[\w-]{1,64}$/.test(jobId);
/**
 * A job's signal from its first line: a Cancelar that arrives while it still reads files (the
 * lesson, the transcripts, the engine) is heard, and the job stops before the next step.
 */
async function withJob<T>(jobId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = jobSignal(jobId);
  try {
    return await work(signal);
  } finally {
    endJob(jobId, signal);
  }
}
/**
 * One FFmpeg run of a job. Its error text is FFmpeg's (English, paths): the person reads what
 * could not be done instead.
 */
async function ffmpeg(
  args: string[],
  jobId: string,
  signal: AbortSignal,
  what: string,
): Promise<void> {
  const { paths, media } = machine();
  try {
    await media.run(paths.ffmpeg, args, { jobId, signal });
  } catch (error) {
    if (signal.aborted) throw new Error("Cancelado");
    console.warn(`[edisvg] FFmpeg (${what}):`, error);
    throw new Error(`Não consegui ${what}. Confira se o arquivo abre num player e tente de novo.`);
  }
}

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
    cacheDir: (path) => cacheDirOf(path),
    // Only the recommendation of which engine to install looks at it; EdiAula installs it.
    gpu: async () => false,
  });
  /**
   * EdiAula's cache folder for the file (same key as EdiAula): its transcript is found there.
   * Created only when a transcription writes into it, never just to look.
   */
  function cacheDirOf(path: string, create = true): string {
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(path);
    } catch {
      throw new Error(`O arquivo ${basename(path)} não foi encontrado.`);
    }
    const key = createHash("sha1")
      .update(`${path}|${st.size}|${st.mtimeMs}`)
      .digest("hex")
      .slice(0, 16);
    const dir = join(ediaula, "cache", key);
    if (create) mkdirSync(dir, { recursive: true });
    return dir;
  }
  return { paths, media, whisper, cacheDirOf };
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
  return withJob(jobId, async (signal) => {
    if (kind === "lesson") return (await lessonWords(pickedPath(token, "lesson"))).words;
    const path = pickedPath(token, "audio");
    const { media, whisper, cacheDirOf } = machine();
    const read = async (file: string) => {
      let words: unknown;
      try {
        words = (JSON.parse(await readFile(file, "utf8")) as { words?: unknown }).words;
      } catch {
        words = null;
      }
      if (!Array.isArray(words))
        throw new Error("A transcrição do áudio não pôde ser lida. Transcreva de novo no EdiAula.");
      return (words as (HeardWord & { dropped?: string })[]).filter((w) => !w.dropped);
    };
    // Transcribed in EdiAula already (its glossary changes the file name): read, not heard again.
    const known = existingTranscript(cacheDirOf(path, false));
    if (known) return read(known);
    const status = await whisper.engineStatus();
    signal.throwIfAborted();
    if (!status.bin || !status.model)
      throw new Error(
        "A transcrição ainda não está instalada. Instale o motor e um modelo no EdiAula (painel Transcrição): o EdiSVG usa os mesmos.",
      );
    const facts = await media.probe(path, signal);
    if (!facts.duration) throw new Error("Não consegui ler a duração do áudio.");
    // The signal reaches every part of the transcription: Cancelar stops it whole (and never
    // treats the stop as a broken voice-detection model, which lives in EdiAula's folder).
    const out = await whisper.transcribe(jobId, path, facts.duration, "pt", [], onProgress, signal);
    return read(out);
  });
}

/** The narration of [start, end) of the picked audio, as WAV bytes for the preview. */
export async function pipelineNarration(
  token: unknown,
  kind: unknown,
  start: number,
  end: number,
  jobId: unknown,
): Promise<Uint8Array> {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Trecho inválido.");
  if (!validJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  return withJob(jobId, async (signal) => {
    const dir = join(app.getPath("temp"), "edisvg-narration");
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `${randomUUID()}.wav`);
    try {
      if (kind === "lesson") {
        const { voices } = await lessonWords(pickedPath(token, "lesson"));
        signal.throwIfAborted();
        // A voice of this stretch whose file moved: said by name, not as FFmpeg's error.
        const gone = voices.find(
          (v) =>
            Math.min(end, v.start + v.duration) - Math.max(start, v.start) >= 0.02 &&
            !existsSync(v.path),
        );
        if (gone)
          throw new Error(
            `A aula usa uma voz que não está mais no lugar (${basename(gone.path)}). Abra a aula no EdiAula para reencontrar a mídia.`,
          );
        const args = mixNarrationArgs(voices, start, end, out);
        if (!args) throw new Error("Nenhuma voz soa nesse trecho da aula.");
        await ffmpeg(args, jobId, signal, "montar a narração da aula");
      } else
        await ffmpeg(
          cutNarrationArgs(pickedPath(token, "audio"), start, end, out),
          jobId,
          signal,
          "cortar a narração do áudio",
        );
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(out, { force: true });
    }
  });
}

/** Stops the transcription (or FFmpeg run) of a job. */
export function cancelPipelineJob(jobId: string): void {
  jobs.get(jobId)?.abort();
  jobs.delete(jobId);
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
  let facts: Awaited<ReturnType<NativeMedia["probe"]>>;
  try {
    facts = await machine().media.probe(path);
  } catch (error) {
    console.warn("[edisvg] FFprobe (vídeo da demonstração):", error);
    throw new Error("Não consegui ler o vídeo. Confira se ele abre num player e tente de novo.");
  }
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
export async function pipelineVideoPreview(
  token: unknown,
  seconds: number,
  jobId: unknown,
): Promise<Uint8Array> {
  if (!validJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  return withJob(jobId, async (signal) => {
    const path = pickedPath(token, "video");
    const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-demo-"));
    try {
      const out = join(dir, "previa.mp4");
      await ffmpeg(previewArgs(path, seconds, out), jobId, signal, "preparar a prévia do vídeo");
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** Frames of the demonstration at `times` (seconds), as JPEG for the assistant. */
export async function pipelineVideoFrames(
  token: unknown,
  times: unknown,
  jobId: unknown,
): Promise<{ mediaType: "image/jpeg"; data: string }[]> {
  if (!Array.isArray(times) || times.length > 4 || !times.every((t) => Number.isFinite(t)))
    throw new Error("Quadros pedidos inválidos.");
  if (!validJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  return withJob(jobId, async (signal) => {
    const path = pickedPath(token, "video");
    const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-frames-"));
    try {
      const out: { mediaType: "image/jpeg"; data: string }[] = [];
      for (const [index, at] of (times as number[]).entries()) {
        signal.throwIfAborted();
        const file = join(dir, `quadro-${index}.jpg`);
        await ffmpeg(frameArgs(path, at, file), jobId, signal, "tirar quadros do vídeo");
        // Past the last picture (sound that outlasts the video) FFmpeg writes nothing: skipped.
        if (!existsSync(file)) continue;
        out.push({ mediaType: "image/jpeg", data: (await readFile(file)).toString("base64") });
      }
      if (!out.length) throw new Error("Não consegui tirar quadros do vídeo nesse trecho.");
      return out;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/** Bounded: a transparent layer is a PNG sequence of at most this many bytes. */
const ALPHA_ZIP_BYTES = 512 * 1024 ** 2;
/** And its frames, unpacked (PNG barely compresses in a ZIP: a bomb is refused, not unpacked). */
const ALPHA_FILES_BYTES = 1024 ** 3;
const SEQUENCE_FILE = /^(?:sequence\.json|quadro-\d{5}\.png)$/;

/** fflate's unzip off the main thread's way (large entries inflate in workers). */
const unzipAsync = (data: Uint8Array, options: UnzipOptions): Promise<Unzipped> =>
  new Promise((resolve, reject) =>
    unzip(data, options, (error, files) => (error ? reject(error) : resolve(files))),
  );

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
  // Only the manifest and the frames are unpacked, and not more than the bound.
  let unpacked = 0;
  let tooBig = false;
  let files: Unzipped;
  try {
    files = await unzipAsync(value.bytes, {
      filter: (file) => {
        if (!SEQUENCE_FILE.test(file.name)) return false;
        unpacked += file.originalSize;
        if (unpacked > ALPHA_FILES_BYTES) tooBig = true;
        return !tooBig;
      },
    });
  } catch {
    throw new Error("Sequência de quadros inválida.");
  }
  if (tooBig) throw new Error("A sequência de quadros passa de 1 GB: exporte um trecho menor.");
  const manifest = files["sequence.json"];
  if (!manifest) throw new Error("A sequência não tem o manifesto.");
  let fps: unknown;
  let frames: unknown;
  try {
    ({ fps, frames } = JSON.parse(new TextDecoder().decode(manifest)) as {
      fps: unknown;
      frames: unknown;
    });
  } catch {
    throw new Error("Sequência de quadros inválida.");
  }
  if (!Number.isInteger(frames) || (frames as number) < 1 || (frames as number) > 100_000)
    throw new Error("Sequência de quadros inválida.");
  if (!Number.isInteger(fps) || (fps as number) < 1 || (fps as number) > 120)
    throw new Error("Sequência de quadros inválida.");
  const name = suggestedNameSchema.safeParse(value.name).data ?? "camada";
  const { paths, media } = machine();
  const dir = await mkdtemp(join(app.getPath("temp"), "edisvg-alpha-"));
  try {
    for (let index = 0; index < (frames as number); index++) {
      const file = `quadro-${String(index).padStart(5, "0")}.png`;
      const bytes = files[file];
      if (!bytes) throw new Error(`Falta o quadro ${index} na sequência.`);
      await writeFile(join(dir, file), bytes);
    }
    const out = join(dir, "camada.webm");
    try {
      await media.run(paths.ffmpeg, alphaWebmArgs(dir, fps as number, out));
    } catch (error) {
      console.warn("[edisvg] FFmpeg (camada transparente):", error);
      throw new Error("Não consegui codificar a camada transparente.");
    }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: join(defaultFolder ?? "", `${name}.webm`),
      properties: ["dontAddToRecent"],
      filters: [{ name: "Camada transparente (WebM)", extensions: ["webm"] }],
    });
    if (canceled || !filePath) return { saved: false };
    assertAccess();
    // Written beside the target and moved over it: a failed copy never leaves half a file.
    const partial = `${filePath}.${randomUUID()}.parcial`;
    try {
      await copyFile(out, partial);
      await rename(partial, filePath);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    return { saved: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
