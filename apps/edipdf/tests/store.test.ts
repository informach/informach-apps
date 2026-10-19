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

test("deleting current page clamps page index, clears stale selection and requests a fresh search", () => {
  setup();
  commit("doc", (c) => ({ ...c, pages: c.pages.slice(0, 1) }));
  const doc = useApp.getState().docs[0];
  assert.equal(doc.currentPage, 0);
  assert.deepEqual(doc.selection, []);
  assert.deepEqual(doc.search?.results, []);
  assert.equal(doc.search?.running, true);
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

test("uncommitted text is pending work, including deletion of an existing annotation", () => {
  setup();
  const annot = {
    id: "t",
    page: "p0",
    kind: "text",
    x: 10,
    y: 10,
    text: "Rascunho",
    font: "helvetica",
    size: 14,
    color: "#000000",
  } as const;
  patchDoc("doc", { draft: { annot } });
  assert.equal(isDirty(useApp.getState().docs[0]), true);
  patchDoc("doc", { draft: { annot: { ...annot, text: "" } } });
  assert.equal(isDirty(useApp.getState().docs[0]), false);
  patchDoc("doc", { draft: { annot, before: annot, existing: true } });
  assert.equal(isDirty(useApp.getState().docs[0]), false);
  patchDoc("doc", { draft: { annot: { ...annot, text: "" }, before: annot, existing: true } });
  assert.equal(isDirty(useApp.getState().docs[0]), true);
});

test("typing in one field is one undo group and a new focus session starts another", () => {
  setup();
  for (const value of ["a", "ab", "abc"])
    commit("doc", (content) => ({ ...content, forms: { name: value } }), {
      historyGroup: "form:name",
    });
  assert.equal(useApp.getState().docs[0].past.length, 1);
  patchDoc("doc", { historyGroup: null });
  commit("doc", (content) => ({ ...content, forms: { name: "abcd" } }), {
    historyGroup: "form:name",
  });
  undo("doc");
  assert.equal(useApp.getState().docs[0].content.forms.name, "abc");
  undo("doc");
  assert.deepEqual(useApp.getState().docs[0].content.forms, {});
});
