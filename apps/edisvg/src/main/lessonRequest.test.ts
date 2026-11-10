import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { takeLessonRequest } from "./lessonRequest.ts";

let ediaula = "";
let userData = "";
before(async () => {
  const root = await mkdtemp(join(tmpdir(), "edisvg-pedido-"));
  ediaula = join(root, "ediaula");
  userData = join(root, "edisvg");
  await mkdir(join(ediaula, "para-o-edisvg"), { recursive: true });
  await mkdir(userData, { recursive: true });
});
after(async () => {
  await rm(join(ediaula, ".."), { recursive: true, force: true });
});

/** A request as EdiAula leaves it (apps/ediaula/src/main/edisvgHandoff.ts): package, then pedido. */
async function send(
  sentAt: number,
  { zip = true, file = `aula-pifnvgomyinhw-${sentAt}.zip` } = {},
) {
  const folder = join(ediaula, "para-o-edisvg");
  if (zip) await writeFile(join(folder, file), "zip");
  await writeFile(
    join(folder, "pedido.json"),
    JSON.stringify({ version: 1, lessonId: "pifnvgomyinhw", name: "DPJ Aula01", file, sentAt }),
  );
}

test("a request is taken once, with its package's path", async () => {
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  await send(1794300000000);
  assert.deepEqual(await takeLessonRequest(ediaula, userData), {
    lessonId: "pifnvgomyinhw",
    name: "DPJ Aula01",
    sentAt: 1794300000000,
    path: join(ediaula, "para-o-edisvg", "aula-pifnvgomyinhw-1794300000000.zip"),
  });
  // Taken: coming back to the front, or opening again, does not open the pipelines again.
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  assert.deepEqual(JSON.parse(await readFile(join(userData, "pedido-do-ediaula.json"), "utf8")), {
    sentAt: 1794300000000,
  });
  // A new click in EdiAula is a new request.
  await send(1794300005000);
  assert.equal((await takeLessonRequest(ediaula, userData))?.sentAt, 1794300005000);
});

test("a request whose package is gone, or that names a file outside the folder, is not taken", async () => {
  await send(1794300009000, { zip: false });
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  await writeFile(join(ediaula, "fora.zip"), "zip");
  await send(1794300010000, { zip: false, file: "../fora.zip" });
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  // Not marked taken: the package that comes later for the same request still opens.
  await send(1794300009000);
  assert.equal((await takeLessonRequest(ediaula, userData))?.sentAt, 1794300009000);
});
