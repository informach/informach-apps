import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { applyComponent } from "../../src/shared/components";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import type { Artboard } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { vectorEffectFixture } from "../vectorEffectFixture";

test("effect authoring follows transient object and vertex drags and rolls back Escape without publishing history", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  if (!board) throw new Error("Missing gesture board");
  editScene(board.scene, fixture.sourceId, "visibility", true);
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.goto(server.url);
    await page.locator('[data-action="design"]').click();
    await page.locator(`[data-scene-select="${fixture.sourceId}"]`).click();
    const shape = page.locator(`[data-object="${fixture.sourceId}"]>path`),
      points = await shape.evaluate((shape) => {
        if (!(shape instanceof SVGPathElement)) throw new Error("Missing actual vector source");
        const matrix = shape.getScreenCTM();
        if (!matrix) throw new Error("Missing source screen matrix");
        const start = new DOMPoint(20, 30).matrixTransform(matrix),
          end = new DOMPoint(40, 30).matrixTransform(matrix);
        return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }),
      before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 4 });
    const livePath = page.locator(".scene-artwork [data-edi-live-effects] clipPath path");
    const translated = ((await livePath.getAttribute("transform")) ?? "")
      .replace(/^matrix\(|\)$/g, "")
      .split(/\s+/)
      .map(Number);
    assert.ok(Math.abs((translated[4] ?? NaN) - 30) < 0.01);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.match((await livePath.getAttribute("transform")) ?? "", /10 20\)/);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.getByRole("button", { name: "Editar vértices", exact: true }).click();
    const anchor = page.locator('[data-vertex-part="anchor"][data-vertex-index="1"]'),
      box = await anchor.boundingBox();
    if (!box) throw new Error("Missing real vertex handle");
    const originalPath = await livePath.getAttribute("d");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 4 });
    assert.notEqual(await livePath.getAttribute("d"), originalPath);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await livePath.getAttribute("d"), originalPath);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test("clipping inside independent component scopes keeps correct viewport coordinates and isolated clocks", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    master = fixture.project.artboards[0];
  if (!master) throw new Error("Missing effect master");
  master.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-local", kind: "boolean", name: "Local", initial: false }],
  };
  const board: Artboard = {
    id: "artboard-effect-components",
    name: "Two scopes",
    scene: { viewBox: [0, 0, 200, 100], nodes: [] },
  };
  fixture.project.artboards.push(board);
  const instanceIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const id = applyComponent(board.scene, {
      type: "component",
      operation: "create",
      name: `Instance ${index}`,
      instance: {
        artboardId: fixture.boardId,
        animationId: fixture.animationId,
        width: 100,
        height: 100,
        fit: "contain",
        speed: 1,
        offsetSeconds: 0,
        overrides: [],
      },
    });
    instanceIds.push(id);
    const node = board.scene.nodes.find((node) => node.id === id);
    if (!node) throw new Error("Missing component instance");
    node.transform.x = index * 100;
  }
  const compiled = compileInteractiveArtboard(fixture.project, board.id),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, firstId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("svg");
        if (!api || !svg) throw new Error("Missing component fixture SVG");
        const player = await api.createInteractiveSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
        });
        try {
          const first = player.getComponent([firstId]);
          first.advance(0.5);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const pixels = await api.svgPixels(svg, 200, 100, [
            [20, 50],
            [60, 50],
            [120, 50],
            [160, 50],
          ]);
          const owned = svg.querySelectorAll("[data-edi-live-effects]").length;
          await player.destroyAsync();
          return {
            pixels,
            owned,
            cleaned: svg.querySelectorAll("[data-edi-live-effects]").length === 0,
          };
        } finally {
          await player.destroyAsync();
        }
      },
      { blueprint: compiled.document, firstId: instanceIds[0] ?? "" },
    );
    assert.deepEqual(
      result.pixels.map((pixel) => pixel[3]),
      [0, 64, 64, 0],
    );
    assert.equal(result.owned, 2);
    assert.equal(result.cleaned, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("live clipping and alpha masks render real pixels, animate independently in two players, restore ownership and refuse tampered definitions", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
      animationId: fixture.animationId,
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<div id="first">${compiled.svg}</div><div id="second">${compiled.svg}</div>`,
    );
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, targetId }) => {
        const api = window.EdiAssetTest,
          first = document.querySelector("#first>svg"),
          second = document.querySelector("#second>svg");
        if (!api || !(first instanceof SVGSVGElement) || !(second instanceof SVGSVGElement))
          throw new Error("Missing effect runtime");
        const firstPlayer = await api.createInteractiveSvgPlayerAsync(first, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
            respectReducedMotion: false,
          }),
          secondPlayer = await api.createInteractiveSvgPlayerAsync(second, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
            respectReducedMotion: false,
          });
        try {
          firstPlayer.advance(0.5);
          // Wait for the actual frame loop paint, not an arbitrary delay.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const points: [number, number][] = [
              [20, 50],
              [40, 50],
              [60, 50],
              [90, 50],
            ],
            firstPixels = await api.svgPixels(first, 100, 100, points),
            secondPixels = await api.svgPixels(second, 100, 100, points),
            firstRef = first
              .querySelector(`[data-edi-object="${targetId}"]`)
              ?.getAttribute("clip-path"),
            secondRef = second
              .querySelector(`[data-edi-object="${targetId}"]`)
              ?.getAttribute("clip-path");
          firstPlayer.reset();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const reset = await api.svgPixels(first, 100, 100, points);
          await firstPlayer.destroyAsync();
          await secondPlayer.destroyAsync();
          const restored =
            first
              .querySelector(`[data-edi-object="${targetId}"]`)
              ?.getAttribute("clip-path")
              ?.includes("-live-") === false &&
            first.querySelectorAll("[data-edi-live-effects]").length === 0;
          first.querySelector("clipPath path")?.setAttribute("d", "M0 0L100 0L100 100Z");
          const before = first.outerHTML;
          let refused = false;
          try {
            await api.createInteractiveSvgPlayerAsync(first, blueprint, { autoplay: false });
          } catch (error) {
            refused = error instanceof Error && error.message.includes("definição tipada");
          }
          return {
            firstPixels,
            secondPixels,
            reset,
            independent: firstRef !== secondRef,
            restored,
            refused,
            intact: first.outerHTML === before,
          };
        } finally {
          await firstPlayer.destroyAsync();
          await secondPlayer.destroyAsync();
        }
      },
      { blueprint: compiled.document, targetId: fixture.targetId },
    );
    assert.equal(result.independent, true);
    assert.equal(result.restored, true);
    assert.equal(result.refused, true);
    assert.equal(result.intact, true);
    assert.deepEqual(
      result.firstPixels.map((pixel) => pixel[3]),
      [0, 64, 64, 0],
    );
    assert.deepEqual(
      result.secondPixels.map((pixel) => pixel[3]),
      [64, 64, 0, 0],
    );
    assert.deepEqual(
      result.reset.map((pixel) => pixel[3]),
      [64, 64, 0, 0],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("built effects inspector authors safe references, preserves undo/recovery and previews animated source movement", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    node = fixture.project.artboards[0]?.scene.nodes.find((node) => node.id === fixture.targetId);
  if (!node) throw new Error("Missing target");
  delete node.effects;
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (!localStorage.getItem("edisvg-project"))
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project);
    await page.goto(server.url);
    await page.locator(`[data-layer-name="${fixture.targetId}"]`).click();
    await page.locator('[data-inspector-section="effects"] > summary').click();
    const panel = page.getByRole("region", { name: "Recortes e máscaras", exact: true });
    await panel
      .getByRole("combobox", { name: "Fonte do recorte", exact: true })
      .selectOption(fixture.sourceId);
    await panel
      .getByRole("combobox", { name: "Fonte da máscara alpha", exact: true })
      .selectOption(fixture.sourceId);
    await panel.getByLabel("Intensidade da máscara", { exact: true }).fill("0.5");
    await panel.getByRole("button", { name: "Aplicar recorte / máscara", exact: true }).click();
    assert.equal(await page.locator(".scene-artwork clipPath").count(), 2);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator(".scene-artwork clipPath").count(), 0);
    await page.locator('[data-action="redo"]').click();
    await page.locator("#clip-select").selectOption(fixture.animationId);
    await page.locator('[data-action="end"]').click();
    const livePath = page.locator(".scene-artwork [data-edi-live-effects] clipPath path");
    await livePath.waitFor({ state: "attached" });
    assert.match((await livePath.getAttribute("transform")) ?? "", /50 20\)/);
    await page.locator('[data-action="export"]').click();
    assert.equal(await page.locator('[name="format"][value="svg"]').isDisabled(), true);
    assert.equal(await page.locator('[name="format"][value="html"]').isDisabled(), true);
    assert.equal(await page.locator('[name="format"][value="interactive-html"]').isChecked(), true);
    await page.getByRole("button", { name: "Fechar exportação", exact: true }).click();
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.reload();
    await page.locator(".scene-artwork clipPath").first().waitFor({ state: "attached" });
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stored);
    await page.locator(`[data-layer-name="${fixture.targetId}"]`).click();
    await page.locator('[data-inspector-section="effects"] > summary').click();
    await panel
      .getByRole("button", { name: "Aplicar recorte / máscara", exact: true })
      .scrollIntoViewIfNeeded();
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await page.screenshot({
      path: resolve("../../.cache/edisvg-review/vector-effects-authoring.png"),
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
