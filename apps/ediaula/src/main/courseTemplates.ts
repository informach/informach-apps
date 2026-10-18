import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { app } from "electron";
import {
  type CourseTemplate,
  courseFolderName,
  legacyTemplateFile,
  migrateCourseSetup,
  readCourseTemplate,
  sameCourse,
} from "../shared/courseTemplate.ts";
import { renameWhenFree } from "./installCheck.ts";

/**
 * Each course's template (shared/courseTemplate.ts) lives in userData/cursos/<curso>/modelo.json.
 * Two courses whose names only differ in what a folder name cannot hold ("Aula: 1" and "Aula 1")
 * never share a file: the second one goes to "<curso> (2)", and every read and write checks the
 * course written inside. Templates of the first version (userData/course-templates/<curso>.json)
 * become version 2 the first time their course is read, and the old file is kept as .migrated.
 */

const root = (): string => join(app.getPath("userData"), "cursos");
/** How many courses may share a folder name before giving up. */
const SAME_NAME = 50;

const candidate = (course: string, n: number): string =>
  join(
    root(),
    n === 1 ? courseFolderName(course) : `${courseFolderName(course)} (${n})`,
    "modelo.json",
  );

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** The file of `course`'s template and the template, or the first free file when it has none. */
async function locate(course: string): Promise<{ file: string; template: CourseTemplate | null }> {
  for (let n = 1; n <= SAME_NAME; n++) {
    const file = candidate(course, n);
    const text = await readText(file);
    if (text === null) return { file, template: null };
    const template = readCourseTemplate(JSON.parse(text));
    if (!template)
      throw new Error(
        "O modelo salvo deste curso não é um modelo do EdiAula; salve o modelo de novo.",
      );
    // A template saved without its course belongs to the folder's own name.
    if (template.course ? sameCourse(template.course, course) : n === 1) return { file, template };
  }
  throw new Error("Há cursos demais com nomes parecidos; dê outro nome a este curso.");
}

async function write(file: string, template: CourseTemplate): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(template, null, 2), "utf8");
  await renameWhenFree(tmp, file);
}

/** A version 1 template of the course, moved to version 2 (null when there is none). */
async function migrate(course: string, file: string): Promise<CourseTemplate | null> {
  const old = join(app.getPath("userData"), "course-templates", legacyTemplateFile(course));
  const text = await readText(old);
  if (text === null) return null;
  const template = migrateCourseSetup(JSON.parse(text));
  if (!template) {
    console.warn("course template of version 1 not readable", old);
    return null;
  }
  // Courses that differ only in characters Windows refuses shared one old file.
  if (!sameCourse(template.course, course)) return null;
  await write(file, template);
  await rename(old, `${old}.migrated`);
  return template;
}

/** The course's template; null when there is none. A file that is not one is an error. */
export async function getCourseTemplate(course: string): Promise<CourseTemplate | null> {
  if (!course.trim()) return null;
  const { file, template } = await locate(course);
  return template ?? (await migrate(course, file));
}

/** Saves the course's template through a temporary file; returns where it is. */
export async function saveCourseTemplate(course: string, raw: unknown): Promise<string> {
  const template = readCourseTemplate(raw);
  if (!template || !course.trim()) throw new Error("Modelo do curso inválido.");
  if (template.course && !sameCourse(template.course, course))
    throw new Error("O modelo é de outro curso.");
  const { file } = await locate(course);
  await write(file, { ...template, course: template.course ?? course });
  return file;
}

/**
 * Whether a music file of a template may be opened when a lesson starts from it: a file on this
 * computer. A path to another machine (\\servidor\pasta) is never touched, since opening it
 * would send the person's Windows credentials to that machine.
 */
export const localMusicPath = (path: string): boolean =>
  isAbsolute(path) && !/^[\\/]{2}/.test(path);
