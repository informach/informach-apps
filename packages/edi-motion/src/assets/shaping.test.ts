import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { inspectFont, inspectFontLayoutScripts } from "./font";
import { assertTextCoverage, inspectTextCoverage } from "./fontCoverage";
import { assetId, encodeAssetData, type FontAsset, parseAsset } from "./model";
import { shapingScript } from "./shapingScripts";

function packed(name: string, hash: string, limit: number) {
  const text = readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url), "utf8"),
    bytes = gunzipSync(Buffer.from(text.replace(/\s/g, ""), "base64"), {
      maxOutputLength: limit,
    });
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
  return bytes;
}
const arabic = () =>
    packed(
      "NotoSansArabic-Regular.ttf.gz.base64",
      "ceea25b464a656dc3b26849bab9356740401af62aedf1bfa8b7f0d9b75925b1b",
      300000,
    ),
  latin = () =>
    packed(
      "NotoSans-Regular.ttf.gz.base64",
      "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5",
      600000,
    );
function table(bytes: Buffer, tag: string) {
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const at = 12 + index * 16;
    if (bytes.toString("ascii", at, at + 4) === tag)
      return { offset: bytes.readUInt32BE(at + 8), length: bytes.readUInt32BE(at + 12) };
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
/** Re-checksums a font edited in test memory, as the loader verifies them. */
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
  return bytes;
}
/** Renames GSUB records (feature list at +6, script list at +4); glyphs and
 * lookups stay intact, but a shaper no longer applies a renamed feature. */
function rename(bytes: Buffer, list: 4 | 6, from: readonly string[], to: string) {
  const gsub = table(bytes, "GSUB"),
    at = gsub.offset + bytes.readUInt16BE(gsub.offset + list);
  for (let index = 0; index < bytes.readUInt16BE(at); index++) {
    const record = at + 2 + index * 6;
    if (from.includes(bytes.toString("ascii", record, record + 4)))
      bytes.write(to, record, "ascii");
  }
  return resign(bytes);
}
function fontAsset(bytes: Buffer): FontAsset {
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
const greeting = "مرحبا بالعالم";

test("layout scripts list the default features GSUB/GPOS apply, per real font", () => {
  const arabicScripts = inspectFontLayoutScripts(arabic()),
    latinScripts = inspectFontLayoutScripts(latin());
  expect([...(arabicScripts.substitution.get("arab") ?? [])]).toEqual(
    expect.arrayContaining(["init", "medi", "fina"]),
  );
  expect(arabicScripts.positioning.get("arab")?.has("mark")).toBe(true);
  expect(latinScripts.substitution.get("latn")?.has("liga")).toBe(true);
  expect(latinScripts.substitution.has("arab")).toBe(false);
  expect(shapingScript("ب")?.name).toBe("árabe");
  expect(shapingScript("क्ष")?.tags).toEqual(["dev2", "deva"]);
  expect(shapingScript("A")).toBeUndefined();
  // Presentation forms and the Arabic mathematical alphabet are already isolated glyphs.
  expect(shapingScript("ﺳ")).toBeUndefined();
  expect(shapingScript("\u{1EE00}")).toBeUndefined();
  expect(shapingScript("ש")).toBeUndefined();
});

test("Arabic needs its contextual substitutions; the script record alone is not the test", () => {
  const shaped = fontAsset(arabic());
  expect(inspectTextCoverage(greeting, [shaped])).toMatchObject({
    covered: true,
    unshapedCount: 0,
  });
  // A real Latin font in front keeps Latin; Arabic falls to the font that can shape it.
  expect(inspectTextCoverage(`Olá ${greeting}`, [fontAsset(latin()), shaped]).covered).toBe(true);
  // Without the 'arab' record a shaper falls back to DFLT, which applies the same features.
  expect(
    inspectTextCoverage(greeting, [fontAsset(rename(arabic(), 4, ["arab"], "zzzz"))]).covered,
  ).toBe(true);
  const unjoined = fontAsset(rename(arabic(), 6, ["init", "medi", "fina"], "zzzz")),
    report = inspectTextCoverage(greeting, [unjoined]);
  expect(report.missingCount).toBe(0);
  expect(report.covered).toBe(false);
  expect(report.unshapedCount).toBe(12);
  expect(report.unshaped[0]).toMatchObject({ script: "árabe", fontId: unjoined.id });
  expect(() => assertTextCoverage(greeting, [unjoined])).toThrow(
    /formas contextuais.*GSUB \('arab'\) não aplica/,
  );
  // Latin text in the same font does not need Arabic shaping.
  expect(assertTextCoverage("123", [unjoined]).covered).toBe(true);
});

test("a malformed layout table keeps the font usable and explains the unverified shaping", () => {
  const bytes = arabic(),
    gsub = table(bytes, "GSUB");
  bytes.writeUInt16BE(2, gsub.offset);
  const font = fontAsset(resign(bytes));
  expect(() => inspectFontLayoutScripts(bytes)).toThrow(/GSUB fora do perfil/);
  expect(inspectTextCoverage(greeting, [font]).unshaped[0]?.reason).toMatch(/GSUB fora do perfil/);
});
