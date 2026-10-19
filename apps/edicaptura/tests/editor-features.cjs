const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("node:path");
async function run() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/renderer.html`);
    await page.waitForFunction(
      () => document.querySelector("#results").dataset.status === "passed",
    );
    const result = await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const source = document.createElement("canvas");
      source.width = 200;
      source.height = 100;
      const ctx = source.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 200, 100);
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 30, 30);
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const ed = new CanvasEditor(canvas, {
        change() {},
        selection() {},
        text: async () => "edited",
      });
      await ed.load({ dataUrl: source.toDataURL(), annotations: [] });
      const first = ed.addAnnotation("text", { x: 40, y: 5, text: "First\nSecond" });
      const textHeight = ed.box(first).height;
      ed.selectIndices([0]);
      ed.editText("Changed\nAgain");
      const edited = ed.annotations[0].text;
      ed.addAnnotation("ellipse", { x: 100, y: 10, x2: 150, y2: 60 });
      ed.addAnnotation("line", { x: 5, y: 50, x2: 50, y2: 50 });
      ed.addAnnotation("callout", { x: 60, y: 60, x2: 130, y2: 90, text: "Note" });
      ed.selectIndices([0, 1]);
      ed.group();
      const group = ed.annotations[0].groupId;
      ed.duplicateSelection();
      const count = ed.annotations.length;
      ed.moveSelection(5, 5);
      ed.alignSelection("left");
      const selected = ed.selectionIndices().map((i) => ed.box(ed.annotations[i]).x);
      ed.selectIndices([0]);
      ed.reorderSelection("front");
      const frontText = ed.annotations.at(-1).text;
      ed.addAnnotation("redact", { x: 0, y: 0, x2: 30, y2: 30 });
      const png = new Image();
      png.src = ed.export();
      await png.decode();
      const out = document.createElement("canvas");
      out.width = png.width;
      out.height = png.height;
      out.getContext("2d").drawImage(png, 0, 0);
      const redacted = Array.from(out.getContext("2d").getImageData(10, 10, 1, 1).data);
      ed.setViewTransform({ turns: 1, padding: 10, background: "#ffffff" });
      const rotated = new Image();
      rotated.src = ed.export();
      await rotated.decode();
      const transformedSize = [rotated.width, rotated.height];
      ed.undo();
      const restoredSize = ed.displaySize();
      const blue = document.createElement("canvas");
      blue.width = 10;
      blue.height = 10;
      blue.getContext("2d").fillStyle = "#0000ff";
      blue.getContext("2d").fillRect(0, 0, 10, 10);
      await ed.addImage(blue.toDataURL());
      const image = ed.annotations.at(-1);
      const resized = new Image();
      resized.src = ed.export({ width: 400, format: "image/png" });
      await resized.decode();
      return {
        textHeight,
        edited,
        group,
        count,
        selected,
        frontText,
        redacted,
        transformedSize,
        restoredSize,
        imageKind: image.kind,
        assetId: image.assetId,
        resized: [resized.width, resized.height],
      };
    });
    assert.ok(result.textHeight > 40);
    assert.equal(result.edited, "Changed\nAgain");
    assert.ok(result.group);
    assert.equal(result.count, 6);
    assert.equal(new Set(result.selected).size, 1);
    assert.equal(result.frontText, "Changed\nAgain");
    assert.deepEqual(result.redacted, [0, 0, 0, 255]);
    assert.deepEqual(result.transformedSize, [120, 220]);
    assert.deepEqual(result.restoredSize, { width: 200, height: 100 });
    assert.equal(result.imageKind, "image");
    assert.ok(result.assetId);
    assert.deepEqual(result.resized, [400, 200]);
    console.log(
      "PASS: multiline editing, shapes/callouts, grouping, duplication, alignment, layers, opaque redaction pixels, non-destructive rotation/padding, raster objects, export dimensions",
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
