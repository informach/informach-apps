import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { inspectPng, pngCrc, validatePngData } from "./png";
import { chunk, png, wav } from "./testFixtures";
import { inspectWav } from "./wav";

test("PNG CRC matches Node's independent implementation and validates complete bounded datastreams", () => {
  const vector = new TextEncoder().encode("123456789");
  expect(pngCrc(vector)).toBe(0xcbf43926);
  expect(pngCrc(vector)).toBe(crc32(vector));
  const data = png(),
    before = new Uint8Array(data),
    result = inspectPng(data, true);
  expect(result.width).toBe(1);
  expect(result.height).toBe(1);
  expect(result.chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  expect(new Uint8Array(data)).toEqual(before);
  const changed = Buffer.from(data);
  changed.writeUInt8(changed.readUInt8(29) ^ 1, 29);
  expect(() => inspectPng(changed, true)).toThrow(/CRC/);
  expect(() =>
    inspectPng(Buffer.concat([data, Buffer.from("<script>bad</script>")]), true),
  ).toThrow(/após IEND/);
  expect(() => inspectPng(png(16385, 1), true)).toThrow(/dimensões/);
  expect(() => inspectPng(png(5000, 5000), true)).toThrow(/dimensões/);
  expect(() => inspectPng(data.subarray(0, 30), true)).toThrow(/Chunk|truncado/);
});
test("animation and unknown critical chunks are never silently reinterpreted as a static bitmap; metadata requires normalization", () => {
  expect(() => inspectPng(png(1, 1, [chunk("acTL", new Uint8Array(8))]))).toThrow(/animado/);
  expect(() => inspectPng(png(1, 1, [chunk("ABCD", new Uint8Array())]))).toThrow(/crítico/);
  const metadata = png(1, 1, [chunk("tEXt", new TextEncoder().encode("Comment\0example"))]);
  expect(inspectPng(metadata).chunks.some((chunk) => chunk.type === "tEXt")).toBe(true);
  expect(() => inspectPng(metadata, true)).toThrow(/normalização/);
});
test("PCM16 WAVE preserves exact sample counts and refuses duration, rate, alignment, metadata and truncated data", () => {
  expect(inspectWav(wav())).toEqual({
    channels: 1,
    sampleRate: 8000,
    frames: 128,
    dataOffset: 44,
    dataLength: 256,
  });
  expect(() => inspectWav(wav(8000 * 31))).toThrow(/duração/);
  const rate = wav();
  rate.writeUInt32LE(96000, 24);
  expect(() => inspectWav(rate)).toThrow(/Formato/);
  const alignment = wav();
  alignment.writeUInt16LE(1, 32);
  expect(() => inspectWav(alignment)).toThrow(/Formato/);
  const truncated = wav().subarray(0, 50);
  expect(() => inspectWav(truncated)).toThrow(/truncado/);
  const extra = Buffer.concat([wav(), Buffer.from([76, 73, 83, 84, 0, 0, 0, 0])]);
  extra.writeUInt32LE(extra.length - 8, 4);
  expect(() => inspectWav(extra)).toThrow(/normalização/);
});

test("IDAT inflation checks row filters, exact declared size and Adler without allowing compressed pixel bombs", () => {
  const source = png(),
    header = source.subarray(8, 33);
  const wrap = (data: Uint8Array) =>
    Buffer.concat([
      source.subarray(0, 8),
      header,
      chunk("IDAT", data),
      chunk("IEND", new Uint8Array()),
    ]);
  const verify = (data: Uint8Array) => validatePngData(data, inspectPng(data, true));
  expect(() => verify(source)).not.toThrow();
  expect(() => verify(wrap(deflateSync(new Uint8Array(2_000_000))))).toThrow(/excede tamanho/);
  expect(() => verify(wrap(deflateSync(new Uint8Array(4))))).toThrow(/incompleto/);
  expect(() => verify(wrap(deflateSync(Buffer.from([5, 255, 0, 0, 255]))))).toThrow(/Filtro/);
  const compressed = deflateSync(Buffer.from([0, 255, 0, 0, 255]));
  compressed.writeUInt8(compressed.readUInt8(compressed.length - 1) ^ 1, compressed.length - 1);
  expect(() => verify(wrap(compressed))).toThrow(/Adler/);
  expect(() => verify(wrap(Buffer.from([1, 2, 3])))).toThrow(/truncado/);
});
