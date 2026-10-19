import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, type Project } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("bones are drawn and cancelled through the real tool, IK is authored, undone and tested without editing its rest pose", {
  timeout: 60000,
}, async (context) => {
  const server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, newProject());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () =>
      page.evaluate((): Project => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    const drag = async (
      from: { x: number; y: number },
      to: { x: number; y: number },
      cancel = false,
    ) => {
      const points = await page.locator(".scene-artwork>svg").evaluate(
        (element, points) => {
          if (!(element instanceof SVGSVGElement)) throw new Error("Missing SVG");
          const matrix = element.getScreenCTM();
          if (!matrix) throw new Error("Missing matrix");
          return points.map((point) => {
            const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
            return { x: screen.x, y: screen.y };
          });
        },
        [from, to],
      );
      const start = points[0],
        end = points[1];
      if (!start || !end) throw new Error("Missing points");
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    };
    await page.getByRole("button", { name: "Osso", exact: true }).click();
    await drag({ x: 100, y: 100 }, { x: 200, y: 100 });
    assert.equal((await snapshot()).artboards[0]?.rig?.bones.length, 1);
    await drag({ x: 200, y: 100 }, { x: 200, y: 200 });
    const rest = await snapshot();
    assert.equal(rest.artboards[0]?.rig?.bones.length, 2);
    await drag({ x: 200, y: 200 }, { x: 250, y: 250 }, true);
    assert.deepEqual(await snapshot(), rest);
    assert.equal(await page.locator("[data-bone-draft]").count(), 0);
    assert.equal(await page.locator("[data-edi-rig-overlay]").count(), 2);
    await page.getByLabel("Nome do alvo", { exact: true }).fill("Mão");
    await page.getByLabel("Novo alvo X", { exact: true }).fill("200");
    await page.getByLabel("Novo alvo Y", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Criar alvo", exact: true }).click();
    await page.getByLabel("Tipo de restrição", { exact: true }).selectOption("ik");
    await page.getByRole("button", { name: "Adicionar restrição", exact: true }).click();
    const constrained = await snapshot();
    assert.equal(constrained.artboards[0]?.rig?.constraints.length, 1);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await snapshot()).artboards[0]?.rig?.constraints.length, 0);
    await page.locator('[data-action="redo"]').click();
    assert.equal((await snapshot()).artboards[0]?.rig?.constraints.length, 1);
    const beforeTest = await snapshot();
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    const lowerId = beforeTest.artboards[0]?.rig?.bones[1]?.targetId;
    if (!lowerId) throw new Error("Missing bone");
    const tip = await page.locator(".behavior-test-preview svg").evaluate((element, id) => {
      if (!(element instanceof SVGSVGElement)) throw new Error("Missing preview");
      const bone = [...element.querySelectorAll("[data-edi-object]")].find(
          (bone) => bone.getAttribute("data-edi-object") === id,
        ),
        matrix = bone instanceof SVGGraphicsElement ? bone.getScreenCTM() : null,
        root = element.getScreenCTM();
      if (!matrix || !root) throw new Error("Missing bone matrix");
      const value = new DOMPoint(100, 0).matrixTransform(matrix).matrixTransform(root.inverse());
      return { x: value.x, y: value.y };
    }, lowerId);
    assert.ok(Math.abs(tip.x - 200) < 0.01);
    assert.ok(Math.abs(tip.y - 100) < 0.01);
    assert.match(
      (await page.locator(".behavior-test-controls").textContent()) ?? "",
      /convergente/,
    );
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(await snapshot(), beforeTest);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(await snapshot(), beforeTest);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
