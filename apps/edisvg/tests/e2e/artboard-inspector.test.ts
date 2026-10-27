import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
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
