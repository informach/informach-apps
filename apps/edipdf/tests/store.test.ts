import assert from "node:assert/strict";
import { test } from "node:test";
import {
  commit,
  type DocState,
  isDirty,
  patchDoc,
  redo,
  undo,
  useApp,
} from "../src/renderer/src/state/store.ts";
import type { DocContent } from "../src/shared/model.ts";

function setup(): void {
  const content: DocContent = {
    pages: [0, 1, 2].map((i) => ({
      id: `p${i}`,
      src: "",
      index: 0,
      rotation: 0,
      blank: { w: 600, h: 800 },
    })),
    annots: [],
    forms: {},
    meta: {},
    watermark: null,
    pageNumbers: null,
  };
  const doc: DocState = {
    id: "doc",
    name: "test.pdf",
    path: "test.pdf",
    primary: null,
    sourceIds: [],
    content,
    saved: content,
    past: [],
    future: [],
    selection: ["p2"],
    selectedAnnot: null,
    openNote: null,
    draft: null,
    zoom: 1,
    fit: "width",
    currentPage: 2,
    view: "organize",
    search: { query: "test", results: [], index: 0, running: false },
    scrollRequest: null,
    hasForms: false,
  };
  useApp.setState({ docs: [doc], activeId: doc.id });
}

test("deleting current page clamps page index, clears stale selection and search", () => {
  setup();
  commit("doc", (c) => ({ ...c, pages: c.pages.slice(0, 1) }));
  const doc = useApp.getState().docs[0];
  assert.equal(doc.currentPage, 0);
  assert.deepEqual(doc.selection, []);
  assert.equal(doc.search, null);
  assert.equal(isDirty(doc), true);
  undo("doc");
  assert.equal(useApp.getState().docs[0].content.pages.length, 3);
  assert.equal(isDirty(useApp.getState().docs[0]), false);
  redo("doc");
  assert.equal(useApp.getState().docs[0].content.pages.length, 1);
});

test("edits after a save snapshot remain dirty and undo restores saved state", () => {
  setup();
  const saved = useApp.getState().docs[0].content;
  commit("doc", (c) => ({ ...c, meta: { title: "Changed during save" } }));
  patchDoc("doc", { saved });
  assert.equal(isDirty(useApp.getState().docs[0]), true);
  undo("doc");
  assert.equal(isDirty(useApp.getState().docs[0]), false);
});
