import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { FontFamily } from "../../shared/fonts.ts";

/**
 * The font files burned captions are drawn with, part of each segment's signature: a font that
 * changed (an update of the bundle, a font installed or replaced in Windows) renders its
 * segments anew. A bundled family gives its own files; any other family is what libass finds in
 * the system's font folders, by its file names (Segoe UI: segoeui.ttf, segoeuib.ttf…).
 */

export interface FontSources {
  /** The app's fonts (resources/fonts.json) and their folder. */
  bundled: () => Promise<{ dir: string; families: readonly FontFamily[] }>;
  /** Windows' font folders (the machine's and the user's). */
  system: readonly string[];
}

const FONT_FILE = /\.(?:ttf|ttc|otf)$/i;
const squash = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function fontResolver(
  sources: FontSources,
): (families: readonly string[]) => Promise<string[]> {
  let listing: Promise<string[]> | null = null;
  /** Every font file of the system folders, read once (a missing folder has none). */
  const systemFiles = (): Promise<string[]> => {
    listing ??= (async () => {
      const files: string[] = [];
      for (const dir of sources.system) {
        try {
          for (const name of await readdir(dir))
            if (FONT_FILE.test(name)) files.push(join(dir, name));
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
      return files;
    })();
    return listing;
  };
  let own: ReturnType<FontSources["bundled"]> | null = null;
  return async (families) => {
    if (!families.length) return [];
    own ??= sources.bundled();
    const { dir, families: bundled } = await own;
    const out = new Set<string>();
    for (const family of families) {
      const shipped = bundled.find((f) => f.family.toLowerCase() === family.toLowerCase());
      if (shipped) {
        for (const item of shipped.files) out.add(join(dir, item.file));
        continue;
      }
      const key = squash(family);
      if (!key) continue;
      for (const path of await systemFiles())
        if (squash(basename(path, extname(path))).startsWith(key)) out.add(path);
    }
    return [...out].sort();
  };
}
