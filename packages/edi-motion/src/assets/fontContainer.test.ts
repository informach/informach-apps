import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync, zlibSync } from "fflate";
import { expect, test } from "vitest";
import { inspectFont, inspectFontCharacterMap, inspectFontLayoutScripts } from "./font";
import { extractFontFace, fontContainer } from "./fontContainer";

function fixture(name: string, hash: string) {
  const text = readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8"),
    bytes = gunzipSync(Buffer.from(text.replace(/\s/g, ""), "base64"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
  return bytes;
}
const latin = () =>
    fixture(
      "NotoSans-Regular.ttf.gz.base64",
      "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5",
    ),
  arabic = () =>
    fixture(
      "NotoSansArabic-Regular.ttf.gz.base64",
      "ceea25b464a656dc3b26849bab9356740401af62aedf1bfa8b7f0d9b75925b1b",
    );
/** Directory checksum of each table of an SFNT. */
function checksums(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    result = new Map<string, number>();
  for (let index = 0; index < view.getUint16(4); index++) {
    const at = 12 + index * 16;
    result.set(String.fromCharCode(...bytes.subarray(at, at + 4)), view.getUint32(at + 4));
  }
  return result;
}
/** Directory of an SFNT: tag → table bytes. */
function tables(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    result = new Map<string, Uint8Array>();
  for (let index = 0; index < view.getUint16(4); index++) {
    const at = 12 + index * 16;
    result.set(
      String.fromCharCode(...bytes.subarray(at, at + 4)),
      bytes.subarray(view.getUint32(at + 8), view.getUint32(at + 8) + view.getUint32(at + 12)),
    );
  }
  return result;
}
/** WOFF 1.0 written in test memory from a real font, compressing every table. */
function woff(source: Uint8Array) {
  const sums = checksums(source),
    entries = [...tables(source)].map(([tag, data]) => {
      const compressed = zlibSync(data, { level: 9 });
      return { tag, data, stored: compressed.length < data.length ? compressed : data };
    }),
    header = 44 + entries.length * 20,
    size = entries.reduce((sum, entry) => sum + Math.ceil(entry.stored.length / 4) * 4, header),
    output = new Uint8Array(size),
    view = new DataView(output.buffer);
  output.set([0x77, 0x4f, 0x46, 0x46]);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, size);
  view.setUint16(12, entries.length);
  let offset = header;
  for (const [index, entry] of entries.entries()) {
    const at = 44 + index * 20;
    for (let character = 0; character < 4; character++)
      output[at + character] = entry.tag.charCodeAt(character);
    view.setUint32(at + 4, offset);
    view.setUint32(at + 8, entry.stored.length);
    view.setUint32(at + 12, entry.data.length);
    view.setUint32(at + 16, sums.get(entry.tag) ?? 0);
    output.set(entry.stored, offset);
    offset += Math.ceil(entry.stored.length / 4) * 4;
  }
  return output;
}
/** A TTC with two real faces (each keeps its own tables). */
function collection(faces: Uint8Array[]) {
  const parts = faces.map((face) => [...tables(face)]),
    sums = faces.map(checksums),
    directories = parts.map((list) => 12 + list.length * 16),
    header = 12 + faces.length * 4,
    size =
      header +
      directories.reduce((sum, value) => sum + value, 0) +
      parts.flat().reduce((sum, [, data]) => sum + Math.ceil(data.length / 4) * 4, 0),
    output = new Uint8Array(size),
    view = new DataView(output.buffer);
  output.set([0x74, 0x74, 0x63, 0x66]);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, faces.length);
  let cursor = header + directories.reduce((sum, value) => sum + value, 0),
    directory = header;
  for (const [face, list] of parts.entries()) {
    view.setUint32(12 + face * 4, directory);
    view.setUint32(directory, 0x00010000);
    view.setUint16(directory + 4, list.length);
    for (const [index, [tag, data]] of list.entries()) {
      const at = directory + 12 + index * 16;
      for (let character = 0; character < 4; character++)
        output[at + character] = tag.charCodeAt(character);
      view.setUint32(at + 4, sums[face]?.get(tag) ?? 0);
      view.setUint32(at + 8, cursor);
      view.setUint32(at + 12, data.length);
      output.set(data, cursor);
      cursor += Math.ceil(data.length / 4) * 4;
    }
    directory += directories[face] ?? 0;
  }
  return output;
}

test("WOFF 1.0 converts to an SFNT whose tables are byte-identical", () => {
  const source = latin(),
    packed = woff(source);
  expect(packed.length).toBeLessThan(source.length);
  expect(fontContainer(packed)).toEqual({ container: "woff", faces: 1 });
  const converted = extractFontFace(packed);
  expect(inspectFont(converted)).toEqual(inspectFont(source));
  // Every table is identical, except head.checkSumAdjustment, which covers the new file.
  const comparable = (name: string, data: Uint8Array) => {
    const copy = Buffer.from(data);
    if (name === "head") copy.fill(0, 8, 12);
    return copy;
  };
  for (const [name, data] of tables(source))
    expect(
      comparable(name, tables(converted).get(name) ?? new Uint8Array()).equals(
        comparable(name, data),
      ),
      name,
    ).toBe(true);
  expect(inspectFontCharacterMap(converted).glyph(0x41)).toBe(
    inspectFontCharacterMap(source).glyph(0x41),
  );
});

test("a collection yields the chosen face as a standalone, verified font", () => {
  const packed = collection([latin(), arabic()]);
  expect(fontContainer(packed)).toEqual({ container: "collection", faces: 2 });
  expect(inspectFont(extractFontFace(packed, 0)).family).toBe("Noto Sans");
  const second = extractFontFace(packed, 1);
  expect(inspectFont(second).family).toBe("Noto Sans Arabic");
  expect(inspectFontLayoutScripts(second).substitution.has("arab")).toBe(true);
  expect(() => extractFontFace(packed, 2)).toThrow(/fora da coleção/);
});

test("WOFF2 and damaged containers are refused with a reason", () => {
  const woff2 = new Uint8Array(48);
  woff2.set([0x77, 0x4f, 0x46, 0x32]);
  expect(() => fontContainer(woff2)).toThrow(/WOFF2/);
  const broken = woff(latin());
  new DataView(broken.buffer).setUint32(8, broken.length + 1);
  expect(() => extractFontFace(broken)).toThrow(/tamanho inconsistente/);
  // A corrupt table byte fails its source checksum, as it would in a plain TTF.
  const corrupt = collection([latin(), arabic()]),
    view = new DataView(corrupt.buffer),
    face = view.getUint32(12),
    first = view.getUint32(face + 12 + 8);
  corrupt[first] = (corrupt[first] ?? 0) ^ 0xff;
  expect(() => extractFontFace(corrupt, 0)).toThrow(/Checksum inválido/);
});
