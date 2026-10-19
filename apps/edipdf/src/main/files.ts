import { randomUUID } from "node:crypto";
import { open, realpath, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { renameExclusive } from "./native-rename.ts";

export async function assertCopyDestination(
  path: string,
  sources: readonly string[],
): Promise<void> {
  const normalize = (value: string): string =>
    process.platform === "win32" ? resolve(value).toLocaleLowerCase("en-US") : resolve(value);
  const identity = async (value: string) => {
    try {
      return { path: normalize(await realpath(value)), stat: await stat(value) };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  };
  const target = await identity(path);
  for (const source of sources) {
    if (normalize(path) === normalize(source))
      throw new Error("Escolha outro nome para preservar o arquivo original.");
    if (!target) continue;
    const origin = await identity(source);
    if (
      origin &&
      (target.path === origin.path ||
        (target.stat.ino !== 0 &&
          target.stat.ino === origin.stat.ino &&
          target.stat.dev === origin.stat.dev))
    )
      throw new Error("O destino aponta para um arquivo original. Escolha outro nome.");
  }
}

/** Write beside the destination, flush, then replace it without truncating the original. */
export async function atomicWrite(
  path: string,
  bytes: Uint8Array | string,
  beforeCommit?: () => Promise<void>,
): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temp, "wx");
  let committed = false;
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await beforeCommit?.();
    await rename(temp, path);
    committed = true;
  } finally {
    if (!committed)
      await unlink(temp).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      });
  }
}

/** Exclusive creation prevents concurrent exports from overwriting one another. */
export async function writeUnique(
  path: string,
  bytes: Uint8Array,
  options: {
    checkpoint?: () => Promise<void>;
    beforeCommit?: (target: string) => Promise<void>;
  } = {},
): Promise<string> {
  await options.checkpoint?.();
  path = resolve(path);
  const ext = extname(path);
  const stem = join(dirname(path), basename(path, ext));
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temp, "wx");
  let committed = false;
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let n = 1; n <= 10000; n++) {
      await options.checkpoint?.();
      const target = n === 1 ? path : `${stem} (${n})${ext}`;
      try {
        await stat(target);
        continue;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await options.beforeCommit?.(target);
      await options.checkpoint?.();
      if ((await renameExclusive(temp, target)) === "created") {
        committed = true;
        return target;
      }
    }
    throw new Error("Há cópias demais com o mesmo nome. Escolha outro nome ou outra pasta.");
  } finally {
    if (!committed)
      await unlink(temp).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      });
  }
}
