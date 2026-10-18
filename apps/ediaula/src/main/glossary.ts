import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import {
  GLOSSARY_LIMIT,
  type GlossaryTerm,
  normalizeGlossary,
  readGlossary,
} from "../shared/glossary.ts";
import { renameWhenFree } from "./installCheck.ts";

/** Names and terms of each course (characters, block names), used by transcription and the AI. */
const file = (): string => join(app.getPath("userData"), "glossaries.json");
const key = (course: string): string => course.trim().toLowerCase() || "(sem curso)";

/**
 * Every course glossary. A missing file is an empty set; a file that cannot be read or parsed is
 * an error, so a save never writes over the glossaries of the other courses.
 */
async function readAll(): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(file(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const all: unknown = JSON.parse(text);
  if (!all || typeof all !== "object" || Array.isArray(all))
    throw new Error("O arquivo de glossários está corrompido; nada foi gravado por cima dele.");
  return all as Record<string, unknown>;
}

/** A course glossary: terms as strings (older files) or {term, aliases}. */
export async function getGlossary(course: string): Promise<GlossaryTerm[]> {
  return readGlossary((await readAll())[key(course)]);
}

/** Saves a course glossary through a temporary file, so a crash never leaves half a file. */
export async function setGlossary(course: string, terms: GlossaryTerm[]): Promise<void> {
  const clean = normalizeGlossary(terms);
  if (clean.length > GLOSSARY_LIMIT)
    throw new Error(`O glossário aceita até ${GLOSSARY_LIMIT} termos; este tem ${clean.length}.`);
  const all = await readAll();
  if (clean.length) all[key(course)] = clean;
  else delete all[key(course)];
  const tmp = `${file()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(all, null, 1));
  await renameWhenFree(tmp, file());
}
