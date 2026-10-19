import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, Zip, ZipDeflate, zipSync } from "fflate";
import { officeDocumentSchema, spreadsheetSchema } from "../src/shared/office-format.ts";
import { readOfficePackage, writeOfficePackage } from "../src/shared/office-package.ts";
import { parseOfficeXml, xml } from "../src/shared/office-xml.ts";

test("Office package preserves binary/XML bytes and validates actual decompressed size and CRC", () => {
  const original = {
    "[Content_Types].xml": strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ),
    "word/document.xml": strToU8("<document>Ação &amp; informação</document>"),
    "word/media/image.bin": new Uint8Array([0, 255, 12, 33]),
  };
  const bytes = writeOfficePackage(original),
    result = readOfficePackage(bytes);
  assert.deepEqual(result.get("word/document.xml"), original["word/document.xml"]);
  assert.deepEqual(result.get("word/media/image.bin"), original["word/media/image.bin"]);
  assert.equal(
    parseOfficeXml(result.get("word/document.xml") ?? new Uint8Array()).documentElement
      ?.textContent,
    "Ação & informação",
  );
  const corrupt = bytes.slice(),
    view = new DataView(corrupt.buffer);
  for (let i = 0; i < corrupt.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 16, 12345, true);
      break;
    }
  assert.throws(() => readOfficePackage(corrupt), /CRC/);
  assert.throws(() => readOfficePackage(bytes.subarray(0, bytes.length - 22)), /diretório/);
});

test("Office import rejects traversal, case-colliding parts, macros and dishonest expansion", () => {
  for (const parts of [
    { "../document.xml": strToU8("x") },
    { "word/Document.xml": strToU8("x"), "word/document.xml": strToU8("y") },
    { "word/vbaProject.bin": new Uint8Array([1, 2]) },
    { "word/activeX/control.xml": strToU8("x") },
  ])
    assert.throws(() => readOfficePackage(zipSync(parts)));
  const bytes = zipSync({ "large.xml": new Uint8Array(1024 * 1024).fill(65) }),
    view = new DataView(bytes.buffer);
  view.setUint32(22, 100, true); // Both headers lie; the streamed expansion must still be bounded.
  for (let i = 0; i < bytes.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 100, true);
      break;
    }
  assert.throws(() => readOfficePackage(bytes), /Expansão/);
});

test("Office ZIP rejects unsupported flags, split entry counts and local header mismatches", () => {
  const original = zipSync({ "word/document.xml": strToU8("<document>Complete</document>") });
  const initial = new DataView(original.buffer),
    end = original.length - 22,
    central = initial.getUint32(end + 16, true);
  for (const mutate of [
    (view: DataView) => view.setUint16(central + 8, 0x40, true),
    (view: DataView) => view.setUint16(central + 34, 1, true),
    (view: DataView) => view.setUint16(end + 8, 0, true),
    (view: DataView) => view.setUint16(6, 0x8000, true),
    (view: DataView) => view.setUint32(22, 999, true),
    (view: DataView) => view.setUint32(central + 42, central - 4, true),
    (view: DataView) => view.setUint8(30, 88),
  ]) {
    const bytes = new Uint8Array(original);
    mutate(new DataView(bytes.buffer));
    assert.throws(() => readOfficePackage(bytes), /ZIP|Office|Pacote/);
  }
});
test("Office ZIP accepts real streaming descriptors and rejects a dishonest descriptor", () => {
  const chunks: Uint8Array[] = [];
  let finished = false;
  const archive = new Zip((error, data, final) => {
    if (error) throw error;
    chunks.push(data);
    finished = final;
  });
  const file = new ZipDeflate("word/document.xml");
  archive.add(file);
  const original = strToU8("<document>STREAMED_LOCAL</document>");
  file.push(original, true);
  archive.end();
  assert.equal(finished, true);
  const bytes = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of chunks) {
    bytes.set(part, at);
    at += part.length;
  }
  assert.deepEqual(readOfficePackage(bytes).get("word/document.xml"), original);
  const view = new DataView(bytes.buffer),
    end = bytes.length - 22,
    central = view.getUint32(end + 16, true),
    descriptor =
      30 + view.getUint16(26, true) + view.getUint16(28, true) + view.getUint32(central + 20, true);
  assert.equal(view.getUint32(descriptor, true), 0x08074b50);
  view.setUint32(descriptor + 4, 1, true);
  assert.throws(() => readOfficePackage(bytes), /Descritor/);
});

test("Office XML rejects DTD/entities, malformed markup and deep trees without recovering altered content", () => {
  assert.equal(xml('Ação <&> "teste"'), "Ação &lt;&amp;&gt; &quot;teste&quot;");
  assert.throws(() => xml("A\u0000B"), /caractere/);
  for (const source of [
    '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///private">]><x>&secret;</x>',
    "<x><y></x>",
    "<x>&unknown;</x>",
    "<x>".repeat(102) + "</x>".repeat(102),
  ])
    assert.throws(() => parseOfficeXml(strToU8(source)));
});

test("Office output keeps a stored first MIME part, rejects prototype names and preserves the same XML read limit", () => {
  const parts = Object.fromEntries([
    ["mimetype", strToU8("application/test")],
    ["content.xml", strToU8("<x/>")],
  ]);
  const bytes = writeOfficePackage(parts, { uncompressed: ["mimetype"] }),
    view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(8, true), 0);
  assert.equal(view.getUint16(28, true), 0);
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 38)), "mimetype");
  assert.throws(
    () => writeOfficePackage(Object.fromEntries([["__proto__", strToU8("literal")]])),
    /Nome de parte/,
  );
  assert.throws(
    () => writeOfficePackage({ "content.xml": new Uint8Array(8 * 1024 * 1024 + 1) }),
    /8 MB/,
  );
  assert.throws(
    () => writeOfficePackage({ "x.xml": strToU8("<x/>") }, { uncompressed: ["toString"] }),
    /ausente/,
  );
  const caseParts = readOfficePackage(
    zipSync({ "Pictures/A.bin": new Uint8Array([1]), "Pictures/a.bin": new Uint8Array([2]) }),
    { caseSensitive: true },
  );
  assert.deepEqual(caseParts.get("Pictures/A.bin"), new Uint8Array([1]));
  assert.deepEqual(caseParts.get("Pictures/a.bin"), new Uint8Array([2]));
});

test("Office contracts bound cells, preserve literal types and reject duplicate or invalid sheet names", () => {
  const spreadsheet = spreadsheetSchema.parse([
    { name: "Dados", rows: [["=SUM(A1:A2)", 12.5, true, null]], header: false },
  ]);
  assert.deepEqual(spreadsheet[0].rows[0], ["=SUM(A1:A2)", 12.5, true, null]);
  assert.equal(
    spreadsheetSchema.safeParse([
      { name: "A", rows: [] },
      { name: "a", rows: [] },
    ]).success,
    false,
  );
  assert.equal(spreadsheetSchema.safeParse([{ name: "A\u0000B", rows: [] }]).success, false);
  assert.equal(
    officeDocumentSchema.safeParse({ title: "x", pages: [], warnings: [] }).success,
    false,
  );
});
