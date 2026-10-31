import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("réguas criam guias arrastando, objetos encaixam nelas e a guia sai arrastada de volta", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push({
    id: "node-box",
    name: "Caixa",
    tag: "rect",
    attrs: { x: "100", y: "100", width: "200", height: "100", fill: "#4fe3c1" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((value) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(value));
    }, project);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    const saved = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0];
    // Artboard units → page pixels, from the scene's own matrix.
    const screen = (x: number, y: number) =>
      page.evaluate(
        ([x, y]) => {
          const svg = document.querySelector(".scene-artwork>svg") as SVGSVGElement,
            point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM() ?? new DOMMatrix());
          return { x: point.x, y: point.y };
        },
        [x, y],
      );
    const top = page.locator('canvas[data-ruler="x"]'),
      left = page.locator('canvas[data-ruler="y"]');
    assert.equal(await top.isVisible(), true);
    assert.equal(await left.isVisible(), true);

    // Out of the left ruler: a vertical guide at x = 500.
    const leftBox = await left.boundingBox(),
      at500 = await screen(500, 300);
    assert.ok(leftBox);
    await page.mouse.move(leftBox.x + 10, at500.y);
    await page.mouse.down();
    await page.mouse.move(at500.x, at500.y, { steps: 6 });
    await page.mouse.up();
    let guides = (await saved())?.guides ?? [];
    assert.equal(guides.length, 1);
    assert.equal(guides[0]?.axis, "x");
    assert.ok(Math.abs((guides[0]?.position ?? 0) - 500) <= 1, `guide at ${guides[0]?.position}`);
    const guideX = guides[0]?.position ?? 500;

    // Out of the top ruler: a horizontal guide.
    const topBox = await top.boundingBox(),
      at400 = await screen(600, 400);
    assert.ok(topBox);
    await page.mouse.move(at400.x, topBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(at400.x, at400.y, { steps: 6 });
    await page.mouse.up();
    guides = (await saved())?.guides ?? [];
    assert.deepEqual(
      guides.map((guide) => guide.axis),
      ["x", "y"],
    );
    assert.equal(await page.locator("[data-guide]").count(), 2);

    // Moving the box so that its right edge (300) lands 3 units from the guide snaps it.
    const from = await screen(200, 150),
      to = await screen(200 + guideX - 300 - 3, 150);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const box = (await saved())?.scene.nodes[0];
    assert.equal(
      Math.round(((box?.transform.x ?? 0) + 300) * 100) / 100,
      guideX,
      "the right edge sits on the guide",
    );

    // Dragged back onto its ruler, the vertical guide goes away; undo brings it back.
    const vertical = page.locator('[data-guide][data-axis="x"]'),
      line = await vertical.boundingBox();
    assert.ok(line);
    await page.mouse.move(line.x + line.width / 2, at500.y + 200);
    await page.mouse.down();
    await page.mouse.move(leftBox.x + 8, at500.y + 200, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual(
      ((await saved())?.guides ?? []).map((guide) => guide.axis),
      ["y"],
    );
    await page.keyboard.press("Control+z");
    assert.equal(((await saved())?.guides ?? []).length, 2);

    // A focused guide moves with the arrows and leaves with Delete.
    const horizontal = page.locator('[data-guide][data-axis="y"]');
    await horizontal.focus();
    const before = (await saved())?.guides?.find((guide) => guide.axis === "y")?.position ?? 0;
    await page.keyboard.press("Shift+ArrowDown");
    assert.equal(
      (await saved())?.guides?.find((guide) => guide.axis === "y")?.position,
      before + 10,
    );
    await page.locator('[data-guide][data-axis="y"]').focus();
    await page.keyboard.press("Delete");
    assert.equal(((await saved())?.guides ?? []).length, 1);
    assert.equal((await saved())?.scene.nodes.length, 1, "Delete on a guide keeps the objects");

    // Shift+R and Shift+G hide rulers and guides; the shapes tool (R) stays off.
    await page.locator(".scene-artwork>svg").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Shift+R");
    assert.equal(await top.count(), 0);
    assert.equal(await page.locator('[data-tool="shapes"].active').count(), 0);
    await page.keyboard.press("Shift+G");
    assert.equal(await page.locator("[data-guide]").count(), 0);
    assert.equal(((await saved())?.guides ?? []).length, 1, "hidden guides stay in the file");
    await page.locator('[data-action="rulers"]').click();
    await page.locator('[data-action="guides"]').click();
    assert.equal(await top.count(), 1);
    assert.equal(await page.locator("[data-guide]").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
