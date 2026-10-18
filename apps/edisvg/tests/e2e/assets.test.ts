import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { decodeAssetData } from "@informach/edi-motion/assets";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { fontFixture, imageFixture } from "../assetFixtures";
import { rendererServer } from "../rendererServer";

declare global {
  interface Window {
    EdiAssetTest?: typeof import("../assetBrowser");
  }
}

test("real bitmap decoding accepts complete pixels, refuses corrupt compressed content, cancels pending work and releases owned resources", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<main>Assets</main>");
    await page.addScriptTag({ content: code });
    const outcome = await page.evaluate(
      async ({ valid, invalid }) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing actual assets API");
        const resources = await api.loadBrowserAssets([valid]),
          image = resources.images.get(valid.id);
        if (!image) throw new Error("Missing decoded bitmap");
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing canvas");
        context.drawImage(image, 0, 0);
        const pixel = [...context.getImageData(0, 0, 1, 1).data];
        resources.destroy();
        resources.destroy();
        const released =
          image.width === 0 && resources.images.size === 0 && resources.assets.size === 0;
        let corruptRejected = false;
        try {
          await api.loadBrowserAssets([valid, invalid]);
        } catch {
          corruptRejected = true;
        }
        const controller = new AbortController(),
          pending = api.loadBrowserAssets([valid], controller.signal);
        controller.abort();
        let canceled = false;
        try {
          await pending;
        } catch (error) {
          canceled = error instanceof DOMException && error.name === "AbortError";
        }
        return { pixel, released, corruptRejected, canceled };
      },
      { valid: imageFixture(true), invalid: imageFixture(false) },
    );
    assert.deepEqual(outcome, {
      pixel: [255, 0, 0, 255],
      released: true,
      corruptRejected: true,
      canceled: true,
    });
    const converted = await page.evaluate(
      async ({ raw, metadata }) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import API");
        const first = await api.prepareAssetImport(
            Uint8Array.from(raw),
            "Pixel.png",
            new AbortController().signal,
          ),
          second = await api.prepareAssetImport(
            Uint8Array.from(metadata),
            "Profile.png",
            new AbortController().signal,
          );
        return {
          same: first.asset.id,
          conversion: first.conversion,
          normalized: second.conversion !== null,
        };
      },
      {
        raw: [...decodeAssetData(imageFixture().data)],
        metadata: [...decodeAssetData(imageFixture(true, true).data)],
      },
    );
    assert.equal(converted.same, imageFixture().id);
    assert.equal(converted.conversion, null);
    assert.equal(converted.normalized, true);
    const fontOutcome = await page.evaluate(async (font) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing font API");
      const bytes = Uint8Array.from(atob(font.data), (char) => char.charCodeAt(0)),
        prepared = await api.prepareAssetImport(bytes, "Noto.ttf", new AbortController().signal);
      let denied = false;
      try {
        await api.completeAssetImport(prepared, new AbortController().signal);
      } catch {
        denied = true;
      }
      const confirmed = await api.completeAssetImport(prepared, new AbortController().signal, {
          rightsConfirmed: true,
          licenseNotice: "SIL OFL 1.1",
        }),
        resources = await api.loadBrowserAssets([confirmed]),
        face = resources.fonts.get(font.id);
      const owned = !!face && face.status === "loaded" && document.fonts.has(face);
      resources.destroy();
      return {
        pending: prepared.kind,
        notConfirmed: !("rightsConfirmed" in prepared.asset),
        denied,
        owned,
        released: !!face && !document.fonts.has(face) && resources.fonts.size === 0,
      };
    }, fontFixture());
    assert.deepEqual(fontOutcome, {
      pending: "font",
      notConfirmed: true,
      denied: true,
      owned: true,
      released: true,
    });
  } finally {
    await browser.close();
  }
});

