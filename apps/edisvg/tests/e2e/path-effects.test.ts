import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

const PATH_D = "M10 50 L90 50";

function seed() {
  const project = newProject();
  const board = project.artboards[0];
  assert.ok(board);
  board.scene.nodes.push(
    {
      id: "node-line",
      name: "Linha",
      tag: "path",
      attrs: { d: PATH_D, fill: "none", stroke: "#112233", "stroke-width": "4" },
      text: "",
      children: [],
      transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
      visible: true,
      locked: false,
    },
    {
      id: "node-box",
      name: "Caixa",
      tag: "rect",
      attrs: { x: "10", y: "60", width: "30", height: "30", fill: "#4fe3c1" },
      text: "",
      children: [],
      transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
      visible: true,
      locked: false,
    },
  );
  return project;
}

const saved = async (page: Page) =>
  parseProject(
    await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
  );

async function open(project: ReturnType<typeof seed>) {
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(
    (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
    project,
  );
  await page.goto(server.url);
  await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
  return {
    page,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

// Trim lengths come out with float noise; compare the drawn points to 0.01.
const points = async (page: Page) =>
  ((await page.locator('[data-object="node-line"] > path').getAttribute("d")) ?? "")
    .match(/-?[\d.]+(?:e-?\d+)?/g)
    ?.map((value) => Math.round(Number(value) * 100) / 100);

async function type(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Enter");
}

test("efeitos de caminho adicionam, editam e removem o trim com prévia no Design", {
  timeout: 60000,
}, async () => {
  const { page, close } = await open(seed());
  try {
    await page.locator('[data-scene-select="node-box"]').click();
    await page
      .getByText("Converta a forma em caminho (seção Caminho) para usar o trim.")
      .waitFor();
    await page.locator('[data-scene-select="node-line"]').click();
    await page.getByRole("button", { name: "Adicionar trim" }).click();
    let trim = (await saved(page)).artboards[0]?.rig?.trims?.[0];
    assert.deepEqual(
      { start: trim?.start, end: trim?.end, offset: trim?.offset, mode: trim?.mode },
      { start: 0, end: 1, offset: 0, mode: "sequential" },
    );
    const shape = page.locator('[data-object="node-line"] > path');
    assert.equal(await shape.getAttribute("d"), PATH_D);

    await type(page, "Fim do trim (%)", "50");
    await type(page, "Deslocamento do trim (%)", "25");
    await page.getByLabel("Modo do trim").selectOption("parallel");
    const project = await saved(page);
    trim = project.artboards[0]?.rig?.trims?.[0];
    assert.equal(trim?.end, 0.5);
    assert.equal(trim?.offset, 90);
    assert.equal(trim?.mode, "parallel");
    assert.equal(project.artboards[0]?.scene.nodes[0]?.attrs.d, PATH_D, "the source stays whole");
    // 25% offset over half the line: from x=30 to x=70.
    assert.deepEqual(await points(page), [30, 50, 70, 50]);

    // Scrubbing the label previews on the canvas and saves once on release.
    const scrub = page
      .locator("label", { has: page.getByLabel("Início do trim (%)", { exact: true }) })
      .locator(".artboard-scrub");
    const box = await scrub.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal((await saved(page)).artboards[0]?.rig?.trims?.[0]?.start, 0.1);
    assert.deepEqual(await points(page), [38, 50, 70, 50]);

    await page.getByRole("button", { name: "Remover trim" }).click();
    assert.equal((await saved(page)).artboards[0]?.rig?.trims?.length ?? 0, 0);
    assert.equal(await shape.getAttribute("d"), PATH_D);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await saved(page)).artboards[0]?.rig?.trims?.length, 1);
  } finally {
    await close();
  }
});

test("linhas de pintura editam hexadecimal, opacidade, visibilidade e espessura", {
  timeout: 60000,
}, async () => {
  const { page, close } = await open(seed());
  try {
    await page.locator('[data-scene-select="node-box"]').click();
    const attrs = async () => (await saved(page)).artboards[0]?.scene.nodes[1]?.attrs ?? {};
    assert.equal(await page.getByLabel("Cor hexadecimal de contorno").count(), 0);

    await type(page, "Cor hexadecimal de preenchimento", "123456");
    assert.equal((await attrs()).fill, "#123456");
    await type(page, "Cor hexadecimal de preenchimento", "xyz");
    await page.getByRole("alert").filter({ hasText: "Use uma cor hexadecimal" }).waitFor();
    assert.equal((await attrs()).fill, "#123456");

    await type(page, "Opacidade de preenchimento (%)", "40");
    assert.equal((await attrs())["fill-opacity"], "0.4");
    await page.getByRole("button", { name: "Ocultar preenchimento" }).click();
    assert.equal((await attrs())["fill-opacity"], "0");
    assert.equal((await attrs()).fill, "#123456", "hiding keeps the color");
    await page.getByRole("button", { name: "Mostrar preenchimento" }).click();
    assert.equal((await attrs())["fill-opacity"], "0.4");

    await page.getByRole("button", { name: "Adicionar preenchimento ou contorno" }).click();
    assert.equal((await attrs()).stroke, "#000000");
    assert.ok(
      await page
        .getByRole("button", { name: "Adicionar preenchimento ou contorno" })
        .isDisabled(),
    );
    await type(page, "Espessura do contorno", "3");
    assert.equal((await attrs())["stroke-width"], "3");
    await page.getByRole("button", { name: "Remover contorno" }).click();
    assert.equal((await attrs()).stroke, "none");
    await page.getByRole("button", { name: "Remover preenchimento" }).click();
    await page.getByText("Sem preenchimento nem contorno.").waitFor();
    await page.getByRole("button", { name: "Adicionar preenchimento ou contorno" }).click();
    await page.getByRole("button", { name: "Contorno", exact: true }).click();
    assert.equal((await attrs()).stroke, "#000000");
  } finally {
    await close();
  }
});
