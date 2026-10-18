import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import {
  type CourseSetup,
  courseSetupSchema,
  sameCourse,
  setupFileName,
} from "../shared/courseSetup.ts";
import { renameWhenFree } from "./installCheck.ts";

/** Course templates (shared/courseSetup.ts), one file per course in the app's profile. */
const folder = (): string => join(app.getPath("userData"), "course-templates");

/** The template of a course, or null when there is none (or it is not one the app can read). */
export async function readCourseSetup(course: string): Promise<CourseSetup | null> {
  let text: string;
  try {
    text = await readFile(join(folder(), setupFileName(course)), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = courseSetupSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.warn("course template not readable", course, parsed.error.issues.slice(0, 3));
    return null;
  }
  // Two courses whose names only differ in characters Windows refuses share a file name.
  return sameCourse(parsed.data.course, course) ? parsed.data : null;
}

/** Saves a course template through a temporary file, so a crash never leaves half a file. */
export async function writeCourseSetup(raw: unknown): Promise<CourseSetup> {
  const setup = courseSetupSchema.parse(raw);
  await mkdir(folder(), { recursive: true });
  const file = join(folder(), setupFileName(setup.course));
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(setup, null, 1));
  await renameWhenFree(tmp, file);
  return setup;
}
