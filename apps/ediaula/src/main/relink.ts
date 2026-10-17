import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { z } from "zod";
import { relinkMismatch } from "../shared/relink.ts";
import type { ProbeResult } from "../shared/types.ts";

/** Media the editor imports; a folder search never looks at (or opens) anything else. */
export const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "mkv",
  "webm",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
  "png",
  "jpg",
  "jpeg",
  "webp",
];
const MEDIA = new Set(MEDIA_EXTENSIONS.map((e) => `.${e}`));
/** Files kept next to a media that follow it when it moves: the cursor data of a recording. */
const COMPANIONS = new Set([".json"]);

const path = z
  .string()
  .min(1)
  .max(32768)
  .refine((value) => !value.includes("\0"));
const companions = z.array(path).max(8);

/** A missing media picked again by the user: its old path and the files that followed it. */
export const relinkPickSchema = z.strictObject({ oldPath: path, companions });

/** Missing media to look for in a folder: name and size of the file and what it must be. */
export const relinkRequestSchema = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(200),
      name: z.string().min(1).max(255),
      size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      kind: z.enum(["video", "audio", "image"]),
      duration: z
        .number()
        .nonnegative()
        .max(7 * 86400),
      width: z.number().nonnegative().max(1e6),
      height: z.number().nonnegative().max(1e6),
      oldPath: path,
      companions,
    }),
  )
  .max(5000);

export type RelinkRequest = z.infer<typeof relinkRequestSchema>;

export interface Relinked {
  path: string;
  size: number;
  /** Old path of each companion file → where it is now. */
  companions: Record<string, string>;
}

const folderKey = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);

/**
 * The companions of a media (files of an allowed type that were in its folder) found under the
 * same name next to where the media is now: old path → new path.
 */
export async function findCompanions(
  oldPath: string,
  newPath: string,
  wanted: readonly string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const old of wanted) {
    if (
      folderKey(dirname(old)) !== folderKey(dirname(oldPath)) ||
      !COMPANIONS.has(extname(old).toLowerCase())
    )
      continue;
    const candidate = join(dirname(newPath), basename(old));
    try {
      if ((await stat(candidate)).isFile()) out[old] = candidate;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return out;
}

/** Recordings live in dated subfolders (Gravações/<data>/tela.mp4): look a few levels down. */
const MAX_DEPTH = 3;
const MAX_ENTRIES = 50_000;

/**
 * Finds each wanted media inside `folder` by name (ignoring case, as Windows does) and size, so
 * the many "tela.mp4" of different recordings are told apart, and keeps only files that probe
 * as the same media (shared/relink.ts). Nothing else in the folder is opened.
 */
export async function findRelinked(
  folder: string,
  wanted: RelinkRequest,
  probe: (path: string) => Promise<ProbeResult>,
): Promise<{ found: Record<string, Relinked>; refused: number; truncated: boolean }> {
  const byName = new Map<string, RelinkRequest>();
  for (const w of wanted) {
    const name = w.name.toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), w]);
  }
  const found: Record<string, Relinked> = {};
  let refused = 0;
  let left = wanted.length;
  let visited = 0;
  let level = [folder];
  for (let depth = 0; depth <= MAX_DEPTH && level.length && left > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (error) {
        // Folders the user cannot open are skipped; the search goes on in the others.
        if (
          error instanceof Error &&
          "code" in error &&
          ["EACCES", "EPERM"].includes(String(error.code))
        )
          continue;
        throw error;
      }
      for (const entry of entries) {
        if (left === 0) return { found, refused, truncated: false };
        if (++visited > MAX_ENTRIES) return { found, refused, truncated: true };
        const file = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) next.push(file);
          continue;
        }
        if (!entry.isFile() || !MEDIA.has(extname(entry.name).toLowerCase())) continue;
        const candidates = byName.get(entry.name.toLowerCase())?.filter((w) => !found[w.key]);
        if (!candidates?.length) continue;
        const { size } = await stat(file);
        const sameSize = candidates.filter((w) => w.size === size);
        if (!sameSize.length) continue;
        let info: ProbeResult;
        try {
          info = await probe(file);
        } catch (error) {
          // A file with the right name and size that does not even open as media is not it.
          console.warn("relink candidate is not readable media", error);
          refused++;
          continue;
        }
        const match = sameSize.find((w) => relinkMismatch(w, info) === null);
        if (!match) {
          refused++;
          continue;
        }
        found[match.key] = {
          path: file,
          size,
          companions: await findCompanions(match.oldPath, file, match.companions),
        };
        left--;
      }
    }
    level = next;
  }
  return { found, refused, truncated: false };
}
