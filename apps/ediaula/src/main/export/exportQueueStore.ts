import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { exportSpecSchema, projectSchema } from "../../shared/project-schema.ts";

/**
 * The export queue kept between sessions (userData/export-queue.json): the pending items, each
 * with its copy of the project, so they can be resumed when the app opens again (the segments
 * already rendered come from the cache). Only files the person had chosen are kept: the
 * destination selected in the save dialog and media that was readable when the item was saved.
 * They are allowed again when the queue is read back.
 */

const MAX_ITEMS = 50;
const MAX_TEXT = 64 * 1024 * 1024;

const itemSchema = z.object({
  id: z.string().min(1).max(200),
  project: projectSchema,
  spec: exportSpecSchema,
  captions: z.boolean(),
  state: z.enum(["waiting", "preparing", "exporting", "done", "error", "cancelled"]),
});
const queueSchema = z.array(itemSchema).max(MAX_ITEMS);
type Item = z.infer<typeof itemSchema>;

const PENDING = new Set(["waiting", "preparing", "exporting"]);

/** Media and generated files an item reads. */
function pathsOf(item: Item): string[] {
  const used = new Set(item.project.clips.map((c) => c.assetId));
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

/** Keeps the pending items whose files the person chose; none left removes the file. */
export async function saveQueue(file: string, text: string, access: QueueAccess): Promise<void> {
  if (text.length > MAX_TEXT) throw new Error("A fila de exportação é grande demais para guardar.");
  const items = queueSchema.parse(JSON.parse(text));
  const kept: Item[] = [];
  for (const item of items) {
    if (!PENDING.has(item.state) || !(await access.canWrite(item.spec.outPath))) continue;
    const readable = await Promise.all(pathsOf(item).map((p) => access.canRead(p)));
    if (readable.every(Boolean)) kept.push({ ...item, state: "waiting" });
  }
  if (!kept.length) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  await writeFile(partial, JSON.stringify(kept));
  await rename(partial, file);
}

/** The saved items (JSON text), with their files allowed again; null when there are none. */
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
    await rm(file, { force: true });
    return null;
  }
  const items: Item[] = [];
  for (const item of parsed.data) {
    try {
      await access.grantWrite(item.spec.outPath);
      for (const path of pathsOf(item)) await access.grantRead(path);
      items.push(item);
    } catch (error) {
      // A destination folder or a media file that is gone: that item cannot run any more.
      if (!isMissing(error)) throw error;
    }
  }
  return items.length ? JSON.stringify(items) : null;
}

const dirsSchema = z.array(z.string().max(32768)).max(40);

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

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
  const dirs = await readFolders(file);
  const next = [folder, ...dirs.filter((d) => d.toLowerCase() !== folder.toLowerCase())];
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.partial`, JSON.stringify(next.slice(0, 20)));
  await rename(`${file}.partial`, file);
}

/**
 * Removes the `.edi-output-*` folders an interrupted export left beside its destination. A folder
 * holding backups of replaced files is a recovery to finish by hand, so it stays.
 */
export async function removeOrphanOutputs(file: string): Promise<number> {
  let removed = 0;
  for (const dir of await readFolders(file)) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const name of names) {
      if (!name.startsWith(".edi-output-")) continue;
      const folder = join(dir, name);
      if (!(await stat(folder)).isDirectory()) continue;
      let backups: string[] = [];
      try {
        backups = await readdir(join(folder, "backups"));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (backups.length) continue;
      await rm(folder, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
