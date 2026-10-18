import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { exportSpecSchema, projectSchema } from "../../shared/project-schema.ts";
import type { ExportSpec } from "../../shared/types.ts";

/**
 * The export queue kept between sessions (userData/export-queue.json): the pending items, each
 * with its copy of the project, so they can be resumed when the app opens again (the segments
 * already rendered come from the cache). Only files the person had chosen are kept: the
 * destination selected in the save dialog (an .mp4, or an .mp3 for a podcast) and media that was
 * readable when the item was saved. They are allowed again when the queue is read back; an item
 * whose folder or media is gone comes back with the reason it cannot be resumed, and nothing of it
 * is allowed.
 */

const MAX_ITEMS = 50;
const MAX_TEXT = 64 * 1024 * 1024;

const itemSchema = z.object({
  id: z.string().min(1).max(200),
  project: projectSchema,
  spec: exportSpecSchema,
  captions: z.boolean(),
  extras: z
    .object({ translations: z.boolean().optional(), platform: z.boolean().optional() })
    .optional(),
  state: z.enum(["waiting", "preparing", "exporting", "done", "error", "cancelled"]),
});
const queueSchema = z.array(itemSchema).max(MAX_ITEMS);
type Item = z.infer<typeof itemSchema>;
/** A saved item as read back: `blocked` says why it cannot be resumed. */
export type SavedItem = Item & { blocked?: string };

const PENDING = new Set(["waiting", "preparing", "exporting"]);

/** The only files an export writes as its main output: the video, or the podcast's sound. */
const outputAllowed = (spec: Pick<ExportSpec, "outPath" | "audioOnly">): boolean =>
  (spec.audioOnly ? /\.mp3$/i : /\.mp4$/i).test(spec.outPath);

/** Media and generated files an item reads. */
function pathsOf(item: Item): string[] {
  const used = new Set(item.project.clips.map((c) => c.assetId));
  // The background picture is read like any media of the lesson.
  if (item.project.background?.kind === "image") used.add(item.project.background.assetId);
  const paths = new Set<string>();
  for (const a of item.project.assets) {
    if (!used.has(a.id)) continue;
    paths.add(a.path);
    if (a.keyed) paths.add(a.keyed);
    if (a.cursor) paths.add(a.cursor);
  }
  return [...paths];
}

