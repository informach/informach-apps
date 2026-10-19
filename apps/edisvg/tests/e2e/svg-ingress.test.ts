import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const source =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L90 90" stroke="red"/></svg>';

test("file ingress cancels navigation on ignored targets, respects effective editability and native selection, and releases event ownership", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(`<main id="canvas">Canvas</main><input id="text"><textarea id="area"></textarea>
      <select id="select"><option>Text</option></select><input id="file" type="file">
      <input id="disabled" type="file" disabled>
      <fieldset disabled><input id="fieldset-disabled" type="file"></fieldset>
      <div contenteditable><span id="inherited">Editable</span><span contenteditable="false" id="not-editable">Not editable</span></div>
      <div contenteditable><svg><text id="editable-svg">Editable SVG child</text></svg></div>
      <div contenteditable="plaintext-only"><span id="plaintext">Plain</span></div>
      <dialog id="modal"><input id="modal-file" type="file"><p id="modal-text">Dialog</p></dialog>`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (source) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing ingress API");
      const standalone = new DataTransfer();
      standalone.dropEffect = "copy";
      const opened: string[] = [],
        files: File[] = [],
        reports: string[] = [],
        dispose = api.bindSvgIngress(
          (value) => opened.push(value),
          (file) => files.push(file),
          (message) => reports.push(message),
        ),
        probe = {
          file(id: string, type: "drop" | "dragover", count = 1) {
            const target = document.getElementById(id),
              data = new DataTransfer();
            if (!target) throw new Error("Missing ingress target");
            for (let index = 0; index < count; index++)
              data.items.add(new File([source], `art-${index}.svg`, { type: "image/svg+xml" }));
            const event = new DragEvent(type, {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
            });
            target.dispatchEvent(event);
            return { canceled: event.defaultPrevented, effect: data.dropEffect };
          },
          text(id: string, type: "drop" | "paste", value: string, mime = "text/plain") {
            const target = document.getElementById(id),
              data = new DataTransfer();
            if (!target) throw new Error("Missing text target");
            data.setData(mime, value);
            const event =
              type === "drop"
                ? new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true })
                : new ClipboardEvent(type, {
                    clipboardData: data,
                    bubbles: true,
                    cancelable: true,
                  });
            target.dispatchEvent(event);
            return event.defaultPrevented;
          },
        };
      try {
        const blocked = [
          "text",
          "area",
          "select",
          "inherited",
          "plaintext",
          "disabled",
          "fieldset-disabled",
          "editable-svg",
        ].map((id) => ({
          id,
          over: probe.file(id, "dragover"),
          drop: probe.file(id, "drop"),
          paste: probe.text(id, "paste", source),
        }));
        const native = [probe.file("file", "dragover"), probe.file("file", "drop")],
          modal = document.getElementById("modal");
        if (!(modal instanceof HTMLDialogElement)) throw new Error("Missing modal");
        modal.showModal();
        const dialog = [probe.file("modal-text", "dragover"), probe.file("modal-text", "drop")],
          nativeInDialog = probe.file("modal-file", "drop");
        modal.close();
        const beforeAllowed = { opened: opened.length, files: files.length },
          canvas = document.getElementById("canvas");
        if (!canvas) throw new Error("Missing canvas");
        canvas.addEventListener("drop", (event) => event.stopPropagation(), { once: true });
        const allowed = [probe.file("canvas", "dragover"), probe.file("canvas", "drop")];
        probe.file("canvas", "drop", 2);
        const ordinary = [
            probe.text("canvas", "drop", "plain text"),
            probe.text("canvas", "paste", "plain text"),
            probe.text("canvas", "drop", "https://example.com/", "text/uri-list"),
          ],
          explicitFalse = probe.text("not-editable", "paste", source),
          loaded = await api.readSvgFile(files[0] ?? new File([], "missing.svg"));
        const refusals: boolean[] = [];
        for (const file of [
          new File([source], "wrong.txt", { type: "text/plain" }),
          new File([new Uint8Array([0xc3, 0x28])], "invalid.svg"),
          new File(["x".repeat(1500001)], "large.svg"),
        ]) {
          try {
            await api.readSvgFile(file);
            refusals.push(false);
          } catch (error) {
            refusals.push(error instanceof Error);
          }
        }
        dispose();
        const afterDispose = probe.file("canvas", "drop");
        return {
          blocked,
          native,
          dialog,
          nativeInDialog,
          beforeAllowed,
          allowed,
          ordinary,
          explicitFalse,
          opened,
          fileCount: files.length,
          reports,
          loaded,
          refusals,
          afterDispose,
          standaloneEffect: standalone.dropEffect,
        };
      } finally {
        dispose();
      }
    }, source);
    for (const row of result.blocked) {
      assert.deepEqual(row.over, { canceled: true, effect: "none" }, row.id);
      assert.equal(row.drop.canceled, true, row.id);
      assert.equal(row.paste, false, row.id);
    }
    for (const row of result.native) assert.equal(row.canceled, false);
    assert.deepEqual(result.dialog[0], { canceled: true, effect: "none" });
    assert.equal(result.dialog[1]?.canceled, true);
    assert.equal(result.nativeInDialog.canceled, false);
    assert.deepEqual(result.beforeAllowed, { opened: 0, files: 0 });
    // Script-created DataTransfer has no associated browser drag data store:
    // Chromium ignores dropEffect writes even outside our listener. The next
    // test checks that real non-file drags retain their native behavior. Cursor
    // policy for OS files still requires a physical Explorer drag; no polyfill.
    assert.equal(result.standaloneEffect, "none");
    assert.equal(result.allowed[0]?.canceled, true);
    assert.equal(result.allowed[1]?.canceled, true);
    assert.deepEqual(result.ordinary, [false, false, false]);
    assert.equal(result.explicitFalse, true);
    assert.deepEqual(result.opened, [source]);
    assert.equal(result.fileCount, 1);
    assert.equal(result.reports.length, 1);
    assert.match(result.reports[0] ?? "", /um SVG por vez/);
    assert.deepEqual(result.loaded, { source, name: "art-0" });
    assert.deepEqual(result.refusals, [true, true, true]);
    assert.equal(result.afterDispose.canceled, false);
  } finally {
    await browser.close();
  }
});

