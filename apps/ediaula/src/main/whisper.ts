import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import type { EngineStatus, WhisperModelInfo, WhisperVariant } from "../shared/types.ts";
import {
  helpHasVad,
  isJobId,
  PROMPT_TERMS,
  whisperArgs,
  whisperThreads,
} from "../shared/whisperArgs.ts";
import {
  makeTranscript,
  parseSilences,
  type VadSegment,
  vadOutcome,
  type WhisperJson,
  WhisperLog,
} from "../shared/whisperParse.ts";
import { downloadVerified, removeStaleParts, verifyFile } from "./download.ts";
import { cacheDir, detectEncoder, FFMPEG, run } from "./ffmpeg.ts";
import { folderMatches, renameWhenFree, signature, swapFolder } from "./installCheck.ts";
import { scheduler } from "./scheduler.ts";
import {
  type Download,
  isEngineVariant,
  isModelName,
  type ModelName,
  WHISPER_ASSETS,
} from "./whisperAssets.ts";
import { ENGINE_FILES } from "./whisperManifest.ts";

export { isEngineVariant, isModelName, WHISPER_ASSETS };

/** Folders where a user may already keep ggml models; listed only when the person asks. */
const EXTERNAL_MODEL_DIRS = ["C:\\whisper-cpp"];

/** The VAD model download gives up after this long; the transcription then goes without it. */
const VAD_DOWNLOAD_TIMEOUT_MS = 60_000;

const root = (): string => join(app.getPath("userData"), "whisper");
const settingsFile = (): string => join(root(), "settings.json");
const binDir = (): string => join(root(), "bin");
const engineDir = (variant: WhisperVariant): string => join(binDir(), variant);
const modelsDir = (): string => join(root(), "models");
const vadModelPath = (): string => join(modelsDir(), "ggml-silero-v6.2.0.bin");
const modelPath = (name: ModelName): string => join(modelsDir(), `ggml-${name}.bin`);

interface Settings {
  model?: string;
  /** The person chose to list the models of C:\whisper-cpp, which are not checked. */
  externalModels?: boolean;
  /** Files and folders checked against the published hashes, with the signature they had. */
  checked?: Record<string, string>;
  /** Installed files that did not match: treated as absent until installed again. */
  rejected?: string[];
}

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as Settings;
  } catch {
    // Missing or unreadable: nothing chosen and nothing checked yet (checks simply run again).
    return {};
  }
}

