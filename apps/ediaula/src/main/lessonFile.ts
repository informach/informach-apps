import { win32 } from "node:path";
import { z } from "zod";

/**
 * The lesson file the renderer names when it opens or saves a lesson (project:open,
 * project:save). Only a .ediaula the person chose reaches the disk: one picked in a dialog, on
 * the recent list, or made by the app (a new lesson, a copy, an opened package), which the desktop
 * SDK allowed (`allowed`: its assertRead or assertWrite, returning the real path). Anything else
 * it allowed (an exported video, a folder picked for the stems) is never read or written as a
 * lesson, and neither is a .ediaula that is a link to some other file.
 */

const EXTENSION = ".ediaula";
const NOT_A_LESSON = "Escolha um arquivo de aula do EdiAula (.ediaula).";

const pathSchema = z.string().min(1).max(32768);

const isLesson = (path: string): boolean => win32.extname(path).toLowerCase() === EXTENSION;

export async function lessonFile(
  value: unknown,
  allowed: (path: string) => Promise<string>,
): Promise<string> {
  const path = pathSchema.parse(value);
  // Windows rules on any host: the app only runs on Windows, and so do its paths.
  if (!win32.isAbsolute(path) || path.includes("\0") || !isLesson(path))
    throw new Error(NOT_A_LESSON);
  const real = await allowed(path);
  if (!isLesson(real)) throw new Error(NOT_A_LESSON);
  return real;
}
