import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Project } from "../src/shared/project";

/** Actual shipped import/inspector/Testar. Each journey undoes its artboard. */
export async function verifyNativeSvgEffectImport(
  page: Page,
  source: string,
  parseProject: (input: unknown) => Project,
  screenshotPath: string,
) {
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  if (!before) throw new Error("Missing isolated project");
  const previous = parseProject(JSON.parse(before));
  await page.locator('[data-action="import-svg"]').first().click();
  const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
  await dialog.locator('input[name="svg-file"]').setInputFiles({
    name: "Recortes nativos.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(source),
  });
  await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
  await page.waitForFunction(
    (count) =>
      JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length === count,
    previous.artboards.length + 1,
  );
  try {
    const current = parseProject(
        JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
      ),
      added = current.artboards.at(-1),
      target = added?.scene.nodes[0],
      effect = target?.effects?.clip ?? target?.effects?.mask;
    assert.ok(added && target && effect);
    assert.equal(current.version, previous.version);
    assert.equal(added.scene.source, source);
    assert.ok(
      target.children.some((child) => child.id === effect.sourceId && child.visible === false),
    );
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator(`[data-scene-select="${target.id}"]`).click();
    const panel = page.getByRole("region", { name: "Recortes e máscaras", exact: true }),
      label = target.effects?.clip ? "Fonte do recorte" : "Fonte da máscara alpha";
    assert.equal(
      await panel.getByRole("combobox", { name: label, exact: true }).inputValue(),
      effect.sourceId,
    );
    await page.locator('[data-action="test"]').click();
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    await testing.locator("[data-edi-live-effects]").waitFor({ state: "attached" });
    await testing.screenshot({ path: screenshotPath });
    await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
  } finally {
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    if (await testing.count())
      await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.keyboard.press("Control+z");
    await page.waitForFunction(
      (expected) => localStorage.getItem("edisvg-project") === expected,
      before,
    );
  }
  assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
  console.log(
    "Verified actual SVG effect import, typed native source inspector, isolated Testar and exact undo under file/CSP",
  );
}
