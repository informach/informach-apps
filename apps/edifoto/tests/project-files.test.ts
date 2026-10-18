import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { saveProjectFile } from "../src/main/projectFiles.ts";
import { encodeArchive } from "../src/shared/documentFormat.ts";

test("invalid save preserves previous output and migrating v1 keeps an immutable backup", async () => {
  const folder = await mkdtemp(join(tmpdir(), "edifoto-files-"));
  try {
    const path = join(folder, "example.edifoto"),
      legacy = Buffer.from("EDIFOTO1original"),
      bytes = encodeArchive(
        { id: "d", name: "Example", width: 10, height: 10, layers: [] },
        new Map(),
      );
    await writeFile(path, legacy);
    await assert.rejects(saveProjectFile(path, new Uint8Array([1, 2, 3])));
    assert.deepEqual(await readFile(path), legacy);
    await saveProjectFile(path, bytes);
    assert.deepEqual(await readFile(`${path}.v1.bak`), legacy);
    assert.deepEqual(await readFile(path), Buffer.from(bytes));
    await saveProjectFile(path, bytes);
    assert.deepEqual(await readFile(`${path}.v1.bak`), legacy);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
