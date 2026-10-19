import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { PROJECT_VERSION, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { imageSliceFixture } from "../imageSliceFixture";
import { rendererServer } from "../rendererServer";

test("real sliced PNG pixels preserve corners through responsive layout, repeat reflow without feedback and restore ownership", {
  timeout: 60000,
}, async () => {
  const fixture = imageSliceFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<main style="width:100px;height:60px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (document) => {
      const api = window.EdiAssetTest,
        svg = window.document.querySelector("svg"),
        host = window.document.querySelector("main");
      if (!api || !svg || !host) throw new Error("Missing actual slice runtime");
      const original = svg.querySelector("[data-edi-slice]")?.outerHTML,
        player = await api.createInteractiveSvgPlayerAsync(svg, document, {
          autoplay: false,
          pauseOffscreen: false,
        }),
        // Sample interiors of tiles, outside the bilinear texture footprint
        // at crop edges; corner widths are checked separately below.
        first = await api.svgPixels(svg, 100, 60, [
          [5, 5],
          [20, 5],
          [95, 5],
          [5, 55],
          [95, 55],
          [50, 30],
        ]);
      host.style.width = "200px";
      host.style.height = "100px";
      player.advance(0);
      const larger = await api.svgPixels(svg, 200, 100, [
          [5, 5],
          [20, 5],
          [195, 5],
          [5, 95],
          [195, 95],
          [100, 50],
        ]),
        corner = svg.querySelector("[data-edi-slice]>svg")?.getAttribute("width");
      host.style.width = "100px";
      host.style.height = "60px";
      player.advance(0);
      const again = await api.svgPixels(svg, 100, 60, [
        [5, 5],
        [20, 5],
        [95, 5],
        [5, 55],
        [95, 55],
        [50, 30],
      ]);
      host.style.width = "12px";
      host.style.height = "12px";
      player.advance(0);
      const tiny = svg.querySelector("[data-edi-slice]>svg")?.getAttribute("width");
      await player.destroyAsync();
      const restored = svg.querySelector("[data-edi-slice]")?.outerHTML === original,
        slots = svg.querySelectorAll("[data-edi-layout]").length;
      return { first, larger, again, corner, tiny, restored, slots };
    }, compiled.document);
    const expected = [
      [255, 0, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [255, 255, 255, 255],
    ];
    assert.deepEqual(result.first, expected);
    assert.deepEqual(result.larger, expected);
    assert.deepEqual(result.again, expected);
    assert.equal(result.corner, "10");
    assert.equal(result.tiny, "6");
    assert.equal(result.restored, true);
    assert.equal(result.slots, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("built image inspector authors slicing and dimensions with undo/redo, persists and exposes no ineffective vector paint", {
  timeout: 60000,
}, async () => {
  const fixture = imageSliceFixture(false),
    node = fixture.project.artboards[0]?.scene.nodes[0];
  if (!node) throw new Error("Missing image fixture");
  delete node.imageSlice;
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.goto(server.url);
    await page.locator(`[data-layer-name="${fixture.imageId}"]`).click();
    assert.equal(await page.locator("[data-scene-paint]").count(), 0);
    assert.equal(await page.locator("[data-appearance-panel]").count(), 0);
    await page.getByLabel("Preservar bordas com nine-slice", { exact: true }).check();
    for (const label of ["Borda superior", "Borda direita", "Borda inferior", "Borda esquerda"])
      await page.getByLabel(label, { exact: true }).fill("10");
    await page.getByLabel("Largura da imagem", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Aplicar dimensões da imagem", exact: true }).click();
    assert.equal(await page.locator(".scene-artwork [data-edi-slice]>svg").count(), 9);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator(".scene-artwork [data-edi-slice]").count(), 0);
    await page.locator('[data-action="redo"]').click();
    assert.equal(await page.locator(".scene-artwork [data-edi-slice]>svg").count(), 9);
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(stored);
    const project = parseProject(JSON.parse(stored));
    assert.equal(project.version, PROJECT_VERSION);
    assert.equal(project.artboards[0]?.scene.nodes[0]?.attrs.width, "200");
    assert.equal(project.artboards[0]?.scene.nodes[0]?.imageSlice?.left, 10);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
