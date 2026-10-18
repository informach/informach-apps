import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { commitBatchDirectory } from "../src/main/batch-directory.ts";
import { type BatchSnapshot, generateBatch } from "../src/shared/batch.ts";
import { batchDigest, readBatchArchive, writeBatchArchive } from "../src/shared/batch-archive.ts";
import { batchDetailSchema } from "../src/shared/batch-format.ts";
import { readOfficePackage, writeOfficePackage } from "../src/shared/office-package.ts";

test("a protected partial batch keeps complete file hashes, manifest order and remaining work without exposing extra archive entries", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const bytes = await pdf.save(),
    sha256 = await batchDigest(bytes),
    partial = batchDetailSchema.parse({
      kind: "batch",
      version: 1,
      stage: "processing",
      settings: { operation: "split", pagesPerFile: 1 },
      sourceSha256: sha256,
      sourcePages: 2,
      total: 2,
      files: [{ name: "parte-001.pdf", bytes: bytes.length, sha256, pages: [1] }],
    }),
    archive = await writeBatchArchive(partial, new Map([["parte-001.pdf", bytes]]));
  assert.equal(
    (await readBatchArchive(archive, partial)).get("parte-001.pdf")?.length,
    bytes.length,
  );
  const parts = Object.fromEntries(readOfficePackage(archive));
  parts["parte-001.pdf"] = new Uint8Array([1, 2, 3]);
  await assert.rejects(() => readBatchArchive(writeOfficePackage(parts), partial), /alterado/);
  parts["parte-001.pdf"] = bytes;
  parts["extra.pdf"] = bytes;
  await assert.rejects(() => readBatchArchive(writeOfficePackage(parts), partial), /corresponde/);
  assert.throws(() => batchDetailSchema.parse({ ...partial, stage: "review" }), /inconsistentes/);
  assert.throws(() =>
    batchDetailSchema.parse({
      ...partial,
      files: [{ ...partial.files[0], name: "../escape.pdf" }],
    }),
  );
});

test("native batch publication creates a whole exclusive directory and never overwrites a previous batch", {
  skip: !["win32", "linux"].includes(process.platform),
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "edipdf-batch-publish-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  try {
    const files = new Map([
        ["parte-001.pdf", new Uint8Array([1, 2, 3])],
        ["manifest.json", new TextEncoder().encode("{}")],
      ]),
      first = await commitBatchDirectory(root, "Documento.pdf", "split", files, async () => {});
    await writeFile(join(first, "parte-001.pdf"), "Preservado");
    const second = await commitBatchDirectory(
      root,
      "Documento.pdf",
      "split",
      files,
      async () => {},
    );
    assert.notEqual(first, second);
    assert.equal(await readFile(join(first, "parte-001.pdf"), "utf8"), "Preservado");
    assert.deepEqual(await readFile(join(second, "parte-001.pdf")), Buffer.from([1, 2, 3]));
    assert.equal(
      (await readdir(root)).some((name) => name.startsWith(".edipdf-lote-")),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("batch cancellation before commit leaves no published folder, and invalid file paths are refused before any write", async () => {
  const root = await mkdtemp(join(tmpdir(), "edipdf-batch-cancel-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  try {
    let checks = 0;
    await assert.rejects(
      () =>
        commitBatchDirectory(
          root,
          "Documento.pdf",
          "split",
          new Map([["parte-001.pdf", new Uint8Array([1])]]),
          async () => {
            if (++checks === 3) throw new Error("Cancelado antes do commit");
          },
        ),
      /Cancelado/,
    );
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(
      () =>
        commitBatchDirectory(
          root,
          "Documento.pdf",
          "split",
          new Map([["../escape.pdf", new Uint8Array([1])]]),
          async () => {},
        ),
      /inválidos/,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("PDF splitting resumes only after its last protected complete file and prunes removed page trees while retaining form values", async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]).drawText("PRIMEIRA_PAGINA", { x: 30, y: 300 });
  source.addPage([300, 400]).drawText("SEGUNDA_PAGINA", { x: 30, y: 300 });
  const field = source.getForm().createTextField("nome");
  field.setText("Atual");
  field.addToPage(source.getPage(0), { x: 30, y: 200, width: 200, height: 25 });
  const bytes = await source.save(),
    protectedSnapshots: BatchSnapshot[] = [];
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 1 },
        {
          checkpoint: async (snapshot) => {
            protectedSnapshots.push(snapshot);
            if (snapshot.detail.files.length === 1)
              throw new Error("Interrupção após arquivo completo");
          },
          progress: () => {},
        },
      ),
    /Interrupção/,
  );
  const last = protectedSnapshots.at(-1);
  assert.ok(last);
  assert.equal(last.detail.files.length, 1);
  const progress: number[] = [],
    result = await generateBatch(bytes, last.detail.settings, {
      previous: { bytes: last.bytes, detail: last.detail },
      checkpoint: async () => {
        throw new Error("Only the final remaining part is generated; ready protects it");
      },
      progress: (done) => progress.push(done),
    });
  assert.deepEqual(progress, [1, 2]);
  const files = await readBatchArchive(result.bytes, result.detail),
    first = files.get("parte-001.pdf"),
    second = files.get("parte-002.pdf");
  assert.ok(first && second);
  const originalFirst = (await readBatchArchive(last.bytes, last.detail)).get("parte-001.pdf");
  assert.deepEqual(first, originalFirst);
  const firstPdf = await PDFDocument.load(first),
    secondPdf = await PDFDocument.load(second);
  assert.equal(firstPdf.getPageCount(), 1);
  assert.equal(secondPdf.getPageCount(), 1);
  assert.equal(firstPdf.getForm().getTextField("nome").getText(), "Atual");
  assert.equal(secondPdf.getForm().getFields().length, 0);
  for (const pdf of [firstPdf, secondPdf])
    assert.equal(
      pdf.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Page"),
        ).length,
      1,
    );
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 2 },
        {
          previous: { bytes: last.bytes, detail: last.detail },
          checkpoint: async () => {},
          progress: () => {},
        },
      ),
    /origem\/ajustes/,
  );
});

