import assert from "node:assert/strict";
import { test } from "node:test";
import { baseLayer, type Doc, IDENTITY } from "../src/shared/doc.ts";
import { decodeArchive, encodeArchive, validateDimensions } from "../src/shared/documentFormat.ts";

const doc = (): Doc => ({
  id: "d",
  name: "Example",
  width: 100,
  height: 100,
  layers: [
    {
      ...baseLayer("Image"),
      kind: "raster",
      bitmap: "b",
      width: 100,
      height: 100,
      transform: IDENTITY,
    },
  ],
});
const image = new Uint8Array([1, 2, 3]);
test("archive roundtrip preserves model, compatible fields, and binary references", () => {
  const model = { ...doc(), compatible: "preserved" };
  const archive = encodeArchive(model, new Map([["b", image]]));
  const parsed = decodeArchive(archive);
  assert.deepEqual(parsed.doc, model);
  assert.deepEqual(parsed.bitmaps.get("b"), image);
  assert.deepEqual(
    decodeArchive(new Uint8Array(new Uint8Array([0, ...archive]).buffer, 1)).doc,
    model,
  );
});
test("invalid dimensions, duplicate layers and missing bitmaps cannot be saved", () => {
  assert.throws(() => encodeArchive(doc(), new Map()), /ausente/);
  assert.throws(() => encodeArchive({ ...doc(), width: -10 }, new Map([["b", image]])), /inválido/);
  const d = doc();
  assert.throws(
    () => encodeArchive({ ...d, layers: [...d.layers, ...d.layers] }, new Map([["b", image]])),
    /repetidos/,
  );
  for (const dims of [
    [0, 10],
    [1.5, 10],
    [8193, 10],
    [8192, 8192],
  ])
    assert.throws(() => validateDimensions(dims[0], dims[1]));
});
test("truncated headers, JSON and binary chunks are rejected", () => {
  const archive = encodeArchive(doc(), new Map([["b", image]]));
  for (const size of [0, 8, 11, 20, archive.length - 1])
    assert.throws(() => decodeArchive(archive.subarray(0, size)));
  new DataView(archive.buffer).setUint32(8, 0xffffffff, true);
  assert.throws(() => decodeArchive(archive), /incompleto/);
});
test("future versions and out-of-range or overlapping indexes are rejected", () => {
  const meta = { format: "edifoto", version: 999, doc: doc(), bitmaps: { b: [0, 3] } };
  const pack = () => {
    const json = new TextEncoder().encode(JSON.stringify(meta));
    const bytes = new Uint8Array(12 + json.length + 3);
    bytes.set(new TextEncoder().encode("EDIFOTO1"));
    new DataView(bytes.buffer).setUint32(8, json.length, true);
    bytes.set(json, 12);
    return bytes;
  };
  assert.throws(() => decodeArchive(pack()), /compatível/);
  meta.version = 1;
  meta.bitmaps.b = [3, 3];
  assert.throws(() => decodeArchive(pack()), /incompleta/);
});
