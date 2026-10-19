import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  applyAnnotationCommand,
  pickAnnotationSelection,
} from "../src/shared/annotation-commands.ts";
import { buildPdf } from "../src/shared/build.ts";
import type { DocContent } from "../src/shared/model.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";

const content = (): DocContent => ({
  pages: [{ id: "p", src: "a", index: 0, rotation: 0 }],
  annots: [
    {
      id: "a",
      page: "p",
      kind: "rect",
      x: 10,
      y: 10,
      w: 30,
      h: 40,
      stroke: null,
      fill: "#FF0000",
      width: 0,
    },
    {
      id: "b",
      page: "p",
      kind: "note",
      x: 80,
      y: 50,
      text: "Revisar",
      color: "#F59E0B",
      author: "Ana",
      resolved: true,
    },
    {
      id: "c",
      page: "p",
      kind: "ellipse",
      x: 150,
      y: 100,
      w: 50,
      h: 20,
      stroke: "#000000",
      fill: null,
      width: 1,
    },
  ],
  forms: {},
  meta: {},
  watermark: null,
  pageNumbers: null,
});
test("editing an individual group member preserves the group and leaves its peers untouched", () => {
  const grouped = applyAnnotationCommand(content(), { kind: "group", ids: ["a", "b"] }).content;
  const normal = { additive: false, insideGroup: false },
    inside = { ...normal, insideGroup: true };
  assert.deepEqual(pickAnnotationSelection(grouped.annots, "a", [], normal), ["a", "b"]);
  assert.deepEqual(pickAnnotationSelection(grouped.annots, "a", ["a", "b"], inside), ["a"]);
  const selection = pickAnnotationSelection(grouped.annots, "a", ["b", "c", "stale"], {
    ...inside,
    additive: true,
  });
  assert.deepEqual(selection, ["b", "c", "a"]);
  assert.deepEqual(
    pickAnnotationSelection(grouped.annots, "a", selection, { ...inside, additive: true }),
    ["b", "c"],
  );
  const moved = applyAnnotationCommand(grouped, { kind: "move", ids: ["a"], dx: 5, dy: 7 }).content;
  assert.equal(moved.annots[0]?.group, grouped.annots[0]?.group);
  assert.deepEqual(moved.annots.slice(1), grouped.annots.slice(1));
  assert.deepEqual(pickAnnotationSelection(moved.annots, "a", ["a"], normal), ["a", "b"]);
});

test("annotation commands retain relative order, group copies independently and apply moves atomically", () => {
  const before = content();
  let next = applyAnnotationCommand(before, { kind: "front", ids: ["b", "a"] }).content;
  assert.deepEqual(
    next.annots.map((annot) => annot.id),
    ["c", "a", "b"],
  );
  next = applyAnnotationCommand(next, { kind: "group", ids: ["a", "b"] }).content;
  const group = next.annots[1].group;
  assert.ok(group);
  assert.equal(next.annots[2].group, group);
  const copied = applyAnnotationCommand(next, { kind: "duplicate", ids: ["a", "b"] });
  assert.equal(copied.selection.length, 2);
  assert.notEqual(copied.content.annots[3].group, group);
  assert.equal(copied.content.annots[3].group, copied.content.annots[4].group);
  next = applyAnnotationCommand(next, { kind: "move", ids: ["a", "b"], dx: 20, dy: -5 }).content;
  assert.equal(next.annots[1].kind === "rect" && next.annots[1].x, 30);
  assert.equal(before.annots[0].kind === "rect" && before.annots[0].x, 10);
  next = applyAnnotationCommand(next, { kind: "lock", ids: ["b"] }).content;
  assert.throws(
    () => applyAnnotationCommand(next, { kind: "delete", ids: ["a", "b"] }),
    /Desbloqueie/,
  );
  assert.equal(next.annots.length, 3);
  next = applyAnnotationCommand(next, { kind: "unlock", ids: ["b"] }).content;
  next = applyAnnotationCommand(next, { kind: "delete", ids: ["a", "b"] }).content;
  assert.deepEqual(
    next.annots.map((annot) => annot.id),
    ["c"],
  );
});
test("alignment and native annotation roundtrip preserve locks, comment author and resolved state", async () => {
  const before = content();
  let next = applyAnnotationCommand(before, {
    kind: "align",
    axis: "left",
    ids: ["a", "c"],
    bounds: {},
  }).content;
  assert.equal(next.annots[2].kind === "ellipse" && next.annots[2].x, 10);
  next = applyAnnotationCommand(next, { kind: "lock", ids: ["a", "b"] }).content;
  const document = await PDFDocument.create();
  document.addPage();
  const out = await PDFDocument.load(
    await buildPdf({ content: next, sources: { a: await document.save() }, primary: "a" }),
  );
  const restored = takeEditableAnnotations(out).get(0) ?? [];
  assert.equal(restored[0].locked, true);
  assert.equal(restored[1].kind === "note" && restored[1].author, "Ana");
  assert.equal(restored[1].kind === "note" && restored[1].resolved, true);
});
