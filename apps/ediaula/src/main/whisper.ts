import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import type { EngineStatus, WhisperModelInfo, WhisperVariant } from "../shared/types.ts";
import { helpHasVad, PROMPT_TERMS, whisperArgs, whisperThreads } from "../shared/whisperArgs.ts";
import {
  makeTranscript,
  parseSilences,
  parseVadSegments,
  type VadSegment,
} from "../shared/whisperParse.ts";
import { downloadVerified, type Expected, removeStaleParts } from "./download.ts";
import { cacheDir, detectEncoder, FFMPEG, run } from "./ffmpeg.ts";
import { scheduler } from "./scheduler.ts";

interface Download extends Expected {
  url: string;
}

/**
 * Pinned whisper.cpp build b5454 (the nightly of v1.9.5, 6 Oct 2026; the CUDA 12 build ships its
 * own cuBLAS, so no CUDA install is needed) and the models it runs. SHA-256 and sizes come from
 * the publishers: the `digest` GitHub lists for each release asset, and the LFS SHA-256 Hugging
 * Face lists for each file (also sent as `x-linked-etag`), at pinned repository revisions.
 */
const RELEASE = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454";
const MODELS_AT =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1";
const VAD_AT =
  "https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b";
export const WHISPER_ASSETS = {
  engine: {
    cuda: {
      url: `${RELEASE}/whisper-bin-win-cuda-12.4.0-x64.zip`,
      sha256: "afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a",
      size: 684913404,
    },
    cpu: {
      url: `${RELEASE}/whisper-bin-x64.zip`,
      sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
      size: 8928640,
    },
  },
  models: {
    "large-v3-turbo-q5_0": {
      url: `${MODELS_AT}/ggml-large-v3-turbo-q5_0.bin`,
      sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
      size: 574041195,
    },
    small: {
      url: `${MODELS_AT}/ggml-small.bin`,
      sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
      size: 487601967,
    },
  },
  /** Silero voice activity model for `--vad`. */
  vad: {
    url: `${VAD_AT}/ggml-silero-v6.2.0.bin`,
    sha256: "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987",
    size: 885098,
  },
} as const satisfies {
  engine: Record<WhisperVariant, Download>;
  models: Record<string, Download>;
  vad: Download;
};
type ModelName = keyof typeof WHISPER_ASSETS.models;
const isModel = (name: string): name is ModelName => Object.hasOwn(WHISPER_ASSETS.models, name);

/** Folders where a user may already keep ggml models. */
const EXTERNAL_MODEL_DIRS = ["C:\\whisper-cpp"];

const root = (): string => join(app.getPath("userData"), "whisper");
const settingsFile = (): string => join(root(), "settings.json");
const modelsDir = (): string => join(root(), "models");
const vadModelPath = (): string => join(modelsDir(), "ggml-silero-v6.2.0.bin");

interface Settings {
  model?: string;
}

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

async function writeSettings(s: Settings): Promise<void> {
  mkdirSync(root(), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify(s, null, 1));
}

function findFile(dir: string, name: string, depth = 3): string | null {
  if (!existsSync(dir) || depth < 0) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return p;
    if (entry.isDirectory()) {
      const found = findFile(p, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function listModels(): WhisperModelInfo[] {
  const dirs = [modelsDir(), ...EXTERNAL_MODEL_DIRS];
  const out: WhisperModelInfo[] = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!/^ggml-.+\.bin$/i.test(f) || /silero|vad/i.test(f)) continue;
      const p = join(d, f);
      out.push({
        name: f.replace(/^ggml-/, "").replace(/\.bin$/, ""),
        path: p,
        size: statSync(p).size,
      });
    }
  }
  return out;
}

/** Preferred model: the user's choice, else the most accurate one installed. */
function pickModel(models: WhisperModelInfo[], chosen?: string): WhisperModelInfo | null {
  const byChoice = chosen ? models.find((m) => m.path === chosen) : undefined;
  if (byChoice) return byChoice;
  const rank = (m: WhisperModelInfo): number =>
    /turbo/.test(m.name)
      ? 0
      : /large/.test(m.name)
        ? 1
        : /medium/.test(m.name)
          ? 2
          : /small/.test(m.name)
            ? 3
            : 4;
  return [...models].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export async function engineStatus(): Promise<EngineStatus> {
  const cuda = findFile(join(root(), "bin", "cuda"), "whisper-cli.exe");
  const cpu = findFile(join(root(), "bin", "cpu"), "whisper-cli.exe");
  const models = listModels();
  const settings = await readSettings();
  return {
    bin: cuda ?? cpu,
    variant: cuda ? "cuda" : cpu ? "cpu" : null,
    model: pickModel(models, settings.model),
    models,
    gpu: (await detectEncoder()) === "nvenc",
  };
}

/** Unfinished downloads left for more than a week; deleted when the app starts. */
export function removeStaleDownloads(): Promise<string[]> {
  return removeStaleParts([root(), modelsDir()]);
}

const downloads = new Map<string, AbortController>();

export function cancelDownload(jobId: string): boolean {
  const c = downloads.get(jobId);
  c?.abort();
  return !!c;
}

async function verifiedDownload(
  jobId: string,
  file: Download,
  dest: string,
  onProgress: (r: number) => void,
): Promise<void> {
  const ctrl = new AbortController();
  downloads.set(jobId, ctrl);
  try {
    await downloadVerified(file.url, dest, file, ctrl.signal, onProgress);
  } finally {
    downloads.delete(jobId);
  }
}

/** Windows ships bsdtar, which extracts zip files. */
function unzip(zip: string, dir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tar = spawn("C:\\Windows\\System32\\tar.exe", ["-xf", zip, "-C", dir], {
      windowsHide: true,
    });
    tar.on("error", reject);
    tar.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`Falha ao extrair o motor (código ${code})`)),
    );
  });
}

