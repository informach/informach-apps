import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { createFontCharacterMap, UnsupportedCharacterMapError } from "./cmap";

function format4(ranged = false) {
  const bytes = new Uint8Array(ranged ? 36 : 32),
    v = new DataView(bytes.buffer);
  const words: [number, number][] = [
    [0, 4],
    [2, bytes.length],
    [6, 4],
    [8, 4],
    [10, 1],
    [14, 66],
    [16, 65535],
    [20, 65],
    [22, 65535],
    [24, ranged ? 65535 : 65472],
    [26, 1],
    [28, ranged ? 4 : 0],
  ];
  for (const [at, value] of words) v.setUint16(at, value);
  if (ranged) v.setUint16(32, 2);
  return bytes;
}
function format12() {
  const bytes = new Uint8Array(40),
    v = new DataView(bytes.buffer);
  v.setUint16(0, 12);
  v.setUint32(4, 40);
  v.setUint32(12, 2);
  const words: [number, number][] = [
    [16, 65],
    [20, 66],
    [24, 2],
    [28, 0x1f600],
    [32, 0x1f600],
    [36, 5],
  ];
  for (const [at, value] of words) v.setUint32(at, value);
  return bytes;
}
function format14() {
  const bytes = new Uint8Array(38),
    v = new DataView(bytes.buffer);
  v.setUint16(0, 14);
  v.setUint32(2, 38);
  v.setUint32(6, 1);
  v.setUint8(10, 0);
  v.setUint16(11, 0xfe0f);
  v.setUint32(13, 21);
  v.setUint32(17, 29);
  v.setUint32(21, 1);
  v.setUint8(25, 0);
  v.setUint16(26, 65);
  v.setUint8(28, 0);
  v.setUint32(29, 1);
  v.setUint8(33, 0);
  v.setUint16(34, 66);
  v.setUint16(36, 7);
  return bytes;
}
function cmap(entries: { platform: number; encoding: number; bytes: Uint8Array }[]) {
  const result = new Uint8Array(
      4 + entries.length * 8 + entries.reduce((sum, entry) => sum + entry.bytes.length, 0),
    ),
    view = new DataView(result.buffer);
  view.setUint16(2, entries.length);
  let offset = 4 + entries.length * 8;
  for (const [index, entry] of entries.entries()) {
    view.setUint16(4 + index * 8, entry.platform);
    view.setUint16(6 + index * 8, entry.encoding);
    view.setUint32(8 + index * 8, offset);
    result.set(entry.bytes, offset);
    offset += entry.bytes.length;
  }
  return result;
}
test("bounded Unicode cmap4 handles delta/range offsets, missing glyphs and immutable ownership", () => {
  for (const ranged of [false, true]) {
    const bytes = cmap([{ platform: 3, encoding: 1, bytes: format4(ranged) }]),
      map = createFontCharacterMap(bytes, 10);
    expect(map.format).toBe(4);
    expect(Object.isFrozen(map)).toBe(true);
    expect(map.glyph(65)).toBe(1);
    expect(map.glyph(66)).toBe(ranged ? 0 : 2);
    expect(map.glyph(64)).toBe(0);
    expect(map.glyph(0xffff)).toBe(0);
    expect(map.glyph(0x1f600)).toBe(0);
    expect(map.glyph(65, 0xfe0f)).toBe(0);
    bytes.fill(0);
    expect(map.glyph(65)).toBe(1);
    expect(() => map.glyph(0xd800)).toThrow(/escalares/);
    expect(() => map.glyph(NaN)).toThrow(/escalares/);
  }
});

