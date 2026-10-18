import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { rendererServer } from "../rendererServer";

test("layout is authored, undone, restored and exported offline through the real UI without a fake animation", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="tool-shapes"]').click();
    const box = await page.locator(".scene-artwork>svg").boundingBox();
    if (!box) throw new Error("Missing artwork");
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 150);
    await page.mouse.up();
    await page.getByRole("button", { name: "Ativar layout da prancheta", exact: true }).click();
    await page.locator(".scene-artwork [data-edi-layout]").waitFor();
    const get = () => page.evaluate(() => localStorage.getItem("edisvg-project")),
      authored = await get();
    await page.getByLabel("Gap horizontal", { exact: true }).fill("24");
    await page.getByRole("button", { name: "Aplicar contêiner", exact: true }).click();
    assert.notEqual(await get(), authored);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await get(), authored);
    await page.reload();
    await page.locator(".scene-artwork [data-edi-layout]").waitFor();
    assert.equal(await get(), authored);
    await page.getByRole("button", { name: "Testar layout", exact: true }).click();
    await page.locator(".behavior-test-preview [data-edi-layout]").waitFor();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    assert.equal(await get(), authored);
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.locator('[data-action="export"]').click();
    const downloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloading,
      path = await download.path();
    if (!path) throw new Error("Missing download");
    const standalone = await browser.newPage(),
      requests: string[] = [],
      standaloneErrors: string[] = [];
    standalone.on("request", (request) => requests.push(request.url()));
    standalone.on("pageerror", (error) => standaloneErrors.push(error.message));
    await standalone.setContent(await readFile(path, "utf8"));
    await standalone.locator("[data-edi-layout]").waitFor();
    await standalone.getByRole("button", { name: "Resetar interação", exact: true }).click();
    assert.deepEqual(requests, []);
    assert.deepEqual(standaloneErrors, []);
    assert.deepEqual(errors, []);
    await standalone.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
