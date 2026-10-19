import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { inspectEditableFont } from "../src/shared/font-file.ts";

function table(
  bytes: Uint8Array,
  wanted: string,
): { offset: number; length: number; entry: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let entry = 12; entry < 12 + view.getUint16(4) * 16; entry += 16) {
    const tag = new TextDecoder().decode(bytes.subarray(entry, entry + 4));
    if (tag === wanted)
      return { offset: view.getUint32(entry + 8), length: view.getUint32(entry + 12), entry };
  }
  throw new Error(`Fixture table missing: ${wanted}`);
}
const source = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
);
test("all bundled static TrueType faces have bounded contours and editable embedding rights", async () => {
  for (const face of ["Regular", "Bold", "Italic", "BoldItalic"]) {
    const bytes = new Uint8Array(
        await readFile(new URL(`../resources/fonts/NotoSans-${face}.ttf`, import.meta.url)),
      ),
      original = new Uint8Array(bytes);
    const info = inspectEditableFont(bytes);
    assert.ok(info.glyphs > 1000);
    assert.equal(info.unitsPerEm, 1000);
    assert.equal(info.embedding, "installable");
    assert.equal(info.subset, true);
    assert.deepEqual(bytes, original);
  }
});
test("imported font rights, truncated tables and recursive composite glyphs are rejected before parsing", () => {
  const os2 = table(source, "OS/2");
  for (const rights of [2, 4, 512, 6, 0x8000]) {
    const bytes = new Uint8Array(source),
      view = new DataView(bytes.buffer);
    view.setUint16(os2.offset + 8, rights);
    assert.throws(() => inspectEditableFont(bytes), /incorporação|Permissão/);
  }
  const editable = new Uint8Array(source);
  new DataView(editable.buffer).setUint16(os2.offset + 8, 8 | 256);
  assert.equal(inspectEditableFont(editable).subset, false);
  assert.equal(inspectEditableFont(editable).embedding, "editable");
  const truncated = new Uint8Array(source);
  new DataView(truncated.buffer).setUint32(table(truncated, "name").entry + 12, truncated.length);
  assert.throws(() => inspectEditableFont(truncated), /fora do arquivo/);
  const overlap = new Uint8Array(source);
  new DataView(overlap.buffer).setUint32(
    table(overlap, "name").entry + 8,
    table(overlap, "post").offset,
  );
  assert.throws(() => inspectEditableFont(overlap), /sobrepõem/);
  const recursive = new Uint8Array(source),
    view = new DataView(recursive.buffer),
    head = table(recursive, "head"),
    loca = table(recursive, "loca"),
    glyf = table(recursive, "glyf"),
    maxp = table(recursive, "maxp");
  const long = view.getInt16(head.offset + 50) === 1;
  let modified = false;
  for (let glyph = 0; glyph < view.getUint16(maxp.offset + 4); glyph++) {
    const offset = long
      ? view.getUint32(loca.offset + glyph * 4)
      : view.getUint16(loca.offset + glyph * 2) * 2;
    if (view.getInt16(glyf.offset + offset) !== -1) continue;
    view.setUint16(glyf.offset + offset + 12, glyph);
    modified = true;
    break;
  }
  assert.equal(modified, true);
  assert.throws(() => inspectEditableFont(recursive), /cíclicos/);
  assert.throws(() => inspectEditableFont(new Uint8Array([0, 1, 2])), /8 MB/);
});
