import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createInflateRaw } from "node:zlib";

/**
 * Reading a ZIP without unpacking all of it: the central directory (ZIP64 included) with every
 * name, size and kind of entry, then one entry at a time copied to a file. EdiAula checks a
 * packed lesson with it before tar.exe sees the archive; EdiSVG takes from that package only the
 * files a pipeline uses. Stored and deflated entries are read; the size and the CRC of what comes
 * out must be the ones the directory says.
 */

/** One entry of an archive's central directory, as readZipDirectory finds it. */
export interface ZipDirectoryEntry {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
  /** CRC-32 of the entry's bytes, as the directory says. */
  crc: number;
  /** The upper byte of "version made by" (3 = Unix) and the external attributes. */
  system: number;
  attributes: number;
  /** The name was not marked UTF-8 (bit 11): it may be in a code page. */
  utf8: boolean;
}

/** Reads `length` bytes at `position` of an archive (a file, or bytes in a test). */
export type ZipReader = (position: number, length: number) => Promise<Buffer>;

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const UTF8 = 0x0800;
const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** End record (22) plus the longest comment (65535). */
const TAIL = 22 + 0xffff;

const notZip = (): Error => new Error("Este arquivo não é um ZIP válido.");

const u64 = (b: Buffer, at: number): number => {
  const v = b.readBigUInt64LE(at);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Pacote com tamanho inválido.");
  return Number(v);
};

/**
 * The central directory of a ZIP of `size` bytes, ZIP64 included, without extracting anything.
 * `limit` entries at most.
 */
export async function readZipDirectory(
  read: ZipReader,
  size: number,
  limit: number,
): Promise<ZipDirectoryEntry[]> {
  const bad = notZip;
  const tailAt = Math.max(0, size - TAIL);
  const tail = await read(tailAt, size - tailAt);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (tail.readUInt32LE(i) === EOCD && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      end = i;
      break;
    }
  if (end < 0) throw bad();
  let count = tail.readUInt16LE(end + 10);
  let cdSize = tail.readUInt32LE(end + 12);
  let cdOffset = tail.readUInt32LE(end + 16);
  if (count === MAX16 || cdSize === MAX32 || cdOffset === MAX32) {
    const locatorAt = tailAt + end - 20;
    if (locatorAt < 0) throw bad();
    const locator = await read(locatorAt, 20);
    if (locator.readUInt32LE(0) !== LOCATOR64) throw bad();
    const recordAt = u64(locator, 8);
    if (recordAt + 56 > size) throw bad();
    const record = await read(recordAt, 56);
    if (record.readUInt32LE(0) !== EOCD64) throw bad();
    count = u64(record, 32);
    cdSize = u64(record, 40);
    cdOffset = u64(record, 48);
  }
  if (count > limit) throw new Error(`O pacote tem ${count} arquivos, mais do que uma aula leva.`);
  if (cdOffset + cdSize > size || cdSize > 64 * 1024 * 1024) throw bad();
  const cd = await read(cdOffset, cdSize);
  const out: ZipDirectoryEntry[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > cd.length || cd.readUInt32LE(at) !== CENTRAL) throw bad();
    const nameLength = cd.readUInt16LE(at + 28);
    const extraLength = cd.readUInt16LE(at + 30);
    const commentLength = cd.readUInt16LE(at + 32);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > cd.length) throw bad();
    let compressedSize = cd.readUInt32LE(at + 20);
    let entrySize = cd.readUInt32LE(at + 24);
    let offset = cd.readUInt32LE(at + 42);
    // The ZIP64 extra field holds, in this order, only the values whose classic field is full.
    const extra = cd.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);
    for (let e = 0; e + 4 <= extra.length; ) {
      const id = extra.readUInt16LE(e);
      const length = extra.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let v = e + 4;
        const take = (): number => {
          if (v + 8 > e + 4 + length) throw bad();
          const value = u64(extra, v);
          v += 8;
          return value;
        };
        if (entrySize === MAX32) entrySize = take();
        if (compressedSize === MAX32) compressedSize = take();
        if (offset === MAX32) offset = take();
      }
      e += 4 + length;
    }
    const flags = cd.readUInt16LE(at + 8);
    out.push({
      name: cd.subarray(at + 46, at + 46 + nameLength).toString("utf8"),
      method: cd.readUInt16LE(at + 10),
      compressedSize,
      size: entrySize,
      offset,
      crc: cd.readUInt32LE(at + 16),
      system: cd.readUInt16LE(at + 4) >> 8,
      attributes: cd.readUInt32LE(at + 38),
      utf8: (flags & UTF8) !== 0,
    });
    at = next;
  }
  return out;
}

