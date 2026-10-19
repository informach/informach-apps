import assert from "node:assert/strict";
import { test } from "node:test";
import { executeDocumentTransaction } from "../src/shared/document-commands.ts";
import type { DocContent } from "../src/shared/model.ts";

test("document batches validate all commands and preserve the old revision on failure", () => {
  const content: DocContent = {
    pages: [
      { id: "one", src: "a", index: 0, rotation: 0 },
      { id: "two", src: "a", index: 1, rotation: 0 },
    ],
    annots: [],
    forms: {},
    meta: {},
    watermark: null,
    pageNumbers: null,
  };
  const before = structuredClone(content);
  assert.throws(
    () =>
      executeDocumentTransaction(content, [
        { type: "pages.delete", ids: ["one"] },
        { type: "pages.delete", ids: ["two"] },
      ]),
    /página/,
  );
  assert.deepEqual(content, before);
  assert.throws(
    () => executeDocumentTransaction(content, [{ type: "pages.move", ids: ["missing"], to: 0 }]),
    /inválido/,
  );
  const moved = executeDocumentTransaction(content, [
    { type: "pages.move", ids: ["two"], to: 0 },
    { type: "metadata.set", metadata: { title: "Organizado" } },
  ]);
  assert.equal(moved.pages[0].id, "two");
  assert.equal(moved.meta.title, "Organizado");
  assert.deepEqual(content, before);
  assert.throws(() =>
    executeDocumentTransaction(content, [
      {
        type: "annotations.add",
        annotations: [
          { id: "x", page: "missing", kind: "note", x: 0, y: 0, text: "note", color: "#000000" },
        ],
      },
    ]),
  );
});
