import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Project } from "../src/shared/project";
import { verifyNativeAnimationCopy } from "./native-animation-copy-journey.mts";

/** Real UI duplication under Electron file/CSP. Reversible edits on the
 * isolated draft; no native file destination or original project is replaced. */
export async function verifyNativeRigClone(
  page: Page,
  parseProject: (input: unknown) => Project,
  screenshotPath: string,
) {
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  if (!before) throw new Error("Missing native clone draft");
  const previous = parseProject(JSON.parse(before));
  let edits = 0;
  try {
    await page.locator('[data-action="import-svg"]').first().click();
    const importing = page.getByRole("dialog", { name: "Importar SVG", exact: true });
    await importing.locator('input[name="svg-file"]').setInputFiles({
      name: "Recorte duplicado.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 160"><path d="M20 80C20 80 220 80 220 80" fill="none" stroke="#e05010" stroke-width="8"/></svg>',
      ),
    });
    await importing.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    await page.waitForFunction(
      (count) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length ===
        count + 1,
      previous.artboards.length,
    );
    edits++;
    const imported = parseProject(
        JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
      ),
      boardId = imported.artboards.at(-1)?.id,
      shapeId = imported.artboards.at(-1)?.scene.nodes[0]?.id;
    assert.ok(boardId && shapeId);
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator(`[data-scene-select="${shapeId}"]`).click();
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Início do recorte (%)", { exact: true }).fill("25");
    await page.getByLabel("Fim do recorte (%)", { exact: true }).fill("75");
    await page.getByLabel("Tolerância do recorte", { exact: true }).fill("0.001");
    await page.getByRole("button", { name: "Adicionar recorte", exact: true }).click();
    await page.waitForFunction(
      (boardId) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.find(
          (board: { id: string }) => board.id === boardId,
        )?.rig?.trims?.length === 1,
      boardId,
    );
    edits++;
    await page.locator('[data-scene-operation="duplicate"]').click();
    await page.waitForFunction(
      (boardId) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.find(
          (board: { id: string }) => board.id === boardId,
        )?.rig?.trims?.length === 2,
      boardId,
    );
    edits++;
    const copied = parseProject(
        JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
      ),
      board = copied.artboards.find((board) => board.id === boardId),
      controls = board?.rig?.trims;
    assert.ok(board && controls?.[0] && controls[1]);
    assert.equal(board.rig?.version, 3);
    assert.notEqual(controls[0].id, controls[1].id);
    assert.notEqual(controls[0].targetId, controls[1].targetId);
    assert.equal(board.scene.nodes.length, 2);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    // This imported board has no animation: the coordinated player is already
    // idle. Reset waits for readiness without assuming an active clock.
    await testing.getByRole("button", { name: "Resetar teste", exact: true }).click();
    assert.equal(
      await testing.getByRole("button", { name: "Reproduzir teste", exact: true }).isEnabled(),
      true,
    );
    for (const control of controls) {
      const length = await testing
        .locator(`[data-edi-object="${control.targetId}"]>path`)
        .evaluate((element) => {
          if (!(element instanceof SVGPathElement))
            throw new Error("Missing native copied trim path");
          return element.getTotalLength();
        });
      assert.ok(Math.abs(length - 100) < 0.001, String(length));
    }
    await testing.screenshot({ path: screenshotPath });
    await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await verifyNativeAnimationCopy(
      page,
      parseProject,
      boardId,
      controls[0].id,
      () => {
        edits++;
      },
      screenshotPath.replace(/edisvg-rig-clone\.png$/, "edisvg-animation-copy.png"),
    );
    console.log(
      "Verified native UI trim authoring/duplication, distinct controllers, actual Testar geometry and reversible draft edits",
    );
  } catch (error) {
    console.error("Native rig clone journey failed before cleanup:", error);
    throw error;
  } finally {
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    if (await testing.count())
      await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    for (let index = 0; index < edits; index++) await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(
      (expected) => localStorage.getItem("edisvg-project") === expected,
      before,
    );
  }
}
