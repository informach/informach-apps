import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExportPayload } from "./exportPayload";

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

test("raster and video exports cross IPC as bytes checked against their own format signature", () => {
  const media = {
    gif: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 0, 0x3b]),
    mp4: Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    webm: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]),
    "png.zip": Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
  };
  for (const [extension, bytes] of Object.entries(media)) {
    const parsed = parseExportPayload({ extension, bytes, encoding: "binary" });
    assert.equal(parsed.extension, extension);
    assert.deepEqual(Buffer.from(parsed.content), Buffer.from(bytes));
  }
  for (const value of [
    { extension: "gif", bytes: media.mp4, encoding: "binary" },
    { extension: "mp4", bytes: media.webm, encoding: "binary" },
    { extension: "webm", bytes: media.gif, encoding: "binary" },
    { extension: "png.zip", bytes: media.gif, encoding: "binary" },
    { extension: "gif", bytes: media.gif.subarray(0, 6), encoding: "binary" },
    { extension: "gif", bytes: media.gif, encoding: "binary", path: "C:/arbitrary" },
    { extension: "gif", bytes: media.gif, encoding: "binary", content: "x" },
    { extension: "react.zip", bytes: media["png.zip"], encoding: "binary" },
    { extension: "gif", bytes: Array.from(media.gif), encoding: "binary" },
    { extension: "gif", bytes: media.gif },
  ])
    assert.throws(() => parseExportPayload(value));
});
