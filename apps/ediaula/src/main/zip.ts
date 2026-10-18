import { createReadStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";
import { crc32 } from "node:zlib";

/**
 * A ZIP writer for the packed lesson: every entry stored without compression (the media are
 * compressed already, and storing keeps packing a 2 GB lesson about as fast as copying it), in
 * ZIP64 whenever a size, an offset or the number of entries does not fit the classic fields.
 * The CRC is computed while the file streams through (zlib.crc32) and written back into its
 * local header afterwards, so each media is read once. Windows reads the result with tar.exe
 * (bsdtar) and with the Explorer.
 */

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  /** A file on disk to store, or the bytes themselves. */
  path?: string;
  data?: Uint8Array;
  mtime?: Date;
}

export interface ZipOptions {
  /** "always" writes the ZIP64 fields in every header, even when they are not needed (tests). */
  zip64?: "auto" | "always";
  signal?: AbortSignal;
  /** Bytes stored so far, of all of them. */
  onProgress?: (done: number, total: number) => void;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const UTF8 = 0x0800;

/** MS-DOS time and date of a moment (local time, 2-second steps, from 1980). */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Written {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  zip64: boolean;
}

/** The ZIP64 extra field with the given 64-bit values (header id 1). */
function zip64Extra(values: number[]): Buffer {
  const b = Buffer.alloc(4 + values.length * 8);
  b.writeUInt16LE(0x0001, 0);
  b.writeUInt16LE(values.length * 8, 2);
  values.forEach((v, i) => {
    b.writeBigUInt64LE(BigInt(v), 4 + i * 8);
  });
  return b;
}

function localHeader(e: Omit<Written, "offset" | "crc">, crc: number): Buffer {
  const extra = e.zip64 ? zip64Extra([e.size, e.size]) : Buffer.alloc(0);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(e.zip64 ? 45 : 20, 4);
  h.writeUInt16LE(UTF8, 6);
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(e.time, 10);
  h.writeUInt16LE(e.date, 12);
  h.writeUInt32LE(crc >>> 0, 14);
  h.writeUInt32LE(e.zip64 ? MAX32 : e.size, 18);
  h.writeUInt32LE(e.zip64 ? MAX32 : e.size, 22);
  h.writeUInt16LE(e.name.length, 26);
  h.writeUInt16LE(extra.length, 28);
  return Buffer.concat([h, e.name, extra]);
}

function centralHeader(e: Written): Buffer {
  const big = e.zip64 || e.offset >= MAX32;
  const values = e.zip64 ? [e.size, e.size, e.offset] : big ? [e.offset] : [];
  const extra = values.length ? zip64Extra(values) : Buffer.alloc(0);
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(45, 4);
  h.writeUInt16LE(big ? 45 : 20, 6);
  h.writeUInt16LE(UTF8, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(e.time, 12);
  h.writeUInt16LE(e.date, 14);
  h.writeUInt32LE(e.crc >>> 0, 16);
  h.writeUInt32LE(e.zip64 ? MAX32 : e.size, 20);
  h.writeUInt32LE(e.zip64 ? MAX32 : e.size, 24);
  h.writeUInt16LE(e.name.length, 28);
  h.writeUInt16LE(extra.length, 30);
  h.writeUInt16LE(0, 32);
  h.writeUInt16LE(0, 34);
  h.writeUInt16LE(0, 36);
  h.writeUInt32LE(0, 38);
  h.writeUInt32LE(big ? MAX32 : e.offset, 42);
  return Buffer.concat([h, e.name, extra]);
}

function endRecords(count: number, cdSize: number, cdOffset: number, force: boolean): Buffer {
  const zip64 = force || count >= MAX16 || cdSize >= MAX32 || cdOffset >= MAX32;
  const parts: Buffer[] = [];
  if (zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(44n, 4);
    rec.writeUInt16LE(45, 12);
    rec.writeUInt16LE(45, 14);
    rec.writeUInt32LE(0, 16);
    rec.writeUInt32LE(0, 20);
    rec.writeBigUInt64LE(BigInt(count), 24);
    rec.writeBigUInt64LE(BigInt(count), 32);
    rec.writeBigUInt64LE(BigInt(cdSize), 40);
    rec.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(rec, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(zip64 ? MAX16 : count, 8);
  end.writeUInt16LE(zip64 ? MAX16 : count, 10);
  end.writeUInt32LE(zip64 ? MAX32 : cdSize, 12);
  end.writeUInt32LE(zip64 ? MAX32 : cdOffset, 16);
  end.writeUInt16LE(0, 20);
  parts.push(end);
  return Buffer.concat(parts);
}

/** Writes the archive to `out` (through a .part file renamed at the end). */
export async function writeZip(
  out: string,
  entries: ZipEntry[],
  options: ZipOptions = {},
): Promise<void> {
  const names = new Set<string>();
  const sizes: number[] = [];
  for (const e of entries) {
    const name = e.name.replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.split("/").includes("..") || names.has(name))
      throw new Error(`Nome inválido no pacote: ${e.name}`);
    names.add(name);
    sizes.push(e.data ? e.data.length : (await stat(e.path ?? "")).size);
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  const part = `${out}.part`;
  const file = await open(part, "w");
  let position = 0;
  let done = 0;
  let complete = false;
  const write = async (buf: Buffer | Uint8Array, at = position): Promise<void> => {
    let off = 0;
    while (off < buf.length) {
      const { bytesWritten } = await file.write(buf, off, buf.length - off, at + off);
      off += bytesWritten;
    }
    if (at === position) position += buf.length;
  };
  try {
    const written: Written[] = [];
    for (const [i, e] of entries.entries()) {
      options.signal?.throwIfAborted();
      const size = sizes[i];
      const { time, date } = dosTime(e.mtime ?? new Date());
      const name = Buffer.from(e.name.replace(/\\/g, "/"), "utf8");
      const head = { name, size, time, date, zip64: options.zip64 === "always" || size >= MAX32 };
      const offset = position;
      await write(localHeader(head, 0));
      let crc = 0;
      if (e.data) {
        crc = crc32(e.data);
        await write(e.data);
        done += e.data.length;
      } else {
        let read = 0;
        for await (const chunk of createReadStream(e.path ?? "", { highWaterMark: 1 << 20 })) {
          options.signal?.throwIfAborted();
          const bytes = chunk as Buffer;
          crc = crc32(bytes, crc);
          await write(bytes);
          read += bytes.length;
          done += bytes.length;
          options.onProgress?.(done, total);
        }
        if (read !== size) throw new Error(`O arquivo mudou enquanto era empacotado: ${e.path}`);
      }
      // The CRC goes back into the local header, now that the whole file went through.
      const crcBytes = Buffer.alloc(4);
      crcBytes.writeUInt32LE(crc >>> 0, 0);
      await write(crcBytes, offset + 14);
      written.push({ ...head, crc, offset });
      options.onProgress?.(done, total);
    }
    const cdOffset = position;
    for (const w of written) await write(centralHeader(w));
    const cdSize = position - cdOffset;
    await write(endRecords(written.length, cdSize, cdOffset, options.zip64 === "always"));
    await file.sync();
    complete = true;
  } finally {
    await file.close();
    if (!complete) await rm(part, { force: true });
  }
  await rename(part, out);
}
