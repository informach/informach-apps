import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { readDesignKit } from "./designKit.ts";

let dir = "";
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "edisvg-kit-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test("a kit zipped as its folder: the folder names it, SVGs as text, PNGs as bytes, the rest left out", async () => {
  const file = join(dir, "kit.zip");
  await writeFile(
    file,
    zipSync({
      "Kit-Aulas/baloes/balao.svg": strToU8(svg),
      "Kit-Aulas/personagens/zappy.png": [png, { level: 0 }],
      "Kit-Aulas/LEIA-ME.txt": strToU8("leia"),
      "Kit-Aulas/fontes/Baloo2.ttf": new Uint8Array(4),
      "Kit-Aulas/.DS_Store": new Uint8Array(1),
      "__MACOSX/Kit-Aulas/._balao.svg": new Uint8Array(1),
      "Kit-Aulas/ruim.svg": new Uint8Array([0xff, 0xfe, 0x00]),
    }),
  );
  const kit = await readDesignKit(file);
  assert.equal(kit.name, "Kit-Aulas");
  assert.deepEqual(
    kit.files.map((f) => ("svg" in f ? [f.path, f.svg] : [f.path, [...f.png]])),
    [
      ["baloes/balao.svg", svg],
      ["personagens/zappy.png", [...png]],
    ],
  );
  assert.deepEqual(kit.left, [
    "LEIA-ME.txt",
    "fontes/Baloo2.ttf",
    "ruim.svg (o texto não está em UTF-8)",
  ]);
});

test("files at the ZIP's root take the ZIP's name; a ZIP without SVG or PNG is refused", async () => {
  const loose = join(dir, "Meu kit.zip");
  await writeFile(loose, zipSync({ "a.svg": strToU8(svg), "icones/b.svg": strToU8(svg) }));
  const kit = await readDesignKit(loose);
  assert.equal(kit.name, "Meu kit");
  assert.deepEqual(
    kit.files.map((f) => f.path),
    ["a.svg", "icones/b.svg"],
  );

  const empty = join(dir, "vazio.zip");
  await writeFile(empty, zipSync({ "leia.txt": strToU8("x") }));
  await assert.rejects(readDesignKit(empty), /não tem SVG nem PNG/);

  const notZip = join(dir, "falso.zip");
  await writeFile(notZip, "não é zip");
  await assert.rejects(readDesignKit(notZip), /não é um ZIP que dê para ler/);
});

test("an SVG over the import's limit is left out, said with the limit", async () => {
  const file = join(dir, "grande.zip");
  await writeFile(
    file,
    zipSync({
      "kit/enorme.svg": strToU8(`<svg>${" ".repeat(1_600_000)}</svg>`),
      "kit/ok.svg": strToU8(svg),
    }),
  );
  const kit = await readDesignKit(file);
  assert.deepEqual(
    kit.files.map((f) => f.path),
    ["ok.svg"],
  );
  assert.deepEqual(kit.left, ["enorme.svg (maior que 1,5 MB)"]);
});
