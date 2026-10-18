import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import type { Project } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";
import { rigFixture } from "../rigFixture";

test("real rig key authoring preserves rest pose, supports undo/reload, and test playback consumes the animated strength", {
  timeout: 60000,
}, async (context) => {
  const fixture = rigFixture(),
    server = await rendererServer();
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
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () =>
      page.evaluate((): Project => JSON.parse(localStorage.getItem("edisvg-project") ?? "null"));
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Animação do canal de rig", { exact: true }).selectOption(fixture.clipId);
    await page.getByLabel("Quadro do parâmetro", { exact: true }).fill("0");
    await page.getByLabel("Força da chave (%)", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Gravar chave de rig", exact: true }).click();
    await page.getByLabel("Quadro do parâmetro", { exact: true }).fill("10");
    await page.getByLabel("Força da chave (%)", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Gravar chave de rig", exact: true }).click();
    const keyed = await snapshot(),
      rig = keyed.artboards[0]?.rig;
    assert.equal(rig?.version, 2);
    assert.equal(rig?.parameterClips?.[0]?.tracks[0]?.keys.length, 2);
    assert.deepEqual(keyed.artboards[0]?.scene, fixture.project().artboards[0]?.scene);
    await page.locator('[data-action="undo"]').click();
    assert.equal(
      (await snapshot()).artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.length,
      1,
    );
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(await snapshot(), keyed);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(await snapshot(), keyed);
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    const tip = await page.locator(".behavior-test-preview svg").evaluate((element) => {
      const bone = element.querySelector('[data-edi-object="node-lower"]');
      if (!(element instanceof SVGSVGElement) || !(bone instanceof SVGGraphicsElement))
        throw new Error("Missing rig");
      const matrix = bone.getScreenCTM(),
        root = element.getScreenCTM();
      if (!matrix || !root) throw new Error("Missing matrices");
      const p = new DOMPoint(100, 0).matrixTransform(matrix).matrixTransform(root.inverse());
      return { x: p.x, y: p.y };
    });
    assert.ok(Math.abs(tip.x - 200) < 0.01 && Math.abs(tip.y) < 0.01, JSON.stringify(tip));
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(await snapshot(), keyed);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
