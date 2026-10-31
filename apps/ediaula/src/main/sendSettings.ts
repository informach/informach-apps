import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { z } from "zod";

/**
 * userData/envio.json: the folder lessons are sent from ("Enviar para a edição"). Usually a
 * folder synced with the cloud, so the package reaches whoever edits it without another step.
 */

const sendSettingsSchema = z.object({
  folder: z.string().min(1).max(4096).optional().catch(undefined),
});

export type SendSettings = z.infer<typeof sendSettingsSchema>;

const file = (): string => join(app.getPath("userData"), "envio.json");

export async function readSendSettings(): Promise<SendSettings> {
  try {
    return sendSettingsSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    // Missing or damaged: no folder yet; the next save writes a whole file.
    return {};
  }
}

/** Written whole and renamed into place, so a crash never leaves half a file. */
export async function writeSendSettings(value: SendSettings): Promise<SendSettings> {
  const settings = sendSettingsSchema.parse(value);
  await mkdir(app.getPath("userData"), { recursive: true });
  const partial = `${file()}.partial`;
  await writeFile(partial, JSON.stringify(settings, null, 2));
  await rename(partial, file());
  return settings;
}
