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
      annotations: [{ kind: "arrow", x: 10, y: 10, x2: 20, y2: 20 }],
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
    lib.save({
      id: item.id,
      name: "Primeira",
      annotations: [{ kind: "text", x: 1, y: 2, text: "Primeira" }],
    }),
    lib.save({
      id: item.id,
      name: "Última",
      annotations: [{ kind: "text", x: 1, y: 2, text: "Última" }],
    }),
  ]);
  const doc = await lib.read(item.id);
  assert.equal(doc.name, "Última");
  assert.equal(doc.annotations[0].text, "Última");
  assert.equal(doc.created, item.created);
  assert.ok(doc.dataUrl.endsWith(Buffer.from("original").toString("base64")));
});
test("vídeo usa WebM e falha de uma gravação não interrompe as próximas", async () => {
  const { lib } = await fixture();
  await assert.rejects(lib.save({ id: "../../escape", name: "No" }));
  const item = await lib.save({ name: "Vídeo", kind: "video" }, Buffer.from("webm"));
  assert.equal((await lib.read(item.id)).dataUrl, "");
  assert.equal(await fs.readFile(lib.file(item.id, "webm"), "utf8"), "webm");
});
test("listagem sinaliza metadados corrompidos e bloqueia traversal", async () => {
  const { lib, folder } = await fixture();
  await fs.writeFile(path.join(folder, "broken.json"), "{");
  assert.equal((await lib.list())[0].kind, "damaged");
  await assert.rejects(lib.read("../../package"));
  assert.throws(() => lib.file("invalid", "png"));
});
test("renomear vídeo preserva tipo e bytes; conversão acidental é recusada", async () => {
  const { lib } = await fixture();
  const video = await lib.save({ kind: "video", name: "Original" }, Buffer.from("webm"));
  await lib.updateMetadata({ id: video.id, name: "Renamed" });
  const doc = await lib.read(video.id);
  assert.equal(doc.kind, "video");
  assert.equal(doc.name, "Renamed");
  assert.equal(doc.dataUrl, "");
  assert.equal(await fs.readFile(lib.file(video.id, "webm"), "utf8"), "webm");
  await assert.rejects(lib.save({ id: video.id, kind: "image" }), /tipo de mídia/);
});
test("recuperação guarda metadados danificados e mantém original", async () => {
  const { lib, folder } = await fixture();
  const original = await lib.save({ name: "Capture" }, Buffer.from("original"));
  await fs.writeFile(lib.file(original.id, "json"), "{broken");
  await lib.recover(original.id);
  assert.equal((await lib.read(original.id)).name, "Original recuperado");
  assert.equal(await fs.readFile(lib.file(original.id, "png"), "utf8"), "original");
  const backup = (await fs.readdir(folder)).find((name) => name.includes(".damaged-"));
  assert.ok(backup);
  assert.equal(await fs.readFile(path.join(folder, backup), "utf8"), "{broken");
});
test("objetos raster e transformações sobrevivem à reabertura sem embutir mídias no JSON", async () => {
  const { lib } = await fixture(),
    assetId = crypto.randomUUID(),
    png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
      "base64",
    );
  const saved = await lib.save(
    {
      name: "Composed",
      annotations: [{ kind: "image", assetId, x: 0, y: 0, x2: 1, y2: 1 }],
      viewTransform: { turns: 1, padding: 10 },
    },
    png,
    [{ id: assetId, bytes: png }],
  );
  const reopened = new Library(lib.root),
    doc = await reopened.read(saved.id);
  assert.equal(doc.annotations[0].dataUrl, undefined);
  assert.deepEqual(doc.assets, [
    { id: assetId, dataUrl: `data:image/png;base64,${png.toString("base64")}` },
  ]);
  assert.equal(doc.viewTransform.turns, 1);
  assert.equal(doc.viewTransform.padding, 10);
  assert.equal(
    JSON.parse(await fs.readFile(lib.file(saved.id, "json"), "utf8")).annotations[0].dataUrl,
    undefined,
  );
  await assert.rejects(
    lib.save({
      id: saved.id,
      name: "Broken",
      annotations: [{ kind: "image", assetId: crypto.randomUUID(), x: 0, y: 0, x2: 1, y2: 1 }],
    }),
    /ENOENT/,
  );
  assert.equal((await reopened.read(saved.id)).name, "Composed");
});

test("aggregate raster budget includes already persisted unique sources and preserves published metadata", async () => {
  const { lib, folder } = await fixture();
  try {
    const item = await lib.save({ name: "Within budget" }, Buffer.from("original"));
    const annotations = [];
    for (let n = 0; n < 3; n++) {
      const assetId = crypto.randomUUID();
      const file = await fs.open(lib.file(item.id, `${assetId}.png`), "wx");
      try {
        await file.truncate(20_000_000);
      } finally {
        await file.close();
      }
      annotations.push({ kind: "image", assetId, x: 0, y: 0, x2: 1, y2: 1 });
    }
    await lib.save({ id: item.id, annotations: annotations.slice(0, 2) });
    const before = await fs.readFile(lib.file(item.id, "json"), "utf8");
    await assert.rejects(
      lib.save({ id: item.id, name: "Over budget", annotations }),
      /limite de imagens/,
    );
    assert.equal(await fs.readFile(lib.file(item.id, "json"), "utf8"), before);
    // A legacy/corrupt oversized document must also fail at the bounded read boundary.
    await fs.writeFile(
      lib.file(item.id, "json"),
      JSON.stringify({ ...JSON.parse(before), annotations }),
    );
    await assert.rejects(lib.read(item.id), /limite de imagens/);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
