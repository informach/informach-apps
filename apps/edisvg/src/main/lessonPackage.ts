import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  extractZipEntry,
  readZipEntry,
  type ZipDirectoryEntry,
  zipDirectory,
} from "@informach/edi-desktop/zip-read";
import { z } from "zod";
import { silentTracks, soundsAsVoice } from "./pipelineMedia.ts";

/**
 * The lesson of a pipeline run comes as EdiAula's package (Arquivo › Empacotar a aula): a ZIP with
 * the lesson (aula.ediaula, its paths pointing at media/<name>) and its media. Only what a run
 * uses is taken out: the voice that sounds and the screen recordings, with their cursor data and
 * transcripts when the package has them. The page's sound of a guided take (recording role
 * "system") stays in. The files go to a folder of this computer kept by the package's path, size
 * and date, so a second run of the same package does not unpack it again; the lesson written
 * there points at them with absolute paths, as a lesson opened in EdiAula does.
 */

export const PACKAGE_LESSON = "aula.ediaula";
/** A package has this many entries at most (a lesson with its media, cursors and takes). */
const MAX_ENTRIES = 20_000;
const LESSON_BYTES = 64 * 1024 ** 2;
/** Unpacked folders kept besides the one in use (the newest). */
const KEEP = 2;

/**
 * A media of the package, as the lesson names it: one file under media/, never a way out, with
 * no character Windows refuses in a name.
 */
