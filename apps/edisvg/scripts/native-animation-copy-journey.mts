import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Project } from "../src/shared/project";
import { verifyNativeTimelineRig } from "./native-timeline-rig-journey.mts";

/** Adds five reversible authoring edits to the caller's isolated trim fixture. */
export async function verifyNativeAnimationCopy(
  page: Page,
  parseProject: (input: unknown) => Project,
  boardId: string,
  trimId: string,
  markEdit: () => void,
  screenshotPath: string,
) {
  const snapshot = async () =>
    parseProject(
      JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
    );
  const before = await snapshot();
  try {
    await page.keyboard.press("Control+k");
    await page.getByLabel("Buscar comando", { exact: true }).fill("Nova animação por objeto");
    await page.locator('[data-command="clip-new"]').click();
    const dialog = page.locator("#clip-dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill("Recorte nativo");
    await dialog.getByLabel("Quadros por segundo", { exact: true }).fill("10");
    await dialog.getByLabel("Duração em quadros", { exact: true }).fill("10");
    await dialog.getByRole("button", { name: "Criar", exact: true }).click();
    await page.waitForFunction(
      (count) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.motion.animations.length ===
        count + 1,
      before.motion.animations.length,
    );
    markEdit();
    // The editor rebuilds its dialog containers on commit; the old form is gone.
    assert.equal(
      await dialog.evaluate((dialog) => dialog instanceof HTMLDialogElement && dialog.open),
      false,
    );
    const sourceId = (await snapshot()).motion.animations.at(-1)?.id;
    assert.ok(sourceId);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Animação do canal de rig", { exact: true }).selectOption(sourceId);
    await page
      .getByLabel("Restrição do canal de rig", { exact: true })
      .selectOption(JSON.stringify([[], trimId, "end"]));
    for (const [frame, value] of [
      [0, 0],
      [10, 100],
    ]) {
      await page.getByLabel("Quadro do parâmetro", { exact: true }).fill(String(frame));
      await page.getByLabel("Fim da chave (%)", { exact: true }).fill(String(value));
      await page.getByRole("button", { name: "Gravar chave de rig", exact: true }).click();
      await page.waitForFunction(
        ({ boardId, sourceId, frame }) =>
          JSON.parse(localStorage.getItem("edisvg-project") ?? "null")
            ?.artboards.find((board: { id: string }) => board.id === boardId)
            ?.rig?.parameterClips.find(
              (clip: { animationId: string }) => clip.animationId === sourceId,
            )
            ?.tracks[0]?.keys.some((key: { frame: number }) => key.frame === frame),
        { boardId, sourceId, frame },
      );
      markEdit();
    }
    await page.locator('[data-action="clip-duplicate"]').click();
    await page.waitForFunction(
      (count) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.motion.animations.length ===
        count + 2,
      before.motion.animations.length,
    );
    markEdit();
    const copied = await snapshot(),
      copyId = copied.motion.animations.at(-1)?.id,
      board = copied.artboards.find((board) => board.id === boardId),
      original = board?.rig?.parameterClips?.find((clip) => clip.animationId === sourceId),
      clone = board?.rig?.parameterClips?.find((clip) => clip.animationId === copyId),
      targetId = board?.rig?.trims?.find((trim) => trim.id === trimId)?.targetId;
    assert.ok(copyId && original?.tracks[0] && clone?.tracks[0] && targetId);
    assert.notEqual(clone.tracks[0].id, original.tracks[0].id);
    assert.deepEqual(
      clone.tracks[0].keys.map((key) => key.value),
      [0, 1],
    );
    assert.notEqual(clone.tracks[0].keys[0]?.id, original.tracks[0].keys[0]?.id);
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
          throw new Error("Missing native copied animation geometry");
        return path.getTotalLength();
      });
    // Static start=.25, copied end channel=.5 at half a second: 200*(.5-.25).
    assert.ok(Math.abs(length - 50) < 0.001, String(length));
    await page
      .getByRole("dialog", { name: "Testar interação", exact: true })
      .screenshot({ path: screenshotPath });
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.locator('[data-action="clip-settings"]').click();
    const copiedText = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    for (const decision of ["Cancel", "Confirm"]) {
      // Register before click: otherwise Playwright auto-dismisses JS dialogs.
      const response = page.waitForEvent("dialog").then(async (dialog) => {
        const message = dialog.message();
        if (
          dialog.type() !== "confirm" ||
          !message.startsWith("Excluir esta animação") ||
          !message.includes("em todas as pranchetas") ||
          !message.includes("áudio")
        ) {
          await dialog.dismiss();
          throw new Error("Unexpected dialog in the owned animation fixture.");
        }
        if (decision === "Cancel") await dialog.dismiss();
        else await dialog.accept();
      });
      await Promise.all([page.locator("[data-delete-clip]").click(), response]);
      console.log(`Verified actual Electron animation confirmation: ${decision}`);
      if (decision === "Cancel")
        assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), copiedText);
      else {
        await page.waitForFunction(
          (count) =>
            JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.motion.animations
              .length ===
            count + 1,
          before.motion.animations.length,
        );
        markEdit();
        const removed = await snapshot();
        assert.equal(
          removed.artboards
            .find((board) => board.id === boardId)
            ?.rig?.parameterClips?.some((clip) => clip.animationId === copyId),
          false,
        );
      }
    }
    await verifyNativeTimelineRig(
      page,
      parseProject,
      boardId,
      sourceId,
      targetId,
      screenshotPath.replace(/edisvg-animation-copy\.png$/, "edisvg-timeline-rig.png"),
    );
    console.log(
      "Verified native clip creation/key authoring/duplication with independent IDs and actual copied trim playback under file/CSP",
    );
  } finally {
    const close = page.locator("#clip-dialog[open] [data-close-clip]");
    if (await close.count()) await close.click();
  }
}
