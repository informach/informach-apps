import { Unzlib } from "fflate";
import { ASSET_BYTES, assertAssetBytes, IMAGE_PIXELS } from "./limits";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function pngCrc(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const value = crcTable[(crc ^ byte) & 255];
    if (value === undefined) throw new Error("CRC inválido.");
    crc = value ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Structural/CRC/pixel preflight only. The platform decoder must still accept
 * IDAT before a resource can become ready; no compressed metadata is executed. */
export function inspectPng(bytes: Uint8Array, canonical = false) {
  assertAssetBytes(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte))
    throw new Error("Assinatura PNG inválida.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks: { type: string; offset: number; length: number }[] = [];
  let offset = 8,
    width = 0,
    height = 0,
    color = 0,
    depth = 0,
    palette = 0,
    seenData = false,
    dataBytes = 0,
    endedData = false,
    ended = false;
  const singleton = new Set<string>();
  while (offset < bytes.length) {
    if (chunks.length >= 1024 || offset + 12 > bytes.length)
      throw new Error("PNG truncado ou com chunks excessivos.");
    const length = view.getUint32(offset),
      type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)),
      end = offset + 12 + length;
    if (
      length > ASSET_BYTES ||
      end > bytes.length ||
      !/^[A-Za-z]{4}$/.test(type) ||
      (type.charCodeAt(2) & 32) !== 0
    )
      throw new Error("Chunk PNG inválido.");
    if (pngCrc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw new Error("CRC de PNG inválido.");
    if (!chunks.length && type !== "IHDR") throw new Error("PNG requer IHDR inicial.");
    if (type === "acTL" || type === "fcTL" || type === "fdAT")
      throw new Error("PNG animado requer importação de frames explícita.");
    if (
      type !== "IDAT" &&
      ["IHDR", "PLTE", "IEND", "tRNS", "sRGB", "gAMA", "cICP"].includes(type)
    ) {
      if (singleton.has(type)) throw new Error("Chunk PNG duplicado.");
      singleton.add(type);
    }
    if (type === "IHDR") {
      if (length !== 13) throw new Error("IHDR PNG inválido.");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = bytes[offset + 16] ?? 0;
      color = bytes[offset + 17] ?? -1;
      const depths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !width ||
        !height ||
        width > 16384 ||
        height > 16384 ||
        width * height > IMAGE_PIXELS ||
        !depths[color]?.includes(depth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        ![0, 1].includes(bytes[offset + 20] ?? -1)
      )
        throw new Error("PNG excede dimensões ou usa cabeçalho inválido.");
    } else if (type === "PLTE") {
      if (
        seenData ||
        singleton.has("tRNS") ||
        length < 3 ||
        length > 768 ||
        length % 3 ||
        color === 0 ||
        color === 4
      )
        throw new Error("Paleta PNG inválida.");
      palette = length / 3;
      if (color === 3 && palette > 2 ** depth) throw new Error("Paleta excede profundidade PNG.");
    } else if (type === "tRNS") {
      if (
        seenData ||
        !(
          (color === 0 && length === 2) ||
          (color === 2 && length === 6) ||
          (color === 3 && palette > 0 && length > 0 && length <= palette)
        )
      )
        throw new Error("Transparência PNG inválida.");
    } else if (type === "IDAT") {
      if (endedData || (color === 3 && !palette))
        throw new Error("IDAT fora de ordem ou sem paleta.");
      seenData = true;
      dataBytes += length;
    } else if (type === "IEND") {
      if (length !== 0 || !seenData || !dataBytes || end !== bytes.length)
        throw new Error("PNG incompleto ou com dados após IEND.");
      ended = true;
    } else {
      if ((type.charCodeAt(0) & 32) === 0) throw new Error("Chunk crítico PNG não suportado.");
      if (["sRGB", "gAMA", "cICP"].includes(type) && (seenData || palette > 0))
        throw new Error("Metadado de cor PNG fora de ordem.");
      if (
        canonical &&
        !(
          (type === "sRGB" && length === 1 && (bytes[offset + 8] ?? 9) <= 3) ||
          (type === "gAMA" && length === 4 && view.getUint32(offset + 8) > 0) ||
          (type === "cICP" &&
            length === 4 &&
            bytes[offset + 8] === 1 &&
            bytes[offset + 9] === 13 &&
            bytes[offset + 10] === 0 &&
            bytes[offset + 11] === 1)
        )
      )
        throw new Error("PNG precisa de normalização para remover metadados não suportados.");
    }
    if (seenData && type !== "IDAT") endedData = true;
    chunks.push({ type, offset, length });
    offset = end;
  }
  if (!ended) throw new Error("PNG sem IEND.");
  return { width, height, chunks };
}

