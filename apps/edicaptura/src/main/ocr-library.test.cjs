const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Library } = require("./library.cjs");
const { snapshot, encodeArchive, decodeArchive } = require("./portable.ts");

// A PNG header is enough: the library reads only the size and hashes the bytes.
function png(width, height, salt = 0) {
  const bytes = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(salt, 36);
  return bytes;
}
const result = (width, height, words) => ({
  width,
  height,
  confidence: 90,
  words: words.map(([text, line, x0, y0]) => ({
    text,
    confidence: 90,
    x0,
    y0,
    x1: x0 + 40,
    y1: y0 + 20,
    line,
  })),
});
async function fixture(t) {
  const base = path.resolve(__dirname, "../../test-results/ocr-library");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const lib = new Library(path.join(folder, "library"));
  await lib.init();
  return lib;
}

test("texto reconhecido fica ao lado do projeto, com correções e identidade do original", async (t) => {
  const lib = await fixture(t);
  const doc = await lib.save({ name: "Tela de cadastro" }, png(400, 300));
  assert.equal(await lib.readOcr(doc.id), null);
  await assert.rejects(
    lib.saveOcr({ id: doc.id, languages: ["por"], result: result(401, 300, []) }),
    /não corresponde/,
  );
  const saved = await lib.saveOcr({
    id: doc.id,
    languages: ["por", "eng"],
    result: result(400, 300, [
      ["Protocolo", 0, 10, 10],
      ["8841", 0, 60, 10],
    ]),
  });
  assert.equal(saved.status, "text");
  assert.match(saved.source.sha256, /^[a-f0-9]{64}$/);
  const edited = await lib.editOcr({ id: doc.id, edits: { 0: "Protocolo 8847" } });
  assert.equal(edited.edits["0"], "Protocolo 8847");
  await assert.rejects(lib.editOcr({ id: doc.id, edits: { 7: "x" } }), /não existe/);
  assert.deepEqual((await lib.readOcr(doc.id)).edits, { 0: "Protocolo 8847" });
  const empty = await lib.save({ name: "Vazia" }, png(10, 10, 1));
  assert.equal(
    (await lib.saveOcr({ id: empty.id, languages: ["por"], result: result(10, 10, []) })).status,
    "empty",
  );
  // The index never reads sidecars as projects.
  assert.equal((await lib.list({})).total, 2);
  await fs.writeFile(lib.file(doc.id, "png"), png(400, 300, 9));
  assert.deepEqual(await lib.readOcr(doc.id), { stale: true });
});

test("busca por conteúdo é opcional, usa a correção e acompanha apagar e duplicar", async (t) => {
  const lib = await fixture(t);
  const doc = await lib.save({ name: "Recibo" }, png(400, 300));
  await lib.saveOcr({
    id: doc.id,
    languages: ["por"],
    result: result(400, 300, [
      ["Pagamento", 0, 10, 10],
      ["aprovado", 0, 60, 10],
    ]),
  });
  assert.equal((await lib.list({ search: "aprovado" })).total, 0);
  assert.equal((await lib.list({ search: "aprovado", content: true })).total, 1);
  assert.equal((await lib.list({ search: "recibo", content: true })).total, 1);
  await lib.editOcr({ id: doc.id, edits: { 0: "Pagamento estornado" } });
  assert.equal((await lib.list({ search: "aprovado", content: true })).total, 0);
  assert.equal((await lib.list({ search: "estornado", content: true })).total, 1);
  const copy = await lib.duplicate(doc.id);
  assert.equal((await lib.list({ search: "estornado", content: true })).total, 2);
  assert.equal((await lib.readOcr(copy.id)).edits["0"], "Pagamento estornado");
  await lib.deleteOcr(doc.id);
  assert.equal((await lib.list({ search: "estornado", content: true })).total, 1);
  assert.equal(await lib.readOcr(doc.id), null);
  // The sidecar travels with the portable project.
  const files = decodeArchive(
    encodeArchive(await snapshot(lib.root, copy.id), "project"),
    "project",
  ).files;
  assert.ok(files.has(`${copy.id}.ocr`));
});

test("busca por conteúdo em 10.000 capturas não trunca o texto", async (t) => {
  const { LibraryIndex } = require("../domain/library-index.ts");
  const index = new LibraryIndex();
  const filler = "linha de texto reconhecido com números 12345 e palavras comuns ".repeat(60);
  for (let i = 0; i < 10_000; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    index.upsert({
      id,
      name: `Captura ${i}`,
      kind: "image",
      created: "2026-10-19T00:00:00.000Z",
      updated: "2026-10-19T00:00:00.000Z",
      tags: [],
      favorite: false,
      collection: "",
      sourceApp: "",
      deletedAt: null,
    });
    index.setContent(id, i === 9_999 ? `${filler} código final XK-9931` : filler);
  }
  const started = performance.now();
  const found = index.query({ search: "xk-9931", content: true });
  const elapsed = performance.now() - started;
  assert.equal(found.total, 1);
  t.diagnostic(`10.000 capturas, ~3.800 caracteres cada: ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < 2000, `busca levou ${elapsed} ms`);
});

test("reimportar o mesmo projeto continua reutilizando, mesmo com texto reconhecido aqui", async (t) => {
  const { importProject } = require("./portable.ts");
  const lib = await fixture(t);
  const doc = await lib.save({ name: "Formulário" }, png(400, 300));
  const exported = await snapshot(lib.root, doc.id);
  await lib.saveOcr({
    id: doc.id,
    languages: ["por"],
    result: result(400, 300, [["Nome", 0, 10, 10]]),
  });
  const again = await importProject(lib.root, exported);
  assert.deepEqual(again, { id: doc.id, reused: true });
});
