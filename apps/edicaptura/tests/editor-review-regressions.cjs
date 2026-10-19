const path = require("node:path");
const { createRequire } = require("node:module");
const requireApp = createRequire(path.resolve(__dirname, "../package.json"));
const { chromium } = requireApp("playwright");
const assert = require("node:assert/strict");
(async () => {
  await require("./crop-checkpoint.cjs")();
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript(() => {
      window.fixture = { saves: [], callbacks: {}, docs: [], closes: 0, listCalls: 0, writes: 0 };
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
        list: async () => {
          window.fixture.listCalls++;
          if (window.fixture.denyList) throw new Error("edi_access_restricted");
          return window.fixture.docs;
        },
        read: async (id) => window.fixture.docs.find((d) => d.id === id),
        save: async (data) => {
          if (window.fixture.failWrite) throw new Error("owned-save-failure");
          window.fixture.writes++;
          window.fixture.saves.push(structuredClone(data));
          return data;
        },
        update: async (data) => {
          if (window.fixture.failWrite) throw new Error("owned-save-failure");
          window.fixture.writes++;
          return data;
        },
        close: async () => {
          window.fixture.closes++;
          window.fixture.writesAtClose = window.fixture.writes;
        },
        onDocument: (cb) => (window.fixture.callbacks.open = cb),
        onNotice() {},
        onMonitors() {},
        onBeforeClose: (cb) => (window.fixture.callbacks.close = cb),
        pasteImage: () => new Promise((resolve) => (window.fixture.releasePaste = resolve)),
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.callbacks.open);
    await page.evaluate(async () => {
      const source = document.createElement("canvas");
      source.width = 200;
      source.height = 100;
      source.getContext("2d").fillRect(0, 0, 200, 100);
      const A = {
        id: crypto.randomUUID(),
        name: "A",
        kind: "image",
        dataUrl: source.toDataURL(),
        annotations: [
          { kind: "text", x: 20, y: 20, text: "hello" },
          { kind: "text", x: 20, y: 40, text: "second" },
          { kind: "text", x: 20, y: 60, text: "third" },
        ],
      };
      const B = { ...A, id: crypto.randomUUID(), name: "B", annotations: [] };
      window.fixture.docs = [A, B];
      await window.fixture.callbacks.open(A);
      document.querySelector("#object-list").closest("details").open = true;
    });
    await page.locator(".object-item").first().click();
    console.log(
      "FOCUS AFTER OBJECT CLICK",
      await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        id: document.activeElement.id,
      })),
    );
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "1. text — hello");
    await page.keyboard.press("Tab");
    console.log(
      "FOCUS AFTER TAB",
      await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        id: document.activeElement.id,
        text: document.activeElement.textContent,
      })),
    );
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "2. text — second");
    await page.keyboard.press("Space");
    assert.equal(await page.locator(".object-item").nth(1).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Control+v");
    await page.waitForFunction(() => window.fixture.releasePaste);
    await page.evaluate(async () => {
      await window.fixture.callbacks.open(window.fixture.docs[1]);
      window.fixture.releasePaste(window.fixture.docs[0].dataUrl);
    });
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("Documento mudou"),
    );
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.saves.some((s) => s.name === "B"));
    const stale = await page.evaluate(() =>
      window.fixture.saves
        .filter((s) => s.name === "B")
        .at(-1)
        .annotations.map((a) => a.kind),
    );
    console.log("STALE PASTE", stale);
    assert.deepEqual(stale, []);
    const closeResult = await page.evaluate(async () => {
      const f = window.fixture;
      const normalLists = f.listCalls;
      f.failWrite = true;
      await f.callbacks.close();
      const failed = { closes: f.closes, writes: f.writes, lists: f.listCalls };
      const errorShown = document
        .querySelector("#toast")
        .textContent.includes("owned-save-failure");
      f.failWrite = false;
      f.denyList = true;
      await f.callbacks.close();
      return {
        normalLists,
        failed,
        errorShown,
        closes: f.closes,
        writes: f.writes,
        writesAtClose: f.writesAtClose,
        lists: f.listCalls,
      };
    });
    assert.ok(closeResult.normalLists >= 2, "Normal save refreshes the library");
    assert.equal(closeResult.failed.closes, 0, "Failed save must keep the editor open");
    assert.equal(closeResult.errorShown, true);
    assert.equal(
      closeResult.closes,
      1,
      "Confirmed save must close even when library list is denied",
    );
    assert.equal(closeResult.writes, closeResult.failed.writes + 1);
    assert.equal(closeResult.writesAtClose, closeResult.writes);
    assert.equal(
      closeResult.lists,
      closeResult.normalLists,
      "Close does not request restricted library list",
    );
    await page.evaluate(() => {
      window.fixture.denyList = false;
    });
    console.log("CLOSE REGRESSIONS", closeResult);
    const result = await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const e = new CanvasEditor(canvas, { change() {}, selection() {}, text: async () => "" });
      await e.load(window.fixture.docs[1]);
      const a = e.addAnnotation("arrow", { x: 150, y: 80, x2: 40, y2: 20 });
      e.resizeSelection(110, 60);
      const arrow = { before: [150, 80, 40, 20], after: [a.x, a.y, a.x2, a.y2] };
      const img = document.createElement("canvas");
      img.width = 1000;
      img.height = 1000;
      await e.addImage(img.toDataURL());
      for (let i = 0; i < 100; i++) e.duplicateSelection();
      let reopen;
      try {
        await e.prepare({
          dataUrl: window.fixture.docs[1].dataUrl,
          annotations: e.annotations,
          assets: e.assets.pending(e.annotations),
          viewTransform: e.viewTransform,
          crop: e.crop,
        });
        reopen = "ok";
      } catch (error) {
        reopen = error.message;
      }
      const tiny = document.createElement("canvas");
      tiny.width = 16;
      tiny.height = 16;
      const t = new CanvasEditor(document.createElement("canvas"), {
        change() {},
        selection() {},
        text: async () => "",
      });
      await t.load({ dataUrl: tiny.toDataURL(), annotations: [] });
      let tinyRejected = false;
      try {
        t.setViewTransform({ scale: 0.01 });
      } catch {
        tinyRejected = true;
      }
      let tinyExport;
      try {
        tinyExport = t.export();
      } catch (error) {
        tinyExport = error.message;
      }
      const cardinal = e.addAnnotation("line", { x: 150, y: 50, x2: 40, y2: 50 });
      e.resizeSelection(100, 0);
      const cardinalPoints = [cardinal.x, cardinal.y, cardinal.x2, cardinal.y2];
      return {
        cardinalPoints,
        arrow,
        images: e.annotations.filter((a) => a.kind === "image").length,
        uniqueRasters: e.rasters.size,
        reopen,
        tinySize: t.displaySize(),
        tinyRejected,
        tinyExport,
      };
    });
    assert.deepEqual(result.cardinalPoints, [140, 50, 40, 50]);
    console.log("CANVAS PROBES", result);
    assert.deepEqual(result.arrow.before, result.arrow.after);
    assert.equal(result.reopen, "ok");
    assert.equal(result.tinyRejected, true);
    assert.deepEqual(result.tinySize, { width: 16, height: 16 });
    assert.ok(result.tinyExport.startsWith("data:image/png;base64,"));
    console.log(
      "PASS: stale image insertion, directed/cardinal resize, unique raster budget, keyboard focus/Space, zero-size transform prevention",
    );
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
