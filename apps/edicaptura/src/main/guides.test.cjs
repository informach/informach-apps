const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { GuideStore } = require("./guides.ts");
const { renderGuideHtml } = require("../domain/guide.ts");
const { Library } = require("./library.cjs");
const { snapshot } = require("./portable.ts");

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
const step = (assetId, extra = {}) => ({
  id: randomUUID(),
  assetId,
  title: "",
  description: "",
  alt: "",
  width: 320,
  height: 200,
  ...extra,
});
async function fixture(t) {
  const base = path.resolve(__dirname, "../../test-results/guides");
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, "case-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new GuideStore(root) };
}

test("guia guarda passos com imagens saneadas, reordena e vai para a lixeira local", async (t) => {
  const { root, store } = await fixture(t);
  const a = randomUUID(),
    b = randomUUID();
  const first = step(a, { title: "Abra o menu", alt: "Menu Arquivo aberto" });
  const second = step(b, { title: "Escolha Salvar" });
  const guide = await store.save(
    { title: "Como salvar", description: "", layout: "tutorial", steps: [first, second] },
    [
      { id: a, bytes: png(320, 200, 1) },
      { id: b, bytes: png(320, 200, 2) },
    ],
  );
  assert.equal((await store.list())[0].steps, 2);
  // Reordering and editing reuse the images already written.
  const reordered = await store.save({
    id: guide.id,
    title: "Como salvar um arquivo",
    description: "Dois passos.",
    layout: "comparison",
    steps: [second, { ...first, description: "Clique em Arquivo." }],
  });
  assert.equal(reordered.created, guide.created);
  assert.deepEqual(
    reordered.steps.map((s) => s.title),
    ["Escolha Salvar", "Abra o menu"],
  );
  const { images } = await store.read(guide.id);
  assert.equal(Object.keys(images).length, 2);
  await assert.rejects(
    store.save({
      id: guide.id,
      title: "x",
      description: "",
      layout: "tutorial",
      steps: [step(randomUUID())],
    }),
    /ausente/,
  );
  await assert.rejects(
    store.save({ title: "x", description: "", layout: "tutorial", steps: [step(a)] }, [
      { id: a, bytes: png(10, 10) },
    ]),
    /não corresponde/,
  );
  await assert.rejects(
    store.save({ title: "x", description: "", layout: "tutorial", steps: [step(a)] }, [
      { id: a, bytes: Buffer.from("not a png") },
    ]),
    /inválida/,
  );
  assert.ok((await store.trash(guide.id, true)).deletedAt);
  assert.equal((await store.trash(guide.id, false)).deletedAt, null);
  // The library index never reads guides as captures, and whole-library backups carry them.
  const library = new Library(root);
  assert.equal((await library.list({})).total, 0);
  const files = await snapshot(root);
  assert.ok(files.has(`${guide.id}.guide`) && files.has(`${guide.id}.${a}.png`));
});

test("HTML do guia é autocontido, sem script e com texto escapado", () => {
  const assetId = randomUUID();
  const html = renderGuideHtml(
    {
      version: 1,
      id: randomUUID(),
      title: 'Guia <script>alert("x")</script>',
      description: "Primeiro parágrafo.\n\nSegundo & último.",
      layout: "tutorial",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      deletedAt: null,
      steps: [step(assetId, { title: "", alt: 'Botão "Salvar"', description: "Linha 1\nLinha 2" })],
    },
    new Map([[assetId, "QUJD"]]),
  );
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Guia &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /default-src 'none'; img-src data:/);
  assert.match(html, /alt="Botão &quot;Salvar&quot;"/);
  assert.match(html, /Passo 1/);
  assert.match(html, /<p>Segundo &amp; último\.<\/p>/);
  assert.match(html, /Linha 1<br>Linha 2/);
  assert.match(html, /src="data:image\/png;base64,QUJD"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.throws(() =>
    renderGuideHtml({ ...JSON.parse("{}"), steps: [step(randomUUID())] }, new Map()),
  );
});
