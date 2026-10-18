const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { Library } = require("../src/main/library.cjs");
const { registerLibraryIpc, readPreferences } = require("../src/main/library-ipc.ts");
async function run() {
  const base = path.resolve(__dirname, "../test-results/library-renderer");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-")),
    lib = new Library(path.join(folder, "captures"));
  await lib.init();
  const handlers = new Map();
  registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => lib,
    preferences: await readPreferences(path.join(folder, "settings.json"), lib.root),
    settingsPath: path.join(folder, "settings.json"),
    electron: {
      dialog: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showSaveDialog: async () => ({ canceled: true }),
      },
      nativeImage: {},
      shell: {},
      clipboard: {},
    },
    assertAccess() {},
    canSwitch: () => true,
    switching() {},
    replaceRoot: async () => {},
    applyPreferences() {},
    thumbnail() {},
  });
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("backend", async (action, data) => {
      if (action === "list") return lib.list(data);
      if (action === "read") return lib.read(data);
      if (action === "save") return lib.save(data);
      if (action === "update") return lib.updateMetadata(data);
      if (action === "workflow") return handlers.get("library:workflow")(data);
      throw new Error("Unexpected boundary operation");
    });
    await page.addInitScript(() => {
      window.fixture = { callbacks: {}, exports: [] };
      window.ediSuite = { onRecovery() {} };
      window.edi = {
        onVideoProgress() {},
        videoInspect: async () => {
          throw new Error("Metadata service is outside this fixture");
        },
        recordRecoveries: async () => [],
        status: async () => ({ version: "test", captureShortcut: "PrintScreen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: (q) => window.backend("list", q),
        read: (id) => window.backend("read", id),
        save: (value) => window.backend("save", value),
        update: (value) => window.backend("update", value),
        libraryWorkflow: (value) => window.backend("workflow", value),
        onDocument: (fn) => {
          window.fixture.callbacks.open = fn;
        },
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
        importImage: () =>
          new Promise((resolve) => {
            window.fixture.releaseImport = resolve;
          }),
        batchDestination: async () => "test-destination",
        batchFinish: async () => true,
        batchExport: async (value) => {
          window.fixture.exports.push(...value.items);
          return { succeeded: value.items.map((item) => item.id), failed: [] };
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.callbacks.open);
    const url = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 30;
      c.height = 20;
      c.getContext("2d").fillStyle = "white";
      c.getContext("2d").fillRect(0, 0, 30, 20);
      return c.toDataURL();
    });
    const docs = [];
    for (let n = 0; n < 130; n++)
      docs.push(
        await lib.save(
          {
            name: `Aula ${String(n).padStart(3, "0")}`,
            tags: ["escola"],
            collection: "Turma",
            sourceApp: "Navegador",
            annotations: [{ kind: "redact", x: 2, y: 2, x2: 15, y2: 15 }],
          },
          Buffer.from(url.split(",")[1], "base64"),
        ),
      );
    await page.evaluate(
      async (id) => window.fixture.callbacks.open(await window.edi.read(id)),
      docs[0].id,
    );
    await page.locator("#library-tab").click();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 60);
    assert.match(await page.locator("#library-page-status").textContent(), /de 130/);
    const evidence = await require("./renderer-evidence.cjs")("library");
    await page.screenshot({ path: path.join(evidence, "library-grid.png") });
    await page.locator("#library-next").click();
    await page.waitForFunction(() =>
      document.querySelector("#library-page-status").textContent.startsWith("61–120"),
    );
    await page.locator("#library-next").click();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 10);
    await page.locator("#library-search").fill("Aula 000");
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 1);
    await page.locator("#library-select-page").click();
    await page.waitForFunction(() =>
      document.querySelector("#library-page-status").textContent.includes("1 selecionadas"),
    );
    await page.locator("#library-apply").click();
    await page.waitForFunction(() =>
      document.querySelector(".library-entry-details").textContent.includes("Favorito"),
    );
    assert.equal((await lib.read(docs[0].id)).favorite, true);
    await page.locator("#library-select-page").click();
    await page.locator("#library-batch-export").click();
    await page.waitForFunction(() => window.fixture.exports.length === 1);
    const pixel = await page.evaluate(async () => {
      const image = new Image();
      const url = URL.createObjectURL(
        new Blob([window.fixture.exports[0].bytes], { type: "image/png" }),
      );
      image.src = url;
      await image.decode();
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = 30;
      c.height = 20;
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(5, 5, 1, 1).data];
    });
    assert.deepEqual(pixel, [0, 0, 0, 255]);
    await page.locator("#library-operation").selectOption("trash");
    await page.locator("#library-apply").click();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 0);
    assert.ok((await lib.read(docs[0].id)).deletedAt);
    await page.locator("#library-trash").check();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 1);
    await page.locator("#library-select-page").click();
    await page.locator("#library-operation").selectOption("restore");
    await page.locator("#library-apply").click();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 0);
    assert.equal((await lib.read(docs[0].id)).deletedAt, null);
    await page.locator("#library-trash").uncheck();
    await page.waitForFunction(() => document.querySelectorAll(".library-item").length === 1);
    await page.locator("#library-settings-open").click();
    await page.screenshot({ path: path.join(evidence, "library-settings.png") });
    assert.equal(await page.locator("#preference-tray").isChecked(), false);
    assert.equal(await page.locator("#preference-start").isChecked(), false);
    await page.locator("#library-backup").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("cancelado"),
    );
    await page.locator("#library-settings button[value=close]").click();
    await page.locator("#import-top").click();
    await page.waitForFunction(() => window.fixture.releaseImport);
    await page.evaluate(
      async ([a, b]) => {
        await window.fixture.callbacks.open(await window.edi.read(b));
        window.fixture.releaseImport(await window.edi.read(a));
      },
      [docs[0].id, docs[1].id],
    );
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("documento aberto mudou"),
    );
    assert.equal(await page.locator("#document-name").inputValue(), "Aula 001");
    await page.screenshot({ path: path.join(evidence, "library-workflows.png") });
    await page.mouse.move(1, 1);
    await page.mouse.down();
    const steps = await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const c = document.createElement("canvas"),
        ed = new CanvasEditor(c, { change() {}, selection() {}, text: async () => "" });
      document.body.append(c);
      const source = document.createElement("canvas");
      source.width = 100;
      source.height = 100;
      await ed.load({ dataUrl: source.toDataURL(), annotations: [] });
      ed.addAnnotation("steps", { number: 1 });
      ed.addAnnotation("steps", { number: 2 });
      ed.selectIndices([0, 1]);
      ed.group();
      const group = ed.annotations[0].groupId;
      ed.duplicateSelection();
      const duplicated = ed.annotations.map((a) => a.number),
        newGroup = ed.annotations[2].groupId;
      ed.undo();
      const undone = ed.annotations.map((a) => a.number);
      ed.redo();
      const redone = ed.annotations.map((a) => a.number);
      await ed.load({
        dataUrl: source.toDataURL(),
        annotations: [{ kind: "steps", number: 1000, x: 1, y: 1 }],
      });
      ed.selectIndices([0]);
      ed.duplicateSelection();
      const wrapped = ed.annotations.map((a) => a.number);
      ed.setTool("steps");
      const bounds = c.getBoundingClientRect(),
        pointer = {
          button: 0,
          clientX: bounds.left + 50,
          clientY: bounds.top + 50,
          preventDefault() {},
          pointerId: 1,
        };
      await ed.down(pointer);
      const created = ed.annotations.map((a) => a.number);
      ed.annotations = Array.from({ length: 1000 }, (_, i) => ({
        kind: "steps",
        number: i + 1,
        x: 1,
        y: 1,
      }));
      let rejected = false;
      try {
        await ed.down(pointer);
      } catch (error) {
        rejected = error.message.includes("1000");
      }
      return {
        duplicated,
        undone,
        redone,
        groupRemapped: group !== newGroup,
        wrapped,
        created,
        rejected,
        count: ed.annotations.length,
      };
    });
    await page.mouse.up();
    assert.deepEqual(steps.duplicated, [1, 2, 3, 4]);
    assert.deepEqual(steps.undone, [1, 2]);
    assert.deepEqual(steps.redone, [1, 2, 3, 4]);
    assert.ok(steps.groupRemapped);
    assert.deepEqual(steps.wrapped, [1000, 1]);
    assert.deepEqual(steps.created, [1000, 1, 2]);
    assert.ok(steps.rejected);
    assert.equal(steps.count, 1000);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 130-project library pages <=60, search, selection, favorite/trash/restore actual persistence, final batch-render redaction, preferences/cancel, stale import; unique duplicate/new step labels, undo/redo and 1000 limits",
    );
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
