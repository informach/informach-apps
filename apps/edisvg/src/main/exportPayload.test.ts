import assert from "node:assert/strict";
import { test } from "node:test";
import { exportFileName, parseExportPayload } from "./exportPayload";

test("export IPC supports only named text/ZIP profiles, bounds decoding and refuses client paths/noncanonical encodings", () => {
  assert.deepEqual(parseExportPayload({ extension: "lottie.json", content: '{"v":"5.13.0"}' }), {
    extension: "lottie.json",
    content: '{"v":"5.13.0"}',
  });
  assert.deepEqual(parseExportPayload({ extension: "svg", content: "<svg/>" }), {
    extension: "svg",
    content: "<svg/>",
  });
  const archive = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 255]);
  assert.deepEqual(
    parseExportPayload({
      extension: "react.zip",
      encoding: "base64",
      content: archive.toString("base64"),
    }).content,
    archive,
  );
  for (const value of [
    { extension: "exe", content: "bad" },
    { extension: "json", content: "bad" },
    { extension: "react.zip", content: "PK" },
    { extension: "react.zip", encoding: "base64", content: "AAAA" },
    { extension: "react.zip", encoding: "base64", content: "UEsDBAAA\n" },
    { extension: "svg", content: "ok", path: "C:/arbitrary" },
    { extension: "html", content: "ã".repeat(5000001) },
  ])
    assert.throws(() => parseExportPayload(value));
});

test("raster and video bytes are not accepted in a single export message", () => {
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 0, 0x3b]);
  assert.throws(() => parseExportPayload({ extension: "gif", bytes: gif, encoding: "binary" }));
});

test("the Save dialog proposes the project's file name, then the animation", () => {
  const path = "C:\\Users\\ana\\Documents\\Personagem.edisvg";
  assert.equal(exportFileName(path), "Personagem");
  assert.equal(exportFileName(path, "Aceno"), "Personagem - Aceno");
  assert.equal(
    exportFileName(path, "Aula 3 (começa em 0m12,5s)"),
    "Personagem - Aula 3 (começa em 0m12,5s)",
  );
  // Already named after the project: not twice.
  assert.equal(exportFileName(path, "Personagem final"), "Personagem final");
  assert.equal(exportFileName("/home/ana/Cena.EDISVG", "Pulo"), "Cena - Pulo");
  // Never saved: the suggestion alone, or the old default.
  assert.equal(exportFileName(null, "Aceno"), "Aceno");
  assert.equal(exportFileName(null), "projeto");
  // Within 120 characters, with no trailing dot or space after the cut.
  const long = exportFileName(path, `${"a".repeat(105)} .b`);
  assert.equal(long.length <= 120, true);
  assert.equal(/[. ]$/.test(long), false);
});
