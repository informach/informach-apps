import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { createInteractiveSvgPlayer } from "@informach/edi-motion/runtime";
import { chromium, type Page } from "playwright";
import type { Project } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

declare global {
  interface Window {
    ediSVGInteractivePlayer?: ReturnType<typeof createInteractiveSvgPlayer>;
  }
}

async function project(page: Page): Promise<Project> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
}
test("authored graph, data and events are created through real UI, survive history/reload and test without editing the document", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported test channel");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="tool-shapes"]').click();
    const art = await page.locator(".scene-artwork>svg").boundingBox();
    if (!art) throw new Error("Missing artboard");
    await page.mouse.move(art.x + 100, art.y + 100);
    await page.mouse.down();
    await page.mouse.move(art.x + 180, art.y + 170);
    await page.mouse.up();
    await page.locator('[data-action="clip-new"]').click();
    await page.locator('#clip-dialog [name="name"]').fill("Movimento livre");
    await page.locator('#clip-dialog [name="frames"]').fill("60");
    await page.locator('#clip-dialog [name="fps"]').fill("60");
    await page.locator('#clip-dialog [type="submit"]').click();
    await page.locator('[data-action="add-key"]').click();
    await page.locator('[data-action="auto"]').click();
    await page.locator('[data-action="end"]').click();
    await page.locator('[data-scene-transform="x"]').fill("100");
    await page.locator('[data-scene-transform="x"]').press("Tab");
    await page.locator('[data-action="machine"]').click();
    await page.getByRole("button", { name: "Criar máquina", exact: true }).click();
    await page.getByLabel("Nome do estado", { exact: true }).fill("Parado");
    await page.getByRole("button", { name: "Aplicar estado", exact: true }).click();
    await page.getByRole("button", { name: "Criar estado", exact: true }).click();
    await page.getByLabel("Nome do estado", { exact: true }).fill("Acenar");
    await page.getByRole("button", { name: "Aplicar estado", exact: true }).click();
    await page.getByLabel("Nome do input", { exact: true }).fill("Clicar");
    await page.getByLabel("Tipo de input", { exact: true }).selectOption("trigger");
    await page.getByRole("button", { name: "Criar input", exact: true }).click();
    await page.getByLabel("Nome do input", { exact: true }).fill("Humor");
    await page.getByLabel("Valor inicial", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "Criar input", exact: true }).click();
    const authored = await project(page),
      board = authored.artboards[0],
      layer = board?.behavior?.machines[0]?.layers[0],
      trigger = board?.behavior?.inputs.find((input) => input.kind === "trigger"),
      number = board?.behavior?.inputs.find((input) => input.kind === "number"),
      object = board?.scene.nodes[0];
    if (!board || !layer || !trigger || !number || !object || !layer.states[0] || !layer.states[1])
      throw new Error("Incomplete authored fixture");
    await page.getByRole("button", { name: "Nova transição", exact: true }).click();
    await page.getByLabel("De", { exact: true }).selectOption(layer.states[0].id);
    await page.getByLabel("Para", { exact: true }).selectOption(layer.states[1].id);
    await page.getByRole("button", { name: "Adicionar condição", exact: true }).click();
    await page.getByRole("button", { name: "Criar transição", exact: true }).click();
    assert.equal(
      (await project(page)).artboards[0]?.behavior?.machines[0]?.layers[0]?.transitions[0]
        ?.conditions[0]?.operator,
      "trigger",
    );
    const state = page.locator(`[data-behavior-state="${layer.states[0].id}"]`),
      stateBox = await state.boundingBox(),
      beforeDrag = await project(page);
    if (!stateBox) throw new Error("Missing graph node");
    await page.mouse.move(stateBox.x + 20, stateBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(stateBox.x + 60, stateBox.y + 40);
    assert.deepEqual(await project(page), beforeDrag);
    await page.mouse.up();
    assert.notDeepEqual(await project(page), beforeDrag);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await project(page), beforeDrag);
    await page.getByLabel("Input do binding", { exact: true }).selectOption(number.id);
    await page.getByLabel("Objeto do binding", { exact: true }).selectOption(object.id);
    await page.getByLabel("Propriedade vinculada", { exact: true }).selectOption("opacity");
    await page.getByLabel("Multiplicador", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Criar binding", exact: true }).click();
    await page
      .locator("[data-behavior-data]")
      .getByRole("button", { name: "Listeners", exact: true })
      .click();
    await page.getByRole("button", { name: "Adicionar ação", exact: true }).click();
    await page.getByLabel("Tipo da ação", { exact: true }).selectOption("trigger");
    await page.getByLabel("Input da ação", { exact: true }).selectOption(trigger.id);
    await page.getByRole("button", { name: "Criar listener", exact: true }).click();
    await page
      .locator("[data-behavior-data]")
      .getByRole("button", { name: "Eventos", exact: true })
      .click();
    await page.getByLabel("Nome do evento", { exact: true }).fill("acenou");
    await page.getByLabel("Quadro do evento", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Criar evento", exact: true }).click();
    const beforeTest = await project(page);
    await page.reload();
    await page.locator("[data-behavior-canvas]").waitFor();
    assert.deepEqual(await project(page), beforeTest);
    await page.locator('[data-action="test"]').click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByLabel("Humor", { exact: true }).fill("0.8");
    await page.getByLabel("Humor", { exact: true }).press("Tab");
    assert.equal(
      await page
        .locator(`.behavior-test-preview [data-edi-object="${object.id}"]`)
        .getAttribute("opacity"),
      "0.8",
    );
    await page.getByRole("button", { name: "Disparar Clicar", exact: true }).click();
    await page.getByRole("button", { name: "Avançar teste 1/60s", exact: true }).click();
    assert.match((await page.locator("#clip-dialog").textContent()) ?? "", /Acenar/);
    assert.deepEqual(
      await project(page),
      beforeTest,
      "Test inputs/poses must never edit the project",
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(await project(page), beforeTest);
    await page.locator('[data-action="export"]').click();
    assert.equal(
      await page.locator('input[name="format"][value="interactive-html"]').isChecked(),
      true,
    );
    const downloaded = page.waitForEvent("download");
    await page.locator("#download").click();
    const path = await (await downloaded).path();
    if (!path) throw new Error("Missing interactive HTML download");
    const html = await readFile(path, "utf8"),
      standalone = await browser.newPage();
    standalone.on("pageerror", (error) => errors.push(error.message));
    await standalone.route("**/*", (route) => route.abort());
    await standalone.setContent(html);
    await standalone.locator("#play-toggle").click();
    await standalone.getByLabel("Humor", { exact: true }).fill("0.9");
    await standalone.getByLabel("Humor", { exact: true }).press("Tab");
    assert.equal(
      await standalone.locator(`[data-edi-object="${object.id}"]`).getAttribute("opacity"),
      "0.9",
    );
    await standalone.getByRole("button", { name: "Disparar Clicar", exact: true }).click();
    assert.equal(
      await standalone.evaluate(() => window.ediSVGInteractivePlayer?.inspect().layers[0]?.stateId),
      layer.states[1].id,
    );
    assert.deepEqual(await project(page), beforeTest);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
