import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { atomicWrite, writeUnique } from "../src/main/files.ts";

test("atomic replacement writes complete bytes and cleans temporary files", async () => {
  const dir = await mkdtemp(join(process.cwd(), ".file-test-"));
  try {
    const path = join(dir, "document.pdf");
    await atomicWrite(path, "original");
    await atomicWrite(path, "replacement");
    assert.equal(await readFile(path, "utf8"), "replacement");
    assert.deepEqual(await readdir(dir), ["document.pdf"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed replacement preserves existing target and removes temporary file", async () => {
  const dir = await mkdtemp(join(process.cwd(), ".file-test-"));
  try {
    const target = join(dir, "folder");
    await mkdir(target);
    await atomicWrite(join(target, "original.pdf"), "keep");
    await assert.rejects(atomicWrite(target, "cannot replace a directory"));
    assert.equal(await readFile(join(target, "original.pdf"), "utf8"), "keep");
    assert.deepEqual(await readdir(dir), ["folder"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("concurrent exports preserve originals and each export", async () => {
  const dir = await mkdtemp(join(process.cwd(), ".file-test-"));
  try {
    const path = join(dir, "part.pdf");
    await atomicWrite(path, "original");
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => writeUnique(path, new TextEncoder().encode(String(i)))),
    );
    assert.equal(new Set(results).size, 8);
    assert.equal(await readFile(path, "utf8"), "original");
    assert.deepEqual(
      await Promise.all(results.map((p) => readFile(p, "utf8"))),
      Array.from({ length: 8 }, (_, i) => String(i)),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
