const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Library } = require("./library.cjs");
async function fixture() {
  const base = path.resolve(__dirname, "../../test-results/library");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-"));
  const lib = new Library(folder);
  await lib.init();
  return { lib, folder };
}
test("salva e recupera original, anotações e recorte após reiniciar a biblioteca", async () => {
  const { lib, folder } = await fixture();
  const data = Buffer.from("original-bytes");
  const item = await lib.save(
    {
      name: "Projeto",
      annotations: [{ kind: "arrow", x: 10 }],
      crop: { x: 1, y: 2, width: 10, height: 20 },
    },
    data,
  );
  const reopened = new Library(folder);
  const doc = await reopened.read(item.id);
  assert.equal(doc.dataUrl, "data:image/png;base64," + data.toString("base64"));
  assert.equal(doc.annotations[0].x, 10);
  assert.equal(doc.crop.height, 20);
  assert.equal((await reopened.list())[0].name, "Projeto");
});
test("edições concorrentes são serializadas e preservam o arquivo original", async () => {
  const { lib } = await fixture();
  const item = await lib.save({ name: "Inicial" }, Buffer.from("original"));
  await Promise.all([
    lib.save({ id: item.id, name: "Primeira", annotations: [1] }),
    lib.save({ id: item.id, name: "Última", annotations: [2] }),
  ]);
  const doc = await lib.read(item.id);
  assert.equal(doc.name, "Última");
  assert.deepEqual(doc.annotations, [2]);
  assert.equal(doc.created, item.created);
  assert.ok(doc.dataUrl.endsWith(Buffer.from("original").toString("base64")));
});
test("vídeo usa WebM e falha de uma gravação não interrompe as próximas", async () => {
  const { lib } = await fixture();
  await assert.rejects(lib.save({ id: "../../escape", name: "No" }));
  const item = await lib.save({ name: "Vídeo", kind: "video" }, Buffer.from("webm"));
  assert.equal((await lib.read(item.id)).dataUrl, "data:video/webm;base64,d2VibQ==");
});
test("listagem ignora metadados corrompidos e bloqueia traversal", async () => {
  const { lib, folder } = await fixture();
  await fs.writeFile(path.join(folder, "broken.json"), "{");
  assert.deepEqual(await lib.list(), []);
  await assert.rejects(lib.read("../../package"));
  assert.throws(() => lib.file("invalid", "png"));
});
