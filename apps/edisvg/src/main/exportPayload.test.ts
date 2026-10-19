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
