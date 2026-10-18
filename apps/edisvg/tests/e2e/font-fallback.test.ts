import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { applyAsset } from "../../src/shared/assets";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { fontFallbackFixture } from "../fontFallbackFixture";
import { rendererServer } from "../rendererServer";

test("real embedded fallback loads both fonts, matches supplementary glyph metrics and refuses unsupported input before publishing state or DOM", {
  timeout: 60000,
}, async () => {
  const fixture = fontFallbackFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent('<svg viewBox="0 0 3 3"><title>Original host</title></svg>');
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, primaryId, fallbackId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("svg");
        if (!api || !svg) throw new Error("Missing font runtime");
        const original = svg.outerHTML,
          player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
        try {
          const shape = svg.querySelector("text");
          if (!shape) throw new Error("Missing actual text");
          const family = shape.getAttribute("font-family"),
            loaded = [primaryId, fallbackId].every((id) =>
              [...document.fonts].some(
                (font) => font.family === `edi-${id}` && font.status === "loaded",
              ),
            ),
            sample = document.createElementNS("http://www.w3.org/2000/svg", "text"),
            reference = document.createElementNS("http://www.w3.org/2000/svg", "text");
          sample.textContent = reference.textContent = "𝒜";
          sample.setAttribute("font-size", "30");
          reference.setAttribute("font-size", "30");
          sample.setAttribute("font-family", family ?? "");
          reference.setAttribute("font-family", `edi-${fallbackId}`);
          svg.append(sample, reference);
          const metric = sample.getComputedTextLength(),
            expected = reference.getComputedTextLength();
          sample.remove();
          reference.remove();
          const before = {
            input: player.getInput("input-text"),
            text: shape.textContent,
            time: player.time,
          };
          let refused = false;
          try {
            player.setInput("input-text", "Texto 中");
          } catch (error) {
            refused = error instanceof Error && error.message.includes("U+4E2D");
          }
          const after = {
            input: player.getInput("input-text"),
            text: shape.textContent,
            time: player.time,
          };
          player.setInput("input-text", "Alterado 𝒜");
          const changed =
            player.getInput("input-text") === "Alterado 𝒜" && shape.textContent === "Alterado 𝒜";
          player.reset();
          const reset = shape.textContent === "Texto 𝒜";
          await player.destroyAsync();
          return {
            family,
            loaded,
            metric,
            expected,
            refused,
            before,
            after,
            changed,
            reset,
            restored: svg.outerHTML === original,
            released: ![...document.fonts].some((font) =>
              [primaryId, fallbackId].some((id) => font.family === `edi-${id}`),
            ),
          };
        } finally {
          await player.destroyAsync();
        }
      },
      {
        blueprint: compiled.document,
        primaryId: fixture.primary.id,
        fallbackId: fixture.fallback.id,
      },
    );
    assert.equal(result.family, `edi-${fixture.primary.id}, edi-${fixture.fallback.id}`);
    assert.equal(result.loaded, true);
    assert.ok(result.metric > 0);
    assert.equal(result.metric, result.expected);
    assert.equal(result.refused, true);
    assert.deepEqual(result.before, result.after);
    assert.equal(result.changed, true);
    assert.equal(result.reset, true);
    assert.equal(result.restored, true);
    assert.equal(result.released, true);
    const html = buildInteractiveExport(
      fixture.project,
      { format: "interactive-html", alt: "Fontes verificadas", reduced: false, offscreen: false },
      await readFile("out/renderer/edi-player.global.js", "utf8"),
    );
    await page.setContent(html.content);
    await page.waitForFunction(
      () =>
        !!Reflect.get(window, "ediSVGInteractivePlayer") ||
        !!document.querySelector("#player-status")?.textContent,
    );
    assert.equal(await page.locator("#player-status").textContent(), "");
    assert.equal(await page.locator("svg text").getAttribute("font-family"), result.family);
  } finally {
    await browser.close();
  }
});

test("built text inspector diagnoses missing glyphs and authors embedded fallback with undo, recovery and isolated Testar", {
  timeout: 60000,
}, async () => {
  const fixture = fontFallbackFixture(),
    board = fixture.project.artboards[0];
  if (!board) throw new Error("Missing board");
  applyAsset(fixture.project, board.scene, {
    type: "asset",
    operation: "set-font",
    targetId: fixture.textId,
    assetId: fixture.primary.id,
    fontFallbackIds: [],
  });
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.reload();
    await page.locator(`.scene-artwork [data-object="${fixture.textId}"]`).click();
    await page.getByText(/Fontes incorporadas não cobrem.*U\+1D49C/).waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.getByRole("button", { name: "Adicionar fonte alternativa", exact: true }).click();
    assert.equal(
      await page.getByLabel("Alternativa 1", { exact: true }).inputValue(),
      fixture.fallback.id,
    );
    await page.getByText(/Cobertura cmap verificada:/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.getByRole("button", { name: "Aplicar texto", exact: true }).click();
    const family = `edi-${fixture.primary.id}, edi-${fixture.fallback.id}`;
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".scene-artwork text")?.getAttribute("font-family") === expected,
      family,
    );
    await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".scene-artwork text")?.getAttribute("font-family") === expected,
      `edi-${fixture.primary.id}`,
    );
    await page.locator('[data-action="redo"]').click();
    await page.reload();
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".scene-artwork text")?.getAttribute("font-family") === expected,
      family,
    );
    const saved = parseProject(
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    assert.deepEqual(saved.artboards[0]?.scene.nodes[0]?.fontFallbackIds, [fixture.fallback.id]);
    const stable = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="test"]').click();
    const dialog = page.getByRole("dialog", { name: "Testar interação", exact: true });
    await dialog.locator("svg text").waitFor();
    assert.equal(await dialog.locator("svg text").getAttribute("font-family"), family);
    await dialog.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stable);
    await page.locator(`.scene-artwork [data-object="${fixture.textId}"]`).click();
    await page.getByLabel("Alternativa 1", { exact: true }).waitFor();
    await page.screenshot({ path: "../../.cache/edisvg-review/font-fallback-authoring.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
