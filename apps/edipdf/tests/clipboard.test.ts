import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAnnotationCommand } from "../src/shared/annotation-commands.ts";
import {
  CLIPBOARD_LIMIT,
  clipboardText,
  decodeClipboardAnnotations,
  encodeClipboardAnnotations,
} from "../src/shared/clipboard-format.ts";
import type { Annot, DocContent } from "../src/shared/model.ts";

const selection: Annot[] = [
  {
    id: "a",
    page: "source",
    kind: "note",
    x: 20,
    y: 40,
    text: "Olá β",
    color: "#ffaa00",
    group: "original",
    locked: true,
  },
  {
    id: "b",
    page: "source",
    kind: "rect",
    x: 10,
    y: 30,
    w: 50,
    h: 80,
    stroke: "#000000",
    fill: null,
    width: 1,
    group: "original",
  },
];
test("clipboard round trip carries Unicode and editable grouped annotations across documents", () => {
  const encoded = encodeClipboardAnnotations({ version: 1, annotations: selection });
  assert.equal(encoded.text, "Olá β");
  const decoded = decodeClipboardAnnotations(new TextEncoder().encode(encoded.json));
  assert.deepEqual(decoded, selection);
  const content: DocContent = {
    pages: [{ id: "target", src: "", index: 0, rotation: 0, blank: { w: 600, h: 800 } }],
    annots: [],
    forms: {},
    meta: {},
    watermark: null,
    pageNumbers: null,
  };
  const pasted = applyAnnotationCommand(content, {
    kind: "paste",
    page: "target",
    annotations: decoded,
  });
  assert.equal(pasted.content.annots.length, 2);
  for (const annotation of pasted.content.annots) {
    assert.equal(annotation.page, "target");
    assert.ok(!selection.some((original) => original.id === annotation.id));
    assert.notEqual(annotation.group, "original");
    assert.equal(annotation.locked, false);
  }
  assert.equal(pasted.content.annots[0].group, pasted.content.annots[1].group);
  assert.equal(selection[0].locked, true);
  assert.equal(content.annots.length, 0);
});
test("clipboard rejects future versions, duplicate identities, invalid UTF-8 and excessive payloads", () => {
  assert.throws(() => encodeClipboardAnnotations({ version: 2, annotations: selection }));
  assert.throws(() =>
    encodeClipboardAnnotations({ version: 1, annotations: [selection[0], selection[0]] }),
  );
  assert.throws(() => decodeClipboardAnnotations(new Uint8Array([255, 254])));
  assert.throws(() => decodeClipboardAnnotations(new Uint8Array(CLIPBOARD_LIMIT + 1)), /16 MB/);
  const huge = Array.from({ length: 18 }, (_, index) => ({
    ...selection[0],
    id: String(index),
    text: "A".repeat(1_000_000),
  }));
  assert.throws(() => encodeClipboardAnnotations({ version: 1, annotations: huge }), /16 MB/);
  assert.throws(() =>
    encodeClipboardAnnotations({
      version: 1,
      annotations: [{ ...selection[0], kind: "image", src: "https://example.org/image.png" }],
    }),
  );
});
test("pasted plain text preserves literals and normalizes newlines without interpreting markup", () => {
  assert.equal(
    clipboardText("<script>literal</script>\r\n=SUM(A1)\rβ"),
    "<script>literal</script>\n=SUM(A1)\nβ",
  );
  assert.throws(() => clipboardText("A\0B"), /nulos/);
  assert.throws(() => clipboardText("A".repeat(100001)), /100 mil/);
});

test("clipboard bounds graph traversal while accepting shared immutable annotation data", () => {
  const paths = [[10, 20, 30, 40]],
    annotations = ["one", "two"].map((id) => ({
      id,
      page: "p",
      kind: "ink",
      paths,
      stroke: "#000000",
      width: 1,
    }));
  const encoded = encodeClipboardAnnotations({ version: 1, annotations });
  assert.deepEqual(decodeClipboardAnnotations(new TextEncoder().encode(encoded.json)), annotations);
  const cyclic: unknown[] = [];
  cyclic.push(cyclic);
  assert.throws(() => encodeClipboardAnnotations(cyclic), /elementos|pontos/);
  assert.throws(
    () =>
      encodeClipboardAnnotations({
        version: 1,
        annotations: [{ ...annotations[0], paths: [Array(100001).fill(0)] }],
      }),
    /elementos/,
  );
});
