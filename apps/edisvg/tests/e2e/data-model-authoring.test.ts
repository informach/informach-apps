import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import type { Project } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("typed view models are authored and linked through UI, persist through undo/reload and drive the standalone player", {
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
    await page.locator('[data-action="machine"]').click();
    await page.getByLabel("Nome do input", { exact: true }).fill("Título");
    await page.getByLabel("Tipo de input", { exact: true }).selectOption("string");
    await page.getByRole("button", { name: "Criar input", exact: true }).click();
    await page.getByText("Modelos de dados compostos", { exact: true }).click();
    await page.getByLabel("Nome do novo modelo", { exact: true }).fill("Pessoa");
    await page.getByRole("button", { name: "Criar modelo de dados", exact: true }).click();
    await page.getByLabel("Nome do campo", { exact: true }).fill("Nome da pessoa");
    await page.getByRole("button", { name: "Adicionar campo", exact: true }).click();
    await page.getByLabel("Nome da instância", { exact: true }).fill("Pessoa A");
    await page.getByRole("button", { name: "Criar instância de dados", exact: true }).click();
    const get = (): Promise<Project> =>
      page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    const before = await get();
    await page.getByLabel("Nome da pessoa", { exact: true }).fill("Lia");
    await page.getByRole("button", { name: "Aplicar Nome da pessoa", exact: true }).click();
    const after = await get();
    assert.notDeepEqual(after, before);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await get(), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(await get(), after);
    const behavior = after.artboards[0]?.behavior,
      model = behavior?.data?.models[0],
      instance = behavior?.data?.instances[0],
      input = behavior?.inputs[0],
      field = model?.fields[0];
    if (!behavior || !model || !instance || !input || !field)
      throw new Error("Missing authored data");
    await page.getByLabel("Caminho do campo", { exact: true }).selectOption(field.id);
    await page.getByLabel("Input do link", { exact: true }).selectOption(input.id);
    await page.getByLabel("Direção do link", { exact: true }).selectOption("two-way");
    await page.getByRole("button", { name: "Criar link de dados", exact: true }).click();
    const linked = await get();
    await page.reload();
    await page.getByLabel("Nome da pessoa", { exact: true }).waitFor();
    assert.deepEqual(await get(), linked);
    await page.locator('[data-action="test"]').click();
    await page.locator(".behavior-test-controls textarea").waitFor();
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(await get(), linked);
    await page.locator('[data-action="export"]').click();
    const downloading = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloading,
      path = await download.path();
    if (!path) throw new Error("Missing download");
    const standalone = await browser.newPage(),
      requests: string[] = [];
    standalone.on("request", (request) => requests.push(request.url()));
    standalone.on("pageerror", (error) => errors.push(error.message));
    await standalone.setContent(await readFile(path, "utf8"));
    await standalone.waitForFunction(() => !!window.ediSVGInteractivePlayer);
    assert.equal(await standalone.getByLabel("Título", { exact: true }).inputValue(), "Lia");
    await standalone.getByLabel("Título", { exact: true }).fill("Bia");
    await standalone.getByLabel("Título", { exact: true }).press("Tab");
    assert.equal(
      await standalone.evaluate(
        ({ instanceId, fieldId }) => window.ediSVGInteractivePlayer?.getData(instanceId, [fieldId]),
        { instanceId: instance.id, fieldId: field.id },
      ),
      "Bia",
    );
    await standalone.evaluate(
      ({ instanceId, fieldId }) =>
        window.ediSVGInteractivePlayer?.editData([
          { operation: "set", instanceId, path: [fieldId], value: "Ana" },
        ]),
      { instanceId: instance.id, fieldId: field.id },
    );
    assert.equal(await standalone.getByLabel("Título", { exact: true }).inputValue(), "Ana");
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await standalone.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
