import { readdir, rm, stat, utimes } from "node:fs/promises";
import { join } from "node:path";

/**
 * Caches that grow with every treated voice and every narration rendered (cache/voz and
 * cache/narracao): kept under a size, the least recently used files going first. A cache hit
 * touches its file, so "used" means used, not made. A file that goes is made again on demand
 * (the editor notices a treated voice gone missing and treats it again).
 */

/** Marks a cached file as just used. */
export async function touch(path: string): Promise<void> {
  const now = new Date();
  await utimes(path, now, now);
}

async function filesUnder(
  dir: string,
  depth = 2,
): Promise<{ path: string; size: number; at: number }[]> {
  const out: { path: string; size: number; at: number }[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return out;
    throw error;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory() && depth > 0) out.push(...(await filesUnder(path, depth - 1)));
    else if (e.isFile() && !e.name.includes(".partial")) {
      const st = await stat(path);
      out.push({ path, size: st.size, at: st.mtimeMs });
    }
  }
  return out;
}

/**
 * Removes the least recently used files under `dir` until it holds at most `maxBytes`; `keep`
 * is never removed (the file just made). Returns the files removed.
 */
export async function pruneCache(dir: string, maxBytes: number, keep?: string): Promise<string[]> {
  const files = (await filesUnder(dir)).sort((a, b) => a.at - b.at);
  let total = files.reduce((s, f) => s + f.size, 0);
  const removed: string[] = [];
  for (const f of files) {
    if (total <= maxBytes) break;
    if (keep && f.path.toLowerCase() === keep.toLowerCase()) continue;
    await rm(f.path, { force: true });
    total -= f.size;
    removed.push(f.path);
  }
  return removed;
}

/** Sizes the voice caches are kept under. */
export const VOICE_CACHE_BYTES = 6 * 1024 ** 3;
export const NARRATION_CACHE_BYTES = 3 * 1024 ** 3;
