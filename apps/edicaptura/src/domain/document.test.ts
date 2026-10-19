import assert from "node:assert/strict";
import { test } from "node:test";
import { imageEditSchema, parseDocument } from "./document.ts";

test("legacy projects receive a version and stable annotation identities without changing content", () => {
  const doc = parseDocument({
    id: crypto.randomUUID(),
    name: "Legacy",
    kind: "image",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    annotations: [{ kind: "text", x: 1, y: 2, text: "Original" }],
  });
  assert.equal(doc.version, 1);
  assert.equal(doc.annotations[0]?.kind, "text");
  assert.ok(doc.annotations[0]?.id);
  assert.equal(parseDocument(doc).annotations[0]?.id, doc.annotations[0]?.id);
});
test("malformed annotation coordinates, unsupported versions and invalid crops are rejected", () => {
  assert.equal(
    imageEditSchema.safeParse({
      annotations: [{ kind: "arrow", x: NaN, y: 1, x2: 2, y2: 3 }],
      crop: null,
    }).success,
    false,
  );
  assert.equal(
    imageEditSchema.safeParse({ annotations: [], crop: { x: 0, y: 0, width: -1, height: 4 } })
      .success,
    false,
  );
  assert.throws(() => parseDocument({ version: 2 }), /Metadados/);
});
