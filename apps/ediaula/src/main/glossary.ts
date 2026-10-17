import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

/** Names and terms of each course (characters, block names), used by transcription and the AI. */
const file = (): string => join(app.getPath("userData"), "glossaries.json");
const key = (course: string): string => course.trim().toLowerCase() || "(sem curso)";

async function readAll(): Promise<Record<string, string[]>> {
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export async function getGlossary(course: string): Promise<string[]> {
  return (await readAll())[key(course)] ?? [];
}

export async function setGlossary(course: string, terms: string[]): Promise<void> {
  const all = await readAll();
  const clean = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, 60);
  if (clean.length) all[key(course)] = clean;
  else delete all[key(course)];
  await writeFile(file(), JSON.stringify(all, null, 1));
}
