import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import {
  type CourseTemplate,
  courseFolderName,
  readCourseTemplate,
} from "../shared/courseTemplate.ts";
import { renameWhenFree } from "./installCheck.ts";

/** Each course's template (shared/courseTemplate.ts) lives in userData/cursos/<curso>/modelo.json. */
const file = (course: string): string =>
  join(app.getPath("userData"), "cursos", courseFolderName(course), "modelo.json");

/** The course's template; null when there is none. A file that is not one is an error. */
export async function getCourseTemplate(course: string): Promise<CourseTemplate | null> {
  let text: string;
  try {
    text = await readFile(file(course), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const template = readCourseTemplate(JSON.parse(text));
  if (!template)
    throw new Error(
      "O modelo salvo deste curso não é um modelo do EdiAula; salve o modelo de novo.",
    );
  return template;
}

/** Saves the course's template through a temporary file; returns where it is. */
export async function saveCourseTemplate(course: string, raw: unknown): Promise<string> {
  const template = readCourseTemplate(raw);
  if (!template) throw new Error("Modelo do curso inválido.");
  const target = file(course);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(template, null, 2), "utf8");
  await renameWhenFree(tmp, target);
  return target;
}