test("browser-owned trusted text drags keep native editing without invoking global file import", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<div id="drag-source" draggable="true" style="width:100px;height:80px">Drag file</div><main id="canvas" style="margin-left:200px;width:200px;height:100px">Canvas</main><textarea id="field" style="margin-left:200px;width:200px;height:100px"></textarea>',
    );
    await page.addScriptTag({ content: code });
    const state = await page.evaluateHandle((source) => {
      const api = window.EdiAssetTest,
        dragSource = document.getElementById("drag-source");
      if (!api || !dragSource) throw new Error("Missing trusted drag fixture");
      const rows: { target: string; effect: string; trusted: boolean; canceled: boolean }[] = [],
        files: string[] = [],
        dispose = api.bindSvgIngress(
          () => {
            throw new Error("Unexpected paste");
          },
          (file) => files.push(file.name),
          (message) => {
            throw new Error(message);
          },
        );
      dragSource.addEventListener("dragstart", (event) => {
        if (!(event instanceof DragEvent) || !event.dataTransfer)
          throw new Error("Missing native drag store");
        event.dataTransfer.setData("text/plain", source);
        event.dataTransfer.effectAllowed = "copy";
      });
      window.addEventListener("dragover", (event) => {
        if (event.target instanceof HTMLElement)
          rows.push({
            target: event.target.id,
            effect: event.dataTransfer?.dropEffect ?? "missing",
            trusted: event.isTrusted,
            canceled: event.defaultPrevented,
          });
      });
      return { rows, files, dispose };
    }, "Texto arrastado");
    try {
      await page.locator("#drag-source").dragTo(page.locator("#canvas"));
      await page.locator("#drag-source").dragTo(page.locator("#field"));
      const result = await state.evaluate(({ rows, files }) => ({ rows, files }));
      assert.ok(
        result.rows.some((row) => row.target === "canvas" && row.trusted && !row.canceled),
        JSON.stringify(result),
      );
      assert.ok(
        result.rows.some((row) => row.target === "field" && row.trusted && !row.canceled),
        JSON.stringify(result),
      );
      assert.deepEqual(result.files, []);
      assert.equal(await page.locator("#field").inputValue(), "Texto arrastado");
    } finally {
      await state.evaluate(({ dispose }) => dispose());
      await state.dispose();
    }
  } finally {
    await browser.close();
  }
});

test("built SVG drop opens review without editing, blocks file drops in fields/dialogs and confirms one reversible import", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project")),
      url = page.url();
    const canceled = await page.evaluate((source) => {
      const data = new DataTransfer();
      data.items.add(new File([source], "Arrastado.svg", { type: "image/svg+xml" }));
      const event = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
      document.querySelector(".scene-artwork")?.dispatchEvent(event);
      return event.defaultPrevented;
    }, source);
    assert.equal(canceled, true);
    const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
    await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    const ignored = await dialog
      .getByLabel("Nome da prancheta importada")
      .evaluate((target, source) => {
        const data = new DataTransfer();
        data.items.add(new File([source], "Ignored.svg", { type: "image/svg+xml" }));
        const event = new DragEvent("drop", {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      }, source);
    assert.equal(ignored, true);
    assert.equal(await dialog.getByLabel("Nome da prancheta importada").inputValue(), "Arrastado");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="import-svg"]').first().click();
    await dialog.getByLabel("Arquivo SVG", { exact: true }).setInputFiles({
      name: "Seleção.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(source),
    });
    await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    const imported = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(imported && imported !== before);
    assert.equal(parseProject(JSON.parse(imported)).artboards.at(-1)?.scene.source, source);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="redo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), imported);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), imported);
    assert.equal(page.url(), url);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
