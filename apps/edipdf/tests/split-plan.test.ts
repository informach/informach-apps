import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { type BatchSnapshot, generateBatch } from "../src/shared/batch.ts";
import { readBatchArchive } from "../src/shared/batch-archive.ts";
import { batchDetailSchema } from "../src/shared/batch-format.ts";
import { addBookmark, bookmarks } from "../src/shared/pdf-navigation.ts";
import { extractSplitPart, planSplit } from "../src/shared/split-plan.ts";

async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date("2000-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  for (let index = 0; index < 6; index++) {
    const page = pdf.addPage([300, 400]);
    page.drawText(`PAGE_${index + 1}`, { x: 20, y: 300, size: 14 });
    page.node.addContentStream(
      pdf.context.register(pdf.context.stream(`%${String(index).repeat(1800)}\n`)),
    );
  }
  addBookmark(pdf, { title: "../../first", page: 1 });
  const first = bookmarks(pdf)[0];
  assert.ok(first);
  addBookmark(pdf, { title: "Child", page: 2, parent: first.id });
  addBookmark(pdf, { title: "Fourth", page: 3 });
  addBookmark(pdf, { title: "Duplicate destination", page: 3 });
  return pdf.save({ updateFieldAppearances: false });
}

test("bookmark splitting preserves the preface and every page once, deduplicates destinations and follows the selected level", async () => {
  const bytes = await fixture(),
    original = bytes.slice();
  assert.deepEqual(await planSplit(bytes, { kind: "bookmarks", level: 1 }), [
    [0],
    [1, 2],
    [3, 4, 5],
  ]);
  assert.deepEqual(await planSplit(bytes, { kind: "bookmarks", level: 2 }), [
    [0, 1],
    [2, 3, 4, 5],
  ]);
  await assert.rejects(
    () => planSplit(bytes, { kind: "bookmarks", level: 3 }),
    /Não há marcadores/,
  );
  const result = await generateBatch(
    bytes,
    { operation: "split", pagesPerFile: 1, strategy: { kind: "bookmarks", level: 1 } },
    {
      checkpoint: async () => {},
      progress: () => {},
    },
  );
  assert.deepEqual(
    result.detail.files.map((file) => file.pages),
    [[1], [2, 3], [4, 5, 6]],
  );
  assert.deepEqual(
    result.detail.files.map((file) => file.name),
    ["parte-001.pdf", "parte-002.pdf", "parte-003.pdf"],
  );
  const files = await readBatchArchive(result.bytes, result.detail);
  for (const file of result.detail.files) {
    const part = files.get(file.name);
    assert.ok(part);
    assert.equal((await PDFDocument.load(part)).getPageCount(), file.pages.length);
  }
  assert.deepEqual(bytes, original);
});

test("bookmark planning refuses non-local destinations and never opens or executes the action", async () => {
  const pdf = await PDFDocument.load(await fixture()),
    first = bookmarks(pdf)[0];
  assert.ok(first);
  const root = pdf.catalog.lookup(PDFName.of("Outlines"));
  assert.ok(root instanceof PDFDict);
  const dictionary = pdf.context.lookup(root.get(PDFName.of("First")));
  assert.ok(dictionary instanceof PDFDict);
  dictionary.delete(PDFName.of("Dest"));
  dictionary.set(
    PDFName.of("A"),
    pdf.context.obj({ S: PDFName.of("URI"), URI: "https://example.invalid/" }),
  );
  let checkpoints = 0;
  const bytes = await pdf.save();
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 1, strategy: { kind: "bookmarks", level: 1 } },
        {
          checkpoint: async () => {
            checkpoints++;
          },
          progress: () => {},
        },
      ),
    /página local/,
  );
  assert.equal(checkpoints, 0);
});

