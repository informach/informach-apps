import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { inspectFont, inspectFontCharacterMap } from "./font";
import { assertTextCoverage, inspectTextCoverage } from "./fontCoverage";
import { assetId, encodeAssetData, type FontAsset, fontCharacterMap, parseAsset } from "./model";

function fixture() {
  const packed = readFileSync(
      new URL("../../tests/fixtures/NotoSans-Regular.ttf.gz.base64", import.meta.url),
      "utf8",
    ).replace(/\s/g, ""),
    bytes = gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 600000 });
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5",
  );
  return bytes;
}
function table(bytes: Buffer, tag: string) {
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const at = 12 + index * 16;
    if (bytes.toString("ascii", at, at + 4) === tag)
      return { entry: at, offset: bytes.readUInt32BE(at + 8), length: bytes.readUInt32BE(at + 12) };
  }
  throw new Error("Missing fixture table");
}
function sum(bytes: Buffer, offset = 0, length = bytes.length) {
  let checksum = 0;
  for (let at = 0; at < Math.ceil(length / 4) * 4; at += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++)
      word = (word << 8) | (at + byte < length ? (bytes[offset + at + byte] ?? 0) : 0);
    checksum = (checksum + (word >>> 0)) >>> 0;
  }
  return checksum;
}
function resign(bytes: Buffer) {
  const head = table(bytes, "head");
  bytes.writeUInt32BE(0, head.offset + 8);
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const at = 12 + index * 16;
    bytes.writeUInt32BE(
      sum(bytes, bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 12)),
      at + 4,
    );
  }
  bytes.writeUInt32BE((0xb1b0afba - sum(bytes)) >>> 0, head.offset + 8);
}
function fontAsset(bytes = fixture()): FontAsset {
  const info = inspectFont(bytes),
    asset = parseAsset({
      ...info,
      kind: "font",
      mime: "font/ttf",
      name: info.family,
      id: assetId(bytes),
      byteLength: bytes.length,
      data: encodeAssetData(bytes),
      rightsConfirmed: true,
      licenseNotice: "OFL test fixture",
    });
  if (asset.kind !== "font") throw new Error("Missing font asset");
  return asset;
}
/** A deliberately narrowed real font, generated only in test memory. All
 * mappings retain their real Noto glyph IDs and the SFNT is re-checksummed. */
