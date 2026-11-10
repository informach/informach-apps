import { randomUUID } from "node:crypto";
import { copyFile, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { type BrowserWindow, dialog } from "electron";
import {
  type PickedFile,
  parseRecipeStore,
  type RecipeStore,
  recipeStoreSchema,
  salvageRecipeStore,
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
  const file = storeFile(userData);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    // No file yet: the ready recipes alone.
    return parseRecipeStore(undefined);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  const { store, complete } = salvageRecipeStore(raw);
  // Part of the file did not fit: a copy stays beside it (pipelines.json.bak) before the next
  // save writes only what was read, so the person's recipes are never lost silently.
  if (!complete) await copyFile(file, `${file}.bak`).catch(() => undefined);
  return store;
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
  // EdiAula's package (Arquivo › Empacotar a aula): the lesson with its narration and screen.
  lesson: [{ name: "Pacote da aula do EdiAula (.zip)", extensions: ["zip"] }],
  video: [{ name: "Vídeo", extensions: ["mp4", "mov", "webm", "mkv", "avi"] }],
};

const picked = new Map<string, { path: string; kind: PickedFile["kind"] }>();

/** The person picks a file in the system dialog; the window gets its token, name and size. */
export async function pickPipelineFile(
  win: BrowserWindow,
  kind: PickedFile["kind"],
  defaultPath: string | undefined,
): Promise<PickedFile | null> {
  if (!Object.hasOwn(FILTERS, kind)) throw new Error("Tipo de arquivo desconhecido.");
  const result = await dialog.showOpenDialog(win, {
    ...(defaultPath ? { defaultPath } : {}),
    filters: FILTERS[kind],
    properties: ["openFile", "dontAddToRecent"],
  });
  const path = result.filePaths[0];
  if (result.canceled || !path) return null;
  return registerPickedFile(path, kind, basename(path));
}

/**
 * A file the main process made for the run (the screen of a lesson's stretch), handed to the
 * window as if picked: the steps read it with its token like any other.
 */
export async function registerPickedFile(
  path: string,
  kind: PickedFile["kind"],
  name: string,
): Promise<PickedFile> {
  const token = `file-${randomUUID()}`;
  picked.set(token, { path, kind });
  return { token, name: name.slice(0, 260), kind, size: (await stat(path)).size };
}

/** Forgets a made file's token (its file is gone). */
export function forgetPickedFile(token: string): void {
  picked.delete(token);
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
