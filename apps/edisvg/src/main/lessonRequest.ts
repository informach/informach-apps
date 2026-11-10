import { copyFile, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";

/**
 * "Animar no EdiSVG", in EdiAula: the lesson comes packed for the pipelines (the ZIP of
 * Empacotar a aula) in EdiAula's profile, `para-o-edisvg/`, with `pedido.json` written last (a
 * request there means its package is whole; apps/ediaula/src/main/edisvgHandoff.ts). EdiSVG
 * takes a request once, when it opens or comes back to the front, and opens its pipelines with
 * the lesson chosen. Which request it took is kept in its own profile.
 */

export const REQUEST_FOLDER = "para-o-edisvg";
const REQUEST_FILE = "pedido.json";
const TAKEN_FILE = "pedido-do-ediaula.json";

const requestSchema = z.looseObject({
  version: z.literal(1),
  lessonId: z.string().regex(/^[\w-]{1,100}$/),
  name: z.string().min(1).max(200),
  file: z.string().regex(/^aula-[\w-]{1,100}-\d{13}\.zip$/),
  sentAt: z.number().int().positive(),
  /** The lesson's EdiSVG project, beside the lesson: opened, or made there the first time. */
  project: z.string().min(1).max(1000).optional(),
});
const takenSchema = z.looseObject({ sentAt: z.number().int().nonnegative() });

export interface LessonRequest {
  lessonId: string;
  name: string;
  sentAt: number;
  /** The package. */
  path: string;
  /** The lesson's project file (a .edisvg whose folder exists), when the request names one. */
  project?: string;
}

/** A project path from the request, as EdiSVG would save one: absolute, .edisvg, its folder there. */
async function projectPath(value: string | undefined): Promise<string | undefined> {
  if (!value || !isAbsolute(value) || !value.toLowerCase().endsWith(".edisvg")) return undefined;
  return (await stat(dirname(value)).catch(() => null))?.isDirectory() ? value : undefined;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** The request EdiAula left that this profile has not taken yet, without taking it. */
async function pending(ediaula: string, userData: string) {
  const folder = join(ediaula, REQUEST_FOLDER);
  const request = requestSchema.safeParse(await readJson(join(folder, REQUEST_FILE)));
  if (!request.success) return null;
  const taken = takenSchema.safeParse(await readJson(join(userData, TAKEN_FILE)));
  if (taken.success && taken.data.sentAt >= request.data.sentAt) return null;
  const path = join(folder, request.data.file);
  if (!(await stat(path).catch(() => null))?.isFile()) return null;
  return { ...request.data, path };
}

/** The request waiting (when it was sent, and its lesson's name), so the window comes for it. */
export async function lessonRequestWaiting(
  ediaula: string,
  userData: string,
): Promise<{ sentAt: number; name: string } | null> {
  const request = await pending(ediaula, userData);
  return request ? { sentAt: request.sentAt, name: request.name } : null;
}

/** Where EdiSVG keeps the packages it took, and how many besides the ones in use. */
export const TAKEN_PACKAGES = "pacotes-do-ediaula";
const KEEP_PACKAGES = 2;

/**
 * The package as EdiSVG's own file: EdiAula cleans its folder at every send, under pipelines
 * that may still be reading it. A hard link (the same folder tree, instant, no second copy on
 * the disk), or a copy when the link cannot be made. The older ones go, except those `inUse`.
 */
export async function keepPackage(
  source: string,
  userData: string,
  inUse: (path: string) => boolean,
): Promise<string> {
  const folder = join(userData, TAKEN_PACKAGES);
  await mkdir(folder, { recursive: true });
  const kept = join(folder, basename(source));
  await rm(kept, { force: true });
  await link(source, kept).catch(() => copyFile(source, kept));
  const names = (await readdir(folder)).filter((name) => /-\d{13}\.zip$/.test(name));
  const at = (name: string) => Number(/-(\d{13})\.zip$/.exec(name)?.[1] ?? 0);
  names.sort((a, b) => at(b) - at(a));
  for (const name of names.slice(KEEP_PACKAGES)) {
    const path = join(folder, name);
    if (path !== kept && !inUse(path)) await rm(path, { force: true }).catch(() => undefined);
  }
  return kept;
}

/**
 * The lesson EdiAula sent and this profile has not taken yet, marked taken; null when there is
 * none (or its package is gone).
 */
export async function takeLessonRequest(
  ediaula: string,
  userData: string,
): Promise<LessonRequest | null> {
  const request = await pending(ediaula, userData);
  if (!request) return null;
  await mkdir(userData, { recursive: true });
  await atomicWrite(join(userData, TAKEN_FILE), JSON.stringify({ sentAt: request.sentAt }));
  const { lessonId, name, sentAt, path } = request;
  const project = await projectPath(request.project);
  return { lessonId, name, sentAt, path, ...(project ? { project } : {}) };
}