test("size splitting measures canonical serialized PDFs and keeps every actual file within its goal", async () => {
  const bytes = await fixture();
  const maxBytes =
    Math.max(
      (await extractSplitPart(bytes, [0, 1])).length,
      (await extractSplitPart(bytes, [4, 5])).length,
    ) + 200;
  const checked: number[] = [];
  const result = await generateBatch(
    bytes,
    { operation: "split", pagesPerFile: 1, strategy: { kind: "size", maxBytes } },
    {
      checkpoint: async () => {},
      progress: () => {},
      planning: (value) => checked.push(value.checked),
    },
  );
  assert.ok(checked.length > 0 && result.detail.total > 1);
  assert.deepEqual(
    result.detail.files.flatMap((file) => file.pages),
    [1, 2, 3, 4, 5, 6],
  );
  const files = await readBatchArchive(result.bytes, result.detail);
  for (const file of result.detail.files) {
    const part = files.get(file.name);
    assert.ok(part);
    assert.ok(part.length <= maxBytes);
    assert.equal(part.length, file.bytes);
    assert.deepEqual(
      part,
      await extractSplitPart(
        bytes,
        file.pages.map((page) => page - 1),
      ),
    );
  }
  const oversize = {
    ...result.detail,
    files: result.detail.files.map((file) => ({ ...file, bytes: maxBytes + 1 })),
  };
  assert.equal(batchDetailSchema.safeParse(oversize).success, false);
});

test("resolved size plans resume without replanning or rewriting the protected prefix, and settings cannot change", async () => {
  const bytes = await fixture(),
    maxBytes = (await extractSplitPart(bytes, [0, 1])).length + 200;
  const snapshots: BatchSnapshot[] = [];
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 1, strategy: { kind: "size", maxBytes } },
        {
          progress: () => {},
          checkpoint: async (snapshot) => {
            snapshots.push(snapshot);
            if (snapshot.detail.files.length === 1)
              throw new Error("Interrupted after one protected file");
          },
        },
      ),
    /Interrupted/,
  );
  const previous = snapshots.at(-1);
  assert.ok(previous);
  assert.equal(previous.detail.files.length, 1);
  const filesBefore = await readBatchArchive(previous.bytes, previous.detail);
  const result = await generateBatch(bytes, previous.detail.settings, {
    previous,
    progress: () => {},
    checkpoint: async () => {},
    planning: () => {
      throw new Error("Must reuse the protected plan");
    },
  });
  const filesAfter = await readBatchArchive(result.bytes, result.detail);
  assert.deepEqual(filesAfter.get("parte-001.pdf"), filesBefore.get("parte-001.pdf"));
  assert.deepEqual(
    result.detail.files.flatMap((file) => file.pages),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(
    batchDetailSchema.safeParse({
      ...previous.detail,
      settings: { operation: "split", pagesPerFile: 1, strategy: { kind: "size", maxBytes } },
    }).success,
    false,
  );
  if (previous.detail.settings.operation !== "split")
    throw new Error("Expected a resolved split plan");
  const previousSettings = previous.detail.settings;
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { ...previousSettings, strategy: { kind: "size", maxBytes: maxBytes + 1 } },
        {
          previous,
          progress: () => {},
          checkpoint: async () => {},
        },
      ),
    /não correspondem/,
  );
});

test("an impossible page limit and cancellation during planning produce no partial output checkpoint", async () => {
  const bytes = await fixture();
  let checkpoints = 0;
  const options = {
    progress: () => {},
    checkpoint: async () => {
      checkpoints++;
    },
  };
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 1, strategy: { kind: "size", maxBytes: 1024 } },
        options,
      ),
    /página 1.*excede/,
  );
  await assert.rejects(
    () =>
      generateBatch(
        bytes,
        { operation: "split", pagesPerFile: 1, strategy: { kind: "size", maxBytes: 1024 } },
        {
          ...options,
          planning: () => {
            throw new DOMException("Cancelado", "AbortError");
          },
        },
      ),
    { name: "AbortError" },
  );
  assert.equal(checkpoints, 0);
});
