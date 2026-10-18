import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { newId } from "../shared/clipTime.ts";
import { blankPausesArgs, transcriptWithoutPauses } from "../shared/pausedMedia.ts";
import { normalizeProject } from "../shared/project-normalize.ts";
import { projectSchema } from "../shared/project-schema.ts";
import {
  CURSOR_IMAGE,
  PACKAGE_CURSORS,
  PACKAGE_MEDIA,
  PACKAGE_PROJECT,
  type PackFile,
  packPlan,
  unpackPaths,
} from "../shared/projectPackage.ts";
import type { Project, Transcript } from "../shared/types.ts";
import { writeZip, type ZipDirectoryEntry, zipDirectory } from "./zip.ts";

/**
 * Packing a lesson into one ZIP and opening such a package (shared/projectPackage.ts says what
 * goes in). Opening reads the archive's directory first and refuses anything a lesson package
 * does not have (names outside media/, links, compressed entries, too many files, more than the
 * disk holds); then tar.exe, which every Windows 10 and 11 has, extracts it.
 */

const run = promisify(execFile);
const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

/** The cursor images beside a cursor data file (its cursors folder), as the recorder saved them. */
export function cursorImagesOf(cursor: string): string[] {
  const folder = join(dirname(cursor), "cursors");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => CURSOR_IMAGE.test(name))
    .map((name) => join(folder, name));
}

/**
 * A copy of a take's file without what it recorded during the pauses, in `dir`: the media with
 * those seconds black and silent (FFmpeg, at the same times and length), the transcript without
 * the words said there.
 */
async function blankCopy(
  f: PackFile & { blank: NonNullable<PackFile["blank"]> },
  source: string,
  dir: string,
  ffmpeg: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  // Archive names are unique, so their base names never meet in the folder.
  const copy = join(dir, basename(f.name));
  if (f.blank.kind === "transcript") {
    const transcript = JSON.parse(await readFile(source, "utf8")) as Transcript;
    await writeFile(copy, JSON.stringify(transcriptWithoutPauses(transcript, f.blank.paused)));
    return copy;
  }
  if (!ffmpeg) throw new Error("O FFmpeg não está disponível para apagar as pausas da gravação.");
  await run(
    ffmpeg,
    blankPausesArgs(source, copy, f.blank.paused, { video: f.blank.video, audio: f.blank.audio }),
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...(signal ? { signal } : {}) },
  );
  return copy;
}

/**
 * The archive with the project and its files; every file read is checked first. A take's media
 * recorded during its pauses goes with those seconds blanked (`ffmpeg` makes the copies, in a
 * folder that goes away afterwards): what the teacher paused never leaves in a package.
 */
