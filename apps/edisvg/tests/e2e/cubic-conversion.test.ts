import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { prepareCubicConversion } from "../../src/shared/cubicConversion";
import { compileLottie } from "../../src/shared/lottie/compile";
import { inspectLottieCompatibility } from "../../src/shared/lottie/prepare";
import { contentSnapshot, parseProject } from "../../src/shared/project";
import { lottieFixture } from "../lottieFixture";
import { rendererServer } from "../rendererServer";

test("built cubic authoring previews geometry, requires consent, persists one undoable edit and enables only explicit Lottie conversion", {
  timeout: 60000,
}, async () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    shape = board?.scene.nodes[0];
  assert.ok(shape);
  shape.attrs.stroke = "#000000";
  shape.attrs["stroke-width"] = "8";
  const options = {
      artboardId: fixture.boardId,
      animationId: fixture.clipId,
      confirmSampling: true,
      confirmRendererPrecision: true,
    },
    before = contentSnapshot(fixture.project);
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project);
    await page.goto(server.url);
    const snapshot = async () => {
      const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
      assert.ok(stored);
      return parseProject(JSON.parse(stored));
    };
    await page.locator('[data-action="design"]').click();
    await page.locator(`[data-scene-select="${fixture.shapeId}"]`).click();
    await page.getByRole("button", { name: "Editar vértices", exact: true }).click();
    const panel = page.locator(".cubic-conversion"),
      convert = panel.getByRole("button", {
        name: "Converter caminho para Bézier cúbica",
        exact: true,
      });
    await panel.getByRole("img", { name: "Geometria antes da conversão", exact: true }).waitFor();
    await panel.getByRole("img", { name: "Geometria depois da conversão", exact: true }).waitFor();
    assert.equal(await convert.isDisabled(), true);
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await panel
      .getByLabel("Confirmo a conversão e possíveis mudanças na aparência", { exact: true })
      .check();
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await panel.screenshot({ path: resolve("../../.cache/edisvg-review/cubic-conversion.png") });
    await convert.click();
    await panel
      .getByText("O caminho já usa a representação cúbica canônica.", { exact: true })
      .waitFor();
    const converted = await snapshot(),
      convertedShape = converted.artboards[0]?.scene.nodes[0];
    assert.deepEqual(convertedShape, {
      ...shape,
      attrs: { ...shape.attrs, d: prepareCubicConversion(shape.attrs.d ?? "").pathData },
    });
    assert.equal(inspectLottieCompatibility(converted, options).supported, true);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(converted));
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(converted));
    await page.locator('[data-action="export"]').click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    const downloading = page.waitForEvent("download");
    await dialog.locator("#download").click();
    const download = await downloading,
      path = await download.path();
    assert.ok(path);
    assert.deepEqual(
      JSON.parse(await readFile(path, "utf8")),
      compileLottie(converted, { ...options, alt: converted.name }).document,
    );
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(converted));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
