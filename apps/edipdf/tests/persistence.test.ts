import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { createFileRevisions } from "../src/main/file-revisions.ts";
import { createRecoveryStore } from "../src/main/recovery-store.ts";
import { buildPdf, mergePdfs } from "../src/shared/build.ts";
import { type RecoveryDocument, recoverySchema } from "../src/shared/document-format.ts";
import type { DocContent } from "../src/shared/model.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";
import { formValueKey } from "../src/shared/pdf-forms.ts";

const empty = (source = "a"): DocContent => ({
  pages: [{ id: "p", src: source, index: 0, rotation: 0 }],
  annots: [],
  forms: {},
  meta: {},
  watermark: null,
  pageNumbers: null,
});
test("annotation remains editable across repeated save/reopen cycles without duplication", async () => {
  const original = await PDFDocument.create();
  original.addPage();
  let bytes = await original.save();
  let content = empty();
  content.annots = [
    { id: "note", kind: "note", page: "p", x: 50, y: 50, text: "Primeiro", color: "#F59E0B" },
    {
      id: "text",
      kind: "text",
      page: "p",
      x: 50,
      y: 100,
      text: "Texto",
      font: "helvetica",
      size: 14,
      color: "#111111",
    },
  ];
  for (let i = 0; i < 3; i++) {
    bytes = await buildPdf({ content, sources: { a: bytes }, primary: "a" });
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPage(0).node.Annots()?.size(), 2);
    const restored = takeEditableAnnotations(document).get(0) ?? [];
    assert.equal(restored.length, 2);
    assert.equal(restored[0].kind === "note" ? restored[0].text : "", "Primeiro" + "!".repeat(i));
    content = {
      ...content,
      annots: restored.map((a) => ({
        ...a,
        page: "p",
        ...("text" in a && a.kind === "note" ? { text: a.text + "!" } : {}),
      })),
    };
  }
});
test("imported homonymous forms preserve independent values in both merge paths", async () => {
  const source = async () => {
    const d = await PDFDocument.create();
    d.getForm().createTextField("nome").addToPage(d.addPage());
    return d.save();
  };
  const a = await source(),
    b = await source();
  const content = empty();
  content.pages.push({ id: "second", src: "b", index: 0, rotation: 0 });
  content.forms = { [formValueKey("a", "nome")]: "Ana", [formValueKey("b", "nome")]: "Bruno" };
  const out = await PDFDocument.load(await buildPdf({ content, sources: { a, b }, primary: "a" }));
  assert.equal(out.getForm().getTextField("nome").getText(), "Ana");
  assert.equal(out.getForm().getTextField("Fonte 2.nome").getText(), "Bruno");
  const direct = await PDFDocument.load(await mergePdfs([a, b]));
  assert.deepEqual(
    direct
      .getForm()
      .getFields()
      .map((f) => f.getName()),
    ["Fonte 1.nome", "Fonte 2.nome"],
  );
});
test("recovery validates sources, preserves corrupt entries and prevents traversal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edipdf-recovery-"));
  try {
    const store = createRecoveryStore(directory, {
      encode: (value) => new TextEncoder().encode(value),
      decode: (value) => new TextDecoder().decode(value),
    });
    const document: RecoveryDocument = {
      version: 1,
      id: "doc",
      name: "Trabalho.pdf",
      updatedAt: 1,
      primary: "a",
      content: empty(),
      sources: [{ id: "a", name: "original.pdf", data: "YWJj" }],
    };
    await store.save(document);
    assert.deepEqual(await store.load("doc"), document);
    assert.equal(recoverySchema.safeParse({ ...document, sources: [] }).success, false);
    await assert.rejects(store.load("../original"), /inválida/);
    await writeFile(join(directory, "corrupt.bin"), "not JSON");
    const listing = await store.list();
    assert.equal(listing.entries.length, 1);
    assert.equal(listing.unreadable, 1);
    assert.equal(await readFile(join(directory, "corrupt.bin"), "utf8"), "not JSON");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("saving detects external edits and preserves both the target and recovery options", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edipdf-revisions-"));
  try {
    const file = join(directory, "original.pdf"),
      bytes = new TextEncoder().encode("Original");
    await writeFile(file, bytes);
    const revisions = createFileRevisions();
    revisions.remember(file, bytes);
    await writeFile(file, "External change");
    await assert.rejects(revisions.write(file, new TextEncoder().encode("My edits")), /alterado/);
    assert.equal(await readFile(file, "utf8"), "External change");
    await revisions.write(join(directory, "copy.pdf"), new TextEncoder().encode("My edits"));
    assert.equal(await readFile(join(directory, "copy.pdf"), "utf8"), "My edits");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
