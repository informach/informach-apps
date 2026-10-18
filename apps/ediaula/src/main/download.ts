import { createHash, type Hash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream, type Stats } from "node:fs";
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/** What the publisher says the file is. */
export interface Expected {
  /** Lowercase hex SHA-256. */
  sha256: string;
  size: number;
}

/** Written next to an unfinished download, so a later attempt can ask for the rest. */
interface PartInfo {
  url: string;
  etag: string | null;
  size: number;
}

/** An unfinished download older than this is not worth resuming. */
export const PART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The bytes received are not the file the publisher lists: nothing is kept. */
export class IntegrityError extends Error {}

const partPath = (dest: string): string => `${dest}.part`;
const infoPath = (dest: string): string => `${dest}.part.json`;

async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** The resume record, or null when it is missing or unreadable (the download starts over). */
async function readInfo(path: string): Promise<PartInfo | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const info = JSON.parse(text) as Partial<PartInfo>;
    if (typeof info.url !== "string" || typeof info.size !== "number") return null;
    return {
      url: info.url,
      size: info.size,
      etag: typeof info.etag === "string" ? info.etag : null,
    };
  } catch {
    // A record cut short by a crash: the bytes it described cannot be trusted to resume.
    return null;
  }
}

async function discard(dest: string): Promise<void> {
  await rm(partPath(dest), { force: true });
  await rm(infoPath(dest), { force: true });
}

/** Feeds a file into `hash`; returns how many bytes it had. */
async function hashFile(path: string, hash: Hash): Promise<number> {
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return bytes;
}

/** "bytes 100-199/1000" → start and total. */
function contentRange(res: Response): { start: number; total: number } | null {
  const m = /^bytes (\d+)-\d+\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
  return m ? { start: Number(m[1]), total: Number(m[2]) } : null;
}

const cancelBody = async (res: Response): Promise<void> => {
  await res.body?.cancel();
};

/**
 * Downloads `url` to `dest`, hashing while it streams, and only renames it into place when the
 * size and SHA-256 match `expected`; a mismatch deletes the `.part`. An interrupted download
 * keeps its `.part` and a `.part.json` (url, ETag, size): the next attempt rehashes the bytes
 * already on disk and asks for the rest with `Range` + `If-Range`. A server that ignores the
 * range (or a file that changed) starts it over from zero.
 */
export async function downloadVerified(
  url: string,
  dest: string,
  expected: Expected,
  signal: AbortSignal,
  onProgress: (ratio: number) => void = () => undefined,
): Promise<void> {
  const part = partPath(dest);
  const infoFile = infoPath(dest);
  let hash = createHash("sha256");
  let have = 0;

  const info = await readInfo(infoFile);
  const partStat = await statOrNull(part);
  const resumable =
    info !== null &&
    partStat !== null &&
    info.etag !== null &&
    info.url === url &&
    info.size === expected.size &&
    partStat.size > 0 &&
    partStat.size <= expected.size &&
    Date.now() - partStat.mtimeMs < PART_MAX_AGE_MS;
  if (resumable) {
    have = await hashFile(part, hash);
    onProgress(have / expected.size);
  } else await discard(dest);

  let res: Response | null = null;
  if (have > 0 && info?.etag) {
    const ranged = await fetch(url, {
      signal,
      redirect: "follow",
      headers: { Range: `bytes=${have}-`, "If-Range": info.etag },
    });
    const range = ranged.status === 206 ? contentRange(ranged) : null;
    if (range && range.start === have && range.total === expected.size) res = ranged;
    else if (ranged.status === 416 && have === expected.size) {
      // Everything was already here; only the check and the rename were missing.
      await cancelBody(ranged);
      res = null;
    } else if (ranged.status === 200) {
      // The server ignored the range (or the file changed): this response is the whole file.
      hash = createHash("sha256");
      have = 0;
      res = ranged;
    } else {
      await cancelBody(ranged);
      hash = createHash("sha256");
      have = 0;
    }
  }
  if (!res && have === 0) res = await fetch(url, { signal, redirect: "follow" });

  if (res) {
    if (!res.ok || !res.body) {
      await cancelBody(res);
      throw new Error(`Falha no download (${res.status}) de ${url}`);
    }
    const append = res.status === 206;
    // A compressed response announces the compressed length; the hash check still covers it.
    const length = res.headers.has("content-encoding")
      ? Number.NaN
      : Number(res.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(length) && length !== expected.size - have) {
      await cancelBody(res);
      await discard(dest);
      throw new IntegrityError(`O servidor anunciou um tamanho diferente do esperado para ${url}.`);
    }
    if (!append) await discard(dest);
    await writeFile(
      infoFile,
      JSON.stringify({
        url,
        etag: res.headers.get("etag"),
        size: expected.size,
      } satisfies PartInfo),
    );
    // Written chunk by chunk and always closed cleanly: when the connection drops, every byte
    // received (and hashed) is on disk for the next attempt.
    const out = createWriteStream(part, { flags: append ? "a" : "w" });
    let failure: unknown = null;
    out.on("error", (err) => {
      failure ??= err;
    });
    // File streams close after an error too, so this always settles.
    const closed = new Promise<void>((resolve) => out.once("close", () => resolve()));
    try {
      for await (const value of Readable.fromWeb(res.body as WebReadableStream<Uint8Array>)) {
        if (failure) break;
        const chunk: Uint8Array = value;
        if (have + chunk.length > expected.size)
          throw new IntegrityError(`O download de ${url} passou do tamanho esperado.`);
        have += chunk.length;
        hash.update(chunk);
        if (!out.write(chunk)) await once(out, "drain");
        onProgress(have / expected.size);
      }
    } catch (err) {
      failure ??= err;
    }
    out.end();
    await closed;
    if (failure) {
      if (failure instanceof IntegrityError) await discard(dest);
      throw failure;
    }
  }

  if (have < expected.size)
    throw new Error(`O download de ${url} parou antes do fim. Tente de novo para continuar.`);
  if (hash.digest("hex") !== expected.sha256.toLowerCase()) {
    await discard(dest);
    throw new IntegrityError(
      `O arquivo baixado de ${url} não confere com o publicado (SHA-256). Nada foi instalado.`,
    );
  }
  await rename(part, dest);
  await rm(infoFile, { force: true });
  onProgress(1);
}

/** Deletes unfinished downloads (and their records) left in `dirs` for longer than `maxAge`. */
export async function removeStaleParts(
  dirs: string[],
  maxAge = PART_MAX_AGE_MS,
  now = Date.now(),
): Promise<string[]> {
  const removed: string[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of names) {
      if (!name.endsWith(".part")) continue;
      const file = join(dir, name);
      const st = await statOrNull(file);
      if (!st || now - st.mtimeMs <= maxAge) continue;
      await rm(file, { force: true });
      await rm(`${file}.json`, { force: true });
      removed.push(file);
    }
  }
  return removed;
}
