import { createHash } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";

/**
 * Files of the export cache that must survive a crash: written in full and flushed before they
 * get their final name, and checked for their structure when the cache finds one it has no
 * record of (a lost index), so a cut-off file is never taken for a whole one.
 */

/** Flushes a written file to the disk, so the rename after it never names lost bytes. */
export async function flush(path: string): Promise<void> {
  const handle = await open(path, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Writes `text` to `path` and flushes it. */
export async function writeFlushed(path: string, text: string): Promise<void> {
  const handle = await open(path, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function read(handle: FileHandle, at: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, at);
  return buffer.subarray(0, bytesRead);
}

/** MP4: its top-level boxes cover the file exactly, with the header, the media and the index. */
async function mp4Whole(handle: FileHandle, size: number): Promise<boolean> {
  const seen = new Set<string>();
  let at = 0;
  while (at < size) {
    const head = await read(handle, at, 16);
    if (head.length < 8) return false;
    let box = head.readUInt32BE(0);
    let header = 8;
    if (box === 1) {
      if (head.length < 16) return false;
      box = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (box === 0) box = size - at;
    if (box < header || at + box > size) return false;
    seen.add(head.toString("latin1", 4, 8));
    at += box;
  }
  return seen.has("ftyp") && seen.has("mdat") && seen.has("moov");
}

/** WAV (or RF64 past 4 GB): the size its header gives is the size of the file. */
async function wavWhole(handle: FileHandle, size: number): Promise<boolean> {
  const head = await read(handle, 0, 28);
  if (head.length < 12 || head.toString("latin1", 8, 12) !== "WAVE") return false;
  const kind = head.toString("latin1", 0, 4);
  if (kind === "RIFF") return head.readUInt32LE(4) + 8 === size;
  if (kind !== "RF64" || head.length < 28 || head.toString("latin1", 12, 16) !== "ds64")
    return false;
  return Number(head.readBigUInt64LE(20)) + 8 === size;
}

/** PNG: the signature at the start and the closing chunk at the end. */
async function pngWhole(handle: FileHandle, size: number): Promise<boolean> {
  if (size < 20) return false;
  const start = await read(handle, 0, 8);
  const end = await read(handle, size - 12, 12);
  return (
    start.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    end.toString("latin1", 4, 8) === "IEND"
  );
}

/**
 * A hash of the H.264 (or HEVC) stream's parameter sets, the `avcC` box of an MP4: segments
 * whose hashes differ cannot be joined by copying (an `avc1` track carries one set), or
 * undefined when the file has none.
 */
export async function streamHeader(path: string): Promise<string | undefined> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    let at = 0;
    while (at + 8 <= size) {
      const head = await read(handle, at, 16);
      let box = head.readUInt32BE(0);
      if (box === 1 && head.length >= 16) box = Number(head.readBigUInt64BE(8));
      else if (box === 0) box = size - at;
      if (box < 8 || at + box > size) return undefined;
      if (head.toString("latin1", 4, 8) === "moov") {
        const moov = await read(handle, at, box);
        for (const tag of ["avcC", "hvcC"]) {
          const i = moov.indexOf(tag, 0, "latin1");
          if (i < 4) continue;
          const length = moov.readUInt32BE(i - 4);
          if (length < 8 || i - 4 + length > moov.length) return undefined;
          return createHash("sha256")
            .update(moov.subarray(i + 4, i - 4 + length))
            .digest("hex");
        }
        return undefined;
      }
      at += box;
    }
    return undefined;
  } finally {
    await handle.close();
  }
}

/** Whether a cached file of this kind (mp4, wav, json, png) is whole. */
export async function intact(path: string, ext: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    switch (ext) {
      case "mp4":
        return await mp4Whole(handle, size);
      case "wav":
        return await wavWhole(handle, size);
      case "png":
        return await pngWhole(handle, size);
      case "json":
        try {
          JSON.parse(await handle.readFile("utf8"));
          return true;
        } catch (error) {
          if (error instanceof SyntaxError) return false;
          throw error;
        }
      default:
        return false;
    }
  } finally {
    await handle.close();
  }
}
