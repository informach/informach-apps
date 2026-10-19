const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { crc32, deflateSync } = require("node:zlib");
const { chromium } = require("playwright");
const { PhotoCapture } = require("../src/main/capture-pipeline.ts");
const { CapturePreferences } = require("../src/main/capture-preferences.ts");

// Electron-shaped owned bitmap boundary. Production composition, crop planning,
// selection validation and persistence all execute; no production method is replaced.
function image(width, height, pixels) {
  return {
    getSize: () => ({ width, height }),
    isEmpty: () => false,
    toBitmap: () => Buffer.from(pixels),
    toDataURL: () => {
      const rows = Buffer.alloc((width * 4 + 1) * height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const input = (y * width + x) * 4,
            output = y * (width * 4 + 1) + 1 + x * 4;
          rows[output] = pixels[input + 2];
          rows[output + 1] = pixels[input + 1];
          rows[output + 2] = pixels[input];
          rows[output + 3] = pixels[input + 3];
        }
      const chunk = (name, data) => {
        const type = Buffer.from(name),
          size = Buffer.alloc(4),
          crc = Buffer.alloc(4);
        size.writeUInt32BE(data.length);
        crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
        return Buffer.concat([size, type, data, crc]);
      };
      const header = Buffer.alloc(13);
      header.writeUInt32BE(width);
      header.writeUInt32BE(height, 4);
      header[8] = 8;
      header[9] = 6;
      return (
        "data:image/png;base64," +
        Buffer.concat([
          Buffer.from("89504e470d0a1a0a", "hex"),
          chunk("IHDR", header),
          chunk("IDAT", deflateSync(rows)),
          chunk("IEND", Buffer.alloc(0)),
        ]).toString("base64")
      );
    },
    crop: (rect) => {
      for (const value of Object.values(rect)) assert(Number.isInteger(value));
      assert(
        rect.x >= 0 &&
          rect.y >= 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x + rect.width <= width &&
          rect.y + rect.height <= height,
      );
      const result = Buffer.alloc(rect.width * rect.height * 4);
      for (let y = 0; y < rect.height; y++)
        pixels.copy(
          result,
          y * rect.width * 4,
          ((rect.y + y) * width + rect.x) * 4,
          ((rect.y + y) * width + rect.x + rect.width) * 4,
        );
      return image(rect.width, rect.height, result);
    },
  };
}
function pixels(width, height, frame) {
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bytes.set([x % 256, y % 256, frame * 40, 255], (y * width + x) * 4);
  return bytes;
}
function assertPixels(actual, x, y, frame, context) {
  assert.deepEqual(actual.getSize(), { width: 2, height: 2 }, context);
  const expected = [];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 2; col++)
      expected.push((x + col) % 256, (y + row) % 256, frame * 40, 255);
  assert.deepEqual(Array.from(actual.toBitmap()), expected, context);
}
async function verifySelectionService() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-selection-service-"));
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  let cases = 0;
  try {
    for (const scale of [1.25, 1.5, 1.75, 1, 2])
      for (const origin of [
        { x: 0, y: 0 },
        { x: -320, y: -160 },
        { x: -320.25, y: -160.5 },
      ])
        for (const timing of ["fresh", "frozen"])
          for (const position of ["interior", "top-left", "bottom-right"]) {
            const context = JSON.stringify({ scale, origin, timing, position });
            const display = {
                id: 1,
                bounds: { ...origin, width: 160, height: 80 },
                scaleFactor: scale,
                rotation: 0,
              },
              width = 160 * scale,
              height = 80 * scale;
            const point =
              position === "interior"
                ? { x: 100, y: 10 }
                : position === "top-left"
                  ? { x: 0, y: 0 }
                  : { x: width - 2, y: height - 2 };
            const file = path.join(root, `profile-${cases}.json`),
              shortcuts = { register: () => true, unregister() {} };
            const store = new CapturePreferences(file, shortcuts, () => {});
            await store.load();
            let frame = 0,
              selection;
            const saved = [];
            const flow = new PhotoCapture({
              sources: {
                getSources: async () => [
                  {
                    id: "screen:1:0",
                    display_id: "1",
                    thumbnail: image(width, height, pixels(width, height, ++frame)),
                  },
                ],
              },
              screen: { getAllDisplays: () => [display], screenToDipRect: (_window, rect) => rect },
              images: {
                createFromBitmap: (bytes, size) =>
                  image(size.width, size.height, Buffer.from(bytes)),
              },
              assertAccess() {},
              allowed: () => true,
              beginJob: () => ({ finish() {} }),
              hide() {},
              show() {},
              state() {},
              publish: async () => {},
              select: (bitmap, region, timing) => {
                selection = {
                  photo: true,
                  image: bitmap.toDataURL(),
                  origin: { x: region.x, y: region.y },
                  display: { width: region.width, height: region.height },
                  pixels: bitmap.getSize(),
                  timing,
                };
              },
              remember: (region) => store.remember(region),
              save: async (bitmap) => {
                saved.push(bitmap);
                return "owned";
              },
            });
            const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
            try {
              await flow.start({ mode: "region", timing }, "1");
              await page.exposeFunction("selectionState", () => selection);
              await page.exposeFunction("confirmSelection", async (input) => {
                try {
                  await flow.selected({
                    ...input.rect,
                    x: input.rect.x + origin.x,
                    y: input.rect.y + origin.y,
                  });
                  return { ok: true };
                } catch (error) {
                  return { error: error.message };
                }
              });
              await page.addInitScript(() => {
                window.fixture = {};
                window.edi = {
                  selection: () => window.selectionState(),
                  select: async (input) => {
                    const result = await window.confirmSelection(input);
                    window.fixture.result = result;
                    if (result.error) throw new Error(result.error);
                  },
                  cancel: async () => {},
                };
              });
              await page.goto(
                `http://127.0.0.1:${server.httpServer.address().port}/src/capture/selection.html`,
              );
              // Navigation can finish while the initial selection IPC is still pending.
              // Production ignores premature input; wait for its observable state publication.
              await page.waitForFunction(() =>
                document.querySelector("#desktop").getAttribute("src")?.startsWith("data:image/"),
              );
              await page.locator("#create-region").click();
              for (const [id, value] of Object.entries({
                width: 2,
                height: 2,
                x: origin.x + point.x / scale,
                y: origin.y + point.y / scale,
              })) {
                await page.locator("#" + id).fill(String(value));
                await page.locator("#" + id).press("Tab");
              }
              await page.locator("#surface").focus();
              await page.keyboard.press("Enter");
              await page.waitForFunction(() => window.fixture.result);
              assert.deepEqual(
                await page.evaluate(() => window.fixture.result),
                { ok: true },
                context,
              );
              assert.equal(saved.length, 1, context);
              assertPixels(saved[0], point.x, point.y, timing === "frozen" ? 1 : 2, context);
              const reloaded = new CapturePreferences(file, shortcuts, () => {});
              await reloaded.load();
              assert(reloaded.read().last, context);
              await flow.start(
                { mode: "region-all", timing, savedRegion: reloaded.read().last },
                "1",
              );
              assert.equal(saved.length, 2, context);
              assertPixels(saved[1], point.x, point.y, timing === "frozen" ? 2 : 3, context);
              reloaded.dispose();
              cases++;
            } finally {
              flow.discard();
              store.dispose();
              await page.close();
            }
          }
    console.log(
      JSON.stringify({
        rendererToPhotoCaptureCases: cases,
        scales: [1, 1.25, 1.5, 1.75, 2],
        origins: "zero, negative integer, negative fractional",
        freshFrozen: true,
        interiorAndEdges: true,
        persistedRepeat: true,
        exactTwoByTwoPixels: true,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
module.exports = { verifySelectionService };
if (require.main === module)
  verifySelectionService().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