export interface QueueAccess {
  canWrite: (path: string) => Promise<boolean>;
  canRead: (path: string) => Promise<boolean>;
  grantWrite: (path: string) => Promise<void>;
  grantRead: (path: string) => Promise<void>;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Writes to each of these files happen one after the other (the next waits for the last). */
const writes = new Map<string, Promise<unknown>>();
function oneAtATime<T>(file: string, work: () => Promise<T>): Promise<T> {
  const next = (writes.get(file) ?? Promise.resolve()).then(work);
  // The chain only waits for the write to end; its result (or failure) goes to the caller.
  writes.set(file, Promise.allSettled([next]));
  return next;
}

/** Replaces `file` with `text` through a temporary file of its own, flushed to disk first. */
async function replaceFile(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const partial = `${file}.${randomUUID()}.partial`;
  try {
    const handle = await open(partial, "w");
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
}

/** Keeps the pending items whose files the person chose; none left removes the file. */
export async function saveQueue(file: string, text: string, access: QueueAccess): Promise<void> {
  if (text.length > MAX_TEXT) throw new Error("A fila de exportação é grande demais para guardar.");
  const items = queueSchema.parse(JSON.parse(text));
  await oneAtATime(file, async () => {
    const kept: Item[] = [];
    for (const item of items) {
      if (!PENDING.has(item.state) || !outputAllowed(item.spec)) continue;
      if (!(await access.canWrite(item.spec.outPath))) continue;
      const readable = await Promise.all(pathsOf(item).map((p) => access.canRead(p)));
      if (!readable.every(Boolean)) continue;
      // The folder picked for the stems is allowed only in this session: a resumed export
      // makes the video and its files, and the stems are asked for again.
      const { stems: _stems, ...spec } = item.spec;
      kept.push({ ...item, spec, state: "waiting" });
    }
    if (!kept.length) await rm(file, { force: true });
    else await replaceFile(file, JSON.stringify(kept));
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** Why an item cannot run any more (a folder or a file that is gone), or null. */
async function gone(item: Item): Promise<string | null> {
  const folder = dirname(item.spec.outPath);
  if (!(await exists(folder))) return `A pasta de destino não existe mais: ${folder}`;
  for (const path of pathsOf(item))
    if (!(await exists(path))) return `Um arquivo da aula não está mais lá: ${path}`;
  return null;
}

/**
 * The saved items (JSON text of SavedItem[]), with their files allowed again; null when there are
 * none. Items that cannot be resumed come back with `blocked` and nothing of them is allowed.
 */
export async function loadQueue(file: string, access: QueueAccess): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const parsed = queueSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    // Written by an older version or damaged: it cannot be resumed, so it is not kept.
    await oneAtATime(file, () => rm(file, { force: true }));
    return null;
  }
  const items: SavedItem[] = [];
  for (const item of parsed.data) {
    if (!outputAllowed(item.spec)) {
      items.push({ ...item, blocked: "O destino guardado não é um arquivo .mp4 nem .mp3." });
      continue;
    }
    const reason = await gone(item);
    if (reason) {
      items.push({ ...item, blocked: reason });
      continue;
    }
    await access.grantWrite(item.spec.outPath);
    for (const path of pathsOf(item)) await access.grantRead(path);
    items.push(item);
  }
  return items.length ? JSON.stringify(items) : null;
}

const dirsSchema = z.array(z.string().max(32768)).max(40);

/** The remembered export folders; a damaged list starts over. */
async function readFolders(file: string): Promise<string[]> {
  try {
    return dirsSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError || error instanceof z.ZodError) return [];
    throw error;
  }
}

/** Remembers the folder of an export, to clean what a crash may leave there. */
export async function rememberExportFolder(file: string, folder: string): Promise<void> {
  await oneAtATime(file, async () => {
    const dirs = await readFolders(file);
    const next = [folder, ...dirs.filter((d) => d.toLowerCase() !== folder.toLowerCase())];
    await replaceFile(file, JSON.stringify(next.slice(0, 20)));
  });
}

export interface LeftoverOptions {
  /** Only what was made before this moment (the app's start): a running export keeps its own. */
  before: number;
  /** A folder that could not be looked at or removed; the cleanup goes on with the next one. */
  onError: (path: string, error: unknown) => void;
}

/** When a file or folder was made (its creation time, or its last change where there is none). */
const madeAt = (info: { birthtimeMs: number; mtimeMs: number }): number =>
  info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;

/**
 * Removes the `.edi-output-*` folders an interrupted export left beside its destination. A folder
 * holding backups of replaced files is a recovery to finish by hand, so it stays.
 */
export async function removeOrphanOutputs(file: string, options: LeftoverOptions): Promise<number> {
  let removed = 0;
  for (const dir of await readFolders(file)) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (!isMissing(error)) options.onError(dir, error);
      continue;
    }
    for (const name of names) {
      if (!name.startsWith(".edi-output-")) continue;
      const folder = join(dir, name);
      try {
        const info = await stat(folder);
        if (!info.isDirectory() || madeAt(info) >= options.before) continue;
        let backups: string[] = [];
        try {
          backups = await readdir(join(folder, "backups"));
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
        if (backups.length) continue;
        await rm(folder, { recursive: true, force: true });
        removed++;
      } catch (error) {
        options.onError(folder, error);
      }
    }
  }
  return removed;
}

/** Removes the private work folders (`export-*`) that exports which did not end left behind. */
export async function removeOrphanWork(workDir: string, options: LeftoverOptions): Promise<number> {
  let names: string[];
  try {
    names = await readdir(workDir);
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith("export-")) continue;
    const folder = join(workDir, name);
    try {
      const info = await stat(folder);
      if (!info.isDirectory() || madeAt(info) >= options.before) continue;
      await rm(folder, { recursive: true, force: true });
      removed++;
    } catch (error) {
      options.onError(folder, error);
    }
  }
  return removed;
}
