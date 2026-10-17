import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/** Missing media to look for: file name and size in bytes (0 = unknown), keyed by asset id. */
export const relinkRequestSchema = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(200),
      name: z.string().min(1).max(255),
      size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  )
  .max(5000);

export type RelinkRequest = z.infer<typeof relinkRequestSchema>;

/** Recordings live in dated subfolders (Gravações/<data>/tela.mp4): look a few levels down. */
const MAX_DEPTH = 3;
const MAX_ENTRIES = 50_000;

/**
 * Finds each wanted file inside `folder` by name (ignoring case, as Windows does) and size, so
 * the many "tela.mp4" of different recordings are told apart. Returns asset id → path.
 */
export async function findRelinked(
  folder: string,
  wanted: RelinkRequest,
): Promise<Record<string, string>> {
  const byName = new Map<string, RelinkRequest>();
  for (const w of wanted) {
    const name = w.name.toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), w]);
  }
  const found: Record<string, string> = {};
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
        if (++visited > MAX_ENTRIES || left === 0) return found;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) next.push(path);
          continue;
        }
        const candidates = entry.isFile() ? byName.get(entry.name.toLowerCase()) : undefined;
        if (!candidates?.some((w) => !found[w.key])) continue;
        const { size } = await stat(path);
        const match = candidates.find((w) => !found[w.key] && (w.size === 0 || w.size === size));
        if (match) {
          found[match.key] = path;
          left--;
        }
      }
    }
    level = next;
  }
  return found;
}
