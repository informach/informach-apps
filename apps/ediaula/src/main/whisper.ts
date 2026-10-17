import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app } from "electron";
import type { EngineStatus, WhisperModelInfo, WhisperVariant } from "../shared/types.ts";
import { makeTranscript, parseSilences } from "../shared/whisperParse.ts";
import { cacheDir, detectEncoder, FFMPEG, run } from "./ffmpeg.ts";

/** Pinned whisper.cpp release; the CUDA 12 build ships its own cuBLAS, so no CUDA install is needed. */
const RELEASE = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454";
const ENGINE_URL: Record<WhisperVariant, string> = {
  cuda: `${RELEASE}/whisper-bin-win-cuda-12.4.0-x64.zip`,
  cpu: `${RELEASE}/whisper-bin-x64.zip`,
};
const MODEL_URL = (name: string): string =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
export const MODELS = ["large-v3-turbo-q5_0", "small"] as const;

/** Folders where a user may already keep ggml models. */
const EXTERNAL_MODEL_DIRS = ["C:\\whisper-cpp"];

/** Nudges whisper to write hesitations down instead of cleaning them up. */
const VERBATIM_PROMPT =
  "Ahn, então, né, tipo, é... a gente vai, hum, começar. Quem está, quem está participando?";

const root = (): string => join(app.getPath("userData"), "whisper");
const settingsFile = (): string => join(root(), "settings.json");

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
  const dirs = [join(root(), "models"), ...EXTERNAL_MODEL_DIRS];
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

async function download(
  url: string,
  dest: string,
  onProgress: (r: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Falha no download (${res.status}) de ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let done = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (chunk: Buffer) => {
    done += chunk.length;
    if (total) onProgress(done / total);
  });
  const part = `${dest}.part`;
  await pipeline(body, createWriteStream(part));
  await rename(part, dest);
}

const downloads = new Map<string, AbortController>();

export function cancelDownload(jobId: string): boolean {
  const c = downloads.get(jobId);
  c?.abort();
  return !!c;
}

export async function installEngine(
  jobId: string,
  variant: WhisperVariant,
  onProgress: (r: number) => void,
): Promise<EngineStatus> {
  const dir = join(root(), "bin", variant);
  mkdirSync(dir, { recursive: true });
  const zip = join(root(), `${variant}.zip`);
  const ctrl = new AbortController();
  downloads.set(jobId, ctrl);
  try {
    await download(ENGINE_URL[variant], zip, (r) => onProgress(r * 0.95), ctrl.signal);
  } finally {
    downloads.delete(jobId);
  }
  // Windows ships bsdtar, which extracts zip files.
  await new Promise<void>((resolve, reject) => {
    const tar = spawn("C:\\Windows\\System32\\tar.exe", ["-xf", zip, "-C", dir], {
      windowsHide: true,
    });
    tar.on("error", reject);
    tar.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`Falha ao extrair o motor (código ${code})`)),
    );
  });
  await unlink(zip).catch(() => undefined);
  onProgress(1);
  const status = await engineStatus();
  if (!status.bin) throw new Error("O pacote baixado não contém o whisper-cli.exe.");
  return status;
}

export async function installModel(
  jobId: string,
  name: string,
  onProgress: (r: number) => void,
): Promise<EngineStatus> {
  if (!(MODELS as readonly string[]).includes(name))
    throw new Error(`Modelo desconhecido: ${name}`);
  const dir = join(root(), "models");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `ggml-${name}.bin`);
  const ctrl = new AbortController();
  downloads.set(jobId, ctrl);
  try {
    await download(MODEL_URL(name), dest, onProgress, ctrl.signal);
  } finally {
    downloads.delete(jobId);
  }
  await writeSettings({ ...(await readSettings()), model: dest });
  return engineStatus();
}

export async function selectModel(path: string): Promise<EngineStatus> {
  await writeSettings({ ...(await readSettings()), model: path });
  return engineStatus();
}

/** whisper.cpp DTW presets per model family; DTW gives much better word timing. */
function dtwPreset(modelName: string): string | null {
  const n = modelName.toLowerCase();
  if (n.includes("large-v3-turbo")) return "large.v3.turbo";
  if (n.includes("large-v3")) return "large.v3";
  if (n.includes("large-v2")) return "large.v2";
  for (const size of ["medium", "small", "base", "tiny"])
    if (n.startsWith(size)) return n.includes(".en") ? `${size}.en` : size;
  return null;
}

/**
 * Transcribes the audio of a media file: extracts 16 kHz mono audio, detects silences,
 * runs whisper with word-level timing and stores the result next to the file's other cache.
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
  if (!status.bin) throw new Error("Motor de transcrição não instalado.");
  if (!status.model) throw new Error("Nenhum modelo de transcrição encontrado.");
  const dir = cacheDir(path);
  // The glossary changes the result, so it is part of the cache key.
  const gl = glossary.length
    ? `-${createHash("sha1").update(glossary.join("|")).digest("hex").slice(0, 8)}`
    : "";
  const out = join(dir, `transcript-${status.model.name}-${language}${gl}.json`);
  if (existsSync(out)) return out;

  const wav = join(dir, "speech16k.wav");
  await run(
    FFMPEG,
    ["-y", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav],
    {
      jobId,
      signal,
      duration,
      onProgress: (r) => onProgress(r * 0.08),
    },
  );

  const detect = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      ["-i", wav, "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"],
      { windowsHide: true, signal },
    );
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", () => resolve(err));
  });
  const silences = parseSilences(detect, duration);
  onProgress(0.1);

  const base = join(dir, `whisper-${jobId}`);
  const dtw = dtwPreset(status.model.name);
  const args = [
    "-m",
    status.model.path,
    "-f",
    wav,
    "-l",
    language,
    "-ojf",
    "-of",
    base,
    "-pp",
    "--prompt",
    glossary.length ? `${VERBATIM_PROMPT} ${glossary.slice(0, 40).join(", ")}.` : VERBATIM_PROMPT,
    "-t",
    "8",
  ];
  if (dtw) args.push("-nfa", "-dtw", dtw);
  if (status.variant === "cpu") args.push("-ng");

  await new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(status.bin!, args, {
      windowsHide: true,
      cwd: join(status.bin!, ".."),
      signal,
    });
    let tail = "";
    const onData = (d: Buffer): void => {
      const text = d.toString();
      tail = (tail + text).slice(-4000);
      const m = /progress =\s*(\d+)%/g;
      let last: RegExpExecArray | null = null;
      for (let r = m.exec(text); r; r = m.exec(text)) last = r;
      if (last) onProgress(0.1 + (Number(last[1]) / 100) * 0.88);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`whisper falhou (código ${code}):\n${tail.split("\n").slice(-6).join("\n")}`),
          ),
    );
    runningWhisper.set(jobId, child);
  }).finally(() => runningWhisper.delete(jobId));

  const json = JSON.parse(await readFile(`${base}.json`, "utf8"));
  const transcript = makeTranscript(json, silences, status.model.name, language, duration);
  signal?.throwIfAborted();
  await writeFile(out, JSON.stringify(transcript));
  await rm(`${base}.json`, { force: true });
  await rm(wav, { force: true });
  onProgress(1);
  return out;
}

const runningWhisper = new Map<string, import("node:child_process").ChildProcess>();

export function cancelWhisper(jobId: string): boolean {
  const c = runningWhisper.get(jobId);
  c?.kill("SIGKILL");
  return !!c;
}
