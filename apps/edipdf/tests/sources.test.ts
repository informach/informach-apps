import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSources, revisionSources } from "../src/shared/document-sources.ts";
import type { DocContent } from "../src/shared/model.ts";

const content = (src: string): DocContent => ({
  baseSource: src,
  pages: [{ id: "page", src, index: 0, rotation: 0 }],
  annots: [],
  forms: {},
  meta: {},
  watermark: null,
  pageNumbers: null,
});
test("source lifecycle preserves current, saved, undo and redo revisions while excluding evicted versions", () => {
  const document = {
    primary: "original",
    content: content("current"),
    saved: content("saved"),
    past: [content("undo")],
    future: [content("redo")],
  };
  assert.deepEqual([...revisionSources(document)].sort(), [
    "current",
    "original",
    "redo",
    "saved",
    "undo",
  ]);
  assert.deepEqual([...contentSources(document.content)], ["current"]);
  document.past = [];
  assert.equal(revisionSources(document).has("undo"), false);
});
