import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readBoundedBytes } from "./boundedBytes";
import { readBoundedText } from "./boundedText.ts";

test("bounded reader enforces byte limits, UTF-8 and regular files without modifying input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "edisvg-bounds-"));
  try {
    const path = join(directory, "selected.svg");
    await writeFile(path, "ação");
    assert.equal(await readBoundedText(path, 6), "ação");
    await assert.rejects(readBoundedText(path, 5), /limite/);
    assert.equal(await readFile(path, "utf8"), "ação");
    await writeFile(path, Buffer.from([0xff, 0xfe]));
    assert.deepEqual([...(await readBoundedBytes(path, 2))], [0xff, 0xfe]);
    await assert.rejects(readBoundedText(path, 10), /encoded/);
    await assert.rejects(readBoundedText(directory, 10));
    await assert.rejects(readBoundedText(path, 0), /Limite/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
