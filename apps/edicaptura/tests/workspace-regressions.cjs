const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { Library } = require("../src/main/library.cjs");
const { registerLibraryIpc, readPreferences } = require("../src/main/library-ipc.ts");
const { snapshot, encodeArchive } = require("../src/main/portable.ts");
const { collectImageAssets } = require("../src/domain/assets.ts");
const { createHash } = require("node:crypto");
const { RecordingStore } = require("../src/main/recording-store.ts");
function gate() {
  let release, enter;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  const arrived = new Promise((resolve) => {
    enter = resolve;
  });
  return {
    promise,
    release,
    enter,
    async wait() {
      let timer;
      try {
        await Promise.race([
          arrived,
          new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Controlled boundary not reached")), 30_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
async function run() {
  const base = path.resolve(__dirname, "../test-results/workspace-regressions");
  await fs.mkdir(base, { recursive: true });
  const folder = await fs.mkdtemp(path.join(base, "case-"));
  const old = new Library(path.join(folder, "old")),
    destination = new Library(path.join(folder, "destination"));
  await old.init();
  await destination.init();
  const recordingStore = new RecordingStore(path.join(folder, "recordings"));
  let recoveryGate,
    recoveringVideo = false;
  let active = old,
    readGate,
    saveGate,
    pickerGate,
    responseGate;
  const handlers = new Map(),
    choices = [],
    saves = [];
  const clipboardCalls = [];
  const workflows = registerLibraryIpc({
    handle: (name, _roles, fn) => handlers.set(name, fn),
    editor: () => ({}),
    library: () => active,
    preferences: await readPreferences(path.join(folder, "settings.json"), old.root),
    settingsPath: path.join(folder, "settings.json"),
    electron: {
      dialog: {
        showOpenDialog: async () => {
          const waiting = pickerGate;
          if (waiting) {
            pickerGate = null;
            waiting.enter();
            await waiting.promise;
          }
          const choice = choices.shift();
          if (choice?.failure) throw new Error("Synthetic picker failure");
          return choice || { canceled: true, filePaths: [] };
        },
      },
      clipboard: { writeText: (value) => clipboardCalls.push(value) },
      nativeImage: {},
      shell: {},
    },
    assertAccess() {},
    canSwitch: () => !recoveringVideo,
    switching() {},
    applyPreferences() {},
    thumbnail() {},
    replaceRoot: async (root) => {
      active = new Library(root);
      await active.init();
      await active.loadIndex();
    },
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
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("backend", async (action, value) => {
      if (action === "record-recoveries") return recordingStore.recoveries();
      if (action === "record-recover") {
        const original = active;
        recoveringVideo = true;
        try {
          let document;
          await recordingStore.commit(
            value,
            original.root,
            (file, journal) => original.importVideoFile(file, journal),
            async (entry) => {
              document = await original.read(entry.id);
              recoveryGate.enter();
              await recoveryGate.promise;
              assert.equal(active, original);
            },
          );
          return document;
        } finally {
          recoveringVideo = false;
        }
      }
      if (action === "list") return active.list(value);
      if (action === "read") {
        const doc = await active.read(value);
        const waiting = readGate;
        if (waiting) {
          readGate = null;
          waiting.enter();
          await waiting.promise;
        }
        return doc;
      }
      if (action === "save") {
        const root = active.root;
        saves.push({ root, value: structuredClone(value) });
        const assets = [...collectImageAssets(value.annotations || [], value.assets)].map(
          ([id, dataUrl]) => ({
            id,
            bytes: Buffer.from(dataUrl.split(",")[1], "base64"),
          }),
        );
        const result = await active.save(value, null, assets);
        const waiting = saveGate;
        if (waiting) {
          saveGate = null;
          waiting.enter();
          await waiting.promise;
        }
        return result;
      }
      if (action === "workflow") {
        if (!["root", "restore"].includes(value.action))
          return handlers.get("library:workflow")(value);
        let result, failure;
        try {
          result = await handlers.get("library:workflow")(value);
        } catch (error) {
          failure = error;
        }
        const waiting = responseGate;
        if (waiting) {
          responseGate = null;
          waiting.enter();
          await waiting.promise;
        }
        if (failure) throw failure;
        return result;
      }
      if (action === "copy-path") return handlers.get("file:copy-path")();
      if (action === "copy-file") return handlers.get("file:copy-final")();
      throw new Error(`Unexpected operation ${action}`);
    });
    await page.addInitScript(() => {
      window.fixture = { callbacks: {}, pasteCalls: 0, reads: 0 };
      window.ediSuite = { onRecovery() {} };
      window.edi = {
        onVideoProgress() {},
        videoInspect: async () => {
          throw new Error("Metadata service is outside this fixture");
        },
        recordRecoveries: () => window.backend("record-recoveries"),
        recordRecover: (id) => window.backend("record-recover", id),
        status: async () => ({ version: "regression", captureShortcut: "PrintScreen" }),
        monitors: async () => ({ selected: "cursor", displays: [] }),
        list: (q) => window.backend("list", q),
        read: async (id) => {
          const doc = await window.backend("read", id);
          window.fixture.reads++;
          return doc;
        },
        save: (v) => window.backend("save", v),
        update: (v) => window.backend("save", v),
        libraryWorkflow: (v) => window.backend("workflow", v),
        copyPath: () => window.backend("copy-path"),
        copyFile: () => window.backend("copy-file"),
        pasteImage: async () => {
          window.fixture.pasteCalls++;
          throw new Error("Synthetic empty clipboard");
        },
        onDocument: (fn) => {
          window.fixture.callbacks.open = fn;
        },
        onNotice() {},
        onMonitors() {},
        onBeforeClose() {},
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/src/editor/index.html`);
    await page.waitForFunction(() => window.fixture.callbacks.open);
    const url = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 100;
      c.height = 80;
      return c.toDataURL();
    });
    const first = await old.save(
      { name: "Old current", annotations: [{ kind: "redact", x: 1, y: 1, x2: 20, y2: 20 }] },
      Buffer.from(url.split(",")[1], "base64"),
    );
    const second = await old.save(
      { name: "Old delayed", annotations: [{ kind: "redact", x: 2, y: 2, x2: 30, y2: 30 }] },
      Buffer.from(url.split(",")[1], "base64"),
    );
    for (const doc of [first, second]) {
      await fs.copyFile(old.file(doc.id, "png"), destination.file(doc.id, "png"));
      await fs.writeFile(
        destination.file(doc.id, "json"),
        JSON.stringify({
          ...doc,
          name: `Destination ${doc.id}`,
          annotations: [{ kind: "redact", x: 40, y: 40, x2: 50, y2: 50 }],
        }),
      );
    }
    const archive = path.join(folder, "restore.edilibrary");
    await fs.writeFile(archive, encodeArchive(await snapshot(destination.root), "library"));
    const openCurrent = async () =>
      page.evaluate((doc) => window.fixture.callbacks.open(doc), await active.read(first.id));
    await openCurrent();
    // Focus and activate a real library button with Space; editor shortcuts must not intercept it.
    await page.locator("#library-tab").click();
    await page.locator("#library-select-page").focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      document.querySelector("#library-page-status").textContent.includes("2 selecionadas"),
    );
    const baseline = saves.length;
    await page.clock.install();
    const keys = [
      "Control+a",
      "Control+d",
      "Control+v",
      "Control+z",
      "Control+Shift+z",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ];
    for (const key of keys) await page.keyboard.press(key);
    await page.clock.runFor(500); // Cross the actual 450 ms autosave deadline deterministically.
    assert.equal(saves.length, baseline, "library keys do not schedule autosave");
    assert.equal(await page.evaluate(() => window.fixture.pasteCalls), 0);
    assert.equal(
      await page.locator('#object-list [aria-pressed="true"]').count(),
      0,
      "Ctrl+A does not select hidden objects",
    );
    assert.equal((await old.read(first.id)).annotations.length, 1);
    await page.locator("#settings-top").click();
    await page.locator("#preference-save").focus();
    for (const key of keys) await page.keyboard.press(key);
    await page.clock.runFor(500);
    assert.equal(saves.length, baseline, "modal keys do not schedule autosave");
    assert.equal(await page.evaluate(() => window.fixture.pasteCalls), 0);
    await page.locator('#library-settings button[value="close"]').click();
    await page.locator("#editor-tab").click();
    await page.locator("#canvas").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press("Control+a");
    assert.equal(await page.locator('#object-list [aria-pressed="true"]').count(), 1);
    await page.keyboard.press("ArrowRight");
    await page.clock.runFor(500);
    await page.waitForFunction(
      () => document.querySelector("#save-status").textContent === "Todas as alterações salvas",
    );
    assert.equal((await old.read(first.id)).annotations[0].x, 2, "editor keys still work");
    const switchRoot = async (id, paths) => {
      choices.push(...paths.map((file) => ({ canceled: false, filePaths: [file] })));
      await page.locator("#settings-top").click();
      await page.locator(`#${id}`).click();
      await page.waitForFunction(
        () => document.querySelector("#document-name").value === "Nenhuma captura aberta",
      );
      await page.locator('#library-settings button[value="close"]').click();
    };
    for (const boundary of ["read", "decode"])
      for (const mode of ["open", "restore"]) {
        if (active.root !== old.root) await switchRoot("library-root-open", [old.root]);
        await openCurrent();
        let waiting;
        if (boundary === "read") {
          waiting = gate();
          readGate = waiting;
          await page.locator("#library-tab").click();
          await page.locator(".library-card").filter({ hasText: "Old delayed" }).click();
          await page.waitForFunction(
            () => document.querySelector("#library-view").hidden === false,
          );
          // The card event owns a pending actual Library.read response.
          await waiting.wait();
        } else {
          await page.evaluate(
            (doc) => {
              const original = Image.prototype.decode;
              Image.prototype.decode = function () {
                Image.prototype.decode = original;
                return new Promise((resolve, reject) => {
                  window.fixture.releaseDecode = () => original.call(this).then(resolve, reject);
                });
              };
              window.fixture.pendingOpen = window.fixture.callbacks.open(doc);
            },
            await old.read(second.id),
          );
          await page.waitForFunction(() => window.fixture.releaseDecode);
        }
        const target =
          mode === "open" ? destination.root : path.join(folder, `restored-${boundary}`);
        if (mode === "restore") await fs.mkdir(target);
        await switchRoot(
          mode === "open" ? "library-root-open" : "library-restore",
          mode === "open" ? [target] : [archive, target],
        );
        if (boundary === "decode") {
          // New-root activation must not wait behind canceled old-root preparation.
          await page.evaluate(
            (doc) => window.fixture.callbacks.open(doc),
            await active.read(second.id),
          );
          assert.match(await page.locator("#document-name").inputValue(), /^Destination /);
        }
        const beforeRelease = saves.length;
        if (waiting) {
          const reads = await page.evaluate(() => window.fixture.reads);
          waiting.release();
          await page.waitForFunction((before) => window.fixture.reads > before, reads);
        } else
          await page.evaluate(async () => {
            await window.fixture.releaseDecode();
            await window.fixture.pendingOpen;
            delete window.fixture.releaseDecode;
          });
        await page.clock.runFor(500);
        const expectedName =
          boundary === "decode" ? (await active.read(second.id)).name : "Nenhuma captura aberta";
        assert.equal(
          await page.locator("#document-name").inputValue(),
          expectedName,
          `${boundary}/${mode}: no old-root activation`,
        );
        assert.equal(saves.length, beforeRelease, `${boundary}/${mode}: no old-root save`);
        assert.equal(
          (await active.read(second.id)).annotations[0].x,
          40,
          "matching destination UUID remains intact",
        );
      }
    // Root copy also clears workspace; an in-flight old save must finish before committing it.
    await switchRoot("library-root-open", [old.root]);
    await openCurrent();
    const heldSave = gate();
    saveGate = heldSave;
    await page.locator("#document-name").fill("Old renamed");
    await page.locator("#save").click();
    await heldSave.wait();
    const copyTarget = path.join(folder, "copied");
    await fs.mkdir(copyTarget);
    choices.push({ canceled: false, filePaths: [copyTarget] });
    await page.locator("#settings-top").click();
    await page.locator("#library-root-copy").click();
    assert.equal(active.root, old.root, "root not committed while save is in flight");
    heldSave.release();
    await page.waitForFunction(
      () => document.querySelector("#document-name").value === "Nenhuma captura aberta",
    );
    assert.equal(active.root, copyTarget);
    assert.equal((await active.read(first.id)).name, "Old renamed");
    assert.equal(
      await page.locator("#save-status").textContent(),
      "",
      "old save UI does not survive workspace clear",
    );
    await page.locator('#library-settings button[value="close"]').click();
    // Both UI actions reach their distinct main contracts; no-export error is actionable.
    await page.locator("#copy-export-file").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("Exporte um arquivo"),
    );
    const exported = path.join(folder, "Final image.png");
    await fs.writeFile(exported, Buffer.from(url.split(",")[1], "base64"));
    await workflows.rememberExport(exported, "png");
    await page.locator("#copy-export-path").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("Caminho do arquivo final copiado"),
    );
    assert.deepEqual(clipboardCalls, [exported]);
    // Hold both native-picker and response boundaries, including rejected/canceled root operations.
    const asyncDoc = await old.save(
      { name: "Async source", annotations: [{ kind: "text", x: 20, y: 20, text: "Existing" }] },
      Buffer.from(url.split(",")[1], "base64"),
    );
    for (const mode of ["open", "copy", "restore"])
      for (const outcome of ["success", "cancel", "failure"]) {
        if (active.root !== old.root) await switchRoot("library-root-open", [old.root]);
        await page.evaluate(
          (doc) => window.fixture.callbacks.open(doc),
          await old.read(asyncDoc.id),
        );
        const acceptedName = `Accepted before ${mode}/${outcome}`;
        await page.locator("#document-name").fill(acceptedName);
        const beforeKinds = (await old.read(asyncDoc.id)).annotations.map((a) => a.kind);
        await page.evaluate(() => {
          for (const id of ["paste-image", "insert-image"])
            document.getElementById(id).closest("details").open = true;
          window.edi.pasteImage = () =>
            new Promise((resolve) => {
              window.fixture.releasePendingPaste = resolve;
            });
          window.edi.importObject = () =>
            new Promise((resolve) => {
              window.fixture.releasePendingObject = resolve;
            });
        });
        await page.locator("#paste-image").click();
        await page.locator("#insert-image").click();
        await page.evaluate((caseName) => {
          // Each case must exercise a new decode; previously inserted immutable sources are reused.
          const source = document.createElement("canvas");
          source.width = 240;
          source.height = 32;
          source.getContext("2d").fillText(caseName, 0, 20);
          const image = source.toDataURL();
          window.edi.pasteImage = async () => image;
          const original = Image.prototype.decode;
          Image.prototype.decode = function () {
            Image.prototype.decode = original;
            return new Promise((resolve, reject) => {
              window.fixture.releasePendingRaster = () => original.call(this).then(resolve, reject);
            });
          };
        }, acceptedName);
        await page.locator("#paste-image").click();
        await page.waitForFunction(() => window.fixture.releasePendingRaster);
        // Queue a real text-dialog close callback before the transition; release its event later.
        if (outcome === "failure") {
          await page.locator("#object-list").evaluate((list) => {
            list.closest("details").open = true;
          });
          await page.locator(".object-item").first().click();
          await page.locator("#edit-object-text").click();
        } else {
          await page.locator('[data-tool="text"]').click();
          await page.locator("#canvas").click({ position: { x: 60, y: 40 } });
        }
        await page.locator("#text-value").fill("Queued text must not enter the workspace");
        await page.evaluate(() => {
          const dialog = document.getElementById("text-dialog");
          const hold = (event) => {
            event.stopImmediatePropagation();
            dialog.removeEventListener("close", hold, true);
            window.fixture.releasePendingText = () => dialog.dispatchEvent(new Event("close"));
          };
          dialog.addEventListener("close", hold, true);
        });
        await page.locator('#text-dialog button[value="ok"]').click();
        await page.waitForFunction(() => window.fixture.releasePendingText);
        await page.locator("#object-rotation").scrollIntoViewIfNeeded();
        const canvasBefore = await page.locator("#canvas").evaluate((canvas) => canvas.toDataURL());
        const heldPicker = gate(),
          heldResponse = gate();
        pickerGate = heldPicker;
        responseGate = heldResponse;
        const target =
          mode === "open" ? destination.root : path.join(folder, `atomic-${mode}-${outcome}`);
        if (outcome === "success" && mode !== "open") await fs.mkdir(target);
        if (outcome === "success") {
          if (mode === "restore") choices.push({ canceled: false, filePaths: [archive] });
          choices.push({ canceled: false, filePaths: [target] });
        } else
          choices.push(
            outcome === "cancel" ? { canceled: true, filePaths: [] } : { failure: true },
          );
        await page.locator("#settings-top").click();
        await page
          .locator(mode === "restore" ? "#library-restore" : `#library-root-${mode}`)
          .click();
        await heldPicker.wait();
        const attemptEdits = async (phase) => {
          const close = await page.locator('#library-settings button[value="close"]').boundingBox();
          await page.mouse.click(close.x + close.width / 2, close.y + close.height / 2);
          assert.equal(
            await page.locator("#library-settings").evaluate((dialog) => dialog.open),
            true,
            `${mode}/${outcome}/${phase}: Close cannot dismiss a root transition`,
          );
          await page.keyboard.press("Escape");
          await page.keyboard.press("Enter");
          assert.equal(
            await page.locator("#library-settings").evaluate((dialog) => dialog.open),
            true,
            `${mode}/${outcome}/${phase}: Close/Escape cannot dismiss`,
          );
          assert.equal(await page.locator("#library-settings").getAttribute("aria-busy"), "true");
          assert.match(
            await page.locator("#save-status").textContent(),
            /Troca de biblioteca.*bloqueada/,
          );
          assert.equal(await page.locator("#document-name").isDisabled(), true);
          assert.equal(await page.locator("#object-rotation").isDisabled(), true);
          const title = await page.locator("#document-name").boundingBox();
          await page.mouse.click(title.x + 5, title.y + 5);
          await page.keyboard.press("Control+a");
          await page.keyboard.type("Rejected during transition");
          for (const key of ["Control+d", "Control+v", "Control+z", "Delete", "ArrowRight"])
            await page.keyboard.press(key);
          const propertyValue = await page.locator("#object-rotation").inputValue(),
            property = await page.locator("#object-rotation").boundingBox();
          await page.mouse.click(property.x + property.width / 2, property.y + property.height / 2);
          await page.keyboard.press("ArrowUp");
          assert.equal(
            await page.locator("#object-rotation").inputValue(),
            propertyValue,
            `${phase}: property protected`,
          );
          const canvas = await page.locator("#canvas").boundingBox();
          await page.mouse.move(canvas.x + 30, canvas.y + 30);
          await page.mouse.down();
          await page.mouse.move(canvas.x + 50, canvas.y + 50);
          await page.mouse.up();
          assert.equal(
            await page.locator("#document-name").inputValue(),
            acceptedName,
            `${phase}: title protected`,
          );
          assert.deepEqual(
            await page.locator("#canvas").evaluate((element) => element.toDataURL()),
            canvasBefore,
            `${phase}: canvas protected`,
          );
        };
        await attemptEdits("picker");
        heldPicker.release();
        await heldResponse.wait();
        await attemptEdits("response");
        await page.evaluate(async (image) => {
          window.fixture.releasePendingPaste(image);
          window.fixture.releasePendingObject(image);
          window.fixture.releasePendingText();
          await window.fixture.releasePendingRaster();
          delete window.fixture.releasePendingText;
          delete window.fixture.releasePendingRaster;
        }, url);
        await page.clock.runFor(500);
        assert.equal(
          await page.locator(".object-item").count(),
          beforeKinds.length,
          "late async operations cannot mutate locked canvas",
        );
        assert.deepEqual(
          (await old.read(asyncDoc.id)).annotations.map((a) => a.kind),
          beforeKinds,
        );
        assert.equal(
          (await old.read(asyncDoc.id)).name,
          acceptedName,
          "accepted pre-transition edit saved in old root",
        );
        assert.match(
          await page.locator("#save-status").textContent(),
          /Troca de biblioteca.*bloqueada/,
        );
        heldResponse.release();
        await page.waitForFunction(
          () => !document.getElementById("library-settings").hasAttribute("aria-busy"),
        );
        assert.equal(
          await page.locator('#library-settings button[value="close"]').isEnabled(),
          true,
        );
        await page.locator('#library-settings button[value="close"]').click();
        if (outcome === "success") {
          assert.equal(await page.locator("#document-name").inputValue(), "Nenhuma captura aberta");
          assert.equal(active.root, target);
        } else {
          assert.equal(active.root, old.root);
          assert.equal(await page.locator("#document-name").inputValue(), acceptedName);
          assert.equal(await page.locator("#document-name").isEnabled(), true);
          await page.locator("#document-name").fill(`Recovered ${mode}/${outcome}`);
          await page.locator("#save").click();
          await page.waitForFunction(
            () =>
              document.getElementById("save-status").textContent === "Todas as alterações salvas",
          );
          assert.equal((await old.read(asyncDoc.id)).name, `Recovered ${mode}/${outcome}`);
          await page.locator("#paste-image").click();
          await page.waitForFunction(
            (count) => document.querySelectorAll(".object-item").length === count + 1,
            beforeKinds.length,
          );
          await page.locator("#save").click();
          await page.waitForFunction(
            () =>
              document.getElementById("save-status").textContent === "Todas as alterações salvas",
          );
          assert.equal(
            (await old.read(asyncDoc.id)).annotations.length,
            beforeKinds.length + 1,
            "new edits resume after cancel/failure",
          );
        }
      }
    for (const interaction of ["open", "edit"]) {
      active = old;
      const session = await recordingStore.begin(old.root, 60);
      const raw = Buffer.from("owned synthetic recovery bytes");
      await recordingStore.append({
        sessionId: session.sessionId,
        sequence: 0,
        bytes: raw,
        sha256: createHash("sha256").update(raw).digest("hex"),
        durationMs: 1000,
      });
      await page.reload();
      await page.waitForFunction(() => window.fixture.callbacks.open);
      await page.evaluate((doc) => window.fixture.callbacks.open(doc), await old.read(first.id));
      recoveryGate = gate();
      await page.getByRole("button", { name: "Recuperar na biblioteca original" }).click();
      await recoveryGate.wait();
      assert.ok(
        (await fs.stat(path.join(recordingStore.directory(session.sessionId), "0.chunk"))).isFile(),
      );
      await assert.rejects(
        handlers.get("library:workflow")({ action: "root", mode: "open" }),
        /Encerre a captura/,
      );
      if (interaction === "open")
        await page.evaluate((doc) => window.fixture.callbacks.open(doc), await old.read(second.id));
      const expected = `Current after pending recovery ${interaction}`;
      await page.locator("#document-name").fill(expected);
      await page.locator("#save").click();
      recoveryGate.release();
      await page.waitForFunction(() => !document.querySelector(".recording-recovery"));
      assert.equal(await page.locator("#document-name").inputValue(), expected);
      const currentId = interaction === "open" ? second.id : first.id;
      assert.equal((await old.read(currentId)).name, expected);
      assert.equal((await recordingStore.read(session.sessionId)).status, "committed");
      await assert.rejects(
        fs.stat(path.join(recordingStore.directory(session.sessionId), "0.chunk")),
        { code: "ENOENT" },
      );
      assert.equal(active, old);
    }
    console.log(
      "PASS: recovery held at library read keeps raw; root switch denied; later open/edit remains current and persisted after recovery commits original library",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: library/modal keyboard isolation; delayed reads/decode and old saves across actual roots; distinct file/path UI; atomic open/copy/restore at held picker/response through success/cancel/failure, Close/Escape/title/pointer/property/keys blocked, queued paste/object/raster/text canceled, accepted edits preserved and interaction restored",
    );
  } finally {
    readGate?.release();
    saveGate?.release();
    recoveryGate?.release();
    await browser.close();
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