test("explicit split groups preserve descending order, corresponding field ownership and omitted page removal", async () => {
  const source = await PDFDocument.create();
  for (const width of [201, 202, 203]) source.addPage([width, 300]);
  for (const [index, name] of ["first", "second"].entries()) {
    const field = source.getForm().createTextField(name);
    field.setText(name.toUpperCase());
    field.addToPage(source.getPage(index), { x: 10, y: 100, width: 100, height: 20 });
  }
  const bytes = await source.save(),
    original = new Uint8Array(bytes);
  const result = await generateBatch(
    bytes,
    { operation: "split", pagesPerFile: 1, groups: [[2, 0], [1]] },
    { checkpoint: async () => {}, progress: () => {} },
  );
  const files = await readBatchArchive(result.bytes, result.detail),
    first = files.get("parte-001.pdf"),
    second = files.get("parte-002.pdf");
  assert.ok(first && second);
  const a = await PDFDocument.load(first),
    b = await PDFDocument.load(second);
  assert.deepEqual(
    a.getPages().map((page) => page.getWidth()),
    [203, 201],
  );
  assert.deepEqual(
    b.getPages().map((page) => page.getWidth()),
    [202],
  );
  assert.deepEqual(
    a
      .getForm()
      .getFields()
      .map((field) => field.getName()),
    ["first"],
  );
  assert.deepEqual(
    b
      .getForm()
      .getFields()
      .map((field) => field.getName()),
    ["second"],
  );
  assert.equal(a.getForm().getTextField("first").acroField.getWidgets()[0]?.P(), a.getPage(1).ref);
  assert.deepEqual(
    result.detail.files.map((file) => file.pages),
    [[3, 1], [2]],
  );
  assert.deepEqual(bytes, original);
  let protectedFiles = false;
  await assert.rejects(
    generateBatch(
      bytes,
      { operation: "split", pagesPerFile: 1, groups: [[3]] },
      {
        checkpoint: async () => {
          protectedFiles = true;
        },
        progress: () => {},
      },
    ),
    /inexistente/,
  );
  assert.equal(protectedFiles, false);
  await assert.rejects(
    generateBatch(
      bytes,
      { operation: "split", pagesPerFile: 1, groups: [[0, 0]] },
      { checkpoint: async () => {}, progress: () => {} },
    ),
    /repetidas/,
  );
});
