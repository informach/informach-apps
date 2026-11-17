import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pruneGuides, readGuide, saveGuide } from "./pipelineGuides.ts";

// A 1×1 PNG and a JPEG's first bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("style guide pictures: kept by their bytes, read back, refused when not a picture", async () => {
  const userData = await mkdtemp(join(tmpdir(), "edisvg-guides-"));
  try {
    const saved = await saveGuide(userData, new Uint8Array(PNG), "C:\\Aulas\\style guide.png");
    assert.match(saved.id, /^guide-[0-9a-f]{32}$/);
    // Only the file's name, never where it was.
    assert.equal(saved.name, "style guide.png");
    // The same picture again is the same guide (one file).
    assert.deepEqual(await saveGuide(userData, new Uint8Array(PNG), "outro.png"), {
      id: saved.id,
      name: "outro.png",
    });
    assert.equal((await readdir(join(userData, "pipeline-guides"))).length, 1);
    const kept = await readGuide(userData, saved.id);
    assert.equal(kept.mediaType, "image/png");
    assert.deepEqual([...kept.bytes], [...PNG]);
    await assert.rejects(saveGuide(userData, new Uint8Array([1, 2, 3]), "x.png"), /PNG, JPEG/);
    await assert.rejects(saveGuide(userData, "texto", "x.png"), /vazia/);
    await assert.rejects(readGuide(userData, "../../segredo"), /inválido/);
    await assert.rejects(
      readGuide(userData, `guide-${"0".repeat(32)}`),
      /não está mais neste computador/,
    );
  } finally {
    await rm(userData, { recursive: true });
  }
});

test("style guide pictures no recipe names go a day after they were last chosen", async () => {
  const userData = await mkdtemp(join(tmpdir(), "edisvg-guides-"));
  try {
    const kept = await saveGuide(userData, new Uint8Array(PNG), "receita.png");
    const other = Buffer.concat([PNG, Buffer.from([0])]);
    const loose = await saveGuide(userData, new Uint8Array(other), "solto.png");
    const folder = join(userData, "pipeline-guides");
    await writeFile(join(folder, "notas.txt"), "não é um guia");
    const now = Date.now();
    // Just chosen: stays even if no recipe names it (a run may be using it).
    await pruneGuides(userData, new Set([kept.id]), now);
    assert.equal((await readdir(folder)).length, 3);
    // Two days later: the loose one goes; the recipe's and other files stay.
    const old = new Date(now - 2 * 24 * 60 * 60_000);
    for (const id of [kept.id, loose.id]) await utimes(join(folder, `${id}.img`), old, old);
    await pruneGuides(userData, new Set([kept.id]), now);
    assert.deepEqual((await readdir(folder)).sort(), [`${kept.id}.img`, "notas.txt"]);
  } finally {
    await rm(userData, { recursive: true });
  }
});
