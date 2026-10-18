import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { parseRecorderSettings, type RecorderSettings } from "../shared/recorderSettings.ts";

/** userData/recorder.json: the recorder's choices between takes (shared/recorderSettings.ts). */

const file = (): string => join(app.getPath("userData"), "recorder.json");

export async function readRecorderSettings(): Promise<RecorderSettings> {
  let text: string;
  try {
    text = await readFile(file(), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return parseRecorderSettings({});
    throw error;
  }
  try {
    return parseRecorderSettings(JSON.parse(text));
  } catch {
    // A damaged file gives the defaults; the next save writes a whole one again.
    return parseRecorderSettings({});
  }
}

/** Written whole and renamed into place, so a crash never leaves half a file. */
export async function writeRecorderSettings(value: unknown): Promise<RecorderSettings> {
  const settings = parseRecorderSettings(value);
  await mkdir(app.getPath("userData"), { recursive: true });
  const partial = `${file()}.partial`;
  await writeFile(partial, JSON.stringify(settings, null, 2));
  await rename(partial, file());
  return settings;
}
