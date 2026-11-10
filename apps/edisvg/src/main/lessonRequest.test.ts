import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { keepPackage, lessonRequestWaiting, takeLessonRequest } from "./lessonRequest.ts";

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
  {
    zip = true,
    file = `aula-pifnvgomyinhw-${sentAt}.zip`,
    project = undefined as string | undefined,
  } = {},
) {
  const folder = join(ediaula, "para-o-edisvg");
  if (zip) await writeFile(join(folder, file), "zip");
  await writeFile(
    join(folder, "pedido.json"),
    JSON.stringify({
      version: 1,
      lessonId: "pifnvgomyinhw",
      name: "DPJ Aula01",
      file,
      sentAt,
      ...(project ? { project } : {}),
    }),
  );
}

test("a request is taken once, with its package's path", async () => {
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  assert.equal(await lessonRequestWaiting(ediaula, userData), null);
  await send(1794300000000);
  // Seen as waiting (the window comes to the front for it), and only taken when asked.
  const waiting = { sentAt: 1794300000000, name: "DPJ Aula01" };
  assert.deepEqual(await lessonRequestWaiting(ediaula, userData), waiting);
  assert.deepEqual(await lessonRequestWaiting(ediaula, userData), waiting);
  assert.deepEqual(await takeLessonRequest(ediaula, userData), {
    lessonId: "pifnvgomyinhw",
    name: "DPJ Aula01",
    sentAt: 1794300000000,
    path: join(ediaula, "para-o-edisvg", "aula-pifnvgomyinhw-1794300000000.zip"),
  });
  // Taken: coming back to the front, or opening again, does not open the pipelines again.
  assert.equal(await takeLessonRequest(ediaula, userData), null);
  assert.equal(await lessonRequestWaiting(ediaula, userData), null);
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

test("the lesson's project comes with the request when it is a .edisvg in a folder that exists", async () => {
  const project = join(ediaula, "..", "DPJ Aula01.edisvg");
  await send(1794300020000, { project });
  assert.equal((await takeLessonRequest(ediaula, userData))?.project, project);
  // Anything else is left out: the pipelines still open, in the project that is open.
  for (const [at, wrong] of [
    [1794300021000, "DPJ Aula01.edisvg"],
    [1794300022000, join(ediaula, "..", "DPJ Aula01.ediaula")],
    [1794300023000, join(ediaula, "..", "nao-existe", "DPJ Aula01.edisvg")],
  ] as const) {
    await send(at, { project: wrong });
    const request = await takeLessonRequest(ediaula, userData);
    assert.equal(request?.sentAt, at);
    assert.equal(request?.project, undefined);
  }
});

test("EdiSVG keeps its own file of each package it took: EdiAula's cleaning never reaches it", async () => {
  const folder = join(ediaula, "para-o-edisvg");
  const at = (n: number) => join(folder, `aula-pifnvgomyinhw-179430010${n}000.zip`);
  for (const n of [1, 2, 3, 4]) await writeFile(at(n), `zip ${n}`);
  const inUse = new Set<string>();
  const kept: string[] = [];
  for (const n of [1, 2, 3, 4]) {
    kept.push(await keepPackage(at(n), userData, (path) => inUse.has(path)));
    if (n === 1) inUse.add(kept[0] as string);
    // EdiAula cleans its folder: EdiSVG's file stays, with the package in it.
    await rm(at(n));
  }
  assert.equal(await readFile(kept[3] as string, "utf8"), "zip 4");
  // The two newest stay, and the one a run still reads (picked in this session).
  assert.deepEqual((await readdir(join(userData, "pacotes-do-ediaula"))).sort(), [
    "aula-pifnvgomyinhw-1794300101000.zip",
    "aula-pifnvgomyinhw-1794300103000.zip",
    "aula-pifnvgomyinhw-1794300104000.zip",
  ]);
});
