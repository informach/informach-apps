import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { type BrowserWindow, dialog } from "electron";
import {
  type PickedFile,
  parseRecipeStore,
  type RecipeStore,
  recipeStoreSchema,
} from "../shared/pipelines";
import { readBoundedText, SZPROJECT_BYTES } from "./boundedText.ts";

/**
 * The pipelines of the main process: the recipes saved in the profile (userData/pipelines.json,
 * written whole and atomically) and the files a run uses. A picked file's path never goes to the
 * window: it gets a token, and every step that reads the file asks with the token, so the main
 * process only ever opens what the person chose in its dialog.
 */

const storeFile = (userData: string): string => join(userData, "pipelines.json");

export async function readRecipeStore(userData: string): Promise<RecipeStore> {
  try {
    return parseRecipeStore(JSON.parse(await readFile(storeFile(userData), "utf8")));
  } catch {
    // Missing or unreadable: the ready recipes alone.
    return parseRecipeStore(undefined);
  }
}

export async function writeRecipeStore(userData: string, value: unknown): Promise<RecipeStore> {
  const store = recipeStoreSchema.parse(value);
  await atomicWrite(storeFile(userData), JSON.stringify(store, null, 1));
  return store;
}

const FILTERS: Record<PickedFile["kind"], Electron.FileFilter[]> = {
  szproject: [{ name: "Projeto do Estúdio (.szproject.json)", extensions: ["json"] }],
  audio: [
    {
      name: "Áudio ou vídeo da aula",
      extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "mp4", "mov", "webm", "mkv"],
    },
  ],
  lesson: [{ name: "Aula do EdiAula (.ediaula)", extensions: ["ediaula"] }],
  video: [{ name: "Vídeo", extensions: ["mp4", "mov", "webm", "mkv", "avi"] }],
};

const picked = new Map<string, { path: string; kind: PickedFile["kind"] }>();

/** The person picks a file in the system dialog; the window gets its token, name and size. */
export async function pickPipelineFile(
  win: BrowserWindow,
  kind: PickedFile["kind"],
  defaultPath: string,
): Promise<PickedFile | null> {
  if (!Object.hasOwn(FILTERS, kind)) throw new Error("Tipo de arquivo desconhecido.");
  const result = await dialog.showOpenDialog(win, {
    defaultPath,
    filters: FILTERS[kind],
    properties: ["openFile", "dontAddToRecent"],
  });
  const path = result.filePaths[0];
  if (result.canceled || !path) return null;
  const token = `file-${randomUUID()}`;
  picked.set(token, { path, kind });
  return { token, name: basename(path), kind, size: (await stat(path)).size };
}

/** The path behind a token, if it was picked as `kind` in this session. */
export function pickedPath(token: unknown, kind: PickedFile["kind"]): string {
  const entry = typeof token === "string" ? picked.get(token) : undefined;
  if (!entry || entry.kind !== kind) throw new Error("Arquivo não escolhido nesta sessão.");
  return entry.path;
}

/** The text of a picked studio project (the import itself runs in the window). */
export function readPickedProject(token: unknown): Promise<string> {
  return readBoundedText(pickedPath(token, "szproject"), SZPROJECT_BYTES);
}