const mediaName = (name: string): boolean =>
  /^media\/(?!\.)[^/\\:*?"<>|]{1,200}$/.test(name) && ![...name].some((c) => c.charCodeAt(0) < 32);

/** The lesson as far as the files of a run go; everything else in it is kept as it is. */
const lessonSchema = z.looseObject({
  assets: z.array(
    z.looseObject({
      id: z.string(),
      path: z.string(),
      cursor: z.string().optional(),
      transcript: z.string().optional(),
      hasAudio: z.boolean().optional(),
      recording: z.looseObject({ role: z.string().optional() }).optional(),
    }),
  ),
  clips: z.array(
    z.looseObject({
      assetId: z.string(),
      trackId: z.string(),
      mutedFor: z.unknown().optional(),
      volume: z.number().optional(),
    }),
  ),
  tracks: z
    .array(
      z.looseObject({
        id: z.string(),
        muted: z.boolean().optional(),
        music: z.unknown().optional(),
        clicks: z.unknown().optional(),
        sfx: z.unknown().optional(),
        name: z.string().optional(),
      }),
    )
    .optional(),
});
type PackagedLesson = z.infer<typeof lessonSchema>;

/**
 * The media a run uses: the voice that sounds (by the same rule the run hears it,
 * pipelineMedia.ts soundsAsVoice: not music, clicks, sound effects or a muted track, and never the
 * page's sound of a take) and the screen recordings with their cursor data.
 */
function usedByRun(lesson: PackagedLesson): Set<string> {
  const silent = silentTracks(lesson.tracks ?? []);
  const assets = new Map(lesson.assets.map((a) => [a.id, a]));
  const used = new Set<string>();
  for (const clip of lesson.clips) {
    const asset = assets.get(clip.assetId);
    if (!asset) continue;
    const screen = asset.recording?.role === "screen" || !!asset.cursor;
    if (screen || (asset.hasAudio === true && soundsAsVoice(clip, asset, silent)))
      used.add(asset.id);
  }
  return used;
}

const FIELDS = ["path", "cursor", "transcript"] as const;

/** The folder a package unpacks to: by its path, size and date (a changed file unpacks again). */
async function folderOf(zipPath: string, root: string): Promise<string> {
  const st = await stat(zipPath);
  const key = createHash("sha1")
    .update(`${zipPath}|${st.size}|${st.mtimeMs}`)
    .digest("hex")
    .slice(0, 16);
  return join(root, key);
}

/** Removes the oldest unpacked packages, keeping `keep` besides `current`. */
async function prune(root: string, current: string, keep: number): Promise<void> {
  const names = await readdir(root).catch(() => [] as string[]);
  const folders: { path: string; time: number }[] = [];
  for (const name of names) {
    const path = join(root, name);
    if (path === current) continue;
    const st = await stat(path).catch(() => null);
    if (st?.isDirectory()) folders.push({ path, time: st.mtimeMs });
  }
  folders.sort((a, b) => b.time - a.time);
  for (const old of folders.slice(keep)) await rm(old.path, { recursive: true, force: true });
}

/**
 * Unpacks the files a run uses from the package at `zipPath` into a folder under `root`, and
 * returns the path of the lesson written there. A package unpacked before is used as it is.
 */
export async function unpackLesson(
  zipPath: string,
  root: string,
  signal?: AbortSignal,
): Promise<string> {
  const folder = await folderOf(zipPath, root);
  const lessonPath = join(folder, PACKAGE_LESSON);
  // The lesson is written last: when it is there, every file it points at is too.
  if (existsSync(lessonPath)) {
    const now = new Date();
    await utimes(folder, now, now).catch(() => undefined);
    return lessonPath;
  }
  let entries: ZipDirectoryEntry[];
  try {
    entries = await zipDirectory(zipPath, MAX_ENTRIES);
  } catch (error) {
    if (error instanceof Error && /arquivos/.test(error.message)) throw error;
    throw new Error(
      "O arquivo escolhido não é um pacote de aula do EdiAula (.zip) que dê para ler.",
    );
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const lessonEntry = byName.get(PACKAGE_LESSON);
  if (!lessonEntry)
    throw new Error(
      "O ZIP não é um pacote de aula do EdiAula: falta a aula (aula.ediaula). No EdiAula, use Arquivo › Empacotar a aula.",
    );
  if (lessonEntry.size > LESSON_BYTES) throw new Error("A aula do pacote é grande demais.");
  await rm(folder, { recursive: true, force: true });
  try {
    return await unpackInto(zipPath, folder, root, lessonEntry, byName, signal);
  } catch (error) {
    // Stopped or failed half way: nothing half unpacked stays on the disk.
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}

async function unpackInto(
  zipPath: string,
  folder: string,
  root: string,
  lessonEntry: ZipDirectoryEntry,
  byName: ReadonlyMap<string, ZipDirectoryEntry>,
  signal: AbortSignal | undefined,
): Promise<string> {
  const lessonPath = join(folder, PACKAGE_LESSON);
  await mkdir(join(folder, "media"), { recursive: true });
  const rawPath = join(folder, `${PACKAGE_LESSON}.pacote`);
  await extractZipEntry(zipPath, lessonEntry, rawPath, signal);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(rawPath, "utf8"));
  } catch {
    raw = null;
  }
  await rm(rawPath, { force: true });
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error("A aula do pacote não é uma aula do EdiAula que dê para ler.");
  const lesson = parsed.data;
  const used = usedByRun(lesson);
  const taken = new Map<string, string>();
  for (const asset of lesson.assets) {
    if (!used.has(asset.id)) continue;
    for (const field of FIELDS) {
      const name = asset[field];
      if (name === undefined) continue;
      if (!mediaName(name)) continue;
      const entry = byName.get(name);
      // A media the lesson names that the package does not bring: its place in this folder,
      // which is not there, so the run says which voice is missing (a relative path is never
      // read as a file of this computer). A name that is not one of its media stays as it was.
      if (!entry) {
        asset[field] = join(folder, ...name.split("/"));
        continue;
      }
      let out = taken.get(name);
      if (!out) {
        signal?.throwIfAborted();
        out = join(folder, ...name.split("/"));
        await extractZipEntry(zipPath, entry, out, signal);
        taken.set(name, out);
      }
      asset[field] = out;
    }
  }
  await atomicWrite(lessonPath, JSON.stringify(lesson));
  await prune(root, folder, KEEP);
  return lessonPath;
}

/** A script longer than this is not a lesson's (EdiAula's own limit is far below). */
const SCRIPT_CHARS = 2_000_000;
const scriptSchema = z.looseObject({
  id: z.string().optional(),
  script: z
    .looseObject({
      text: z.string().max(SCRIPT_CHARS),
      section: z.int().nonnegative().optional(),
    })
    .optional(),
});

/** What a run needs to know of the lesson in a package before it starts. */
export interface PackageLesson {
  /** The lesson's id in EdiAula (null when it has none a run can record). */
  id: string | null;
  /** Its script (the Markdown EdiAula keeps) and the section of it this lesson is, if any. */
  script: { text: string; section: number } | null;
}

/**
 * The lesson in the package at `zipPath`, read without unpacking anything: a run offers its
 * script's phrases before it starts, and records which lesson its animation is a stretch of.
 */
export async function packageLesson(zipPath: string): Promise<PackageLesson> {
  let entries: ZipDirectoryEntry[];
  try {
    entries = await zipDirectory(zipPath, MAX_ENTRIES);
  } catch {
    throw new Error(
      "O arquivo escolhido não é um pacote de aula do EdiAula (.zip) que dê para ler.",
    );
  }
  const entry = entries.find((e) => e.name === PACKAGE_LESSON);
  if (!entry)
    throw new Error(
      "O ZIP não é um pacote de aula do EdiAula: falta a aula (aula.ediaula). No EdiAula, use Arquivo › Empacotar a aula.",
    );
  if (entry.size > LESSON_BYTES) throw new Error("A aula do pacote é grande demais.");
  let raw: unknown;
  try {
    raw = JSON.parse((await readZipEntry(zipPath, entry)).toString("utf8"));
  } catch {
    raw = null;
  }
  const parsed = scriptSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error("A aula do pacote não é uma aula do EdiAula que dê para ler.");
  const { id, script } = parsed.data;
  return {
    id: id && /^[\w-]{1,100}$/.test(id) ? id : null,
    script: script?.text.trim() ? { text: script.text, section: script.section ?? 0 } : null,
  };
}