/** readZipDirectory of a file on disk. */
export async function zipDirectory(path: string, limit: number): Promise<ZipDirectoryEntry[]> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    return await readZipDirectory(
      async (position, length) => {
        const b = Buffer.alloc(length);
        let off = 0;
        while (off < length) {
          const { bytesRead } = await file.read(b, off, length - off, position + off);
          if (!bytesRead) throw notZip();
          off += bytesRead;
        }
        return b;
      },
      size,
      limit,
    );
  } finally {
    await file.close();
  }
}

/**
 * Streams one entry of the ZIP at `zipPath` into the stream `sink` makes. Stored and deflated
 * entries only; an encrypted one is refused. The bytes that come out must have the directory's
 * size and CRC. The sink is made only once the entry can be read, so a refused entry never leaves
 * a file opened (or created) behind.
 */
async function copyZipEntry(
  zipPath: string,
  entry: ZipDirectoryEntry,
  sink: () => Writable,
  signal?: AbortSignal,
): Promise<void> {
  if (entry.method !== 0 && entry.method !== 8)
    throw new Error(`O arquivo ${entry.name} do pacote usa uma compressão que não dá para ler.`);
  const file = await open(zipPath, "r");
  let start: number;
  try {
    const head = Buffer.alloc(30);
    const { bytesRead } = await file.read(head, 0, 30, entry.offset);
    if (bytesRead < 30 || head.readUInt32LE(0) !== LOCAL) throw notZip();
    if (head.readUInt16LE(6) & 1)
      throw new Error(`O arquivo ${entry.name} do pacote está protegido por senha.`);
    start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    if (start + entry.compressedSize > (await file.stat()).size) throw notZip();
  } finally {
    await file.close();
  }
  const broken = () => new Error(`O arquivo ${entry.name} do pacote está danificado.`);
  let written = 0;
  let crc = 0;
  const check = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      written += chunk.length;
      // A deflated entry that grows past its size is a bomb or a lie: stopped, not written out.
      if (written > entry.size) return done(broken());
      crc = crc32(chunk, crc);
      done(null, chunk);
    },
  });
  const source = entry.compressedSize
    ? createReadStream(zipPath, { start, end: start + entry.compressedSize - 1 })
    : Readable.from([]);
  if (entry.method === 8) await pipeline(source, createInflateRaw(), check, sink(), { signal });
  else await pipeline(source, check, sink(), { signal });
  if (written !== entry.size || crc >>> 0 !== entry.crc >>> 0) throw broken();
}

/**
 * Copies one entry of the ZIP at `zipPath` to the file `out` (through `out.part`, renamed at the
 * end). The bytes that come out must have the directory's size and CRC, or nothing is left at
 * `out`.
 */
export async function extractZipEntry(
  zipPath: string,
  entry: ZipDirectoryEntry,
  out: string,
  signal?: AbortSignal,
): Promise<void> {
  const part = `${out}.part`;
  try {
    await copyZipEntry(zipPath, entry, () => createWriteStream(part), signal);
    await rename(part, out);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

/**
 * One entry of the ZIP at `zipPath` in memory, checked as extractZipEntry checks it. The caller
 * bounds `entry.size` first: nothing larger than the directory says is ever held.
 */
export async function readZipEntry(
  zipPath: string,
  entry: ZipDirectoryEntry,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await copyZipEntry(
    zipPath,
    entry,
    () =>
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          chunks.push(chunk);
          done();
        },
      }),
    signal,
  );
  return Buffer.concat(chunks, entry.size);
}
