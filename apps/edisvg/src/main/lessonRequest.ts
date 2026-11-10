import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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
});
const takenSchema = z.looseObject({ sentAt: z.number().int().nonnegative() });

export interface LessonRequest {
  lessonId: string;
  name: string;
  sentAt: number;
  /** The package. */
  path: string;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The lesson EdiAula sent and this profile has not taken yet, marked taken; null when there is
 * none (or its package is gone).
 */
export async function takeLessonRequest(
  ediaula: string,
  userData: string,
): Promise<LessonRequest | null> {
  const folder = join(ediaula, REQUEST_FOLDER);
  const request = requestSchema.safeParse(await readJson(join(folder, REQUEST_FILE)));
  if (!request.success) return null;
  const taken = takenSchema.safeParse(await readJson(join(userData, TAKEN_FILE)));
  if (taken.success && taken.data.sentAt >= request.data.sentAt) return null;
  const path = join(folder, request.data.file);
  if (!(await stat(path).catch(() => null))?.isFile()) return null;
  await mkdir(userData, { recursive: true });
  await atomicWrite(join(userData, TAKEN_FILE), JSON.stringify({ sentAt: request.data.sentAt }));
  const { lessonId, name, sentAt } = request.data;
  return { lessonId, name, sentAt, path };
}
