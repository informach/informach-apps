const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { Library } = require("../src/main/library.cjs");

module.exports = async function cropCheckpoint({ canvasSource } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edicaptura-crop-checkpoint-"));
  const lib = new Library(root);
  await lib.init();
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    plugins: canvasSource
      ? [
          {
            name: "owned-frozen-canvas",
            load(id) {
              if (id === path.resolve(__dirname, "../src/editor/canvas.js").replaceAll("\\", "/"))
                return canvasSource;
            },
          },
        ]
      : [],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const dataUrl = await page.evaluate(async () => {
      document.body.innerHTML = '<canvas id="owned"></canvas>';
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const source = document.createElement("canvas");
      source.width = source.height = 8;
      const ctx = source.getContext("2d");
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = `rgb(${x * 30},${y * 30},50)`;
          ctx.fillRect(x, y, 1, 1);
        }
      window.cropEditor = new CanvasEditor(document.querySelector("canvas"), {
        change() {},
        text() {},
        selection() {},
      });
      document.body.style.margin = "0";
      return source.toDataURL();
    });
    const original = Buffer.from(dataUrl.split(",")[1], "base64");
    const digest = createHash("sha256").update(original).digest("hex");
    const doc = await lib.save({ name: "Owned 8x8", kind: "image" }, original);
    const cases = [
      { from: [3, 3], to: [16, 16], crop: { x: 2, y: 2, width: 6, height: 6 } },
      { from: [4, 4], to: [16, 16], crop: { x: 2, y: 2, width: 6, height: 6 } },
      { from: [15, 15], to: [0, 0], crop: { x: 0, y: 0, width: 8, height: 8 } },
      { from: [3, 4], to: [16, 16], crop: { x: 2, y: 2, width: 6, height: 6 } },
      { from: [4, 3], to: [16, 16], crop: { x: 2, y: 2, width: 6, height: 6 } },
      { from: [6, 6], to: [32, 32], css: 32, crop: { x: 2, y: 2, width: 6, height: 6 } },
      {
        from: [3, 3],
        to: [16, 16],
        turns: 1,
        crop: { x: 2, y: 0, width: 6, height: 7 },
        pixel: [60, 180, 50, 255],
      },
      {
        from: [3, 3],
        to: [16, 16],
        flipX: true,
        crop: { x: 0, y: 2, width: 7, height: 6 },
        pixel: [180, 60, 50, 255],
      },
      { from: [3, 3], to: [16, 16], successive: true, crop: { x: 3, y: 3, width: 5, height: 5 } },
    ];
    for (const input of cases) {
      await page.evaluate(
        async ({ value, css, turns, flipX }) => {
          await window.cropEditor.load({
            ...value,
            viewTransform: { ...value.viewTransform, turns: turns || 0, flipX: flipX || false },
          });
          const canvas = window.cropEditor.canvas;
          canvas.style.cssText = `position:fixed;left:0;top:0;width:${css}px;height:${css}px`;
          window.cropEditor.setTool("crop");
        },
        {
          value: { ...doc, dataUrl },
          css: input.css || 16,
          turns: input.turns,
          flipX: input.flipX,
        },
      );
      if (input.successive) {
        await page.mouse.move(3, 3);
        await page.mouse.down();
        await page.mouse.move(16, 16);
        await page.mouse.up();
      }
      await page.mouse.move(...input.from);
      await page.mouse.down();
      await page.mouse.move(...input.to);
      await page.mouse.up();
      const snapshot = await page.evaluate(() => JSON.parse(window.cropEditor.snapshot()));
      await lib.save({ id: doc.id, ...snapshot });
      const read = await lib.read(doc.id);
      const result = await page.evaluate(async (value) => {
        const e = window.cropEditor;
        e.undo();
        const undone = e.crop;
        e.redo();
        const redone = e.crop;
        e.activate(await e.prepare(value));
        const img = new Image();
        img.src = e.export();
        await img.decode();
        const pixels = document.createElement("canvas");
        pixels.width = img.width;
        pixels.height = img.height;
        const ctx = pixels.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return {
          undone,
          redone,
          width: img.width,
          height: img.height,
          pixel: [...ctx.getImageData(0, 0, 1, 1).data],
        };
      }, read);
      assert.deepEqual(snapshot.crop, input.crop);
      assert.deepEqual(
        result.undone,
        input.successive ? { x: 2, y: 2, width: 6, height: 6 } : null,
      );
      assert.deepEqual(result.redone, input.crop);
      assert.equal(result.width, input.turns ? input.crop.height : input.crop.width);
      assert.equal(result.height, input.turns ? input.crop.width : input.crop.height);
      assert.deepEqual(
        result.pixel,
        input.pixel || [input.crop.x * 30, input.crop.y * 30, 50, 255],
      );
      assert.equal(
        createHash("sha256")
          .update(await fs.readFile(lib.file(doc.id, "png")))
          .digest("hex"),
        digest,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS checkpoint crop pointer/save/read/prepare: ${cases.length} cases, pixels, undo/redo, original SHA preserved`,
    );
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(root, { recursive: true });
  }
};
if (require.main === module)
  module.exports().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
