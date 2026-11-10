import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { edisvgExecutable, handOffLesson, openEdisvg } from "../src/main/edisvgHandoff.ts";

let userData = "";
before(async () => {
  userData = await mkdtemp(join(tmpdir(), "ediaula-para-o-edisvg-"));
});
after(async () => {
  await rm(userData, { recursive: true, force: true });
});

const folder = () => join(userData, "para-o-edisvg");
const lesson = { id: "pifnvgomyinhw", name: " DPJ Aula01 gravação automática " };

test("the lesson goes as a package, and the request is written after it, naming it", async () => {
  let requestWhilePacking = true;
  const out = await handOffLesson(
    userData,
    lesson,
    async (part) => {
      // While the package is made, no request points at it (EdiSVG would read half a ZIP).
      requestWhilePacking = existsSync(join(folder(), "pedido.json"));
      assert.match(part, /\.zip\.part$/);
      await writeFile(part, "zip");
    },
    1794300000000,
  );
  assert.equal(requestWhilePacking, false);
  assert.equal(out, join(folder(), "aula-pifnvgomyinhw-1794300000000.zip"));
  assert.equal(await readFile(out, "utf8"), "zip");
  assert.deepEqual(JSON.parse(await readFile(join(folder(), "pedido.json"), "utf8")), {
    version: 1,
    lessonId: "pifnvgomyinhw",
    name: "DPJ Aula01 gravação automática",
    file: "aula-pifnvgomyinhw-1794300000000.zip",
    sentAt: 1794300000000,
  });
});

test("a package that fails leaves nothing and keeps the request before it", async () => {
  await assert.rejects(
    handOffLesson(
      userData,
      lesson,
      async (part) => {
        await writeFile(part, "meio");
        throw new Error("Reconecte antes de empacotar: tela.mp4.");
      },
      1794300001000,
    ),
    /Reconecte/,
  );
  assert.deepEqual(await readdir(folder()), [
    "aula-pifnvgomyinhw-1794300000000.zip",
    "pedido.json",
  ]);
  const request = JSON.parse(await readFile(join(folder(), "pedido.json"), "utf8"));
  assert.equal(request.sentAt, 1794300000000);
});

test("only the newest package stays: older ones and half-made ones go", async () => {
  await writeFile(join(folder(), "aula-outra-1794200000000.zip.part"), "resto");
  await writeFile(join(folder(), "notas.txt"), "da pessoa");
  for (const at of [1794300002000, 1794300003000])
    await handOffLesson(userData, lesson, (part) => writeFile(part, "zip"), at);
  assert.deepEqual((await readdir(folder())).sort(), [
    "aula-pifnvgomyinhw-1794300003000.zip",
    // Only packages are cleaned: anything else in the folder stays.
    "notas.txt",
    "pedido.json",
  ]);
});

test("a lesson id EdiSVG cannot take is refused before anything is packed", async () => {
  let packed = false;
  await assert.rejects(
    handOffLesson(userData, { id: "../fora", name: "Aula" }, async () => {
      packed = true;
    }),
  );
  assert.equal(packed, false);
});

test("EdiSVG is opened where the Hub installs it, and not when it is not there", async () => {
  assert.equal(
    edisvgExecutable("C:\\Users\\x\\AppData\\Local"),
    join("C:\\Users\\x\\AppData\\Local", "Programs", "Edi", "EdiSVG", "EdiSVG.exe"),
  );
  assert.equal(await openEdisvg(join(userData, "nao-existe", "EdiSVG.exe")), false);
});
