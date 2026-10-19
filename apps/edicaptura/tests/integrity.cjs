const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

async function run() {
  const { createServer } = await import("vite");
  const root = path.resolve(__dirname, "..");
  const server = await createServer({
    root,
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixture = { saves: [], docs: [], callbacks: {}, failSave: false };
      window.ediSuite = { onRecovery() {} };
      const persist = async (data) => {
        if (window.fixture.failSave) throw Error("Disco indisponível");
        if (window.fixture.blockSave) {
          window.fixture.blockSave = false;
          await new Promise((resolve) => {
            window.fixture.releaseSave = resolve;
          });
        }
        window.fixture.saves.push(structuredClone(data));
        return data;
      };
      window.edi = {
        onVideoProgress() {},
        videoInspect: async () => {
          throw new Error("Metadata service is outside this fixture");
        },
        recordRecoveries: async () => [],
        status: async () => ({ version: "test", captureShortcut: "Print Screen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: async () => window.fixture.docs,
        read: async (id) => window.fixture.docs.find((doc) => doc.id === id),
        save: persist,
        update: persist,
        onDocument: (callback) => (window.fixture.callbacks.open = callback),
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
      };
    });
    await page.goto(`http://127.0.0.1:${address.port}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.callbacks.open);
    await page.evaluate(async () => {
      const image = document.createElement("canvas");
      image.width = 200;
      image.height = 200;
      const ctx = image.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 200, 200);
      const doc = {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Original",
        kind: "image",
        dataUrl: image.toDataURL(),
        annotations: [
          {
            kind: "square",
            x: 10,
            y: 10,
            x2: 100,
            y2: 100,
            color: "#ff0000",
            stroke: 3,
            opacity: 1,
            fontSize: 24,
          },
        ],
        crop: null,
      };
      window.fixture.docs.push(doc);
      await window.fixture.callbacks.open(doc);
      await window.fixture.callbacks.open({
        id: "22222222-2222-4222-8222-222222222222",
        name: "Invalid",
        kind: "image",
        dataUrl: "data:image/png;base64,AAAA",
        annotations: [],
      });
    });
    assert.equal(
      await page.locator("#document-name").inputValue(),
      "Original",
      "failed image load must retain active identity",
    );
    await page.locator("#save").click();
    await page.waitForFunction(() => window.fixture.saves.length > 0);
    assert.equal(
      await page.evaluate(() => window.fixture.saves.at(-1).id),
      "11111111-1111-4111-8111-111111111111",
    );
    await page.evaluate(async () => {
      window.fixture.failSave = true;
      document.querySelector("#document-name").value = "Pending";
      document.querySelector("#document-name").dispatchEvent(new Event("input"));
      document.querySelector("#save").click();
    });
    await page.waitForFunction(() =>
      document.querySelector("#save-status").textContent.includes("Não salvo"),
    );
    await page.evaluate(() => {
      window.fixture.failSave = false;
    });
    await page.locator("#save").click();
    await page.waitForFunction(() =>
      document.querySelector("#save-status").textContent.includes("salvas"),
    );
    await page.locator('[data-tool="select"]').click();
    const bounds = await page.locator("#canvas").boundingBox();
    await page.mouse.click(bounds.x + 50, bounds.y + 50);
    assert.equal(
      await page.locator("#color").inputValue(),
      "#ff0000",
      "selection properties must reflect selected object",
    );
    await page.locator("#document-name").fill("Unsaved current");
    await page.evaluate(() =>
      window.fixture.callbacks.open({ ...window.fixture.docs[0], name: "Stale disk name" }),
    );
    assert.equal(
      await page.locator("#document-name").inputValue(),
      "Unsaved current",
      "reopening current capture must retain pending edits",
    );
    await page.evaluate(() => {
      window.fixture.blockSave = true;
      const next = {
        ...window.fixture.docs[0],
        id: "44444444-4444-4444-8444-444444444444",
        name: "Next image",
      };
      window.fixture.transition = window.fixture.callbacks.open(next);
    });
    await page.waitForFunction(() => window.fixture.releaseSave);
    await page.locator("#document-name").fill("Late edit while saving");
    await page.evaluate(async () => {
      window.fixture.releaseSave();
      await window.fixture.transition;
    });
    assert.equal(
      await page.evaluate(
        () =>
          window.fixture.saves
            .filter((save) => save.id === "11111111-1111-4111-8111-111111111111")
            .at(-1).name,
      ),
      "Late edit while saving",
    );
    assert.equal(await page.locator("#document-name").inputValue(), "Next image");
    await page.evaluate(async () => {
      const doc = {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Video",
        kind: "video",
        dataUrl: "data:video/webm;base64,",
      };
      window.fixture.docs.push(doc);
      await window.fixture.callbacks.open(doc);
    });
    await page.locator("#document-name").fill("Renamed video");
    await page.locator("#save").click();
    await page.waitForFunction(() =>
      window.fixture.saves.some(
        (s) => s.id === "33333333-3333-4333-8333-333333333333" && s.name === "Renamed video",
      ),
    );
    const findings = await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      canvas.setPointerCapture = () => {};
      const source = document.createElement("canvas");
      source.width = 200;
      source.height = 200;
      const editor = new CanvasEditor(canvas, {
        change() {},
        selection() {},
        text: async () => "text",
      });
      await editor.load({ dataUrl: source.toDataURL(), annotations: [] });
      const point = (x, y) => {
        const b = canvas.getBoundingClientRect();
        return { clientX: b.x + x, clientY: b.y + y, button: 0, pointerId: 1 };
      };
      editor.setTool("steps");
      for (const p of [
        [20, 20],
        [70, 70],
        [120, 120],
      ])
        await editor.down(point(...p));
      editor.selected = 1;
      editor.remove();
      await editor.down(point(170, 170));
      const numbers = editor.annotations.map((a) => a.number);
      editor.setTool("select");
      for (let i = 0; i < 75; i++) {
        const a = editor.annotations[0];
        await editor.down(point(a.x, a.y));
        editor.move(point(a.x + 0.1, a.y + 0.1));
        editor.up();
      }
      return { numbers, history: editor.past.length };
    });
    assert.equal(
      new Set(findings.numbers).size,
      findings.numbers.length,
      "step numbers must be unique",
    );
    assert.ok(findings.history <= 60, "history must stay bounded after moving");
    assert.deepEqual(errors, []);
    const evidence = await require("./renderer-evidence.cjs")("integrity");
    await page.screenshot({ path: path.join(evidence, "integrity.png") });
    console.log(
      "PASS: failed/concurrent opening preserves document, stale same-document reload, explicit save failure/retry, video rename, properties, unique steps, bounded history",
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
