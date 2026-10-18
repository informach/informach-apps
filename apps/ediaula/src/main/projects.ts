import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { app } from "electron";
import { z } from "zod";
import { normalizeProject } from "../shared/project-normalize.ts";
import { projectSchema, projectSettingsSchema } from "../shared/project-schema.ts";
import { defaultTracks, newId, projectDuration } from "../shared/timeline.ts";
import type { BackupEntry, Project, ProjectSettings, RecentEntry } from "../shared/types.ts";

export const PROJECT_EXT = "ediaula";
/** The start screen lists this many lessons, most recent first, with a search over all of them. */
const MAX_RECENT = 300;

export function projectsDir(): string {
  const dir = join(app.getPath("documents"), "EdiAula", "Projetos");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const recentFile = (): string => join(app.getPath("userData"), "recent.json");

/** `<folder>/<base>.ediaula`, or `<base> (2).ediaula` and so on when the name is taken. */
function freePath(folder: string, base: string, except?: string): string {
  let path = join(folder, `${base}.${PROJECT_EXT}`);
  for (let i = 2; existsSync(path) && path.toLowerCase() !== except?.toLowerCase(); i++)
    path = join(folder, `${base} (${i}).${PROJECT_EXT}`);
  return path;
}

const safeName = (name: string): string =>
  [...name]
    .filter((character) => character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Aula sem nome";

export async function createProject(
  name: string,
  course: string | undefined,
  settings: ProjectSettings,
): Promise<{ path: string; project: Project }> {
  const path = freePath(projectsDir(), safeName(name));
  const now = Date.now();
  const project: Project = {
    version: 1,
    id: newId("p"),
    name: name.trim() || "Aula sem nome",
    course: course?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    settings: projectSettingsSchema.parse(settings),
    assets: [],
    tracks: defaultTracks(),
    clips: [],
  };
  await saveProject(path, project);
  return { path, project };
}

const BACKUP_EVERY_MS = 10 * 60 * 1000;
const BACKUPS_KEPT = 20;

/** Where the rolling copies of a project are kept: a .backups folder next to it. */
const backupDir = (path: string): string =>
  join(path, "..", ".backups", basename(path).replace(/\.ediaula$/i, ""));
/** The name of a backup file: the moment it was taken, and a letter when that second is taken. */
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}[a-z]?\.ediaula$/;
/**
 * What the list of backups shows of each copy (name, length, clips), kept beside them, so
 * listing them never reads every copy: a copy is read whole only to be restored.
 */
const BACKUP_INDEX = "indice.json";
type BackupSummary = Pick<BackupEntry, "name" | "duration" | "clips">;
const indexSchema = z.record(
  z.string(),
  z.looseObject({
    name: z.string().max(1024).optional(),
    duration: z.number().nonnegative().optional(),
    clips: z.int().nonnegative().optional(),
  }),
);

function readIndex(dir: string): Record<string, BackupSummary> {
  const file = join(dir, BACKUP_INDEX);
  if (!existsSync(file)) return {};
  try {
    return indexSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (err) {
    // Only a summary: the copies are all there, and the list reads them once to make it again.
    console.warn("backup index not readable", file, err);
    return {};
  }
}

const summaryOf = (p: Project): BackupSummary => ({
  name: p.name,
  duration: projectDuration(p),
  clips: p.clips.length,
});

/**
 * Keeps rolling copies of a project (at most one every 10 minutes, or one now with `force`) in a
 * .backups folder next to it, the last BACKUPS_KEPT of them, each with its line in the index.
 */
function backup(path: string, force = false): void {
  if (!existsSync(path)) return;
  const dir = backupDir(path);
  mkdirSync(dir, { recursive: true });
  const files = readdirSync(dir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort();
  const last = files[files.length - 1];
  if (!force && last && Date.now() - statSync(join(dir, last)).mtimeMs < BACKUP_EVERY_MS) return;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  let name = `${stamp}.ediaula`;
  for (let i = 0; existsSync(join(dir, name)) && i < 26; i++)
    name = `${stamp}${String.fromCharCode(97 + i)}.ediaula`;
  copyFileSync(path, join(dir, name));
  const kept = [...files.filter((f) => f !== name), name].sort();
  const gone = kept.slice(0, Math.max(0, kept.length - BACKUPS_KEPT));
  for (const old of gone) unlinkSync(join(dir, old));
  const index = readIndex(dir);
  for (const old of gone) delete index[old];
  try {
    index[name] = summaryOf(projectSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8"))));
  } catch (err) {
    console.warn("backup not summarized", name, err);
  }
  writeFileSync(join(dir, BACKUP_INDEX), JSON.stringify(index));
}

/** Largest project file the editor reads, and so the largest it writes. */
const MAX_PROJECT_BYTES = 32 * 1024 ** 2;
const TOO_LARGE = "Projeto maior que 32 MB.";

/**
 * The renderer sends the project as JSON text: one IPC value however long the lesson is (the
 * structure limit of the desktop SDK counts every field of an object). This only reads it, with
 * the same size limit as a file; the schema check happens once, where the project is used
 * (saveProject, exportLesson).
 */
export function projectJson(text: unknown): unknown {
  if (typeof text !== "string") throw new Error("Projeto inválido.");
  if (Buffer.byteLength(text) > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  return JSON.parse(text);
}

/** The recent list is a convenience: failing to update it never fails a save or an open. */
async function remember(path: string, project: Project): Promise<void> {
  try {
    await touchRecent(path, project);
  } catch (err) {
    console.warn("recent projects not updated", err);
  }
}

export async function saveProject(path: string, rawProject: unknown): Promise<void> {
  const project = projectSchema.parse(rawProject);
  const content = JSON.stringify(project, null, 1);
  // Refused before touching the file: a project that could not be opened again is not saved.
  if (Buffer.byteLength(content) > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  try {
    backup(path);
  } catch (err) {
    console.warn("backup failed", err);
  }
  await atomicWrite(path, content);
  await remember(path, project);
}

export async function openProject(path: string): Promise<Project> {
  if ((await stat(path)).size > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const content = await readFile(path, "utf8");
  if (Buffer.byteLength(content) > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const project = normalizeProject(projectSchema.parse(JSON.parse(content)));
  await remember(path, project);
  return project;
}

async function readRecent(): Promise<RecentEntry[]> {
  try {
    return JSON.parse(await readFile(recentFile(), "utf8")) as RecentEntry[];
  } catch {
    return [];
  }
}

async function touchRecent(path: string, project: Project): Promise<void> {
  const firstVisual = project.clips
    .map((c) => project.assets.find((a) => a.id === c.assetId))
    .find((a) => a && a.kind !== "audio" && a.thumb);
  const entry: RecentEntry = {
    path,
    name: project.name,
    course: project.course,
    updatedAt: project.updatedAt,
    exportedAt: project.exportedAt,
    duration: projectDuration(project),
    thumb: firstVisual?.thumb ?? project.assets.find((a) => a.thumb)?.thumb,
    assetCount: project.assets.length,
    editSeconds: project.stats?.editSeconds,
  };
  const list = (await readRecent()).filter((r) => r.path !== path);
  list.unshift(entry);
  await atomicWrite(recentFile(), JSON.stringify(list.slice(0, MAX_RECENT)));
}

export async function recentProjects(): Promise<RecentEntry[]> {
  const list = await readRecent();
  return list.filter((r) => existsSync(r.path)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeRecent(path: string): Promise<void> {
  const list = (await readRecent()).filter((r) => r.path !== path);
  await atomicWrite(recentFile(), JSON.stringify(list));
}

/** Reads and checks a project file, as opening it would (without touching the recent list). */
async function readProject(path: string): Promise<Project> {
  if ((await stat(path)).size > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const content = await readFile(path, "utf8");
  return normalizeProject(projectSchema.parse(JSON.parse(content)));
}

/**
 * A copy of a lesson as a lesson of its own (Duplicar): next to it, named "<name> (cópia)", with
 * its own id, so the recent list, the export marks and the proposals tell them apart. Returns
 * where it was written.
 */
export async function duplicateProject(path: string): Promise<{ path: string; project: Project }> {
  const source = await readProject(path);
  const name = `${source.name} (cópia)`;
  const id = newId("p");
  const copy: Project = {
    ...source,
    id,
    name,
    updatedAt: Date.now(),
    ...(source.proposals
      ? { proposals: source.proposals.map((proposal) => ({ ...proposal, projectId: id })) }
      : {}),
  };
  const target = freePath(dirname(path), safeName(name));
  await saveProject(target, copy);
  return { path: target, project: copy };
}

/**
 * Renames a lesson: its name and its file (and the folder of its backups) follow, and the recent
 * list forgets the old file. Returns the new path, the same one when the file name stays.
 */
export async function renameProject(path: string, name: string): Promise<string> {
  const clean = name.trim().slice(0, 200);
  if (!clean) throw new Error("Dê um nome à aula.");
  const project = await readProject(path);
  const free = freePath(dirname(path), safeName(clean), path);
  // Windows names ignore case: the same name in other capitals is the same file.
  const moves = free.toLowerCase() !== path.toLowerCase();
  const target = moves ? free : path;
  const renamed: Project = { ...project, name: clean, updatedAt: Date.now() };
  if (moves && existsSync(backupDir(path)) && !existsSync(backupDir(target)))
    await rename(backupDir(path), backupDir(target));
  await saveProject(target, renamed);
  if (moves) {
    await rm(path, { force: true });
    await removeRecent(path);
  }
  return target;
}

/**
 * The backups of a lesson, newest first, from the index beside them. A copy the index does not
 * know (made before it existed) is read once and joins it.
 */
export async function listBackups(path: string): Promise<BackupEntry[]> {
  const dir = backupDir(path);
  if (!existsSync(dir)) return [];
  const index = readIndex(dir);
  let learned = false;
  const out: BackupEntry[] = [];
  for (const id of readdirSync(dir).filter((f) => BACKUP_NAME.test(f))) {
    const file = join(dir, id);
    const info = statSync(file);
    let summary = index[id];
    if (!summary)
      try {
        summary = summaryOf(await readProject(file));
        index[id] = summary;
        learned = true;
      } catch (err) {
        console.warn("backup not readable", file, err);
      }
    out.push({ id, at: info.mtimeMs, size: info.size, ...summary });
  }
  if (learned) writeFileSync(join(dir, BACKUP_INDEX), JSON.stringify(index));
  return out.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
}

/**
 * Puts a backup back in place of the lesson. What the lesson is now becomes a backup first, so
 * restoring can itself be undone by restoring that one. Returns the restored lesson.
 */
export async function restoreBackup(path: string, id: string): Promise<Project> {
  if (!BACKUP_NAME.test(id) || basename(id) !== id) throw new Error("Cópia de segurança inválida.");
  const file = join(backupDir(path), id);
  if (!existsSync(file)) throw new Error("Essa cópia de segurança não existe mais.");
  const restored: Project = { ...(await readProject(file)), updatedAt: Date.now() };
  backup(path, true);
  await saveProject(path, restored);
  return restored;
}
