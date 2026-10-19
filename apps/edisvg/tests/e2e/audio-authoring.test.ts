import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { decodeAssetData } from "@informach/edi-motion/assets";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { parseProject } from "../../src/shared/project";
import { audioProjectFixture } from "../audioFixture";
import { rendererServer } from "../rendererServer";

test("built audio authoring imports PCM, binds actual events, persists undo/redo and exports offline captions and explicit controls", {
  timeout: 60000,
}, async () => {
  const fixture = audioProjectFixture();
  delete fixture.project.artboards[0]?.audio;
  fixture.project.assets = [];
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="assets"]').click();
    await page.getByLabel("Arquivo de recurso", { exact: true }).setInputFiles({
      name: "Confirmação.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from(decodeAssetData(fixture.asset.data)),
    });
    await page.getByLabel("Recurso de áudio", { exact: true }).selectOption(fixture.asset.id);
    await page.getByLabel("Evento de áudio", { exact: true }).selectOption("event-tone");
    await page
      .getByLabel("Alternativa textual do áudio", { exact: true })
      .fill("Tom de confirmação");
    await page.getByRole("button", { name: "Vincular áudio ao evento", exact: true }).click();
    await page.getByRole("button", { name: "Salvar vínculo", exact: true }).waitFor();
    await page.locator('[data-action="undo"]').click();
    assert.equal(
      await page.getByRole("button", { name: "Salvar vínculo", exact: true }).count(),
      0,
    );
    await page.locator('[data-action="redo"]').click();
    await page.getByRole("button", { name: "Salvar vínculo", exact: true }).waitFor();
    await page.getByLabel("Volume do efeito", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "Salvar vínculo", exact: true }).click();
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(stored);
    const project = parseProject(JSON.parse(stored));
    assert.equal(project.artboards[0]?.audio?.bindings[0]?.volume, 0.5);
    // Init scripts are only a fixture for the initial load; use a fresh page to prove storage restoration.
    const restored = await context.newPage();
    restored.on("dialog", (dialog) => dialog.accept());
    restored.on("pageerror", (error) => errors.push(error.message));
    await restored.goto(server.url);
    await restored.locator(".scene-artwork>svg").waitFor();
    if (!(await restored.getByRole("region", { name: "Efeitos de áudio" }).isVisible()))
      await restored.locator('[data-action="assets"]').click();
    assert.equal(
      await restored.getByLabel("Volume do efeito", { exact: true }).inputValue(),
      "0.5",
    );
    await restored.locator('[data-action="test"]').click();
    await restored.getByRole("button", { name: "Ativar áudio", exact: true }).waitFor();
    await restored
      .getByRole("button", { name: "Reiniciar sessão e reproduzir", exact: true })
      .click();
    await restored
      .getByLabel("Alternativas dos efeitos de áudio")
      .getByText("Tom de confirmação", { exact: true })
      .waitFor();
    await restored.getByRole("button", { name: "Fechar teste", exact: true }).click();
    const runtime = await readFile("out/renderer/edi-player.global.js", "utf8"),
      html = buildInteractiveExport(
        project,
        {
          format: "interactive-html",
          artboardId: fixture.boardId,
          animationId: "animation-tone",
          alt: "Confirmação",
          reduced: false,
          offscreen: false,
        },
        runtime,
      ),
      consumer = await browser.newPage();
    consumer.on("pageerror", (error) => errors.push(error.message));
    await consumer.setContent(html.content);
    await consumer.getByRole("button", { name: "Ativar áudio", exact: true }).waitFor();
    await consumer
      .getByLabel("Alternativas dos efeitos de áudio")
      .getByText("Tom de confirmação", { exact: true })
      .waitFor();
    // Caption display must never require opening a speaker or granting autoplay permission.
    assert.equal(
      await consumer.getByRole("button", { name: "Desativar áudio", exact: true }).count(),
      0,
    );
    await consumer.getByLabel("Volume do áudio", { exact: true }).fill("0.25");
    assert.equal(
      await consumer.getByLabel("Volume do áudio", { exact: true }).inputValue(),
      "0.25",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
