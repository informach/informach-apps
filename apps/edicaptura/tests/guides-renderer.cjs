const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { GuideStore } = require("../src/main/guides.ts");

// The guide editor in real Chromium, saving through the real GuideStore on a temporary folder.
// Synthetic images only.
async function run() {
  const parent = path.resolve(__dirname, "../test-results/guides-renderer");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "case-"));
  const store = new GuideStore(root);
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => failures.push(error.message));
    await page.exposeFunction("guideSave", ({ guide, assets }) =>
      store.save(
        guide,
        assets.map((asset) => ({ id: asset.id, bytes: Uint8Array.from(asset.bytes) })),
      ),
    );
    await page.exposeFunction("guideRead", (id) => store.read(id));
    await page.exposeFunction("guideList", () => store.list());
    await page.exposeFunction("guideTrash", ({ id, deleted }) => store.trash(id, deleted));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/renderer.html`);
    await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const { mountGuides } = await import("/src/editor/guides.js");
      const paint = (color) => {
        const source = document.createElement("canvas");
        source.width = 200;
        source.height = 120;
        const ctx = source.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 200, 120);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 40, 40);
        return source.toDataURL();
      };
      const actions = document.createElement("section");
      actions.className = "main-actions";
      const canvas = document.createElement("canvas");
      document.body.append(actions, canvas);
      const engine = new CanvasEditor(canvas, {
        change() {},
        selection() {},
        text: async () => "",
      });
      // The open capture has a red secret covered by an opaque mask.
      await engine.load({ dataUrl: paint("#ff0000"), annotations: [] });
      engine.addAnnotation("redact", { x: 0, y: 0, x2: 40, y2: 40 });
      const fixture = { exports: [], toasts: [] };
      window.guideFixture = fixture;
      const library = {
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "image",
          name: "Tela azul",
          dataUrl: paint("#0000ff"),
          annotations: [],
        },
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          kind: "image",
          name: "Tela verde",
          dataUrl: paint("#00ff00"),
          annotations: [],
        },
      };
      const api = {
        guideSave: ({ guide, assets }) =>
          fixture.failSave
            ? Promise.reject(new Error("Disco cheio"))
            : window.guideSave({
                guide,
                assets: assets.map((asset) => ({ id: asset.id, bytes: Array.from(asset.bytes) })),
              }),
        guideRead: (id) => window.guideRead(id),
        guideList: () => window.guideList(),
        guideTrash: (input) => window.guideTrash(input),
        guideExport: async (input) => {
          fixture.exports.push(input);
          return `C:\\fixture\\guia.${input.format}`;
        },
        list: async () => ({ items: [library["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]], total: 1 }),
        read: async (id) => structuredClone(library[id]),
      };
      fixture.panel = mountGuides({
        api,
        engine,
        current: () => ({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          kind: "image",
          name: "Captura aberta",
        }),
        toast: (message) => fixture.toasts.push(message),
      });
      fixture.library = library;
      fixture.pixel = async (src, x, y) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const probe = document.createElement("canvas");
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const ctx = probe.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
      };
    });
    const saved = async () => (await store.list())[0];
    const settle = async () => {
      try {
        await page.waitForFunction(() =>
          /salvo neste/.test(document.querySelector("#guide-status").textContent),
        );
      } catch (error) {
        console.error(
          "Guide diagnostic",
          JSON.stringify(
            await page.evaluate(() => ({
              status: document.querySelector("#guide-status").textContent,
              toasts: window.guideFixture.toasts,
            })),
          ),
        );
        throw error;
      }
    };
    await page.locator("#guides").click();
    await page.locator("#guide-new").click();
    await settle();
    await page.locator("#guide-title").fill("Como cadastrar");
    // 1. The open capture becomes a step with its final image: the mask, not the secret.
    await page.locator("#guide-add-current").click();
    await page.waitForFunction(() =>
      /adicionada como passo/.test(document.querySelector("#guide-status").textContent),
    );
    const first = await page.locator(".guide-step img").first().getAttribute("src");
    assert.deepEqual(
      await page.evaluate(({ src }) => window.guideFixture.pixel(src, 10, 10), { src: first }),
      [0, 0, 0],
    );
    // 2. From the library, then accessible text, reordering and autosave.
    await page.locator("#guide-add-library").click();
    await page.locator("#guide-picker-list input").first().check();
    await page.locator("#guide-picker-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".guide-step").length === 2);
    await page
      .locator(".guide-step")
      .nth(1)
      .locator("input")
      .nth(1)
      .fill("Tela azul com o formulário");
    await page.getByRole("button", { name: "Subir passo 2" }).click();
    await settle();
    await page.waitForTimeout(800);
    let guide = (await store.read((await saved()).id)).guide;
    assert.equal(guide.title, "Como cadastrar");
    assert.deepEqual(
      guide.steps.map((step) => [step.title, step.alt]),
      [
        ["Tela azul", "Tela azul com o formulário"],
        ["Captura aberta", ""],
      ],
    );
    // 3. "Capturar passos": a new capture becomes the next step instead of opening.
    await page.locator("#guide-session").click();
    await page.waitForFunction(() => !document.querySelector("#guide-banner").hidden);
    assert.equal(await page.locator("#guide-dialog").evaluate((dialog) => dialog.open), false);
    const took = await page.evaluate(() =>
      window.guideFixture.panel.capture(
        window.guideFixture.library["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      ),
    );
    assert.equal(took, true);
    assert.match(await page.locator("#guide-banner-text").textContent(), /1 adicionado/);
    const video = await page.evaluate(() =>
      window.guideFixture.panel.capture({ kind: "video", id: "x" }),
    );
    assert.equal(video, false, "videos open normally");
    await page.locator("#guide-banner-done").click();
    await page.waitForFunction(() => document.querySelectorAll(".guide-step").length === 3);
    guide = (await store.read(guide.id)).guide;
    assert.equal(guide.steps.length, 3);
    assert.equal(guide.steps[2].sourceId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    // A step whose save fails leaves the guide as it was saved, and later saves still work.
    await page.evaluate(() => {
      window.guideFixture.failSave = true;
    });
    await page.locator("#guide-add-current").click();
    await page.waitForFunction(() => window.guideFixture.toasts.some((t) => /Disco cheio/.test(t)));
    assert.equal(await page.locator(".guide-step").count(), 3);
    await page.evaluate(() => {
      window.guideFixture.failSave = false;
    });
    // 4. Exports go through the main process; trash and restore keep the files.
    await page.locator("#guide-html").click();
    await page.locator("#guide-pdf").click();
    await page.waitForFunction(() => window.guideFixture.exports.length === 2);
    assert.deepEqual(
      await page.evaluate(() => window.guideFixture.exports.map((call) => call.format)),
      ["html", "pdf"],
    );
    await page.locator("#guide-trash").click();
    await page.waitForFunction(() =>
      /lixeira/.test(document.querySelector("#guide-status").textContent),
    );
    assert.ok((await saved()).deletedAt);
    await page.locator("#guide-trash").click();
    await page.waitForFunction(() =>
      /restaurado/.test(document.querySelector("#guide-status").textContent),
    );
    assert.equal((await saved()).deletedAt, null);
    const { html } = await store.html(guide.id);
    assert.match(html, /Como cadastrar/);
    assert.match(html, /alt="Tela azul com o formulário"/);
    assert.deepEqual(failures, []);
    console.log(
      JSON.stringify({
        guideSteps: guide.steps.length,
        maskedPixel: [0, 0, 0],
        reorderedAndAltSaved: true,
        captureSession: true,
        exports: ["html", "pdf"],
        trashRestore: true,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