/**
 * Downloads the engine zip (checked against its published SHA-256), extracts it into a temporary
 * folder and only puts it in place of `bin/<variant>` once whisper-cli.exe is there. The Silero
 * model for voice activity detection comes along.
 */
export async function installEngine(
  jobId: string,
  variant: WhisperVariant,
  onProgress: (r: number) => void,
): Promise<EngineStatus> {
  const bin = join(root(), "bin");
  mkdirSync(bin, { recursive: true });
  const zip = join(root(), `${variant}.zip`);
  await verifiedDownload(jobId, WHISPER_ASSETS.engine[variant], zip, (r) => onProgress(r * 0.9));
  // Leftovers of an extraction cut short by closing the app.
  for (const name of readdirSync(bin))
    if (name.startsWith(`.${variant}-`))
      await rm(join(bin, name), { recursive: true, force: true });
  const staging = join(bin, `.${variant}-${jobId}`);
  try {
    mkdirSync(staging, { recursive: true });
    await unzip(zip, staging);
    if (!findFile(staging, "whisper-cli.exe"))
      throw new Error("O pacote baixado não contém o whisper-cli.exe.");
    const dir = join(bin, variant);
    await rm(dir, { recursive: true, force: true });
    await rename(staging, dir);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(zip, { force: true });
  }
  vadSupport.clear();
  onProgress(0.95);
  try {
    await ensureVadModel(jobId);
  } catch (err) {
    // The engine is in place; the first transcription tries the VAD model again.
    console.warn("[whisper] engine installed, the VAD model will be downloaded later:", err);
  }
  onProgress(1);
  return engineStatus();
}

export async function installModel(
  jobId: string,
  name: string,
  onProgress: (r: number) => void,
): Promise<EngineStatus> {
  if (!isModel(name)) throw new Error(`Modelo desconhecido: ${name}`);
  mkdirSync(modelsDir(), { recursive: true });
  const dest = join(modelsDir(), `ggml-${name}.bin`);
  await verifiedDownload(jobId, WHISPER_ASSETS.models[name], dest, onProgress);
  await writeSettings({ ...(await readSettings()), model: dest });
  return engineStatus();
}

export async function selectModel(path: string): Promise<EngineStatus> {
  await writeSettings({ ...(await readSettings()), model: path });
  return engineStatus();
}

/* ----- Voice activity detection ----- */

/** Whether each whisper-cli build lists `--vad` in its usage, by path. */
const vadSupport = new Map<string, Promise<boolean>>();

function supportsVad(bin: string): Promise<boolean> {
  let known = vadSupport.get(bin);
  if (!known) {
    known = new Promise<boolean>((resolve) => {
      const child = spawn(bin, ["--help"], {
        windowsHide: true,
        cwd: join(bin, ".."),
        signal: AbortSignal.timeout(15_000),
      });
      let help = "";
      child.stdout.on("data", (d: Buffer) => (help += d.toString()));
      child.stderr.on("data", (d: Buffer) => (help += d.toString()));
      child.on("error", (err) => {
        console.warn("[whisper] could not read whisper-cli --help; transcribing without VAD:", err);
        resolve(false);
      });
      child.on("close", () => resolve(helpHasVad(help)));
    });
    vadSupport.set(bin, known);
  }
  return known;
}

/** The Silero model, downloaded (and checked) when missing. */
async function ensureVadModel(jobId: string): Promise<string> {
  const path = vadModelPath();
  if (existsSync(path)) return path;
  mkdirSync(modelsDir(), { recursive: true });
  await verifiedDownload(`${jobId}:vad`, WHISPER_ASSETS.vad, path, () => undefined);
  return path;
}

/**
 * The VAD model to pass to this build, or null to go without: a build that does not list
 * `--vad`, or a model that cannot be downloaded right now. The hallucination filter runs anyway.
 */
async function vadModelFor(bin: string, jobId: string): Promise<string | null> {
  if (!(await supportsVad(bin))) return null;
  try {
    return await ensureVadModel(jobId);
  } catch (err) {
    console.warn("[whisper] transcribing without VAD, the model could not be downloaded:", err);
    return null;
  }
}