function narrowedFont(points: number[]) {
  const bytes = fixture(),
    original = inspectFontCharacterMap(bytes),
    cmap = table(bytes, "cmap"),
    count = points.length + 1,
    length = 16 + count * 8,
    at = cmap.offset + 20;
  bytes.fill(0, cmap.offset, cmap.offset + cmap.length);
  bytes.writeUInt16BE(2, cmap.offset + 2);
  bytes.writeUInt16BE(0, cmap.offset + 4);
  bytes.writeUInt16BE(3, cmap.offset + 6);
  bytes.writeUInt32BE(20, cmap.offset + 8);
  bytes.writeUInt16BE(3, cmap.offset + 12);
  bytes.writeUInt16BE(1, cmap.offset + 14);
  bytes.writeUInt32BE(20, cmap.offset + 16);
  bytes.writeUInt16BE(4, at);
  bytes.writeUInt16BE(length, at + 2);
  bytes.writeUInt16BE(count * 2, at + 6);
  const power = 2 ** Math.floor(Math.log2(count));
  bytes.writeUInt16BE(power * 2, at + 8);
  bytes.writeUInt16BE(Math.log2(power), at + 10);
  bytes.writeUInt16BE(count * 2 - power * 2, at + 12);
  for (const [index, point] of [...points, 0xffff].entries()) {
    bytes.writeUInt16BE(point, at + 14 + index * 2);
    bytes.writeUInt16BE(point, at + 16 + count * 2 + index * 2);
    bytes.writeUInt16BE(
      ((point === 0xffff ? 0 : original.glyph(point)) - point) & 0xffff,
      at + 16 + count * 4 + index * 2,
    );
  }
  resign(bytes);
  return fontAsset(bytes);
}
test("font coverage reports graphemes, variations and bounded missing text instead of certifying fallback from FontFace loading", () => {
  const font = fontAsset(),
    report = assertTextCoverage("ação cafe\u0301\nTexto", [font]);
  expect(report.covered).toBe(true);
  expect(report.usedFontIds).toEqual([font.id]);
  const missing = inspectTextCoverage("中中 😀 👩‍👩‍👧‍👦", [font]);
  expect(missing.missingCount).toBe(4);
  expect(missing.missing).toHaveLength(3);
  expect(missing.missing[0]?.codePoints).toEqual([0x4e2d]);
  expect(missing.missing[1]?.codePoints).toEqual([0x1f600]);
  expect(missing.missing[2]?.text).toBe("👩‍👩‍👧‍👦");
  expect(inspectTextCoverage("A\ufe0f", [font]).missingCount).toBe(1);
  expect(() => assertTextCoverage("中", [font])).toThrow(/U\+4E2D/);
  expect(() => inspectTextCoverage("A", [font], { remaining: 0 })).toThrow(/orçamento/);
  expect(() => inspectTextCoverage("A", [font, font])).toThrow(/distintas/);
  expect(() => inspectTextCoverage("\ud800", [font])).toThrow(/XML/);
});
test("embedded fallback covers an entire grapheme in one font and never unions partial combining coverage", () => {
  const base = narrowedFont([0x65]),
    mark = narrowedFont([0x301]),
    whole = narrowedFont([0x65, 0x301]);
  expect(inspectTextCoverage("e\u0301", [base, mark]).missingCount).toBe(1);
  const report = assertTextCoverage("ee\u0301e", [base, whole]);
  expect(report.covered).toBe(true);
  expect(report.graphemes).toBe(3);
  expect(report.usedFontIds).toEqual([base.id, whole.id]);
});
test("coverage shares verified byte ownership across clones/renames and propagates integrity or unsupported-map failures", () => {
  const font = fontAsset(),
    map = fontCharacterMap(font),
    clone = parseAsset(font);
  if (clone.kind !== "font") throw new Error("Missing cloned font");
  clone.name = "Renamed";
  expect(fontCharacterMap(clone)).toBe(map);
  clone.weight = clone.weight + 1;
  expect(() => fontCharacterMap(clone)).toThrow(/Metadados/);
  const bytes = fixture(),
    cmap = table(bytes, "cmap"),
    subtable = bytes.readUInt32BE(cmap.offset + 8);
  bytes.writeUInt16BE(6, cmap.offset + subtable);
  resign(bytes);
  const unsupported = fontAsset(bytes);
  expect(inspectTextCoverage("A", [unsupported]).unsupportedFontIds).toEqual([unsupported.id]);
  expect(inspectTextCoverage("A", [font, unsupported]).covered).toBe(false);
  expect(() => assertTextCoverage("A", [unsupported])).toThrow(/cmap/);
  const corrupt = fixture();
  corrupt.writeUInt32BE(0xffffffff, table(corrupt, "cmap").offset + 8);
  resign(corrupt);
  expect(() => inspectTextCoverage("A", [fontAsset(corrupt)])).toThrow(/limites/);
});
test("single-face OpenType validates real font bytes, checksums, metrics and declared editable embedding", () => {
  const bytes = fixture(),
    info = inspectFont(bytes);
  expect(info.family).toBe("Noto Sans");
  expect(info.format).toBe("truetype");
  expect(info.unitsPerEm).toBe(1000);
  expect(info.embedding).toBe(0);
  expect(info.weight).toBe(400);
  expect(info.glyphs).toBeGreaterThan(1000);
  const changed = Buffer.from(bytes);
  changed[500] = (changed[500] ?? 0) ^ 1;
  expect(() => inspectFont(changed)).toThrow(/Checksum/);
  expect(() => inspectFont(bytes.subarray(0, 100))).toThrow(/Diretório/);
  const restricted = Buffer.from(bytes);
  restricted.writeUInt16BE(2, table(restricted, "OS/2").offset + 8);
  resign(restricted);
  expect(() => inspectFont(restricted)).toThrow(/restrita/);
  const readonly = Buffer.from(bytes);
  readonly.writeUInt16BE(4, table(readonly, "OS/2").offset + 8);
  resign(readonly);
  expect(() => inspectFont(readonly)).toThrow(/somente leitura/);
  const noSubset = Buffer.from(bytes);
  noSubset.writeUInt16BE(0x100, table(noSubset, "OS/2").offset + 8);
  resign(noSubset);
  expect(inspectFont(noSubset).embedding).toBe(0x100);
  const collection = Buffer.from(bytes);
  collection.write("ttcf", 0, "ascii");
  expect(() => inspectFont(collection)).toThrow(/única face/);
});
