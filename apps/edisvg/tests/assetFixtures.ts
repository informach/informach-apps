import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { crc32, deflateSync, gunzipSync } from "node:zlib";
import {
  type AudioAsset,
  assetId,
  encodeAssetData,
  type FontAsset,
  type ImageAsset,
  inspectFont,
} from "@informach/edi-motion/assets";
export function imageFixture(valid = true, metadata = false): ImageAsset {
  return pngFixture(1, 1, Buffer.from([0, 255, 0, 0, 255]), valid, metadata);
}
function pngFixture(
  width: number,
  height: number,
  pixels: Buffer,
  valid = true,
  metadata = false,
): ImageAsset {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    chunks: [string, Buffer][] = [["IHDR", header]];
  if (metadata) chunks.push(["tEXt", Buffer.from("Author\0Example")]);
  chunks.push(
    ["IDAT", valid ? deflateSync(pixels) : Buffer.from([1, 2, 3])],
    ["IEND", Buffer.alloc(0)],
  );
  for (const [type, data] of chunks) {
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, "ascii");
    chunk.set(data, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
    parts.push(chunk);
  }
  const bytes = Buffer.concat(parts);
  return {
    id: assetId(bytes),
    name: "Pixel",
    kind: "image",
    mime: "image/png",
    width,
    height,
    byteLength: bytes.length,
    data: encodeAssetData(bytes),
  };
}
export function sliceImageFixture(): ImageAsset {
  const pixels = Buffer.alloc(30 * 121),
    colors = [
      [255, 0, 0],
      [255, 0, 255],
      [0, 255, 0],
      [0, 255, 255],
      [255, 255, 255],
      [255, 128, 0],
      [0, 0, 255],
      [128, 128, 128],
      [255, 255, 0],
    ];
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) {
      const color = colors[Math.floor(y / 10) * 3 + Math.floor(x / 10)];
      if (!color) throw new Error("Missing fixture color");
      pixels.set([...color, 255], y * 121 + 1 + x * 4);
    }
  return { ...pngFixture(30, 30, pixels), name: "Nine colors" };
}
export function fontFixture(): FontAsset {
  const packed = readFileSync(
      new URL(
        "../../../packages/edi-motion/tests/fixtures/NotoSans-Regular.ttf.gz.base64",
        import.meta.url,
      ),
      "utf8",
    ).replace(/\s/g, ""),
    bytes = gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 600000 });
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5"
  )
    throw new Error("Unexpected font fixture");
  return {
    kind: "font",
    mime: "font/ttf",
    id: assetId(bytes),
    name: "Noto Sans",
    byteLength: bytes.length,
    data: encodeAssetData(bytes),
    ...inspectFont(bytes),
    rightsConfirmed: true,
    licenseNotice: readFileSync(
      new URL("../../../packages/edi-motion/tests/fixtures/Noto-OFL.txt", import.meta.url),
      "utf8",
    ),
  };
}
export function mathFontFixture(): FontAsset {
  const packed = readFileSync(
      new URL(
        "../../../packages/edi-motion/tests/fixtures/NotoSansMath-Regular.ttf.gz.base64",
        import.meta.url,
      ),
      "utf8",
    ).replace(/\s/g, ""),
    bytes = gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 1100000 });
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    "3f495fe933c06786e4d5f6d86b8ee70b6753a68ee3b9d87528726de0f6e2c47d"
  )
    throw new Error("Unexpected math font fixture");
  return {
    kind: "font",
    mime: "font/ttf",
    id: assetId(bytes),
    name: "Noto Sans Math",
    byteLength: bytes.length,
    data: encodeAssetData(bytes),
    ...inspectFont(bytes),
    rightsConfirmed: true,
    licenseNotice: readFileSync(
      new URL("../../../packages/edi-motion/tests/fixtures/NotoSansMath-OFL.txt", import.meta.url),
      "utf8",
    ),
  };
}
export function audioFixture(frames = 800): AudioAsset {
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++)
    bytes.writeInt16LE(
      Math.round(16384 * Math.sin((2 * Math.PI * 440 * frame) / 8000)),
      44 + frame * 2,
    );
  return {
    kind: "audio",
    mime: "audio/wav",
    id: assetId(bytes),
    name: "Tom de teste",
    byteLength: bytes.length,
    data: encodeAssetData(bytes),
    channels: 1,
    sampleRate: 8000,
    frames,
  };
}
function fontTable(bytes: Buffer, tag: string) {
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const at = 12 + index * 16;
    if (bytes.toString("ascii", at, at + 4) === tag)
      return { offset: bytes.readUInt32BE(at + 8), length: bytes.readUInt32BE(at + 12) };
  }
  throw new Error("Missing fixture table");
}
function fontChecksum(bytes: Buffer, offset = 0, length = bytes.length) {
  let checksum = 0;
  for (let at = 0; at < Math.ceil(length / 4) * 4; at += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++)
      word = (word << 8) | (at + byte < length ? (bytes[offset + at + byte] ?? 0) : 0);
    checksum = (checksum + (word >>> 0)) >>> 0;
  }
  return checksum;
}
/** Noto Sans Arabic; `unjoined` renames its GSUB init/medi/fina feature records in
 * memory (re-checksummed): the glyphs stay, but no shaper joins the letters. */
export function arabicFontFixture(unjoined = false): FontAsset {
  const packed = readFileSync(
      new URL(
        "../../../packages/edi-motion/tests/fixtures/NotoSansArabic-Regular.ttf.gz.base64",
        import.meta.url,
      ),
      "utf8",
    ).replace(/\s/g, ""),
    bytes = gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 300000 });
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    "ceea25b464a656dc3b26849bab9356740401af62aedf1bfa8b7f0d9b75925b1b"
  )
    throw new Error("Unexpected Arabic font fixture");
  if (unjoined) {
    const gsub = fontTable(bytes, "GSUB"),
      list = gsub.offset + bytes.readUInt16BE(gsub.offset + 6);
    for (let index = 0; index < bytes.readUInt16BE(list); index++) {
      const at = list + 2 + index * 6;
      if (["init", "medi", "fina"].includes(bytes.toString("ascii", at, at + 4)))
        bytes.write("zzzz", at, "ascii");
    }
    const head = fontTable(bytes, "head");
    bytes.writeUInt32BE(0, head.offset + 8);
    for (let index = 0; index < bytes.readUInt16BE(4); index++) {
      const at = 12 + index * 16;
      bytes.writeUInt32BE(
        fontChecksum(bytes, bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 12)),
        at + 4,
      );
    }
    bytes.writeUInt32BE((0xb1b0afba - fontChecksum(bytes)) >>> 0, head.offset + 8);
  }
  return {
    kind: "font",
    mime: "font/ttf",
    id: assetId(bytes),
    name: unjoined ? "Noto Sans Arabic (sem formas contextuais)" : "Noto Sans Arabic",
    byteLength: bytes.length,
    data: encodeAssetData(bytes),
    ...inspectFont(bytes),
    rightsConfirmed: true,
    licenseNotice: readFileSync(
      new URL("../../../packages/edi-motion/tests/fixtures/Noto-OFL.txt", import.meta.url),
      "utf8",
    ),
  };
}