async function writeSettings(s: Settings): Promise<void> {
  mkdirSync(root(), { recursive: true });
  const tmp = `${settingsFile()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 1));
  await renameWhenFree(tmp, settingsFile());
}

async function updateSettings(change: (s: Settings) => Settings): Promise<void> {
  await writeSettings(change(await readSettings()));
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

/**
 * Models to offer: the ones EdiAula downloads (checked against their hashes on first use), and,
 * only when the person chose so, other ggml files, marked as not checked.
 */
function listModels(settings: Settings): WhisperModelInfo[] {
  const rejected = new Set(settings.rejected ?? []);
  const known = new Set<string>(
    (Object.keys(WHISPER_ASSETS.models) as ModelName[]).map((n) => modelPath(n).toLowerCase()),
  );
  const dirs = [modelsDir(), ...(settings.externalModels ? EXTERNAL_MODEL_DIRS : [])];
  const out: WhisperModelInfo[] = [];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!/^ggml-.+\.bin$/i.test(f) || /silero|vad/i.test(f)) continue;
      const p = join(d, f);
      if (rejected.has(p)) continue;
      const unchecked = !known.has(p.toLowerCase());
      if (unchecked && !settings.externalModels) continue;
      out.push({
        name: f.replace(/^ggml-/, "").replace(/\.bin$/, ""),
        path: p,
        size: statSync(p).size,
        ...(unchecked ? { unchecked: true } : {}),
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
    (m.unchecked ? 10 : 0) +
    (/turbo/.test(m.name)
      ? 0
      : /large/.test(m.name)
        ? 1
        : /medium/.test(m.name)
          ? 2
          : /small/.test(m.name)
            ? 3
            : 4);
  return [...models].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export async function engineStatus(): Promise<EngineStatus> {
  const settings = await readSettings();
  const rejected = new Set(settings.rejected ?? []);
  const installed = (variant: WhisperVariant): string | null =>
    rejected.has(engineDir(variant)) ? null : findFile(engineDir(variant), "whisper-cli.exe");
  const cuda = installed("cuda");
  const cpu = installed("cpu");
  const models = listModels(settings);
  return {
    bin: cuda ?? cpu,
    variant: cuda ? "cuda" : cpu ? "cpu" : null,
    model: pickModel(models, settings.model),
    models,
    gpu: (await detectEncoder()) === "nvenc",
    externalModels: !!settings.externalModels,
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
  signal?: AbortSignal,
): Promise<void> {
  const ctrl = new AbortController();
  downloads.set(jobId, ctrl);
  try {
    const stop = signal ? AbortSignal.any([ctrl.signal, signal]) : ctrl.signal;
    await downloadVerified(file.url, dest, file, stop, onProgress);
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

/** Records that `path` passed (or failed) its check, as it is now. */
async function recordCheck(path: string, ok: boolean): Promise<void> {
  const sig = ok ? await signature(path) : null;
  await updateSettings((s) => {
    const checked = { ...s.checked };
    const rejected = new Set(s.rejected ?? []);
    if (sig) {
      checked[path] = sig;
      rejected.delete(path);
    } else {
      delete checked[path];
      rejected.add(path);
    }
    return { ...s, checked, rejected: [...rejected] };
  });
}

/** `path` was checked and has not changed since. */
async function stillChecked(path: string): Promise<boolean> {
  const known = (await readSettings()).checked?.[path];
  return !!known && existsSync(path) && known === (await signature(path));
}

const engineFailure = (): Error =>
  new Error(
    "O motor de transcrição instalado não confere com o publicado. Instale o motor de novo pelo painel de transcrição.",
  );

/**
 * Downloads the engine zip (checked against its published SHA-256; a checked zip left by a
 * failed install is used again), extracts it into a temporary folder, checks every file against
 * the manifest and only then swaps it with the engine in use, which is moved aside first and
 * brought back if the swap fails. The zip is deleted only after the new engine is in place. The
 * Silero model for voice activity detection comes along.
 */
export async function installEngine(
  jobId: string,
  variant: WhisperVariant,
  onProgress: (r: number) => void,
): Promise<EngineStatus> {
  if (!isJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  if (!isEngineVariant(variant)) throw new Error("Variante de motor desconhecida.");
  const bin = binDir();
  mkdirSync(bin, { recursive: true });
  const asset = WHISPER_ASSETS.engine[variant];
  const zip = join(root(), `${variant}.zip`);
  if (!(await verifyFile(zip, asset)))
    await verifiedDownload(jobId, asset, zip, (r) => onProgress(r * 0.85));
  // Leftovers of an install cut short by closing the app.
  for (const name of readdirSync(bin))
    if (name.startsWith(`.${variant}-`) || name.startsWith(".old-"))
      await rm(join(bin, name), { recursive: true, force: true });
  const staging = join(bin, `.${variant}-${randomUUID()}`);
  const aside = join(bin, `.old-${randomUUID()}`);
  try {
    mkdirSync(staging, { recursive: true });
    await unzip(zip, staging);
    onProgress(0.88);
    if (!findFile(staging, "whisper-cli.exe"))
      throw new Error("O pacote baixado não contém o whisper-cli.exe.");
    if (!(await folderMatches(staging, ENGINE_FILES[variant])))
      throw new Error("Os arquivos do motor extraído não conferem com os publicados.");
    const hadOld = await swapFolder(staging, engineDir(variant), aside);
    if (hadOld)
      await rm(aside, { recursive: true, force: true }).catch((err: unknown) =>
        // Still open somewhere: the next install removes it.
        console.warn("[whisper] could not remove the previous engine yet:", err),
      );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await rm(zip, { force: true });
  await recordCheck(engineDir(variant), true);
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
  if (!isJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  if (!isModelName(name)) throw new Error(`Modelo desconhecido: ${name}`);
  mkdirSync(modelsDir(), { recursive: true });
  const dest = modelPath(name);
  await verifiedDownload(jobId, WHISPER_ASSETS.models[name], dest, onProgress);
  await recordCheck(dest, true);
  await updateSettings((s) => ({ ...s, model: dest }));
  return engineStatus();
}

export async function selectModel(path: string): Promise<EngineStatus> {
  const offered = listModels(await readSettings()).some((m) => m.path === path);
  if (!offered) throw new Error("Esse modelo não está na lista.");
  await updateSettings((s) => ({ ...s, model: path }));
  return engineStatus();
}

export async function setExternalModels(on: boolean): Promise<EngineStatus> {
  await updateSettings((s) => ({ ...s, externalModels: on }));
  return engineStatus();
}

/**
 * Engines and models installed before downloads were checked, or changed on disk since: checked
 * against the published hashes the first time they are used, then remembered. A file that does
 * not match is set aside (offered for download again) and the transcription stops.
 */
async function ensureChecked(variant: WhisperVariant, model: WhisperModelInfo): Promise<void> {
  const dir = engineDir(variant);
  if (!(await stillChecked(dir))) {
    const ok = await folderMatches(dir, ENGINE_FILES[variant]);
    await recordCheck(dir, ok);
    if (!ok) throw engineFailure();
  }
  if (model.unchecked) return;
  const name = model.name;
  if (!isModelName(name) || model.path !== modelPath(name) || (await stillChecked(model.path)))
    return;
  const ok = await verifyFile(model.path, WHISPER_ASSETS.models[name]);
  await recordCheck(model.path, ok);
  if (!ok)
    throw new Error(
      `O modelo ${name} não confere com o publicado. Baixe o modelo de novo pelo painel de transcrição.`,
    );
}

/**
 * The installed engine with this model, checked as a transcription checks them (the engine
 * folder against its manifest, a published model against its hash): the recorder listens live
 * with the engine's whisper-server (main/voiceFollow.ts).
 */
export async function checkedEngine(
  model: WhisperModelInfo,
): Promise<{ cli: string; variant: WhisperVariant }> {
  const status = await engineStatus();
  if (!status.bin || !status.variant) throw new Error("Motor de transcrição não instalado.");
  await ensureChecked(status.variant, model);
  return { cli: status.bin, variant: status.variant };
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
        // Not remembered: the next transcription asks again.
        vadSupport.delete(bin);
        console.warn("[whisper] could not read whisper-cli --help; transcribing without VAD:", err);
        resolve(false);
      });
      child.on("close", () => resolve(helpHasVad(help)));
    });
    vadSupport.set(bin, known);
  }
  return known;
}

/** The Silero model, checked against its hash (once per change) and downloaded when missing or wrong. */
async function ensureVadModel(jobId: string, signal?: AbortSignal): Promise<string> {
  const path = vadModelPath();
  if (await stillChecked(path)) return path;
  if (existsSync(path) && (await verifyFile(path, WHISPER_ASSETS.vad))) {
    await recordCheck(path, true);
    return path;
  }
  await rm(path, { force: true });
  mkdirSync(modelsDir(), { recursive: true });
  const stop = AbortSignal.any([
    AbortSignal.timeout(VAD_DOWNLOAD_TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ]);
  await verifiedDownload(`${jobId}-vad`, WHISPER_ASSETS.vad, path, () => undefined, stop);
  await recordCheck(path, true);
  return path;
}

/**
 * The VAD model to pass to this build, or null to go without: a build that does not list
 * `--vad`, or a model that cannot be had right now. The hallucination filter runs anyway.
 */
async function vadModelFor(
  bin: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!(await supportsVad(bin))) return null;
  try {
    return await ensureVadModel(jobId, signal);
  } catch (err) {
    signal?.throwIfAborted();
    console.warn("[whisper] transcribing without VAD, the model could not be had:", err);
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

/** Runs whisper-cli; resolves with the VAD lines of its log. */
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
    const log = new WhisperLog();
    const onData =
      (stream: "out" | "err") =>
      (d: Buffer): void => {
        const text = d.toString();
        log.push(stream, text);
        const m = /progress =\s*(\d+)%/g;
        let last: RegExpExecArray | null = null;
        for (let r = m.exec(text); r; r = m.exec(text)) last = r;
        if (last) onProgress(Number(last[1]) / 100);
      };
    child.stdout.on("data", onData("out"));
    child.stderr.on("data", onData("err"));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(log.vadLog())
        : reject(
            new Error(
              `whisper falhou (código ${code}):\n${log.tail.split("\n").slice(-6).join("\n")}`,
            ),
          ),
    );
    runningWhisper.set(jobId, child);
    scheduler.track(child);
  }).finally(() => runningWhisper.delete(jobId));
}

/**
 * Transcribes the audio of a media file: extracts 16 kHz mono audio, detects silences, runs
 * whisper with word-level timing (and voice activity detection when the build has it) and stores
 * the result next to the file's other cache, under the name of the mode that really ran. The
 * temporary WAV and JSON never stay behind; their names come from the main process.
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
  if (!isJobId(jobId)) throw new Error("Identificador de tarefa inválido.");
  if (!/^[a-z]{2,3}$/.test(language)) throw new Error("Idioma inválido.");
  signal?.throwIfAborted();
  const status = await engineStatus();
  const { bin, model, variant } = status;
  if (!bin || !variant) throw new Error("Motor de transcrição não instalado.");
  if (!model) throw new Error("Nenhum modelo de transcrição encontrado.");
  await ensureChecked(variant, model);
  const dir = cacheDir(path);
  const vadModel = await vadModelFor(bin, jobId, signal);
  signal?.throwIfAborted();
  // The prompt terms and VAD change the result, so they are part of the cache key; the rest of
  // the glossary only corrects the text when it is read.
  const terms = glossary.slice(0, PROMPT_TERMS);
  const gl = terms.length
    ? `-${createHash("sha1").update(terms.join("|")).digest("hex").slice(0, 8)}`
    : "";
  const outFor = (vad: boolean): string =>
    join(dir, `transcript-${model.name}-${language}${gl}${vad ? "-vad" : ""}.json`);
  if (existsSync(outFor(!!vadModel))) return outFor(!!vadModel);

  const run16k = randomUUID();
  const wav = join(dir, `speech16k-${run16k}.wav`);
  const base = join(dir, `whisper-${run16k}`);
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
    const runOnce = async (vad: string | null): Promise<{ log: string; json: WhisperJson }> => {
      const args = whisperArgs({
        modelPath: model.path,
        modelName: model.name,
        wav,
        language,
        out: base,
        terms,
        threads,
        cpu: variant === "cpu",
        vadModel: vad,
      });
      const log = await runWhisper(jobId, bin, args, (r) => onProgress(0.1 + r * 0.88), signal);
      return { log, json: JSON.parse(await readFile(`${base}.json`, "utf8")) as WhisperJson };
    };

    let segments: VadSegment[] = [];
    let ranVad = false;
    let result: { log: string; json: WhisperJson } | null = null;
    if (vadModel) {
      try {
        result = await runOnce(vadModel);
      } catch (err) {
        signal?.throwIfAborted();
        // A broken model makes whisper fail: it is downloaded again next time.
        console.warn("[whisper] whisper failed with VAD; deleting the model, going without:", err);
        await rm(vadModelPath(), { force: true });
      }
      if (result) {
        const outcome = vadOutcome(result.log, result.json);
        if (outcome.kind === "mapped") {
          segments = outcome.segments;
          ranVad = true;
        } else if (outcome.kind === "silent") ranVad = true;
        else {
          // Without the whole segment table the word times would stay on the shortened audio.
          console.warn("[whisper] VAD segment table incomplete; transcribing again without VAD");
          result = null;
        }
      }
    }
    result ??= await runOnce(null);

    const transcript = makeTranscript(
      result.json,
      silences,
      model.name,
      language,
      duration,
      segments,
    );
    signal?.throwIfAborted();
    const out = outFor(ranVad);
    await writeFile(out, JSON.stringify(transcript));
    onProgress(1);
    return out;
  } finally {
    await rm(`${base}.json`, { force: true });
    await rm(wav, { force: true });
  }
}
