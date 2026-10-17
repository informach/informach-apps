import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { app } from "electron";
import { normalizeProject } from "../shared/project-normalize.ts";
import { projectSchema, projectSettingsSchema } from "../shared/project-schema.ts";
import { defaultTracks, newId, projectDuration } from "../shared/timeline.ts";
import type { Project, ProjectSettings, RecentEntry } from "../shared/types.ts";

export const PROJECT_EXT = "ediaula";
const MAX_RECENT = 40;

export function projectsDir(): string {
  const dir = join(app.getPath("documents"), "EdiAula", "Projetos");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const recentFile = (): string => join(app.getPath("userData"), "recent.json");

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
  const base = safeName(name);
  let path = join(projectsDir(), `${base}.${PROJECT_EXT}`);
  for (let i = 2; existsSync(path); i++)
    path = join(projectsDir(), `${base} (${i}).${PROJECT_EXT}`);
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

/** Keeps rolling copies of a project (at most one every 10 minutes) in a .backups folder next to it. */
function backup(path: string): void {
  if (!existsSync(path)) return;
  const dir = join(path, "..", ".backups", basename(path).replace(/\.ediaula$/, ""));
  mkdirSync(dir, { recursive: true });
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ediaula"))
    .sort();
  const last = files[files.length - 1];
  if (last && Date.now() - statSync(join(dir, last)).mtimeMs < BACKUP_EVERY_MS) return;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  copyFileSync(path, join(dir, `${stamp}.ediaula`));
  for (const old of files.slice(0, Math.max(0, files.length + 1 - BACKUPS_KEPT)))
    unlinkSync(join(dir, old));
}

/** Largest project file the editor reads, and so the largest it writes. */
const MAX_PROJECT_BYTES = 32 * 1024 ** 2;
const TOO_LARGE = "Projeto maior que 32 MB.";

/**
 * The renderer sends the project as JSON text: one IPC value however long the lesson is (the
 * structure limit of the desktop SDK counts every field of an object). Validated like a file.
 */
export function parseProjectText(text: unknown): Project {
  if (typeof text !== "string") throw new Error("Projeto inválido.");
  if (Buffer.byteLength(text) > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  return projectSchema.parse(JSON.parse(text));
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
  await touchRecent(path, project);
}

export async function openProject(path: string): Promise<Project> {
  if ((await stat(path)).size > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const content = await readFile(path, "utf8");
  if (Buffer.byteLength(content) > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const project = normalizeProject(projectSchema.parse(JSON.parse(content)));
  await touchRecent(path, project);
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
