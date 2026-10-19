const {
  app,
  BrowserWindow,
  desktopCapturer,
  screen,
  nativeImage,
  globalShortcut,
} = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { PhotoCapture } = require("../src/main/capture-pipeline.ts");
const { Library } = require("../src/main/library.cjs");
const { CapturePreferences } = require("../src/main/capture-preferences.ts");
const { nativeHelperPath, useNativeHelper } = require("../src/main/native-helper.ts");
// Same resolution as the app in development: the helper built by test:capture-pixels-native.
useNativeHelper(
  nativeHelperPath({ isPackaged: false, getAppPath: () => path.join(__dirname, "..") }),
);
// The Node parent owns this unique root and deletes it only after Electron exits.
const root = process.argv.find((arg) => arg.startsWith("--fixture-root="))?.slice(15);
assert(root && path.isAbsolute(root), "Launch through capture-pixels-runner.cjs");
assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
assert(path.basename(root).startsWith("edi-capture-pixels-"));
assert.equal(app.isReady(), false);
for (const name of ["userData", "sessionData", "crashDumps", "logs"]) {
  const target = path.join(root, name);
  fs.mkdirSync(target, { recursive: true });
  app.setPath(name, target);
  assert.equal(app.getPath(name), target);
}
console.log(JSON.stringify({ ownedProfile: true, ownedSessionData: true }));
const mode = process.argv.find((arg) => arg.startsWith("--fixture-mode="))?.slice(15);
assert(["pixels", "assertion", "uncaught", "rejection", "cleanup"].includes(mode));
let owned,
  stage = "ready",
  resultCode = 0,
  finalizing;
