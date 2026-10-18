import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import { courseFolderName } from "../shared/courseTemplate.ts";
import {
  addLearning,
  emptyLearning,
  LEARNING_KINDS,
  type Learning,
  learningSchema,
} from "../shared/learning.ts";
import { renameWhenFree } from "./installCheck.ts";

/** What the person decided in each course (shared/learning.ts), in userData/cursos/<curso>. */
const file = (course: string): string =>
  join(app.getPath("userData"), "cursos", courseFolderName(course), "aprendizado.json");

/** Decisions written at once (one review bar resolution). */
const newEvents = z
  .array(
    z.object({
      kind: z.enum(LEARNING_KINDS),
      accepted: z.boolean(),
      at: z.number().nonnegative(),
      word: z.string().max(60).optional(),
      seconds: z.number().min(0).max(600).optional(),
      direction: z.string().max(200).optional(),
    }),
  )
  .max(2000);

export async function getLearning(course: string): Promise<Learning> {
  let text: string;
  try {
    text = await readFile(file(course), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLearning();
    throw err;
  }
  const parsed = learningSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error("O aprendizado guardado deste curso não pôde ser lido; ele recomeça do zero.");
  return parsed.data;
}

/** Adds decisions to the course's file, through a temporary file. */
export async function recordLearning(course: string, raw: unknown): Promise<void> {
  const events = newEvents.parse(raw);
  if (!events.length || !course.trim()) return;
  let now: Learning;
  try {
    now = await getLearning(course);
  } catch (err) {
    console.warn("[ediaula] learning_reset", err instanceof Error ? err.message : err);
    now = emptyLearning();
  }
  const target = file(course);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(addLearning(now, events)), "utf8");
  await renameWhenFree(tmp, target);
}