/* ----- Transcription ----- */

/** Silences of a 16 kHz WAV (ffmpeg silencedetect); a failed run is an error, not "no silence". */
function detectSilences(
  wav: string,
  duration: number,
  signal?: AbortSignal,
): Promise<[number, number][]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      ["-i", wav, "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"],
      { windowsHide: true, signal },
    );
    scheduler.track(child);
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(parseSilences(err, duration))
        : reject(
            new Error(
              `Falha ao medir os silêncios (código ${code}):\n${err.trim().split("\n").slice(-4).join("\n")}`,
            ),
          ),
    );
  });
}

const runningWhisper = new Map<string, ChildProcess>();

export function cancelWhisper(jobId: string): boolean {
  const c = runningWhisper.get(jobId);
  c?.kill("SIGKILL");
  return !!c;
}

/** Runs whisper-cli; resolves with the VAD lines of its log (the rest is only kept as a tail). */
function runWhisper(
  jobId: string,
  bin: string,
  args: string[],
  onProgress: (r: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(bin, args, { windowsHide: true, cwd: join(bin, ".."), signal });
    let tail = "";
    let partial = "";
    let vadLog = "";
    const onData = (d: Buffer): void => {
      const text = d.toString();
      tail = (tail + text).slice(-4000);
      const lines = (partial + text).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines)
        if (/whisper_vad|vad_segment_info/.test(line)) vadLog += `${line}\n`;
      const m = /progress =\s*(\d+)%/g;
      let last: RegExpExecArray | null = null;
      for (let r = m.exec(text); r; r = m.exec(text)) last = r;
      if (last) onProgress(Number(last[1]) / 100);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(vadLog + partial)
        : reject(
            new Error(`whisper falhou (código ${code}):\n${tail.split("\n").slice(-6).join("\n")}`),
          ),
    );
    runningWhisper.set(jobId, child);
    scheduler.track(child);
  }).finally(() => runningWhisper.delete(jobId));
}

/**
 * Transcribes the audio of a media file: extracts 16 kHz mono audio, detects silences, runs
 * whisper with word-level timing (and voice activity detection when the build has it) and stores
 * the result next to the file's other cache. The temporary WAV and JSON never stay behind.
 */
export async function transcribe(
  jobId: string,
  path: string,
  duration: number,
  language: string,
  glossary: string[],
  onProgress: (r: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const status = await engineStatus();
  const { bin, model } = status;
  if (!bin) throw new Error("Motor de transcrição não instalado.");
  if (!model) throw new Error("Nenhum modelo de transcrição encontrado.");
  const dir = cacheDir(path);
  const vadModel = await vadModelFor(bin, jobId);
  signal?.throwIfAborted();
  // The prompt terms and VAD change the result, so they are part of the cache key; the rest of
  // the glossary only corrects the text when it is read.
  const terms = glossary.slice(0, PROMPT_TERMS);
  const gl = terms.length
    ? `-${createHash("sha1").update(terms.join("|")).digest("hex").slice(0, 8)}`
    : "";
  const out = join(dir, `transcript-${model.name}-${language}${gl}${vadModel ? "-vad" : ""}.json`);
  if (existsSync(out)) return out;

  const wav = join(dir, `speech16k-${jobId}.wav`);
  const base = join(dir, `whisper-${jobId}`);
  try {
    await run(
      FFMPEG,
      [
        "-y",
        "-v",
        "error",
        "-i",
        path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        wav,
      ],
      { jobId, signal, duration, onProgress: (r) => onProgress(r * 0.08) },
    );
    const silences = await detectSilences(wav, duration, signal);
    onProgress(0.1);

    const threads = whisperThreads(availableParallelism());
    let vad = vadModel;
    let segments: VadSegment[] = [];
    for (;;) {
      const args = whisperArgs({
        modelPath: model.path,
        modelName: model.name,
        wav,
        language,
        out: base,
        terms,
        threads,
        cpu: status.variant === "cpu",
        vadModel: vad,
      });
      const log = await runWhisper(jobId, bin, args, (r) => onProgress(0.1 + r * 0.88), signal);
      segments = vad ? parseVadSegments(log) : [];
      // Without the segment table the word times would stay on the shortened audio.
      if (!vad || segments.length || /detected 0 speech segments/.test(log)) break;
      console.warn("[whisper] VAD segments missing from the log; transcribing again without VAD");
      vad = null;
    }

    const json = JSON.parse(await readFile(`${base}.json`, "utf8"));
    const transcript = makeTranscript(json, silences, model.name, language, duration, segments);
    signal?.throwIfAborted();
    await writeFile(out, JSON.stringify(transcript));
  } finally {
    await rm(`${base}.json`, { force: true });
    await rm(wav, { force: true });
  }
  onProgress(1);
  return out;
}
