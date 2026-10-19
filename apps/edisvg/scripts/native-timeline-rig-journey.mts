import assert from "node:assert/strict";
import type { Page } from "playwright";
import { tsImport } from "tsx/esm/api";
import type { Project } from "../src/shared/project";

/** Exercises unified authoring on the caller's isolated document, then undoes
 * exactly its own edits. Main/preload licensing and file/CSP remain in force. */
export async function verifyNativeTimelineRig(
  page: Page,
  parseProject: (input: unknown) => Project,
  boardId: string,
  animationId: string,
  targetId: string,
  screenshotPath: string,
) {
  const { ease, animationKeySelectionId }: typeof import("../tests/nativeRigFixtures.ts") =
    await tsImport("../tests/nativeRigFixtures.ts", import.meta.url);
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project")),
    snapshot = async () =>
      parseProject(
        JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
      );
  assert.ok(before);
  let edits = 0;
  try {
    await page.locator('[data-action="animate"]').click();
    await page.locator("#clip-select").selectOption(animationId);
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator(`[data-scene-select="${targetId}"]`).click();
    await page.locator('[data-action="start"]').click();
    await page.locator('[data-action="add-key"]').click();
    await page.waitForFunction(
      (animationId) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.motion.animations.find(
          (clip: { id: string }) => clip.id === animationId,
        )?.tracks.length > 0,
      animationId,
    );
    edits++;
    const authored = await snapshot(),
      clip = authored.motion.animations.find((clip) => clip.id === animationId),
      board = authored.artboards.find((board) => board.id === boardId),
      motion = clip?.tracks.find((track) => track.targetId === targetId && track.property === "x"),
      rig = board?.rig?.parameterClips?.find((clip) => clip.animationId === animationId)?.tracks[0];
    assert.ok(motion?.keys[0] && rig?.keys[0]);
    const motionId = motion.keys[0].id,
      rigId = animationKeySelectionId({
        kind: "rig",
        artboardId: boardId,
        trackId: rig.id,
        keyId: rig.keys[0].id,
      }),
      rigSelector = `[data-clip-key=${JSON.stringify(rigId)}]`;
    // The row may lie below nine TRS channels. Native scroll keeps virtualization.
    await page.locator(".timeline-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.locator(rigSelector).waitFor();
    await page.locator(".timeline-body").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.locator(`[data-clip-key="${motionId}"]`).click();
    await page.locator(".timeline-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.locator(rigSelector).click({ modifiers: ["Shift"] });
    await page.locator('[data-action="retime-keys"]').click();
    await page.getByRole("combobox", { name: "Operação", exact: true }).selectOption("move-keys");
    await page.getByLabel("Deslocamento em quadros", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Aplicar às chaves", exact: true }).click();
    await page.waitForFunction(
      ({ boardId, animationId }) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")
          ?.artboards.find((board: { id: string }) => board.id === boardId)
          ?.rig?.parameterClips.find(
            (clip: { animationId: string }) => clip.animationId === animationId,
          )?.tracks[0]?.keys[0]?.frame === 2,
      { boardId, animationId },
    );
    edits++;
    const moved = await snapshot();
    assert.equal(
      moved.motion.animations
        .find((clip) => clip.id === animationId)
        ?.tracks.find((track) => track.id === motion.id)?.keys[0]?.frame,
      2,
    );
    await page.locator(rigSelector).click();
    await page.locator('[data-action="edit-key"]').click();
    await page.getByLabel("Valor", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "Usar curva Suave", exact: true }).click();
    await page.getByRole("button", { name: "Controle Bézier 1", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    await page.waitForFunction(
      ({ boardId, animationId }) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")
          ?.artboards.find((board: { id: string }) => board.id === boardId)
          ?.rig?.parameterClips.find(
            (clip: { animationId: string }) => clip.animationId === animationId,
          )?.tracks[0]?.keys[0]?.value === 0.5,
      { boardId, animationId },
    );
    edits++;
    const edited = await snapshot(),
      key = edited.artboards
        .find((board) => board.id === boardId)
        ?.rig?.parameterClips?.find((clip) => clip.animationId === animationId)?.tracks[0]?.keys[0];
    assert.ok(key);
    assert.deepEqual(key.easing, { kind: "cubic-bezier", points: [0.43, 0, 0.58, 1] });
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    for (let index = 0; index < 30; index++)
      await page.getByRole("button", { name: "Avançar teste 1/60s", exact: true }).click();
    const length = await page
        .locator(`.behavior-test-preview [data-edi-object="${targetId}"]>path`)
        .evaluate((path) => {
          if (!(path instanceof SVGPathElement))
            throw new Error("Missing native unified timeline geometry");
          return path.getTotalLength();
        }),
      end = 0.5 + ease((5 - 2) / (10 - 2), key.easing) * 0.5;
    assert.ok(Math.abs(length - 200 * (end - 0.25)) < 0.001, String(length));
    await page
      .getByRole("dialog", { name: "Testar interação", exact: true })
      .screenshot({ path: screenshotPath });
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    console.log(
      "Verified native unified TRS/rig selection, mixed retiming, React curve keyboard editing and actual coordinated geometry",
    );
  } finally {
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    if (await testing.count())
      await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    const close = page.locator("#clip-dialog[open] [data-close-key]");
    if (await close.count()) await close.click();
    // The menu buttons are intentionally hidden at narrower native window sizes.
    for (let index = 0; index < edits; index++) await page.keyboard.press("Control+z");
    await page.waitForFunction(
      (before) => localStorage.getItem("edisvg-project") === before,
      before,
    );
  }
}