test("same-format Unicode platform mappings cannot disagree, while an explicit notdef variation remains missing", () => {
  const alternate = format4();
  new DataView(alternate.buffer).setUint16(24, 65473);
  expect(() =>
    createFontCharacterMap(
      cmap([
        { platform: 0, encoding: 3, bytes: format4() },
        { platform: 3, encoding: 1, bytes: alternate },
      ]),
      10,
    ),
  ).toThrow(/ambíguos/);
  const emptyVariation = format14();
  new DataView(emptyVariation.buffer).setUint16(36, 0);
  const map = createFontCharacterMap(
    cmap([
      { platform: 0, encoding: 3, bytes: format4() },
      { platform: 0, encoding: 5, bytes: emptyVariation },
    ]),
    10,
  );
  expect(map.glyph(66, 0xfe0f)).toBe(0);
  expect(map.glyph(65, 0xfe0f)).toBe(1);
});
test("cmap12 takes precedence without unioning subtables and cmap14 verifies default/nondefault sequences", () => {
  const map = createFontCharacterMap(
    cmap([
      { platform: 0, encoding: 3, bytes: format4() },
      { platform: 0, encoding: 5, bytes: format14() },
      { platform: 3, encoding: 10, bytes: format12() },
    ]),
    10,
  );
  expect(map.format).toBe(12);
  expect(map.glyph(65)).toBe(2);
  expect(map.glyph(66)).toBe(3);
  expect(map.glyph(0x1f600)).toBe(5);
  expect(map.glyph(0x1f601)).toBe(0);
  expect(map.glyph(65, 0xfe0f)).toBe(2);
  expect(map.glyph(66, 0xfe0f)).toBe(7);
  expect(map.glyph(67, 0xfe0f)).toBe(0);
  expect(map.glyph(65, 0xfe0e)).toBe(0);
});
test("cmap refuses truncated, overlapping, out-of-range and unsupported mappings before lookup", () => {
  const create = (bytes: Uint8Array, encoding = 1) =>
    createFontCharacterMap(cmap([{ platform: 3, encoding, bytes }]), 10);
  const short = format4().subarray(0, 31);
  expect(() => create(short)).toThrow(/limites/);
  const overlap = format4(),
    o = new DataView(overlap.buffer);
  o.setUint16(22, 66);
  expect(() => create(overlap)).toThrow(/Intervalo/);
  const badOffset = format4(true);
  new DataView(badOffset.buffer).setUint16(28, 100);
  expect(() => create(badOffset)).toThrow(/referência/);
  const missingGlyph = format4();
  new DataView(missingGlyph.buffer).setUint16(24, 0);
  expect(() => create(missingGlyph)).toThrow(/glifo/);
  const excessive = format12();
  new DataView(excessive.buffer).setUint32(12, 0xffffffff);
  expect(() => create(excessive, 10)).toThrow(/excessivo/);
  const surrogate = format12();
  new DataView(surrogate.buffer).setUint32(28, 0xd800);
  expect(() => create(surrogate, 10)).toThrow(/Intervalo/);
  const unsupported = format4();
  new DataView(unsupported.buffer).setUint16(0, 6);
  expect(() => create(unsupported)).toThrow(UnsupportedCharacterMapError);
  const variations = format14();
  new DataView(variations.buffer).setUint32(13, 4000);
  expect(() =>
    createFontCharacterMap(
      cmap([
        { platform: 0, encoding: 3, bytes: format4() },
        { platform: 0, encoding: 5, bytes: variations },
      ]),
      10,
    ),
  ).toThrow(/limites/);
  expect(() =>
    createFontCharacterMap(
      cmap([
        { platform: 3, encoding: 1, bytes: format4() },
        { platform: 3, encoding: 1, bytes: format4() },
      ]),
      10,
    ),
  ).toThrow(/duplicados/);
});
test("the real Noto Sans cmap covers Portuguese/combining marks but does not certify missing CJK/emoji", () => {
  const packed = readFileSync(
      new URL("../../tests/fixtures/NotoSans-Regular.ttf.gz.base64", import.meta.url),
      "utf8",
    ).replace(/\s/g, ""),
    font = gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 600000 });
  let table: Uint8Array | undefined,
    glyphs = 0;
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const at = 12 + index * 16,
      tag = font.toString("ascii", at, at + 4),
      offset = font.readUInt32BE(at + 8);
    if (tag === "cmap") table = font.subarray(offset, offset + font.readUInt32BE(at + 12));
    if (tag === "maxp") glyphs = font.readUInt16BE(offset + 4);
  }
  if (!table) throw new Error("Missing real cmap fixture");
  const map = createFontCharacterMap(table, glyphs);
  for (const point of [0x41, 0xe7, 0xe3, 0xe9, 0x301]) expect(map.glyph(point)).toBeGreaterThan(0);
  expect(map.glyph(0x4e2d)).toBe(0);
  expect(map.glyph(0x1f600)).toBe(0);
});