let presets;
let ownedOtherShortcut = false;
const covers = [];
app.on("window-all-closed", () => {});
async function finalize(error) {
  if (error) {
    resultCode = 1;
    console.error(`${stage}: ${error.stack || error}`);
  }
  if (finalizing) return finalizing;
  finalizing = (async () => {
    try {
      presets?.dispose();
      if (ownedOtherShortcut) globalShortcut.unregister("Control+Alt+Shift+F24");
      for (const cover of covers) if (!cover.isDestroyed()) cover.destroy();
      if (owned && !owned.isDestroyed()) owned.destroy();
      // Exercise asynchronous cleanup after the last window closes, including forced failures.
      if (mode !== "pixels") await new Promise((resolve) => setTimeout(resolve, 500));
      if (mode === "cleanup") throw Error("FIXTURE_EXPECTED_FAILURE cleanup");
      await fs.promises.writeFile(
        path.join(root, "cleanup-result.json"),
        JSON.stringify({ resultCode }),
      );
    } catch (cleanupError) {
      resultCode = 1;
      console.error(cleanupError);
    }
    console.log(JSON.stringify({ fixtureCleanupComplete: true, resultCode }));
    app.exit(resultCode);
  })();
  return finalizing;
}
process.on("uncaughtException", (error) => {
  void finalize(error);
});
process.on("unhandledRejection", (error) => {
  void finalize(error);
});
app
  .whenReady()
  .then(async () => {
    const library = new Library(path.join(root, "library"));
    await library.init();
    owned = new BrowserWindow({
      x: 90,
      y: 90,
      width: 320,
      height: 240,
      frame: false,
      resizable: false,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    if (mode === "assertion") assert.fail("FIXTURE_EXPECTED_FAILURE assertion");
    if (mode === "cleanup") return;
    if (mode !== "pixels") {
      setImmediate(() => {
        if (mode === "uncaught") throw Error("FIXTURE_EXPECTED_FAILURE uncaught");
        void Promise.reject(Error("FIXTURE_EXPECTED_FAILURE rejection"));
      });
      await new Promise(() => {});
    }
    await owned.loadURL(
      "data:text/html," +
        encodeURIComponent(
          '<html><body style="margin:0;background:rgb(200,30,40)"><div style="position:absolute;left:160px;top:0;width:160px;height:240px;background:rgb(20,180,60)"></div></body></html>',
        ),
    );
    owned.show();
    assert(owned.isVisible(), "Owned capture window must be visible before source discovery");
    await owned.webContents.executeJavaScript(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const handle = owned.getNativeWindowHandle().readBigUInt64LE().toString();
    let changedAt = 0,
      domReadyAt = 0,
      paintedAt = 0,
      acquiredAt = 0,
      paintError,
      doc;
    owned.webContents.beginFrameSubscription((image) => {
      if (!changedAt || paintedAt) return;
      const size = image.getSize(),
        bytes = image.toBitmap();
      const offset = (Math.floor(size.height / 2) * size.width + Math.floor(size.width / 4)) * 4;
      if (
        bytes[offset] === 210 &&
        bytes[offset + 1] === 50 &&
        bytes[offset + 2] === 30 &&
        bytes[offset + 3] === 255
      ) {
        paintedAt = performance.now();
        owned.webContents.endFrameSubscription();
      }
    });
    const sources = {
      getSources: async (options) => {
        if (changedAt) {
          assert.ifError(paintError);
          assert(
            domReadyAt > changedAt,
            "Owned DOM stimulus must be acknowledged before acquisition",
          );
          assert(
            paintedAt > changedAt,
            "Owned countdown stimulus must paint before frame acquisition",
          );
          acquiredAt ||= performance.now();
        }
        // Electron eagerly acquires other windows too. Keep only our known fixture; never log or persist them.
        const all = await desktopCapturer.getSources(options);
        const selected = all.filter((s) => s.id.startsWith(`window:${handle}:`));
        console.log(
          JSON.stringify({
            ownedSourceCount: selected.length,
            ownedVisible: owned.isVisible(),
            ownedMinimized: owned.isMinimized(),
          }),
        );
        all.length = 0;
        return selected;
      },
    };
    const flow = new PhotoCapture({
      sources,
      screen,
      images: nativeImage,
      assertAccess: () => {},
      allowed: () => true,
      beginJob: () => ({ finish() {} }),
      hide() {},
      show() {},
      select() {
        throw Error("Unexpected selection");
      },
      state: (s) => {
        if (s.phase === "countdown" && !changedAt) {
          changedAt = performance.now();
          void owned.webContents
            .executeJavaScript(
              'document.body.style.background="rgb(30,50,210)"; new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(getComputedStyle(document.body).backgroundColor))))',
            )
            .then((color) => {
              assert.equal(color, "rgb(30, 50, 210)");
              domReadyAt = performance.now();
            })
            .catch((error) => {
              paintError = error;
            });
        }
      },
      save: async (image) => {
        const entry = await library.save(
          { name: "Owned synthetic pixels", kind: "image" },
          image.toPNG(),
        );
        doc = await library.read(entry.id);
        return entry.id;
      },
      publish: async () => {},
    });
    stage = "sources";
    const list = await flow.sources();
    assert.equal(list.length, 1);
    stage = "fresh-window";
    const before = performance.now();
    await flow.start(
      { mode: "window", source: list[0].token, delay: 1 },
      String(screen.getPrimaryDisplay().id),
    );
    assert(performance.now() - before >= 1000);
    assert(changedAt > 0);
    assert(doc);
    const image = nativeImage.createFromDataURL(doc.dataUrl),
      size = image.getSize(),
      pixels = image.toBitmap();
    const sample = (x, y) =>
      Array.from(pixels.subarray((y * size.width + x) * 4, (y * size.width + x) * 4 + 4));
    assert.deepEqual(
      sample(Math.floor(size.width / 4), Math.floor(size.height / 2)),
      [210, 50, 30, 255],
    );
    assert.deepEqual(
      sample(Math.floor((size.width * 3) / 4), Math.floor(size.height / 2)),
      [60, 180, 20, 255],
    );
    stage = "moved-target";
    const stale = (await flow.sources())[0];
    owned.setPosition(110, 110);
    await assert.rejects(
      flow.start({ mode: "window", source: stale.token }, String(screen.getPrimaryDisplay().id)),
      /TARGET_CHANGED/,
    );
    stage = "covered-monitors";
    for (const display of screen.getAllDisplays()) {
      const cover = new BrowserWindow({
        ...display.bounds,
        frame: false,
        show: false,
        alwaysOnTop: true,
        fullscreen: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      covers.push(cover);
      await cover.loadURL(
        "data:text/html," +
          encodeURIComponent('<html style="background:rgb(30,70,90)"><body></body></html>'),
      );
      cover.setAlwaysOnTop(true, "screen-saver");
      cover.show();
      await cover.webContents.executeJavaScript(
        "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
      );
    }
    let screenDoc;
    const screenFlow = new PhotoCapture({
      sources: {
        getSources: async (options) => {
          const sources = await desktopCapturer.getSources(options);
          for (const source of sources) {
            const bytes = source.thumbnail.toBitmap();
            for (let i = 0; i < bytes.length; i += 4)
              assert(
                bytes[i] === 90 &&
                  bytes[i + 1] === 70 &&
                  bytes[i + 2] === 30 &&
                  bytes[i + 3] === 255,
                "Only owned opaque monitor pixels may reach persistence",
              );
          }
          return sources;
        },
      },
      screen,
      images: nativeImage,
      assertAccess() {},
      allowed: () => true,
      beginJob: () => ({ finish() {} }),
      hide() {},
      show() {},
      select() {},
      state() {},
      publish: async () => {},
      save: async (image) => {
        screenDoc = image;
        return "synthetic-monitor";
      },
    });
    await screenFlow.start({ mode: "all" }, String(screen.getPrimaryDisplay().id));
    assert(screenDoc);
    assert(screenDoc.getSize().width > 0);
    stage = "native-presets-repeat";
    ownedOtherShortcut = globalShortcut.register("Control+Alt+Shift+F24", () => {});
    assert(ownedOtherShortcut, "Owned unrelated shortcut must be available");
    presets = new CapturePreferences(
      path.join(root, "photo-presets.json"),
      globalShortcut,
      () => {},
    );
    await presets.load();
    const defaults = presets.read().defaults;
    const preset = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Owned pixels",
      mode: "region-all",
      options: defaults,
      shortcut: "Control+Alt+Shift+F23",
    };
    await presets.update({ defaults, presets: [preset] });
    assert(globalShortcut.isRegistered("Control+Alt+Shift+F23"));
    await assert.rejects(
      presets.update({ defaults, presets: [{ ...preset, shortcut: "Control+Alt+Shift+F24" }] }),
      /conflito/,
    );
    assert(globalShortcut.isRegistered("Control+Alt+Shift+F23"));
    assert(globalShortcut.isRegistered("Control+Alt+Shift+F24"));
    const { topologyKey } = require("../src/domain/capture-geometry.ts");
    const displays = screen.getAllDisplays().map((d) => ({
      id: String(d.id),
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
    }));
    const bounds = screen.getPrimaryDisplay().bounds;
    const savedRegion = {
      topology: topologyKey(displays),
      rect: { x: bounds.x + 10, y: bounds.y + 10, width: 32, height: 24 },
      scale: 2,
    };
    await presets.remember(savedRegion);
    await screenFlow.start(
      { mode: "region-all", savedRegion: presets.read().last },
      String(screen.getPrimaryDisplay().id),
    );
    assert.deepEqual(screenDoc.getSize(), { width: 64, height: 48 });
    const repeatedPixels = screenDoc.toBitmap();
    for (let i = 0; i < repeatedPixels.length; i += 4)
      assert.deepEqual(Array.from(repeatedPixels.subarray(i, i + 4)), [90, 70, 30, 255]);
    presets.dispose();
    assert(!globalShortcut.isRegistered("Control+Alt+Shift+F23"));
    assert(globalShortcut.isRegistered("Control+Alt+Shift+F24"));
    console.log(
      JSON.stringify({
        actualElectronAllScreens: true,
        repeatedRegionPixels: true,
        nativeShortcutConflictRollback: true,
        unrelatedShortcutPreserved: true,
        actualElectronWindow: true,
        freshDelayedPixels: true,
        savedProject: true,
        width: size.width,
        height: size.height,
        movedRejected: true,
        elapsedMs: Math.round(performance.now() - before),
        stimulusPaintMs: Math.round(paintedAt - changedAt),
        stimulusDomMs: Math.round(domReadyAt - changedAt),
        acquisitionAfterStimulusMs: Math.round(acquiredAt - changedAt),
      }),
    );
  })
  .then(
    () => finalize(),
    (error) => finalize(error),
  );
