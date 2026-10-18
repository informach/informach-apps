import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * Rendered export segments and sounds, kept by the hash of what they show
 * (userData/cache/segments/<sha256>.<ext>). A file is written as `.part` and renamed when it is
 * complete, so a crash never leaves a broken entry. The index remembers when each one was last
 * used; past the size limit the oldest go first, when the app starts and after each export.
 */

export const CACHE_LIMIT = 15 * 1024 ** 3;

const indexSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.object({ size: z.number().nonnegative(), used: z.number() })),
});

const NAME = /^[0-9a-f]{64}\.(mp4|wav|json)$/;

export class SegmentCache {
  private entries = new Map<string, { size: number; used: number }>();
  private loaded: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  /** Entries some export is reading right now: never pruned under it. */
  private readonly pinned = new Map<string, number>();

  readonly dir: string;
  private readonly limit: number;
  private readonly now: () => number;

  constructor(dir: string, limit = CACHE_LIMIT, now: () => number = Date.now) {
    this.dir = dir;
    this.limit = limit;
    this.now = now;
  }

  private get indexFile(): string {
    return join(this.dir, "index.json");
  }

  /** Reads the index, keeping only entries whose file is there, and adopting complete files. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      await mkdir(this.dir, { recursive: true });
      let saved: z.infer<typeof indexSchema>["entries"] = {};
      try {
        const parsed = indexSchema.safeParse(JSON.parse(await readFile(this.indexFile, "utf8")));
        if (parsed.success) saved = parsed.data.entries;
      } catch (error) {
        // A missing or damaged index is rebuilt from the files themselves.
        if (!(error instanceof SyntaxError || isMissing(error))) throw error;
      }
      for (const name of await readdir(this.dir)) {
        const path = join(this.dir, name);
        if (name.includes(".part.")) {
          await rm(path, { force: true });
          continue;
        }
        if (!NAME.test(name)) continue;
        const info = await stat(path);
        this.entries.set(name, { size: info.size, used: saved[name]?.used ?? info.mtimeMs });
      }
      await this.save();
    })();
    return this.loaded;
  }

  private save(): Promise<void> {
    const snapshot = JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) });
    this.writing = this.writing.then(async () => {
      const partial = `${this.indexFile}.partial`;
      await writeFile(partial, snapshot);
      await rename(partial, this.indexFile);
    });
    return this.writing;
  }

  /** Where the entry `key` lives (whether or not it exists). */
  path(key: string, ext: string): string {
    return join(this.dir, `${key}.${ext}`);
  }

  /** The temporary file to render `key` into before `commit`. */
  partPath(key: string, ext: string): string {
    return join(this.dir, `${key}.part.${ext}`);
  }

  /** The cached file of `key`, marked as just used and pinned until `release`, or null. */
  async get(key: string, ext: string): Promise<string | null> {
    await this.load();
    const name = `${key}.${ext}`;
    const entry = this.entries.get(name);
    if (!entry) return null;
    try {
      await stat(this.path(key, ext));
    } catch (error) {
      if (!isMissing(error)) throw error;
      this.entries.delete(name);
      await this.save();
      return null;
    }
    entry.used = this.now();
    this.pin(name);
    await this.save();
    return this.path(key, ext);
  }

  /** The rendered `.part` file becomes the entry. */
  async commit(key: string, ext: string): Promise<string> {
    await this.load();
    const path = this.path(key, ext);
    await rename(this.partPath(key, ext), path);
    const info = await stat(path);
    const name = `${key}.${ext}`;
    this.entries.set(name, { size: info.size, used: this.now() });
    this.pin(name);
    await this.save();
    return path;
  }

  private pin(name: string): void {
    this.pinned.set(name, (this.pinned.get(name) ?? 0) + 1);
  }

  /** The export that read these entries is over: they may be pruned again. */
  release(paths: readonly string[]): void {
    for (const path of paths) {
      const name = path.slice(this.dir.length + 1);
      const count = (this.pinned.get(name) ?? 0) - 1;
      if (count > 0) this.pinned.set(name, count);
      else this.pinned.delete(name);
    }
  }

  get size(): number {
    let total = 0;
    for (const e of this.entries.values()) total += e.size;
    return total;
  }

  /** Removes the least recently used entries until the cache fits its limit; bytes freed. */
  async prune(): Promise<number> {
    await this.load();
    let total = this.size;
    let freed = 0;
    const oldest = [...this.entries.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [name, entry] of oldest) {
      if (total <= this.limit) break;
      if (this.pinned.has(name)) continue;
      await rm(join(this.dir, name), { force: true });
      this.entries.delete(name);
      total -= entry.size;
      freed += entry.size;
    }
    if (freed) await this.save();
    return freed;
  }

  /** Removes every entry no export is reading (Configurações › Limpar cache de exportação). */
  async clear(): Promise<number> {
    await this.load();
    let freed = 0;
    for (const [name, entry] of [...this.entries.entries()]) {
      if (this.pinned.has(name)) continue;
      await rm(join(this.dir, name), { force: true });
      this.entries.delete(name);
      freed += entry.size;
    }
    await this.save();
    return freed;
  }
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
