import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

/** Write beside the destination, flush, then replace it without truncating the original. */
export async function atomicWrite(path: string, bytes: Uint8Array | string): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temp, "wx");
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

/** Exclusive creation prevents concurrent exports from overwriting one another. */
export async function writeUnique(path: string, bytes: Uint8Array): Promise<string> {
  const ext = extname(path);
  const stem = join(dirname(path), basename(path, ext));
  for (let n = 1; ; n++) {
    const target = n === 1 ? path : `${stem} (${n})${ext}`;
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(target, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (err) {
      await handle.close();
      await unlink(target).catch(() => undefined);
      throw err;
    }
    await handle.close();
    return target;
  }
}
