import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Project } from "../src/shared/project";

/** Actual file input + shipped DOMParser/transactions under Electron file/CSP.
 * Uses only the runner's isolated profile and undoes the temporary artboard. */
export async function verifyNativeSvgSemanticImport(
  page: Page,
  source: string,
  parseProject: (input: unknown) => Project,
  screenshotPath: string,
) {
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  if (!before) throw new Error("Missing native project snapshot");
  const previous = parseProject(JSON.parse(before));
  await page.locator('[data-action="import-svg"]').first().click();
  const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
  const url = page.url(),
    canceled = await dialog.locator("h2").evaluate((target, source) => {
      const data = new DataTransfer();
      data.items.add(new File([source], "Ignored.svg", { type: "image/svg+xml" }));
      const event = new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    }, source);
  assert.equal(canceled, true);
  assert.equal(page.url(), url);
  assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
  await dialog.locator('input[name="svg-file"]').setInputFiles({
    name: "Arte semântica.svg",
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
      added = current.artboards.at(-1);
    assert.ok(added);
    assert.equal(added.scene.source, source);
    const rect = added.scene.nodes[0]?.children.find((node) => node.name === "paint");
    assert.ok(rect);
    assert.deepEqual(rect.semantics, {
      kind: "image",
      label: "Retângulo",
      description: "Forma vermelha.",
    });
    await page.locator(`.scene-artwork [data-object="${rect.id}"]`).click();
    assert.equal(
      await page.getByLabel("Nome acessível", { exact: true }).inputValue(),
      "Retângulo",
    );
    await page.locator('[data-action="test"]').click();
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    await testing.getByRole("img", { name: "Retângulo", exact: true }).waitFor();
    await testing.screenshot({ path: screenshotPath });
    await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
  } finally {
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    if (await testing.count())
      await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(
      (expected) => localStorage.getItem("edisvg-project") === expected,
      before,
    );
  }
  assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
  console.log(
    "Verified native SVG metadata import via actual file input, semantic Testar and undo preserving the original document under file/CSP",
  );
}
