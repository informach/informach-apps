import assert from "node:assert/strict";
import { test } from "node:test";
import { apiContent, panelImages } from "../src/main/turnImages.ts";

// The first bytes of a PNG and of a JPEG: enough for the check of what the bytes are.
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0xff, 0xd9]);

test("the panel's images reach the engines checked, as the suite takes them", () => {
  assert.deepEqual(panelImages(undefined), []);
  const images = panelImages([
    { mediaType: "image/png", data: png },
    { mediaType: "image/jpeg", data: jpeg },
  ]);
  assert.deepEqual(
    images.map((i) => i.mediaType),
    ["image/png", "image/jpeg"],
  );
  assert.deepEqual(images[0]?.data, png);
  // A type that is not what the bytes are, base64 text in place of bytes, too many.
  assert.throws(() => panelImages([{ mediaType: "image/jpeg", data: png }]), /não é PNG/);
  assert.throws(
    () => panelImages([{ mediaType: "image/png", data: "iVBORw0KGgo=" }]),
    /Imagens inválidas/,
  );
  assert.throws(() => panelImages("x"), /Imagens inválidas/);
  assert.throws(
    () => panelImages(Array.from({ length: 5 }, () => ({ mediaType: "image/png", data: png }))),
    /no máximo 4/,
  );
});

test("with the API key, the images go first in the message, then the text", () => {
  assert.equal(apiContent("Oi", []), "Oi");
  const content = apiContent("Faça assim", panelImages([{ mediaType: "image/png", data: png }]));
  assert.ok(Array.isArray(content));
  assert.deepEqual(content[0], {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") },
  });
  assert.deepEqual(content[1], { type: "text", text: "Faça assim" });
});
