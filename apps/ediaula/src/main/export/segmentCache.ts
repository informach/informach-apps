import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, statfs } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { flush, intact, streamHeader, writeFlushed } from "./durable.ts";

/**
 * Rendered export segments and sounds, kept by the hash of what they show
 * (userData/cache/segments/<sha256>.<ext>). A file is written as `.part`, flushed to the disk and
 * renamed when it is complete, so a crash never leaves a broken entry; the index remembers each
 * one's size, and a file whose size changed, or one the index does not know that is not whole
 * (durable.ts), is dropped. The index also remembers when each one was last used: past the limit
 * the oldest go first, when the app starts and after each export.
 */

/** At most 15 GB, and never more than a quarter of the space the disk leaves the cache. */
export const CACHE_LIMIT = 15 * 1024 ** 3;
const SHARE_OF_FREE_SPACE = 0.25;

/** Bytes free on the disk of `dir`. */
export async function freeSpace(dir: string): Promise<number> {
  const s = await statfs(dir);
  return s.bavail * s.bsize;
}

const entrySchema = z.object({
  size: z.number().nonnegative(),
  used: z.number(),
  /** Hash of a segment's H.264 parameter sets (durable.ts), once it has been read. */
  stream: z.string().optional(),
});
type Entry = z.infer<typeof entrySchema>;
const indexSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), entrySchema),
});

const NAME = /^[0-9a-f]{64}\.(mp4|wav|json)$/;

export class SegmentCache {
  private entries = new Map<string, Entry>();
  private loaded: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  /** Entries some export is reading right now: never pruned under it. */
  private readonly pinned = new Map<string, number>();

  readonly dir: string;
  private readonly limit: number;
  private readonly now: () => number;
  private readonly space: (dir: string) => Promise<number>;

  constructor(
    dir: string,
    limit = CACHE_LIMIT,
    now: () => number = Date.now,
    space: (dir: string) => Promise<number> = freeSpace,
  ) {
    this.dir = dir;
    this.limit = limit;
    this.now = now;
    this.space = space;
  }

  private get indexFile(): string {
    return join(this.dir, "index.json");
  }

  /**
   * Reads the index, keeping only entries whose file is there with the size it had, and adopting
   * files it does not know when they are whole.
   */
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
        if (name.includes(".part.") || name.endsWith(".partial")) {
          await rm(path, { force: true });
          continue;
        }
        if (!NAME.test(name)) continue;
        const info = await stat(path);
        const known = saved[name];
        const whole = known
          ? known.size === info.size
          : await intact(path, name.slice(name.lastIndexOf(".") + 1));
        if (!whole) {
          await rm(path, { force: true });
          continue;
        }
        this.entries.set(name, { ...known, size: info.size, used: known?.used ?? info.mtimeMs });
      }
      await this.save();
    })();
    return this.loaded;
  }

  private save(): Promise<void> {
    const snapshot = JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) });
    this.writing = this.writing.then(async () => {
      const partial = `${this.indexFile}.${randomUUID()}.partial`;
      await writeFlushed(partial, snapshot);
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

  /**
   * The cached file of `key`, marked as just used and pinned until `release`, or null (also when
   * the file is gone or its size is not the one it was saved with).
   */
  async get(key: string, ext: string): Promise<string | null> {
    await this.load();
    const name = `${key}.${ext}`;
    const entry = this.entries.get(name);
    if (!entry) return null;
    let size: number | null = null;
    try {
      size = (await stat(this.path(key, ext))).size;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (size !== entry.size) {
      if (size !== null && !this.pinned.has(name)) await rm(this.path(key, ext), { force: true });
      this.entries.delete(name);
      await this.save();
      return null;
    }
    entry.used = this.now();
    this.pin(name);
    await this.save();
    return this.path(key, ext);
  }

  /** The rendered `.part` file, flushed to the disk, becomes the entry. */
  async commit(key: string, ext: string): Promise<string> {
    await this.load();
    const path = this.path(key, ext);
    await flush(this.partPath(key, ext));
    await rename(this.partPath(key, ext), path);
    const info = await stat(path);
    const name = `${key}.${ext}`;
    const stream = ext === "mp4" ? await streamHeader(path) : undefined;
    this.entries.set(name, { size: info.size, used: this.now(), ...(stream ? { stream } : {}) });
    this.pin(name);
    await this.save();
    return path;
  }

  /**
   * The hash of a cached segment's H.264 parameter sets: segments joined by copying must share
   * it. Read from the file the first time (an entry from before it was kept), then remembered.
   */
  async header(path: string): Promise<string | undefined> {
    await this.load();
    const name = basename(path);
    const entry = this.entries.get(name);
    if (!entry || !name.endsWith(".mp4")) return undefined;
    if (entry.stream) return entry.stream;
    const stream = await streamHeader(path);
    if (stream) {
      entry.stream = stream;
      await this.save();
    }
    return stream;
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

  /**
   * Removes the least recently used entries until the cache fits its limit: 15 GB, or a quarter
   * of the space it could have (what is free on the disk plus what it holds), if less. Bytes freed.
   */
  async prune(): Promise<number> {
    await this.load();
    let total = this.size;
    const room = SHARE_OF_FREE_SPACE * ((await this.space(this.dir)) + total);
    const limit = Math.min(this.limit, room);
    let freed = 0;
    const oldest = [...this.entries.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [name, entry] of oldest) {
      if (total <= limit) break;
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
