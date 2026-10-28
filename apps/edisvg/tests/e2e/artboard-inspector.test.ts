import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { rendererServer } from "../rendererServer";

test("o inspetor da prancheta edita tamanho e layout com histórico, e guarda a disposição apenas no editor", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      newProject(),
    );
    await page.goto(server.url);
    await page.locator("[data-artboard-inspector]").waitFor();
    const readProject = () => page.evaluate(() => localStorage.getItem("edisvg-project"));
    const original = await readProject();
    await page.getByLabel("Posição X", { exact: true }).fill("42");
    await page.getByLabel("Posição X", { exact: true }).press("Enter");
    await page.getByLabel("Escala X (%)", { exact: true }).fill("125");
    await page.getByLabel("Escala X (%)", { exact: true }).press("Enter");
    await page.getByLabel("Rotação (°)", { exact: true }).fill("15");
    await page.getByLabel("Rotação (°)", { exact: true }).press("Enter");
    assert.equal(await readProject(), original);
    assert.deepEqual(
      await page.locator(".scene-artboard").evaluate((element) => ({
        translate: (element as HTMLElement).style.translate,
        scale: (element as HTMLElement).style.scale,
      })),
      { translate: "42px", scale: "1.25 1" },
    );
    assert.equal(
      await page
        .locator(".scene-artboard")
        .evaluate((element) => (element as HTMLElement).style.rotate),
      "15deg",
    );
    const workspace = await page.evaluate(() => localStorage.getItem("edisvg-workspace"));
    assert.match(workspace ?? "", /"rotation":15/);

    await page.getByLabel("Nome da prancheta", { exact: true }).fill("Cena principal");
    await page.getByLabel("Nome da prancheta", { exact: true }).press("Enter");
    await page.getByLabel("Largura", { exact: true }).fill("640");
    await page.getByLabel("Largura", { exact: true }).press("Enter");
    assert.deepEqual(
      parseProject(JSON.parse((await readProject()) ?? "null")).artboards[0]?.scene.viewBox,
      [0, 0, 640, 1080],
    );
    await page.getByRole("button", { name: "Ativar layout", exact: true }).click();
    await page.getByRole("button", { name: "Grade", exact: true }).click();
    assert.deepEqual(
      parseProject(JSON.parse((await readProject()) ?? "null")).artboards[0]?.layout?.root.columns,
      { kind: "fixed", count: 2 },
    );
    await page.getByRole("button", { name: "Fluxo vertical", exact: true }).click();
    await page.getByRole("button", { name: "Padding 0 / 0 / 0 / 0" }).click();
    await page.getByLabel("Superior", { exact: true }).fill("24");
    await page.getByLabel("Superior", { exact: true }).press("Enter");
    await page
      .locator("[data-artboard-inspector]")
      .getByLabel("Recortar conteúdo", { exact: true })
      .check();
    const saved = parseProject(JSON.parse((await readProject()) ?? "null"));
    assert.equal(saved.artboards[0]?.name, "Cena principal");
    assert.equal(saved.artboards[0]?.layout?.root.flow, "column");
    assert.equal(saved.artboards[0]?.layout?.root.columns, undefined);
    assert.deepEqual(saved.artboards[0]?.layout?.root.padding, [24, 0, 0, 0]);
    assert.equal(saved.artboards[0]?.layout?.root.clip, true);
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await page.screenshot({ path: resolve("../../.cache/edisvg-review/artboard-inspector.png") });
    await page.locator('[data-action="undo"]').click();
    assert.equal(
      parseProject(JSON.parse((await readProject()) ?? "null")).artboards[0]?.layout?.root.clip,
      false,
    );
    await page.reload();
    await page.locator("[data-artboard-inspector]").waitFor();
    assert.equal(await page.getByLabel("Posição X", { exact: true }).inputValue(), "42");
    assert.equal(await page.getByLabel("Rotação (°)", { exact: true }).inputValue(), "15");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("arrastar o rótulo ajusta o valor e os vínculos mantêm a proporção do eixo parceiro", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      newProject(),
    );
    await page.goto(server.url);
    await page.locator("[data-artboard-inspector]").waitFor();
    const readProject = () => page.evaluate(() => localStorage.getItem("edisvg-project"));
    const original = await readProject();
    const drag = async (label: string, dx: number) => {
      const handle = page.locator(`.artboard-value:has([aria-label="${label}"]) .artboard-scrub`);
      const box = await handle.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
    };

    assert.equal(await page.getByLabel("Recortar conteúdo", { exact: true }).isDisabled(), true);

    await drag("Posição X", 30);
    assert.equal(await page.getByLabel("Posição X", { exact: true }).inputValue(), "30");
    assert.equal(
      await page
        .locator(".scene-artboard")
        .evaluate((element) => (element as HTMLElement).style.translate),
      "30px",
    );
    assert.equal(await readProject(), original);

    // A preview moves only the frame (no remount); returning to the start applies the start.
    const handle = page.locator('.artboard-value:has([aria-label="Posição Y"]) .artboard-scrub'),
      grip = await handle.boundingBox();
    assert.ok(grip);
    await page
      .getByLabel("Posição Y", { exact: true })
      .evaluate((element) => element.setAttribute("data-mounted", "before-drag"));
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 40, grip.y + grip.height / 2, { steps: 6 });
    await page.waitForFunction(
      () =>
        (document.querySelector(".scene-artboard") as HTMLElement | null)?.style.translate ===
        "30px 40px",
    );
    assert.equal(
      await page.getByLabel("Posição Y", { exact: true }).getAttribute("data-mounted"),
      "before-drag",
    );
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 6 });
    await page.mouse.up();
    assert.equal(await page.getByLabel("Posição Y", { exact: true }).inputValue(), "0");
    assert.equal(
      await page
        .locator(".scene-artboard")
        .evaluate((element) => (element as HTMLElement).style.translate),
      "30px",
    );

    await page.getByLabel("Origem Y (%)", { exact: true }).fill("50");
    await page.getByLabel("Origem Y (%)", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Vincular origem", exact: true }).click();
    await page.getByLabel("Origem X (%)", { exact: true }).fill("10");
    await page.getByLabel("Origem X (%)", { exact: true }).press("Enter");
    assert.equal(await page.getByLabel("Origem Y (%)", { exact: true }).inputValue(), "60");

    await page.getByRole("button", { name: "Vincular escala", exact: true }).click();
    await page.getByLabel("Escala X (%)", { exact: true }).fill("200");
    await page.getByLabel("Escala X (%)", { exact: true }).press("Enter");
    assert.equal(await page.getByLabel("Escala Y (%)", { exact: true }).inputValue(), "200");
    assert.equal(
      await page
        .locator(".scene-artboard")
        .evaluate((element) => (element as HTMLElement).style.scale),
      "2",
    );

    await drag("Largura", 20);
    assert.deepEqual(
      parseProject(JSON.parse((await readProject()) ?? "null")).artboards[0]?.scene.viewBox,
      [0, 0, 1100, 1080],
    );
    await page.locator('[data-action="undo"]').click();
    assert.equal(await readProject(), original);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("os modos de tamanho da prancheta exigem layout e ajustar ao conteúdo redimensiona a moldura", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const project = newProject(),
      board = project.artboards[0];
    if (!board) throw new Error("Missing board");
    editScene(board.scene, null, "add", "rect");
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator("[data-artboard-inspector]").waitFor();
    const readProject = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    const width = page.getByLabel("Modo da largura", { exact: true }),
      height = page.getByLabel("Modo da altura", { exact: true });

    assert.equal(await width.isDisabled(), true);
    assert.equal(await width.inputValue(), "fixed");
    await page.getByRole("button", { name: "Ativar layout", exact: true }).click();
    assert.equal(await width.inputValue(), "fill");
    await width.selectOption("hug");
    await height.selectOption("hug");
    assert.deepEqual(parseProject(await readProject()).artboards[0]?.layout?.rootSize, {
      width: "hug",
      height: "hug",
    });
    await page.waitForFunction(() => {
      const svg = document.querySelector<SVGSVGElement>(".scene-artwork > svg");
      return svg && svg.viewBox.baseVal.width !== 1080;
    });
    const frame = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>(".scene-artwork > svg"),
        artboard = document.querySelector<HTMLElement>(".scene-artboard");
      return {
        viewBox: [svg?.viewBox.baseVal.width, svg?.viewBox.baseVal.height],
        aspect: artboard?.style.aspectRatio,
      };
    });
    assert.equal(frame.aspect, `${frame.viewBox[0]} / ${frame.viewBox[1]}`);

    await width.selectOption("fixed");
    assert.equal(parseProject(await readProject()).artboards[0]?.layout?.rootSize?.width, "fixed");
    await page.locator('[data-action="undo"]').click();
    assert.equal(await width.inputValue(), "hug");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("modelo e instância da prancheta ligam os links da prancheta e trocam a instância no teste", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const project = newProject(),
      board = project.artboards[0];
    if (!board) throw new Error("Missing board");
    board.behavior = {
      ...emptyBehavior(),
      inputs: [{ id: "input-price", name: "Preço", kind: "number", min: 0, max: 1000, initial: 0 }],
      data: {
        version: 1,
        models: [
          {
            id: "model-product",
            name: "Produto",
            fields: [{ id: "field-price", name: "Valor", kind: "number", min: 0, max: 1000 }],
          },
        ],
        instances: [
          {
            id: "instance-a",
            name: "Caneca",
            modelId: "model-product",
            value: { "field-price": 30 },
          },
          {
            id: "instance-b",
            name: "Camiseta",
            modelId: "model-product",
            value: { "field-price": 80 },
          },
        ],
        links: [],
      },
    };
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator("[data-artboard-inspector]").waitFor();
    const readData = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0]?.behavior?.data;
    const model = page.getByLabel("Modelo da prancheta", { exact: true }),
      instance = page.getByLabel("Instância da prancheta", { exact: true });

    assert.equal(await instance.isDisabled(), true);
    await model.selectOption("model-product");
    assert.deepEqual((await readData())?.context, {
      modelId: "model-product",
      instanceId: "instance-a",
    });
    await instance.selectOption("instance-b");
    assert.equal((await readData())?.context?.instanceId, "instance-b");
    await page.locator('[data-action="undo"]').click();
    assert.equal(await instance.inputValue(), "instance-a");

    await page.locator('[data-action="machine"]').click();
    await page.getByText("Modelos de dados compostos", { exact: true }).click();
    await page.getByLabel("Caminho do campo", { exact: true }).selectOption("field-price");
    await page.getByLabel("Input do link", { exact: true }).selectOption("input-price");
    await page.getByLabel("Instância em edição", { exact: true }).selectOption("instance-b");
    await page.getByLabel("Caminho do campo", { exact: true }).selectOption("field-price");
    assert.equal(await page.getByLabel("Alvo do link", { exact: true }).inputValue(), "fixed");
    await page.getByLabel("Instância em edição", { exact: true }).selectOption("instance-a");
    await page.getByLabel("Caminho do campo", { exact: true }).selectOption("field-price");
    await page.getByLabel("Input do link", { exact: true }).selectOption("input-price");
    assert.equal(await page.getByLabel("Alvo do link", { exact: true }).inputValue(), "bound");
    await page.getByRole("button", { name: "Criar link de dados", exact: true }).click();
    assert.equal((await readData())?.links[0]?.instanceId, null);

    await page.locator('[data-action="test"]').click();
    const dialog = page.getByRole("dialog", { name: "Testar interação" }),
      price = dialog.locator(".behavior-test-input").getByLabel("Preço", { exact: true });
    await price.waitFor();
    assert.equal(await price.inputValue(), "30");
    await dialog.getByText("Modelos e listas ao vivo", { exact: true }).click();
    await dialog
      .getByLabel("Instância ligada à prancheta", { exact: true })
      .selectOption("instance-b");
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            '[aria-label="Testar interação"] .behavior-test-input input',
          ) as HTMLInputElement | null
        )?.value === "80",
    );
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal((await readData())?.context?.instanceId, "instance-a");

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("os campos do inspetor mostram e gravam no máximo duas casas decimais", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const project = newProject(),
      board = project.artboards[0];
    if (!board) throw new Error("Missing board");
    const id = editScene(board.scene, null, "add", "rect");
    const node = board.scene.nodes.find((value) => value.id === id);
    if (!node) throw new Error("Missing rect");
    node.transform.x = 10.123456;
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator("[data-artboard-inspector]").waitFor();
    const readBoard = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0];

    await page.getByLabel("Largura", { exact: true }).fill("0.004");
    await page.getByLabel("Largura", { exact: true }).press("Enter");
    await page.getByText(/Use pelo menos 0,01/).waitFor();
    assert.deepEqual((await readBoard())?.scene.viewBox, [0, 0, 1080, 1080]);
    assert.equal(await page.getByLabel("Largura", { exact: true }).inputValue(), "1080");

    await page.getByLabel("Altura", { exact: true }).fill("700");
    await page.getByLabel("Altura", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Vincular proporção", exact: true }).click();
    await page.getByLabel("Largura", { exact: true }).fill("1000");
    await page.getByLabel("Largura", { exact: true }).press("Enter");
    assert.deepEqual((await readBoard())?.scene.viewBox, [0, 0, 1000, 648.15]);
    assert.equal(await page.getByLabel("Altura", { exact: true }).inputValue(), "648.15");
    // Focusing and leaving an untouched field is not an edit.
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.getByLabel("Altura", { exact: true }).focus();
    await page.getByLabel("Largura", { exact: true }).focus();
    await page.getByLabel("Origem X (%)", { exact: true }).fill("12.3456");
    await page.getByLabel("Origem X (%)", { exact: true }).press("Enter");
    assert.equal(await page.getByLabel("Origem X (%)", { exact: true }).inputValue(), "12.35");
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);

    await page.locator(`[data-layer-name="${id}"]`).click();
    const x = page.getByLabel("Objeto X", { exact: true });
    assert.equal(await x.inputValue(), "10.12");
    await x.fill("4.56789");
    await x.press("Enter");
    const moved = (await readBoard())?.scene.nodes.find((value) => value.id === id);
    assert.equal(moved?.transform.x, 4.57);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
