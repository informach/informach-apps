const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { CapturePreferences } = require("../src/main/capture-preferences.ts");
const { topologyKey } = require("../src/domain/capture-geometry.ts");
async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-precision-renderer-"));
  const shortcuts = new Map([["Control+Alt+X", () => {}]]),
    intents = [];
  const store = new CapturePreferences(
    path.join(root, "profile.json"),
    {
      register: (key, fn) => {
        if (shortcuts.has(key)) return false;
        shortcuts.set(key, fn);
        return true;
      },
      unregister: (key) => shortcuts.delete(key),
    },
    (id) => intents.push(id),
  );
  await store.load();
  const topology = [
    { id: "1", bounds: { x: -400, y: 0, width: 600, height: 200 }, scaleFactor: 2, rotation: 0 },
  ];
  const last = {
    rect: { x: -300, y: 50, width: 100, height: 50 },
    topology: topologyKey(topology),
    scale: 2,
  };
  await store.remember(last);
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let topologyChanged = false;
    const status = () => ({
      ...store.status(),
      lastValid: !topologyChanged,
      presets: store.read().presets.map((p) => ({ ...p, regionValid: !topologyChanged })),
    });
    await page.exposeFunction("profileRead", status);
    await page.exposeFunction("profileSave", async (input) => {
      await store.update(input);
      return status();
    });
    await page.addInitScript(
      ({ last }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 600, 400);
        ctx.fillStyle = "#0000ff";
        ctx.fillRect(600, 0, 600, 400);
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(966, 257, 1, 1);
        window.fixture = { selections: [], requests: [] };
        window.ediSuite = { onRecovery() {} };
        window.edi = {
          onVideoProgress() {},
          videoInspect: async () => {
            throw new Error("Metadata service is outside this fixture");
          },
          recordRecoveries: async () => [],
          status: async () => ({ version: "fixture" }),
          monitors: async () => ({ selected: "cursor", displays: [] }),
          list: async () => [],
          onDocument() {},
          onNotice() {},
          onMonitors() {},
          onBeforeClose() {},
          onPhotoState() {},
          photoPreferences: () => window.profileRead(),
          photoPreferencesSave: (input) => window.profileSave(input),
          onPhotoPreset: (fn) => {
            window.fixture.intent = fn;
          },
          photoPreset: async (id) => {
            window.fixture.requests.push(id);
            if (window.fixture.holdPreset)
              await new Promise((resolve) => {
                window.fixture.releasePreset = resolve;
              });
            return window.fixture.chooseSource;
          },
          photoSources: async () => [],
          photoRepeat: async () => {
            window.fixture.repeat = true;
          },
          photoCancel: async () => {
            window.fixture.cancelled = true;
          },
          selection: async () => ({
            photo: true,
            timing: "fresh",
            origin: { x: -400, y: 0 },
            display: { width: 600, height: 200 },
            pixels: { width: 1200, height: 400 },
            image: canvas.toDataURL(),
            last,
          }),
          select: async (input) => window.fixture.selections.push(input),
          cancel: async () => {
            window.fixture.cancelled = true;
          },
        };
      },
      { last },
    );
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(base + "/src/capture/selection.html");
    await page.locator("#create-region").click();
    assert.equal(
      await page.locator("#surface").evaluate((el) => el === document.activeElement),
      true,
    );
    const ax = await page.context().newCDPSession(page);
    const tree = await ax.send("Accessibility.getFullAXTree");
    const picker = tree.nodes.find((node) => node.role?.value === "application");
    assert.equal(picker?.name?.value, "Selecionar região bidimensional");
    assert.match(picker?.description?.value, /Tab acessa os campos e ações/);
    const graphic = tree.nodes.find((node) => node.name?.value === "Área gráfica de seleção");
    assert.equal(
      graphic.properties.find((property) => property.name === "focused").value.value,
      true,
    );
    console.log(
      "SELECTION AX",
      JSON.stringify({
        role: picker.role.value,
        name: picker.name.value,
        description: picker.description.value,
        graphicRole: graphic.role.value,
        graphicName: graphic.name.value,
        focused: true,
      }),
    );
    await ax.detach();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    assert.equal(await page.locator("#x").inputValue(), "-394.5");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.tagName), "BUTTON");
    await page.locator("#x").fill("-390");
    await page.locator("#x").press("Tab");
    assert.equal(await page.locator("#x").inputValue(), "-390");
    await page.locator("#width").fill("320");
    await page.locator("#width").press("Tab");
    await page.locator("#precision").selectOption("16:9");
    assert.equal(await page.locator("#height").inputValue(), "180");
    await page.locator("#precision").selectOption("fixed");
    assert.match(await page.locator("#error").innerText(), /não cabe/);
    await page.locator("#fixed-width").fill("200");
    await page.locator("#fixed-height").fill("100");
    await page.locator("#fixed-apply").click();
    assert.equal(await page.locator("#width").inputValue(), "200");
    assert.equal(await page.locator("#height").inputValue(), "100");
    await page.locator("#repeat-region").click();
    assert.equal(await page.locator("#x").inputValue(), "-300");
    assert.equal(await page.locator("#y").inputValue(), "50");
    await page.locator("#precision").selectOption("free");
    const regionBounds = await page.locator("#region").boundingBox();
    const pixelStep = (await page.locator("#surface").boundingBox()).width / 1200;
    await page.mouse.move(
      regionBounds.x + regionBounds.width / 2,
      regionBounds.y + regionBounds.height / 2,
    );
    await page.mouse.down();
    assert.equal(
      await page.locator("#surface").evaluate((el) => el === document.activeElement),
      true,
    );
    await page.mouse.move(
      regionBounds.x + regionBounds.width / 2 + pixelStep * 10,
      regionBounds.y + regionBounds.height / 2,
    );
    await page.mouse.up();
    assert.equal(
      await page.locator("#surface").evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(await page.locator("#x").inputValue(), "-295");
    assert.equal(await page.locator("#width").inputValue(), "200");
    const edge = await page.locator('[data-handle="e"]').boundingBox();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    assert.equal(
      await page.locator("#surface").evaluate((el) => el === document.activeElement),
      true,
    );
    await page.mouse.move(edge.x + edge.width / 2 + pixelStep * 10, edge.y + edge.height / 2);
    await page.mouse.up();
    assert.equal(await page.locator("#width").inputValue(), "210");
    assert.equal(
      await page.locator("#surface").evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("#repeat-region").click();
    assert.equal(await page.locator("#x").inputValue(), "-300");
    assert.equal(await page.locator("#width").inputValue(), "200");
    console.log(
      "SELECTION POINTER: overlay move 10 bitmap pixels; east resize 10; canvas focus; repeat restores",
    );
    const evidence = await require("./renderer-evidence.cjs")("selection");
    await page.screenshot({ path: path.join(evidence, "selection.png") });
    await page.mouse.move(1100, 450);
    await page.waitForFunction(() => !document.querySelector("#loupe").hidden);
    // At this viewport the fitted image begins at y=156 1/3; (1100,450)
    // maps to source floor(966.325...,257.979...), independently of DPR.
    assert.equal(
      await page.locator("#magnifier-label").innerText(),
      "Pixel 966, 257 · bitmap 1200 × 400",
    );
    assert.deepEqual(
      await page
        .locator("#magnifier")
        .evaluate((c) => Array.from(c.getContext("2d").getImageData(75, 75, 1, 1).data)),
      [0, 255, 0, 255],
    );
    assert.deepEqual(
      await page
        .locator("#magnifier")
        .evaluate((c) => Array.from(c.getContext("2d").getImageData(65, 75, 1, 1).data)),
      [0, 0, 255, 255],
    );
    assert.deepEqual(
      await page
        .locator("#magnifier")
        .evaluate((c) => Array.from(c.getContext("2d").getImageData(75, 65, 1, 1).data)),
      [0, 0, 255, 255],
    );
    await page.locator("#surface").focus();
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.fixture.selections[0].rect), {
      x: 100,
      y: 50,
      width: 100,
      height: 50,
    });
    await page.keyboard.press("Escape");
    assert(await page.evaluate(() => window.fixture.cancelled));
    await page.goto(base + "/src/editor/index.html");
    await page.locator("#photo-options").click();
    await page.locator("#photo-preset-tools summary").click();
    await page.locator("#photo-delay").fill("4");
    await page.locator("#photo-cursor").check();
    await page.locator("#photo-destination").selectOption("library");
    await page.locator("#photo-precision").selectOption("16:9");
    await page.locator("#photo-defaults-save").click();
    await page.waitForFunction(
      () => document.querySelector("#photo-preset-feedback").textContent === "Preferências salvas.",
    );
    assert.equal(store.read().defaults.delay, 4);
    await page.locator("#photo-preset-name").fill("Região fixa");
    await page.locator("#photo-preset-shortcut").fill("Ctrl+Alt+K");
    await page.locator("#photo-preset-region").check();
    await page.locator("#photo-preset-save").click();
    await page.waitForFunction(
      () => document.querySelector("#photo-preset-list").options.length === 2,
    );
    const preset = store.read().presets[0];
    assert.equal(preset.options.cursor, true);
    assert.deepEqual(preset.region, last);
    assert(shortcuts.has("Control+Alt+K"));
    await page.locator("#photo-preset-shortcut").fill("Ctrl+Alt+X");
    await page.locator("#photo-preset-save").click();
    await page.waitForFunction(() =>
      document.querySelector("#photo-preset-feedback").textContent.includes("conflito"),
    );
    assert.equal(store.read().presets[0].shortcut, "Control+Alt+K");
    shortcuts.get("Control+Alt+K")();
    assert.deepEqual(intents, [preset.id]);
    await page.evaluate((id) => window.fixture.intent(id), preset.id);
    assert.deepEqual(await page.evaluate(() => window.fixture.requests), [preset.id]);
    await page.locator("#photo-repeat").click();
    await page.waitForFunction(() => window.fixture.repeat);
    const bounds = await page.locator("#photo-dialog").boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.width <= 1366 && bounds.height <= 768);
    await page.reload();
    await page.locator("#photo-options").click();
    assert.equal(await page.locator("#photo-delay").inputValue(), "4");
    assert.equal(await page.locator("#photo-destination").inputValue(), "library");
    await page.locator("#photo-close").click();
    await page.evaluate((options) => {
      window.fixture.chooseSource = { chooseSource: true, options };
    }, store.read().presets[0].options);
    await page.evaluate((id) => window.fixture.intent(id), preset.id);
    assert(await page.locator("#photo-dialog").isVisible());
    assert.equal(await page.locator("#photo-delay").inputValue(), "4");
    await page.evaluate((id) => {
      window.fixture.holdPreset = true;
      void window.fixture.intent(id).then(() => {
        window.fixture.intentDone = true;
      });
    }, preset.id);
    await page.waitForFunction(() => !!window.fixture.releasePreset);
    await page.locator("#photo-close").click();
    await page.evaluate(() => window.fixture.releasePreset());
    await page.waitForFunction(() => window.fixture.intentDone);
    assert.equal(await page.locator("#photo-dialog").isVisible(), false);
    topologyChanged = true;
    await page.locator("#photo-options").click();
    assert(await page.locator("#photo-repeat").isDisabled());
    assert.match(await page.locator("#photo-preset-list").textContent(), /região inválida/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        pixelNudge: true,
        shift: true,
        globalNumbers: true,
        aspect: true,
        fixedSize: true,
        repeat: true,
        magnifierActualPixels: true,
        cancel: true,
        persistedDefaults: true,
        presets: true,
        shortcutConflictRollback: true,
        shortcutIntent: true,
        stalePresetCancelled: true,
        changedTopologyVisible: true,
        viewport: "1366x768",
      }),
    );
  } finally {
    store.dispose();
    await browser.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
run()
  .then(() => require("./capture-selection-service.cjs").verifySelectionService())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
