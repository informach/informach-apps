import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAssetData, inspectFont } from "@informach/edi-motion/assets";
import { zlibSync } from "fflate";
import { arabicFontFixture, fontFixture, sliceImageFixture } from "../../tests/assetFixtures";
import { prepareAssetImport } from "../renderer/src/asset-import";
import { executeDocumentTransaction } from "./documentCommands";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { newProject } from "./project";

/** SFNT tables of a fixture font, for repacking in test memory. */
function tables(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: view.getUint16(4) }, (_, index) => {
    const at = 12 + index * 16;
    return {
      tag: String.fromCharCode(...bytes.subarray(at, at + 4)),
      checksum: view.getUint32(at + 4),
      data: bytes.subarray(
        view.getUint32(at + 8),
        view.getUint32(at + 8) + view.getUint32(at + 12),
      ),
    };
  });
}
function woff(source: Uint8Array) {
  // WOFF stores a table raw when compression would not make it smaller.
  const entries = tables(source).map((table) => {
      const compressed = zlibSync(table.data);
      return { ...table, stored: compressed.length < table.data.length ? compressed : table.data };
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
    view.setUint32(at + 16, entry.checksum);
    output.set(entry.stored, offset);
    offset += Math.ceil(entry.stored.length / 4) * 4;
  }
  return output;
}
function collection(faces: Uint8Array[]) {
  const parts = faces.map(tables),
    header = 12 + faces.length * 4,
    directories = parts.map((list) => 12 + list.length * 16),
    start = header + directories.reduce((sum, value) => sum + value, 0),
    size = parts.flat().reduce((sum, table) => sum + Math.ceil(table.data.length / 4) * 4, start),
    output = new Uint8Array(size),
    view = new DataView(output.buffer);
  output.set([0x74, 0x74, 0x63, 0x66]);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, faces.length);
  let cursor = start,
    directory = header;
  for (const [face, list] of parts.entries()) {
    view.setUint32(12 + face * 4, directory);
    view.setUint32(directory, 0x00010000);
    view.setUint16(directory + 4, list.length);
    for (const [index, table] of list.entries()) {
      const at = directory + 12 + index * 16;
      for (let character = 0; character < 4; character++)
        output[at + character] = table.tag.charCodeAt(character);
      view.setUint32(at + 4, table.checksum);
      view.setUint32(at + 8, cursor);
      view.setUint32(at + 12, table.data.length);
      output.set(table.data, cursor);
      cursor += Math.ceil(table.data.length / 4) * 4;
    }
    directory += directories[face] ?? 0;
  }
  return output;
}
const bytes = (font: { data: string }) => decodeAssetData(font.data);

test("WOFF and collection faces import as standalone TTF assets", async () => {
  const signal = new AbortController().signal,
    fromWoff = await prepareAssetImport(woff(bytes(fontFixture())), "Noto.woff", signal);
  assert.equal(fromWoff.kind, "font");
  if (fromWoff.kind !== "font") return;
  assert.equal(fromWoff.asset.family, "Noto Sans");
  assert.equal(fromWoff.asset.mime, "font/ttf");
  assert.match(fromWoff.conversion, /WOFF será descompactado/);
  assert.equal(inspectFont(decodeAssetData(fromWoff.asset.data)).family, "Noto Sans");
  const packed = collection([bytes(fontFixture()), bytes(arabicFontFixture())]),
    first = await prepareAssetImport(packed, "Noto.ttc", signal),
    second = await prepareAssetImport(packed, "Noto.ttc", signal, 1);
  assert.ok(first.kind === "font" && second.kind === "font");
  if (first.kind !== "font" || second.kind !== "font") return;
  assert.deepEqual(
    first.collection?.faces.map((face) => face.family),
    ["Noto Sans", "Noto Sans Arabic"],
  );
  assert.equal(second.asset.family, "Noto Sans Arabic");
  const woff2 = new Uint8Array(64);
  woff2.set([0x77, 0x4f, 0x46, 0x32]);
  await assert.rejects(prepareAssetImport(woff2, "x.woff2", signal), /WOFF2/);
});

test("Lottie accepts plain PNG images and refuses nine-slice, meshes and slice fits", () => {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
      return result;
    },
    image = sliceImageFixture();
  run([
    { type: "asset", operation: "put", value: image },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: { id: "animation-x", name: "X", fps: 10, frames: 10, mode: "once", tracks: [] },
      },
    },
  ]);
  const id = run([{ type: "asset", operation: "insert-image", assetId: image.id }]).selected;
  assert.ok(id);
  const board = project.artboards[0];
  assert.ok(board);
  const report = () =>
    inspectLottieCompatibility(project, {
      artboardId: board.id,
      animationId: "animation-x",
      alt: "X",
    });
  assert.equal(report().supported, true);
  assert.ok(report().issues.some((issue) => issue.code === "image-profile"));
  run([
    {
      type: "scene",
      operation: "attrs",
      targetId: id,
      value: { preserveAspectRatio: "xMidYMid slice" },
    },
  ]);
  assert.match(report().issues[0]?.message ?? "", /slice recorta/);
  run([
    { type: "scene", operation: "attrs", targetId: id, value: { preserveAspectRatio: "none" } },
    { type: "scene", operation: "image-mesh", targetId: id, value: { columns: 2, rows: 2 } },
  ]);
  assert.match(report().issues[0]?.message ?? "", /malha raster/);
});