/** Bounded streaming inflation validates the complete scanline count, filter
 * bytes and Adler-32 before a PNG enters a synchronous project transaction.
 * No decoded pixel allocation or platform-specific Node module is needed. The
 * browser decoder remains responsible for accepting actual rendering. */
export function validatePngData(bytes: Uint8Array, header: ReturnType<typeof inspectPng>) {
  const ihdr = header.chunks[0];
  if (!ihdr) throw new Error("PNG sem cabeçalho.");
  const channelsByColor: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const depth = bytes[ihdr.offset + 16] ?? 0,
    color = bytes[ihdr.offset + 17] ?? -1,
    channels = channelsByColor[color];
  if (!channels) throw new Error("PNG sem canais válidos.");
  const passes =
      bytes[ihdr.offset + 20] === 1
        ? [
            [0, 0, 8, 8],
            [4, 0, 8, 8],
            [0, 4, 4, 8],
            [2, 0, 4, 4],
            [0, 2, 2, 4],
            [1, 0, 2, 2],
            [0, 1, 1, 2],
          ]
        : [[0, 0, 1, 1]],
    rows: { stride: number; count: number }[] = [];
  for (const pass of passes) {
    const [x, y, dx, dy] = pass;
    if (x === undefined || y === undefined || !dx || !dy) throw new Error("Passe PNG inválido.");
    const width = Math.max(0, Math.ceil((header.width - x) / dx)),
      height = Math.max(0, Math.ceil((header.height - y) / dy));
    if (width && height)
      rows.push({ stride: 1 + Math.ceil((width * channels * depth) / 8), count: height });
  }
  const expected = rows.reduce((sum, row) => sum + row.stride * row.count, 0),
    dataChunks = header.chunks.filter((chunk) => chunk.type === "IDAT"),
    compressed = new Uint8Array(dataChunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of dataChunks) {
    compressed.set(bytes.subarray(chunk.offset + 8, chunk.offset + 8 + chunk.length), at);
    at += chunk.length;
  }
  if (compressed.length < 6) throw new Error("IDAT PNG truncado.");
  const footer = new DataView(compressed.buffer).getUint32(compressed.length - 4);
  let produced = 0,
    a = 1,
    b = 0,
    nextFilter = 0,
    passIndex = 0,
    passRows = 0;
  const stream = new Unzlib((chunk) => {
    if (produced + chunk.length > expected)
      throw new Error("IDAT excede tamanho de pixels declarado.");
    while (nextFilter < produced + chunk.length) {
      const filter = chunk[nextFilter - produced],
        row = rows[passIndex];
      if (filter === undefined || filter > 4 || !row) throw new Error("Filtro PNG inválido.");
      nextFilter += row.stride;
      if (++passRows === row.count) {
        passIndex++;
        passRows = 0;
      }
    }
    for (let offset = 0; offset < chunk.length; offset += 5552) {
      const end = Math.min(offset + 5552, chunk.length);
      for (let index = offset; index < end; index++) {
        a += chunk[index] ?? 0;
        b += a;
      }
      a %= 65521;
      b %= 65521;
    }
    produced += chunk.length;
  });
  // Limit each inflation input batch: even a maximal DEFLATE expansion reaches
  // the length check after a bounded batch, not a whole compressed-file bomb.
  for (let offset = 0; offset < compressed.length; offset += 4096)
    stream.push(compressed.subarray(offset, offset + 4096), offset + 4096 >= compressed.length);
  if (produced !== expected || ((b << 16) | a) >>> 0 !== footer)
    throw new Error("IDAT PNG incompleto ou Adler-32 inválido.");
}
