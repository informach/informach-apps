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
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.fixture = { requests: [], states: null, selections: [] };
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
        status: async () => ({ version: "fixture", captureShortcut: "Print Screen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: async () => [],
        onDocument() {},
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
        onPhotoState: (f) => {
          window.fixture.states = f;
        },
        photoPreferences: async () => ({
          version: 1,
          defaults: {
            delay: 0,
            cursor: false,
            timing: "fresh",
            destination: "editor",
            precision: { kind: "free" },
          },
          presets: [],
          shortcutErrors: [],
          lastValid: false,
        }),
        photoStart: async (input) => {
          window.fixture.requests.push(input);
        },
        photoSources: async () => [
          {
            token: "11111111-1111-4111-8111-111111111111",
            name: "Synthetic window",
            preview:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          },
        ],
        photoControls: async () => [
          {
            token: "22222222-2222-4222-8222-222222222222",
            name: "Synthetic clipped HWND",
            bounds: { width: 80, height: 30 },
          },
        ],
        cancel: async () => {
          window.fixture.cancelled = true;
        },
        photoCancel: async () => {
          window.fixture.photoCancelled = true;
        },
        photoRetry: async () => {
          window.fixture.retried = true;
        },
        photoDiscard: async () => {},
        selection: async () => ({
          photo: true,
          origin: { x: -400, y: 0 },
          display: { width: 600, height: 200 },
          pixels: { width: 1200, height: 400 },
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        }),
        select: async (input) => {
          window.fixture.selections.push(input);
        },
      };
    });
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(base + "/src/editor/index.html");
    await page.locator("#photo-options").click();
    assert(await page.locator("#photo-dialog").isVisible());
    await page.locator("#photo-cancel").click();
    await page.waitForFunction(() => window.fixture.photoCancelled);
    assert.equal(await page.evaluate(() => window.fixture.cancelled), undefined);
    await page.locator("#photo-delay").fill("3");
    await page.locator("#photo-cursor").check();
    await page.locator('[data-photo="all"]').click();
    await page.waitForFunction(() => window.fixture.requests.length === 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.requests[0]), {
      mode: "all",
      delay: 3,
      cursor: true,
      timing: "fresh",
      destination: "editor",
      precision: { kind: "free" },
    });
    await page.locator("#photo-refresh").click();
    await page.getByRole("button", { name: "Synthetic window", exact: true }).click();
    await page.waitForFunction(() => window.fixture.requests.length === 2);
    assert.equal(
      await page.evaluate(() => window.fixture.requests[1].source),
      "11111111-1111-4111-8111-111111111111",
    );
    await page.getByRole("button", { name: "Controles HWND", exact: true }).click();
    await page.getByRole("button", { name: /Synthetic clipped HWND/ }).click();
    await page.waitForFunction(() => window.fixture.requests.length === 3);
    assert.equal(await page.evaluate(() => window.fixture.requests[2].mode), "control");
    await page.evaluate(() =>
      window.fixture.states({ phase: "retained", error: "Disco indisponível" }),
    );
    await page.locator("#photo-retry").click();
    assert(await page.evaluate(() => window.fixture.retried));
    await page.goto(base + "/src/capture/selection.html");
    await page.waitForFunction(() => document.querySelector("#picker").style.width);
    await page.mouse.move(213, 240);
    await page.mouse.down();
    await page.mouse.move(853, 453);
    await page.mouse.up();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.fixture.selections.length === 1);
    const selected = await page.evaluate(() => window.fixture.selections[0]);
    assert.equal(selected.mode, "image");
    assert(Math.abs(selected.rect.x - 100) < 1);
    assert(Math.abs(selected.rect.width - 300) < 1);
    assert.equal(await page.locator('[data-mode="video"]').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        modeButtons: true,
        sourcePreview: true,
        controlTokens: true,
        recovery: true,
        virtualDesktopSelection: true,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
