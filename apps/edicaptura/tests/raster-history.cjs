const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { crc32, deflateSync } = require("node:zlib");
const { chromium } = require("playwright");
const { Library } = require("../src/main/library.cjs");
const { collectImageAssets } = require("../src/domain/assets.ts");
const { imageEditSchema } = require("../src/domain/document.ts");
const { snapshot, encodeArchive, decodeArchive } = require("../src/main/portable.ts");

function pngFixture() {
  const width = 2500,
    height = 2500,
    stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 4;
      raw[i] = x % 256;
      raw[i + 1] = y % 256;
      raw[i + 2] = (x + y) % 256;
      raw[i + 3] = 255;
    }
  function chunk(name, bytes) {
    const type = Buffer.from(name),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
    return Buffer.concat([size, type, bytes, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function run() {
  const png = pngFixture(),
    dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  assert.ok(png.length > 25_000_000);
  const base = path.resolve(__dirname, "../test-results/raster-history");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-"));
  const lib = new Library(path.join(folder, "library"));
  await lib.init();
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  let releaseSave;
  let enterHold;
  const held = new Promise((resolve) => {
    enterHold = resolve;
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.clock.install({ time: new Date("2026-10-18T00:00:00Z") });
    const errors = [],
      saves = [];
    let failSave = false,
      holdSave = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("backend", async (action, value) => {
      if (action === "source") return dataUrl;
      if (action === "read") return lib.read(value);
      if (action === "list") return lib.list(value);
      if (action === "update") {
        saves.push({ action, assets: 0, sourceBytes: 0, preview: false });
        return lib.updateMetadata(value);
      }
      if (action === "save") {
        const edits = imageEditSchema.parse(value);
        const assets = [...collectImageAssets(edits.annotations, value.assets)].map(
          ([id, source]) => ({ id, bytes: Buffer.from(source.split(",")[1], "base64") }),
        );
        saves.push({
          action,
          assets: assets.length,
          sourceBytes: assets.reduce((sum, asset) => sum + asset.bytes.length, 0),
          metadataBytes: JSON.stringify(edits).length,
          preview: !!value.preview,
        });
        if (failSave) {
          failSave = false;
          throw new Error("Synthetic disk unavailable");
        }
        const result = await lib.save(value, null, assets);
        if (holdSave) {
          holdSave = false;
          await new Promise((resolve) => {
            releaseSave = resolve;
            enterHold();
          });
        }
        return result;
      }
      throw new Error(`Unexpected operation: ${action}`);
    });
    await page.addInitScript(() => {
      window.fixture = { callbacks: {}, started: 0, finished: 0 };
      window.ediSuite = { onRecovery() {} };
      window.edi = {
        onVideoProgress() {},
        videoInspect: async () => {
          throw new Error("Metadata service is outside this fixture");
        },
        // Phase 6–8 preload methods, inert here: no recognized text, guides or assistant clients.
        ocrRead: async () => null,
        ocrSave: async () => null,
        ocrEdit: async () => null,
        ocrDelete: async () => true,
        ocrCopyText: async () => true,
        guideList: async () => [],
        guideRead: async () => null,
        guideSave: async () => null,
        guideTrash: async () => null,
        guideExport: async () => null,
        aiClients: async () => [],
        aiTaskStart: async () => ({ runId: "" }),
        aiTaskStop: async () => false,
        onAiEvent() {},
        recordRecoveries: async () => [],
        status: async () => ({ version: "test", captureShortcut: "PrintScreen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: (value) => window.backend("list", value),
        read: (value) => window.backend("read", value),
        update: (value) => window.backend("update", value),
        save: async (value) => {
          window.fixture.started++;
          try {
            return await window.backend("save", value);
          } finally {
            window.fixture.finished++;
          }
        },
        importObject: () => window.backend("source"),
        onDocument: (callback) => {
          window.fixture.callbacks.open = callback;
        },
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.callbacks.open);
    const originalUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 100;
      canvas.getContext("2d").fillRect(0, 0, 100, 100);
      return canvas.toDataURL();
    });
    const doc = await lib.save(
      { name: "Large raster", preview: originalUrl },
      Buffer.from(originalUrl.split(",")[1], "base64"),
    );
    await page.evaluate(
      async (id) => window.fixture.callbacks.open(await window.edi.read(id)),
      doc.id,
    );
    await page.clock.pauseAt(new Date("2026-10-19T00:00:00Z"));
    failSave = true;
    await page.evaluate(() => {
      document.querySelector("#insert-image").closest("details").open = true;
      document.querySelector("#insert-image").click();
    });
    await page.waitForFunction(() => document.querySelectorAll(".object-item").length === 1);
    // Exercise the real autosave deadline. Wall-clock PNG/IPC cost must not create
    // an unplanned manual retry before the deliberate first failure is observed.
    assert.equal(saves.length, 0);
    await page.clock.runFor(449);
    assert.equal(saves.length, 0, "autosave must remain pending before 450 ms");
    await page.clock.runFor(1);
    await page.waitForFunction(() =>
      document.querySelector("#save-status").textContent.startsWith("Não salvo"),
    );
    assert.equal(saves.filter((s) => s.action === "save").length, 1);
    assert.equal(
      (await lib.read(doc.id)).annotations.length,
      0,
      "failed save preserves published metadata",
    );
    holdSave = true;
    await page.locator("#duplicate-object").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.started === 2);
    // The real disk publication precedes the held acknowledgment.
    let holdDeadline;
    try {
      await Promise.race([
        held,
        new Promise((_resolve, reject) => {
          holdDeadline = setTimeout(
            () => reject(new Error("Save acknowledgment boundary not reached")),
            30_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(holdDeadline);
    }
    assert.equal((await lib.read(doc.id)).annotations.length, 2);
    await page.locator("#duplicate-object").click();
    await page.locator("#save").click();
    assert.equal(typeof releaseSave, "function");
    releaseSave();
    releaseSave = undefined;
    await page.waitForFunction(
      () =>
        window.fixture.finished === 3 &&
        document.querySelector("#save-status").textContent === "Todas as alterações salvas",
    );
    const imageSaves = saves.filter((s) => s.action === "save");
    assert.deepEqual(
      imageSaves.map((s) => s.assets),
      [1, 1, 0],
    );
    assert.deepEqual(
      imageSaves.map((s) => s.sourceBytes),
      [png.length, png.length, 0],
    );
    assert.ok(imageSaves.every((s) => s.metadataBytes < 5000));
    const persisted = await lib.read(doc.id);
    assert.equal(persisted.assets.length, 1);
    assert.equal(persisted.annotations.length, 3);
    const assetId = persisted.assets[0].id;
    assert.equal(hash(await fs.readFile(lib.file(doc.id, `${assetId}.png`))), hash(png));
    assert.ok(persisted.annotations.every((a) => a.assetId === assetId && a.dataUrl === undefined));
    assert.equal(
      (await fs.readdir(lib.root)).filter((name) => name.endsWith(`${assetId}.png`)).length,
      1,
    );

    // V8 precise coverage observes production calls, without replacing canvas or application methods.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    await page.locator("#rotate-image").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.finished === 4);
    const visualCoverage = await cdp.send("Profiler.takePreciseCoverage");
    const visualExports = visualCoverage.result
      .filter((script) => script.url.includes("/src/editor/canvas.js"))
      .flatMap((script) => script.functions.filter((fn) => fn.functionName === "export"));
    assert.equal(visualExports.length, 1, "positive calibration finds production export method");
    assert.ok(visualExports[0].ranges[0].count > 0);
    const rotatedPreview = (await lib.read(doc.id)).preview;
    assert.notEqual(rotatedPreview, persisted.preview, "visual transform refreshes thumbnail");
    await page.locator("#undo").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.finished === 5);
    assert.equal((await lib.read(doc.id)).preview, persisted.preview, "undo refreshes thumbnail");
    await page.locator("#redo").click();
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.finished === 6);
    assert.equal((await lib.read(doc.id)).preview, rotatedPreview, "redo refreshes thumbnail");
    await cdp.send("Profiler.takePreciseCoverage");
    await page.locator("#document-name").fill("Only metadata changed");
    await page.locator("#save").click();
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "Todas as alterações salvas",
    );
    const coverage = await cdp.send("Profiler.takePreciseCoverage");
    await cdp.send("Profiler.stopPreciseCoverage");
    const exports = coverage.result
      .filter((script) => script.url.includes("/src/editor/canvas.js"))
      .flatMap((script) => script.functions.filter((fn) => fn.functionName === "export"));
    const metadataExportCalls = exports.reduce((sum, fn) => sum + fn.ranges[0].count, 0);
    assert.equal(metadataExportCalls, 0, "title-only save performs zero image export/PNG encodes");
    assert.equal(saves.at(-1).action, "update");
    assert.equal((await lib.read(doc.id)).preview, rotatedPreview);

    // Real CanvasEditor history, then real filesystem and portable reopen.
    const history = await page.evaluate(async (id) => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const doc = await window.edi.read(id);
      const editor = new CanvasEditor(document.createElement("canvas"), {
        change() {},
        selection() {},
        text: async () => "",
      });
      await editor.load(doc);
      const before = editor.export();
      editor.selectIndices([0]);
      for (let n = 0; n < 12; n++) editor.moveSelection(1, 0);
      const moved = editor.annotations[0].x;
      const historyCharacters = editor.past.reduce((sum, item) => sum + item.length, 0);
      const states = editor.past.length;
      for (let n = 0; n < 12; n++) editor.undo();
      const afterUndo = editor.export();
      for (let n = 0; n < 12; n++) editor.redo();
      const afterRedo = editor.annotations[0].x;
      const referencesOnly =
        !editor.snapshot().includes("data:image") &&
        editor.past.every((item) => !item.includes("data:image"));
      editor.selectIndices([0]);
      editor.duplicateSelection();
      await window.edi.save({
        id,
        name: "History saved",
        ...JSON.parse(editor.snapshot()),
        assets: editor.assets.pending(editor.annotations),
      });
      const finalPixels = editor.export();
      await editor.load(await window.edi.read(id));
      const samePixels = finalPixels === editor.export();
      // Legacy inline documents are normalized at the load boundary as well.
      const legacy = {
        ...doc,
        assets: undefined,
        annotations: doc.annotations.map((a) => ({
          ...a,
          dataUrl: doc.assets.find((asset) => asset.id === a.assetId).dataUrl,
        })),
      };
      await editor.load(legacy);
      return {
        moved,
        afterRedo,
        states,
        historyCharacters,
        referencesOnly,
        undoSame: before === afterUndo,
        samePixels,
        legacySame: before === editor.export(),
        legacyReferenceOnly: !editor.snapshot().includes("data:image"),
        finalPixels,
      };
    }, doc.id);
    assert.equal(history.states, 12);
    assert.equal(history.moved, 12);
    assert.equal(history.afterRedo, 12);
    assert.ok(history.historyCharacters < 50_000);
    for (const key of [
      "referencesOnly",
      "undoSame",
      "samePixels",
      "legacySame",
      "legacyReferenceOnly",
    ])
      assert.equal(history[key], true, key);
    const copied = await lib.duplicate(doc.id);
    const restored = new Library(path.join(folder, "restored"));
    await restored.init();
    const imported = await restored.importPortable(
      decodeArchive(encodeArchive(await snapshot(lib.root, doc.id), "project"), "project").files,
    );
    for (const reopened of [await lib.read(copied.id), await restored.read(imported.id)]) {
      assert.equal(reopened.assets.length, 1);
      assert.equal(
        hash(Buffer.from(reopened.assets[0].dataUrl.split(",")[1], "base64")),
        hash(png),
      );
      const finalPixels = await page.evaluate(async (doc) => {
        const { CanvasEditor } = await import("/src/editor/canvas.js");
        const editor = new CanvasEditor(document.createElement("canvas"), {
          change() {},
          selection() {},
          text: async () => "",
        });
        await editor.load(doc);
        return editor.export();
      }, reopened);
      assert.equal(finalPixels, history.finalPixels);
    }
    await assert.rejects(
      lib.save({ id: doc.id }, null, [{ id: assetId, bytes: Buffer.from("changed") }]),
      /conflitante/,
    );
    assert.equal(hash(await fs.readFile(lib.file(doc.id, `${assetId}.png`))), hash(png));
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        rasterBytes: png.length,
        sourceCharacters: dataUrl.length,
        placedCopies: 4,
        undoStates: history.states,
        historyCharacters: history.historyCharacters,
        sourceBytesPerSave: imageSaves.map((s) => s.sourceBytes),
        metadataExportCalls,
      }),
    );
    console.log(
      "PASS: actual 25MB PNG, unique source transport, failed/queued save acknowledgment, small useful undo/redo history, exact disk/duplicate/portable reopen pixels, legacy normalization, immutable conflict, title-only zero PNG export calls",
    );
  } finally {
    releaseSave?.();
    await browser.close();
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
