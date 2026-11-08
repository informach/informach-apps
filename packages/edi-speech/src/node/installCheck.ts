import { readdir, rename, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Expected, verifyFile } from "./download.ts";

/**
 * Checks of what is installed against what the publisher lists, and the folder swaps of an
 * engine install. No Electron here, so it runs in tests.
 */

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Paths under `dir` with "/" separators, as the manifest lists them. */
const relativeName = (dir: string, file: string): string =>
  relative(dir, file).split("\\").join("/");

/**
 * The folder holds exactly the files of `manifest`, each with its size and SHA-256. A file the
 * manifest does not list (a DLL dropped next to the engine) fails the check too.
 */
export async function folderMatches(
  dir: string,
  manifest: Record<string, Expected>,
): Promise<boolean> {
  const seen = new Set<string>();
  for await (const file of walk(dir)) {
    const name = relativeName(dir, file);
    const expected = manifest[name];
    if (!expected || !(await verifyFile(file, expected))) return false;
    seen.add(name);
  }
  return Object.keys(manifest).every((name) => seen.has(name));
}

/**
 * Size and modification time of a file, or of every file of a folder: what a check is valid
 * for. Any change makes it different and the check runs again.
 */
export async function signature(path: string): Promise<string> {
  const st = await stat(path);
  if (!st.isDirectory()) return `${st.size}:${Math.round(st.mtimeMs)}`;
  const parts: string[] = [];
  for await (const file of walk(path)) {
    const f = await stat(file);
    parts.push(`${relativeName(path, file)}=${f.size}:${Math.round(f.mtimeMs)}`);
  }
  return parts.sort().join("|");
}

/** Windows keeps a file busy for a moment after it is closed (antivirus, indexing). */
const BUSY = new Set(["EPERM", "EBUSY", "EACCES"]);

/** `rename`, tried again a few times (with a growing pause) while Windows reports it busy. */
export async function renameWhenFree(from: string, to: string, attempts = 6): Promise<void> {
  for (let n = 1; ; n++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!BUSY.has(code) || n >= attempts) throw err;
      await delay(100 * 2 ** (n - 1));
    }
  }
}

/**
 * Puts `staging` in place of `target`: the working folder is first moved aside to `aside`, and
 * brought back if the new one cannot take its place. Returns whether there was an old folder
 * (left at `aside` for the caller to delete).
 */
export async function swapFolder(staging: string, target: string, aside: string): Promise<boolean> {
  let moved = false;
  try {
    await renameWhenFree(target, aside);
    moved = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  try {
    await renameWhenFree(staging, target);
  } catch (err) {
    if (moved) await renameWhenFree(aside, target);
    throw err;
  }
  return moved;
}
