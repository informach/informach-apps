import { mkdir, readdir, readFile, rm, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";

/**
 * The references of pipeline runs kept on this computer: the narration that plays with each
 * animation and the demonstration video under each artboard. They are never part of the project
 * (nor of its exports), so a file closed and opened again finds them here, by the project's id:
 * `pipeline-references/<project id>/narration-<animation>.*` and `video-<artboard>.*` in EdiSVG's
 * profile. A lesson may have several runs (a full-screen scene and a demonstration over the
 * screen, each on its stretch): each keeps its own, and a run again on the same animation or
 * artboard replaces it. The folders of the projects used least recently go first (KEEP stay).
 */

const PROJECT_ID = /^project-[\w-]{1,100}$/;
/** Projects whose references stay (the most recently saved or opened). */
const KEEP = 12;
/** References of each kind a project keeps (the most recently made). */
const PER_PROJECT = 24;
const BYTES = { narration: 500_000_000, video: 1_000_000_000 } as const;

const narrationSchema = z.strictObject({
  clipId: z.string().regex(/^animation-[\w-]{1,100}$/),
  name: z.string().max(200),
  duration: z.number().positive().max(36_000),
  lessonStart: z.number().min(0).max(360_000),
  lines: z
    .array(
      z.strictObject({
        text: z.string().max(10_000),
        start: z.number().min(0).max(36_000),
        end: z.number().min(0).max(36_000),
      }),
    )
    .max(5_000),
});
const videoSchema = z.strictObject({
  artboardId: z.string().regex(/^artboard-[\w-]{1,100}$/),
  offset: z.number().min(-3_600).max(36_000),
  duration: z.number().positive().max(36_000),
});
const SCHEMAS = { narration: narrationSchema, video: videoSchema } as const;
export type ReferenceKind = keyof typeof SCHEMAS;
export type NarrationReference = z.infer<typeof narrationSchema>;
export type VideoReference = z.infer<typeof videoSchema>;

export interface StoredReferences {
  narrations: (NarrationReference & { bytes: Uint8Array })[];
  videos: (VideoReference & { bytes: Uint8Array })[];
}

const folderOf = (root: string, projectId: unknown): string => {
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId))
    throw new Error("Projeto inválido.");
  return join(root, projectId);
};
const kindOf = (kind: unknown): ReferenceKind => {
  if (kind !== "narration" && kind !== "video") throw new Error("Referência inválida.");
  return kind;
};
/** The file name of a reference: its kind and the animation or artboard it goes with. */
const nameOf = (kind: ReferenceKind, meta: NarrationReference | VideoReference): string =>
  `${kind}-${"clipId" in meta ? meta.clipId : meta.artboardId}`;

/** Removes the references of the projects used least recently, keeping KEEP besides `current`. */
async function prune(root: string, current: string): Promise<void> {
  const folders: { path: string; time: number }[] = [];
  for (const name of await readdir(root).catch(() => [] as string[])) {
    const path = join(root, name);
    if (path === current) continue;
    const st = await stat(path).catch(() => null);
    if (st?.isDirectory()) folders.push({ path, time: st.mtimeMs });
  }
  folders.sort((a, b) => b.time - a.time);
  for (const old of folders.slice(KEEP - 1)) await rm(old.path, { recursive: true, force: true });
}

/** Removes the oldest references of a kind in a project folder, keeping PER_PROJECT. */
async function pruneKind(folder: string, kind: ReferenceKind): Promise<void> {
  const found: { name: string; time: number }[] = [];
  for (const name of await readdir(folder).catch(() => [] as string[])) {
    if (!name.startsWith(`${kind}`) || !name.endsWith(".json")) continue;
    const st = await stat(join(folder, name)).catch(() => null);
    if (st) found.push({ name: name.slice(0, -".json".length), time: st.mtimeMs });
  }
  found.sort((a, b) => b.time - a.time);
  for (const old of found.slice(PER_PROJECT)) {
    await rm(join(folder, `${old.name}.json`), { force: true });
    await rm(join(folder, `${old.name}.bin`), { force: true });
  }
}

/**
 * Keeps the reference of one animation (narration) or artboard (video) of a project, replacing
 * the one it had. The description goes last: a reference whose description is there has all its
 * bytes.
 */
export async function saveReference(
  root: string,
  projectId: unknown,
  kind: unknown,
  bytes: unknown,
  meta: unknown,
): Promise<void> {
  const folder = folderOf(root, projectId);
  const which = kindOf(kind);
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > BYTES[which])
    throw new Error("Referência vazia ou grande demais.");
  const value = SCHEMAS[which].parse(meta);
  const name = nameOf(which, value);
  await mkdir(folder, { recursive: true });
  await rm(join(folder, `${name}.json`), { force: true });
  await atomicWrite(join(folder, `${name}.bin`), bytes);
  await atomicWrite(
    join(folder, `${name}.json`),
    JSON.stringify({ ...value, byteLength: bytes.length }),
  );
  await pruneKind(folder, which);
  await prune(root, folder);
}

async function loadOne<K extends ReferenceKind>(
  folder: string,
  kind: K,
  name: string,
): Promise<(z.infer<(typeof SCHEMAS)[K]> & { bytes: Uint8Array }) | null> {
  try {
    const raw = JSON.parse(await readFile(join(folder, `${name}.json`), "utf8")) as Record<
      string,
      unknown
    >;
    const { byteLength, ...rest } = raw;
    const meta = SCHEMAS[kind].parse(rest) as z.infer<(typeof SCHEMAS)[K]>;
    const data = await readFile(join(folder, `${name}.bin`));
    if (data.length !== byteLength) return null;
    return { ...meta, bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch {
    // Left half written, or not a reference: the file opens without it.
    return null;
  }
}

/**
 * The references kept for a project (none when it never ran a pipeline here). The single
 * narration.* and video.* an earlier EdiSVG kept are read as one of each.
 */
export async function loadReferences(root: string, projectId: unknown): Promise<StoredReferences> {
  const folder = folderOf(root, projectId);
  const out: StoredReferences = { narrations: [], videos: [] };
  const names = (await readdir(folder).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    // The earlier single ones last: one made since for the same animation or artboard wins.
    .sort((a, b) => Number(!a.includes("-")) - Number(!b.includes("-")) || a.localeCompare(b));
  for (const name of names) {
    if (name === "narration" || name.startsWith("narration-")) {
      const found = await loadOne(folder, "narration", name);
      if (found && !out.narrations.some((n) => n.clipId === found.clipId))
        out.narrations.push(found);
    } else if (name === "video" || name.startsWith("video-")) {
      const found = await loadOne(folder, "video", name);
      if (found && !out.videos.some((v) => v.artboardId === found.artboardId))
        out.videos.push(found);
    }
  }
  if (out.narrations.length || out.videos.length) {
    const now = new Date();
    await utimes(folder, now, now).catch(() => undefined);
  }
  return out;
}