test("font import requires explicit rights, applies typed font reference, waits for decoding and preserves restore/undo without fallback", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="assets"]').click();
    const font = fontFixture(),
      before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.getByLabel("Arquivo de recurso", { exact: true }).setInputFiles({
      name: "Noto.ttf",
      mimeType: "font/ttf",
      buffer: Buffer.from(decodeAssetData(font.data)),
    });
    const confirm = page.getByRole("button", { name: "Confirmar e importar fonte", exact: true });
    await confirm.waitFor();
    assert.equal(await confirm.isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page
      .getByRole("checkbox", {
        name: "Confirmo que posso incorporar e redistribuir esta fonte",
        exact: true,
      })
      .check();
    await confirm.click();
    await page
      .getByRole("button", { name: "Aplicar fonte ao texto selecionado", exact: true })
      .waitFor();
    await page.locator('[data-action="tool-text"]').click();
    const stage = await page.locator(".scene-artwork>svg").boundingBox();
    if (!stage) throw new Error("Missing stage");
    await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page
      .getByRole("button", { name: "Aplicar fonte ao texto selecionado", exact: true })
      .click();
    await page.waitForFunction(
      (id) =>
        document.querySelector(".scene-artwork text")?.getAttribute("font-family") === `edi-${id}`,
      font.id,
    );
    assert.equal(await page.locator(".scene-artwork style").count(), 0);
    await page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('[data-action="export"]')?.disabled === false,
    );
    await page.locator('[data-action="undo"]').click();
    assert.notEqual(
      await page.locator(".scene-artwork text").getAttribute("font-family"),
      `edi-${font.id}`,
    );
    await page.locator('[data-action="redo"]').click();
    await page.reload();
    await page.waitForFunction(
      (id) =>
        document.querySelector(".scene-artwork text")?.getAttribute("font-family") ===
          `edi-${id}` &&
        !document.querySelector<HTMLButtonElement>('[data-action="export"]')?.disabled,
      font.id,
    );
    const project = parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ),
      exported = buildInteractiveExport(
        project,
        { format: "interactive-html", alt: "Texto portátil", reduced: true, offscreen: false },
        await readFile("out/renderer/edi-player.global.js", "utf8"),
      ),
      consumer = await browser.newPage();
    consumer.on("pageerror", (error) => errors.push(error.message));
    await consumer.setContent(exported.content);
    await consumer.waitForFunction(
      () =>
        !!Reflect.get(window, "ediSVGInteractivePlayer") ||
        !!document.querySelector("#player-status")?.textContent,
    );
    assert.equal(await consumer.locator("#player-status").textContent(), "");
    assert.equal(
      await consumer.evaluate(() => !!Reflect.get(window, "ediSVGInteractivePlayer")),
      true,
    );
    assert.equal(await consumer.locator("svg text").getAttribute("font-family"), `edi-${font.id}`);
    assert.equal(
      await consumer.evaluate(
        (id) =>
          [...document.fonts].some(
            (font) =>
              font.family.replace(/^["']|["']$/g, "") === `edi-${id}` && font.status === "loaded",
          ),
        font.id,
      ),
      true,
    );
    await consumer.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test("built resource panel imports, converts with consent, inserts reusable images, rejects corrupt data and preserves project history", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="assets"]').click();
    await page.getByRole("region", { name: "Catálogo de recursos" }).waitFor();
    const input = page.getByLabel("Arquivo de recurso", { exact: true });
    await input.setInputFiles({
      name: "Pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(decodeAssetData(imageFixture().data)),
    });
    await page.getByRole("button", { name: "Inserir imagem", exact: true }).waitFor();
    await page.getByRole("button", { name: "Inserir imagem", exact: true }).click();
    await page.getByRole("button", { name: "Inserir imagem", exact: true }).click();
    assert.equal(await page.locator(".scene-artwork svg use").count(), 2);
    assert.equal(await page.locator(".scene-artwork>svg>defs>image").count(), 1);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator(".scene-artwork svg use").count(), 1);
    await page.locator('[data-action="redo"]').click();
    assert.equal(await page.locator(".scene-artwork svg use").count(), 2);
    await page.getByRole("button", { name: "Excluir recurso", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Remova as imagens" }).waitFor();
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(stored);
    await page.reload();
    await page.locator(".scene-artwork svg use").first().waitFor();
    assert.equal(await page.locator(".scene-artwork svg use").count(), 2);
    assert.equal(await page.locator('[data-action="undo"]').isDisabled(), true); // a reopened project starts a fresh undo session
    await page.locator('[data-action="assets"]').click();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await input.setInputFiles({
      name: "Broken.png",
      mimeType: "image/png",
      buffer: Buffer.from(decodeAssetData(imageFixture(false).data)),
    });
    await page.getByRole("region", { name: "Catálogo de recursos" }).getByRole("alert").waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await input.setInputFiles({
      name: "Metadata.png",
      mimeType: "image/png",
      buffer: Buffer.from(decodeAssetData(imageFixture(true, true).data)),
    });
    await page.getByRole("button", { name: "Cancelar conversão", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.getByRole("button", { name: "Cancelar conversão", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
