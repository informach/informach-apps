import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readBoundedFile } from "../src/main/bounded-files.ts";
import { assertCopyDestination, atomicWrite, writeUnique } from "../src/main/files.ts";

const execute = promisify(execFile);
async function isolatedDirectory(): Promise<string> {
  const root = resolve(process.cwd()),
    directory = await mkdtemp(join(root, ".file-test-"));
  assert.equal(dirname(directory), root);
  assert.match(basename(directory), /^\.file-test-[a-zA-Z\d]+$/);
  return directory;
}

test("bounded reads return complete binary data and reject empty, oversized or non-file inputs", async () => {
  const root = await isolatedDirectory();
  try {
    const path = join(root, "binary.pdf"),
      bytes = new Uint8Array([0, 255, 3, 4]);
    await writeFile(path, bytes);
    assert.deepEqual(await readBoundedFile(path, 4), bytes);
    await assert.rejects(readBoundedFile(path, 3), /arquivo/);
    await assert.rejects(readBoundedFile(root, 4));
    await writeFile(path, new Uint8Array());
    await assert.rejects(readBoundedFile(path, 4), /arquivo/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("independent processes create complete Unicode-named copies without replacing each other", async () => {
  const dir = await isolatedDirectory();
  try {
    const outputs = await Promise.all(
      Array.from({ length: 4 }, (_, number) =>
        execute(process.execPath, [
          fileURLToPath(new URL("./fixtures/file-writer.mts", import.meta.url)),
          dir,
          String(number),
        ]),
      ),
    );
    const paths: string[] = outputs.map((output) => {
      const value: unknown = JSON.parse(output.stdout);
      assert.equal(typeof value, "string");
      if (typeof value !== "string") throw new Error("Invalid fixture result");
      return value;
    });
    assert.equal(new Set(paths).size, 4);
    assert.deepEqual(await Promise.all(paths.map((path) => readFile(path, "utf8"))), [
      "conteúdo 0",
      "conteúdo 1",
      "conteúdo 2",
      "conteúdo 3",
    ]);
    assert.equal((await readdir(dir)).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stopped exclusive commit never exposes a partial output and removes its staging file", async () => {
  const dir = await isolatedDirectory();
  try {
    const path = join(dir, "output.pdf");
    await assert.rejects(
      writeUnique(path, new Uint8Array(1024), {
        async beforeCommit(target) {
          assert.equal(target, path);
          assert.equal((await readdir(dir)).includes("output.pdf"), false);
          throw new Error("deadline");
        },
      }),
      /deadline/,
    );
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("atomic replacement writes complete bytes and cleans temporary files", async () => {
  const dir = await isolatedDirectory();
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
  const dir = await isolatedDirectory();
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
  const dir = await isolatedDirectory();
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

test("copy destinations reject originals and filesystem aliases but permit a new file", async () => {
  const dir = await isolatedDirectory();
  try {
    const source = join(dir, "original.pdf");
    const alias = join(dir, "alias.pdf");
    await atomicWrite(source, "original");
    await link(source, alias);
    await assert.rejects(assertCopyDestination(source, [source]), /original/);
    await assert.rejects(assertCopyDestination(alias, [source]), /original/);
    await assertCopyDestination(join(dir, "copy.pdf"), [source]);
    assert.equal(await readFile(source, "utf8"), "original");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