export async function packProject(
  project: Project,
  out: string,
  assertRead: (path: string) => Promise<string>,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
  ffmpeg?: string,
): Promise<{ files: number; bytes: number; droppedVoices: number }> {
  const plan = packPlan(project, existsSync, cursorImagesOf);
  const missing = plan.files.filter((f) => !existsSync(f.path)).map((f) => basename(f.path));
  if (missing.length)
    throw new Error(
      `Reconecte antes de empacotar: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` e mais ${missing.length - 5}` : ""}.`,
    );
  const blanks = plan.files.filter((f) => f.blank).length;
  const scratch = blanks ? await mkdtemp(join(tmpdir(), "ediaula-pacote-")) : null;
  try {
    const stored: { name: string; path: string }[] = [];
    let blanked = 0;
    for (const f of plan.files) {
      const source = await assertRead(f.path);
      if (f.blank && scratch) {
        signal?.throwIfAborted();
        stored.push({
          name: f.name,
          path: await blankCopy({ ...f, blank: f.blank }, source, scratch, ffmpeg, signal),
        });
        // Blanking the pauses is the first half of the work; the archive is the second.
        onProgress?.((++blanked / blanks) * 0.5);
      } else stored.push({ name: f.name, path: source });
    }
    // Compact, as the lesson file is saved (main/projects.ts): opening reads at most 32 MB of it.
    const text = Buffer.from(JSON.stringify(projectSchema.parse(plan.project)), "utf8");
    let bytes = text.length;
    for (const f of stored) bytes += (await stat(f.path)).size;
    const head = blanks ? 0.5 : 0;
    await writeZip(out, [{ name: PACKAGE_PROJECT, data: text }, ...stored], {
      signal,
      onProgress: (done, total) => onProgress?.(head + (1 - head) * (total ? done / total : 1)),
    });
    return { files: stored.length, bytes, droppedVoices: plan.droppedVoices };
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

/** `<folder>/<name>`, or `<name> (2)` and so on when it is taken. */
function freeFolder(folder: string, name: string): string {
  let path = join(folder, name);
  for (let i = 2; existsSync(path); i++) path = join(folder, `${name} (${i})`);
  return path;
}

const tarPath = (): string =>
  join(process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows", "System32", "tar.exe");

/** Every file under `dir`, relative to it, with forward slashes. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full).replace(/\\/g, "/"));
  }
  return out;
}

/** Entries a lesson package may have, and the room left on the disk after extracting it. */
const MAX_ENTRIES = 20_000;
const SPARE_BYTES = 512 * 1024 * 1024;

/** What opening a package will write, after every entry of it was checked. */
export interface PackageInfo {
  /** Files that come out of it (the project and its media). */
  files: number;
  /** Bytes they take. */
  bytes: number;
  /** Where the lesson's folder will be. */
  folder: string;
}

const UNIX_TYPE = 0o170000;
const UNIX_FILE = 0o100000;
const DOS_DIRECTORY = 0x10;
const DOS_REPARSE = 0x400;

/** A character Windows does not take in a file name (the reserved ones and the control ones). */
const notInName = (c: string): boolean => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c);

/** Why an entry cannot come out of a lesson package, or null when it can. */
function entryProblem(e: ZipDirectoryEntry): string | null {
  const media = e.name.startsWith(PACKAGE_MEDIA) ? e.name.slice(PACKAGE_MEDIA.length) : null;
  // A cursor image goes in the one folder beside the cursor data, under the name it was saved with.
  const cursorImage =
    e.name.startsWith(PACKAGE_CURSORS) && CURSOR_IMAGE.test(e.name.slice(PACKAGE_CURSORS.length));
  const plainName =
    cursorImage ||
    (media !== null &&
      media.length > 0 &&
      media.length <= 200 &&
      ![...media].some(notInName) &&
      !/^\.+$/.test(media) &&
      !/[. ]$/.test(media));
  if (e.name !== PACKAGE_PROJECT && !plainName) return "um nome fora da pasta da aula";
  if (!e.utf8 && /[^ -~]/.test(e.name)) return "um nome sem codificação";
  if (e.method !== 0 || e.compressedSize !== e.size) return "um arquivo comprimido";
  const unixType = e.system === 3 ? (e.attributes >>> 16) & UNIX_TYPE : 0;
  if ((unixType && unixType !== UNIX_FILE) || e.attributes & (DOS_DIRECTORY | DOS_REPARSE))
    return "um atalho ou uma pasta";
  return null;
}

const gigabytes = (bytes: number): string =>
  `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;

const packageName = (zip: string): string =>
  [...basename(zip, extname(zip))]
    .filter((c) => !notInName(c))
    .join("")
    .replace(/[. ]+$/, "")
    .trim() || "Aula";

/**
 * Every entry of the package checked before anything is written: only the project and files
 * directly under media/, stored (as Empacotar writes them, so their sizes are what they take),
 * plain files (no links, no folders), no name twice, and room for all of it on the disk.
 */
export async function inspectPackage(zip: string, into: string): Promise<PackageInfo> {
  const notPackage = "Este arquivo não é um pacote de aula do EdiAula";
  let entries: ZipDirectoryEntry[];
  try {
    entries = await zipDirectory(zip, MAX_ENTRIES);
  } catch (error) {
    throw new Error(`${notPackage}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  const names = new Set<string>();
  let bytes = 0;
  for (const e of entries) {
    const problem = entryProblem(e);
    if (problem) throw new Error(`${notPackage}: ele tem ${problem} (${e.name.slice(0, 120)}).`);
    const key = e.name.toLowerCase();
    if (names.has(key))
      throw new Error(`${notPackage}: ele tem ${e.name.slice(0, 120)} duas vezes.`);
    names.add(key);
    bytes += e.size;
  }
  const project = entries.find((e) => e.name === PACKAGE_PROJECT);
  if (!project) throw new Error(`${notPackage}.`);
  if (project.size > MAX_PROJECT_BYTES) throw new Error("O projeto do pacote é grande demais.");
  if (bytes > (await stat(zip)).size) throw new Error(`${notPackage}: os tamanhos não batem.`);
  await mkdir(into, { recursive: true });
  const disk = await statfs(into);
  const free = disk.bavail * disk.bsize;
  if (bytes + SPARE_BYTES > free)
    throw new Error(
      `Falta espaço em disco para abrir o pacote: ele precisa de ${gigabytes(bytes + SPARE_BYTES)} livres e há ${gigabytes(free)} em ${into}.`,
    );
  return { files: entries.length, bytes, folder: freeFolder(into, packageName(zip)) };
}

/**
 * Extracts a package into a new folder of `into` (named after the package) and writes the
 * lesson there with its paths pointing to the extracted files, under a new project id (it is
 * another copy of the lesson). Every entry is checked first (inspectPackage), and what came out
 * is checked again against the directory. Returns the lesson's project and where it must be
 * saved; on any failure the folder is gone.
 */
export async function unpackProject(
  zip: string,
  into: string,
): Promise<{ folder: string; project: Project }> {
  const info = await inspectPackage(zip, into);
  const folder = info.folder;
  await mkdir(folder);
  try {
    try {
      await run(tarPath(), ["-x", "-f", zip, "-C", folder], {
        windowsHide: true,
        maxBuffer: 1 << 20,
      });
    } catch (error) {
      throw new Error(
        "Este arquivo não é um pacote de aula do EdiAula: ele não pôde ser extraído.",
        {
          cause: error,
        },
      );
    }
    const root = await realpath(folder);
    const extracted = await listFiles(root);
    if (extracted.length !== info.files)
      throw new Error("O pacote não saiu como o índice dele diz.");
    for (const file of extracted) {
      const full = await realpath(join(root, file));
      const rel = relative(root, full);
      if (!rel || rel.startsWith("..") || resolve(root, rel) !== full)
        throw new Error("O pacote tem um arquivo fora da pasta da aula.");
    }
    const projectFile = join(root, PACKAGE_PROJECT);
    if (!existsSync(projectFile))
      throw new Error("Este arquivo não é um pacote de aula do EdiAula.");
    if ((await stat(projectFile)).size > MAX_PROJECT_BYTES)
      throw new Error("O projeto do pacote é grande demais.");
    const stored = projectSchema.parse(JSON.parse(await readFile(projectFile, "utf8")));
    const unpacked = unpackPaths(normalizeProject(stored), root);
    const id = newId("p");
    const project: Project = {
      ...unpacked,
      id,
      ...(unpacked.proposals
        ? { proposals: unpacked.proposals.map((x) => ({ ...x, projectId: id })) }
        : {}),
    };
    await rm(projectFile);
    return { folder: root, project };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}
