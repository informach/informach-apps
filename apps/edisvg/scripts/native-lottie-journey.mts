import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { tsImport } from "tsx/esm/api";

/** Actual shipped worker under file/CSP and native Save/Cancel. The helper
 * edits only the harness draft and undoes its authoring changes afterwards. */
export async function verifyNativeLottieExport(
  page: Page,
  outputPath: string,
  screenshotPath: string,
  respond: (action: "Save" | "Open" | "Cancel", path: string) => Promise<unknown>,
  source?: {
    kind: "stroke" | "gradient" | "cubic-conversion";
    svg: string;
    expectedGradientCount?: number;
  },
) {
  const importSource = source?.svg,
    convertCubic = source?.kind === "cubic-conversion";
  const { compileLottie, parseProject }: typeof import("../tests/nativeRigFixtures.ts") =
    await tsImport("../tests/nativeRigFixtures.ts", import.meta.url);
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  if (!before) throw new Error("Missing native Lottie source");
  let edits = 0;
  try {
    if (importSource) {
      const count = parseProject(JSON.parse(before)).artboards.length;
      await page.locator('[data-action="import-svg"]').first().click();
      const importing = page.getByRole("dialog", { name: "Importar SVG", exact: true });
      await importing.locator('input[name="svg-file"]').setInputFiles({
        name: "Curvas com contorno.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(importSource),
      });
      await importing.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
      await page.waitForFunction(
        (count) =>
          JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length ===
          count + 1,
        count,
      );
      edits++;
    }
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator("[data-scene-select]").first().click();
    const stroke = page.locator('[data-scene-paint="stroke"]'),
      previousStroke = await stroke.inputValue();
    if (!importSource && previousStroke !== "none") {
      await stroke.fill("none");
      await stroke.press("Tab");
      edits++;
    }
    if (convertCubic) {
      await page.getByRole("button", { name: "Editar vértices", exact: true }).click();
      const panel = page.locator(".cubic-conversion"),
        convert = panel.getByRole("button", {
          name: "Converter caminho para Bézier cúbica",
          exact: true,
        });
      await panel.getByRole("img", { name: "Geometria antes da conversão", exact: true }).waitFor();
      assert.equal(await convert.isDisabled(), true);
      await panel
        .getByLabel("Confirmo a conversão e possíveis mudanças na aparência", { exact: true })
        .check();
      await convert.click();
      await panel
        .getByText("O caminho já usa a representação cúbica canônica.", { exact: true })
        .waitFor();
      edits++;
      await page.keyboard.press("Escape");
    }
    await page.locator('[data-action="clip-new"]').first().click();
    const creation = page.locator("#clip-dialog");
    await creation.locator('[name="name"]').fill("Lottie nativo");
    await creation.locator('[name="fps"]').fill("30");
    await creation.locator('[name="frames"]').fill("30");
    await creation.getByRole("button", { name: "Criar", exact: true }).click();
    edits++;
    const draft = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    if (!draft) throw new Error("Missing authored native animation");
    const project = parseProject(JSON.parse(draft)),
      clip = project.motion.animations.at(-1);
    assert.ok(clip);
    const boardId = importSource ? project.artboards.at(-1)?.id : project.defaultArtboardId;
    assert.ok(boardId);
    const expected = compileLottie(project, {
      artboardId: boardId,
      animationId: clip.id,
      alt: project.name,
      confirmSampling: true,
      confirmRendererPrecision: true,
    });
    if (source?.expectedGradientCount !== undefined) {
      const pending = expected.document.layers.flatMap((layer) => layer.shapes);
      let count = 0;
      while (pending.length) {
        const shape = pending.pop();
        if (shape?.ty === "gf") count++;
        if (shape?.ty === "gr") pending.push(...shape.it);
      }
      assert.equal(
        count,
        source.expectedGradientCount,
        "All imported gradient paints must survive authoring and compilation",
      );
    }
    await page.locator('[data-action="export"]').click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    await dialog.screenshot({ path: screenshotPath });
    await dialog.locator("#download").click();
    await respond("Save", outputPath);
    await dialog.waitFor({ state: "hidden" });
    const saved = await readFile(outputPath, "utf8");
    assert.deepEqual(JSON.parse(saved), expected.document);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), draft);
    await page.locator('[data-action="export"]').click();
    await dialog.locator('[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    await dialog.locator("#download").click();
    await respond("Cancel", outputPath);
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#download")?.disabled,
    );
    assert.equal(await readFile(outputPath, "utf8"), saved);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), draft);
    await dialog.locator("#close-export").click();
  } finally {
    const dialog = page.locator("#export-dialog");
    if (await dialog.isVisible()) await dialog.locator("#close-export").click();
    for (let step = 0; step < edits; step++) await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(
      (expected) => localStorage.getItem("edisvg-project") === expected,
      before,
    );
  }
  console.log(
    `Verified native Lottie ${convertCubic ? "authored cubic conversion" : source?.kind === "gradient" ? "typed gradient" : importSource ? "cubic stroke" : "fill"} worker under file/CSP, explicit consent, Save/Cancel and unchanged original draft`,
  );
}
