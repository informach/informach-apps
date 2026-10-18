import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Project } from "../src/shared/project";

/** Reversible authoring through the actual Electron inspector and history. */
export async function verifyNativeJoystick(
  page: Page,
  parseProject: (input: unknown) => Project,
  screenshotPath: string,
) {
  const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  assert.ok(before);
  const snapshot = async () =>
      parseProject(
        JSON.parse(await page.evaluate(() => localStorage.getItem("edisvg-project") ?? "null")),
      ),
    boardId = (await snapshot()).defaultArtboardId;
  let edits = 0;
  try {
    await page.locator('[data-action="design"]').click();
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Nome do alvo", { exact: true }).fill("Alvo do joystick");
    await page.getByLabel("Novo alvo X", { exact: true }).fill("100");
    await page.getByLabel("Novo alvo Y", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Criar alvo", exact: true }).click();
    edits++;
    const targetId = (await snapshot()).artboards
      .find((board) => board.id === boardId)
      ?.rig?.targets.at(-1);
    assert.ok(targetId);
    await page.getByLabel("Editar joystick", { exact: true }).selectOption("");
    await page.getByLabel("Nome do joystick", { exact: true }).fill("Joystick nativo");
    await page.getByLabel("Alvo do joystick", { exact: true }).selectOption(targetId);
    await page.getByLabel("Extensão do joystick X", { exact: true }).fill("40");
    await page.getByLabel("Extensão do joystick Y", { exact: true }).fill("20");
    await page.getByRole("button", { name: "Adicionar joystick", exact: true }).click();
    edits++;
    const base = await snapshot(),
      controller = base.artboards.find((board) => board.id === boardId)?.rig?.joysticks?.[0];
    assert.ok(controller);
    const pad = page.getByRole("button", { name: "Pad 2D de Joystick nativo", exact: true });
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    assert.ok(box);
    const target = page.locator(`.scene-artwork [data-object="${targetId}"]`),
      transform = await target.getAttribute("transform");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6, { steps: 5 });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("edisvg-project")),
      JSON.stringify(base),
    );
    assert.notEqual(await target.getAttribute("transform"), transform);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await snapshot(), base);
    assert.equal(await target.getAttribute("transform"), transform);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6, { steps: 5 });
    await page.mouse.up();
    edits++;
    const committed = await snapshot(),
      value = committed.artboards.find((board) => board.id === boardId)?.rig?.joysticks?.[0];
    assert.ok(value && value.x > 0.5 && value.y > 0.15);
    assert.equal(await pad.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await snapshot(), base);
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await snapshot(), committed);
    await page.getByLabel("Joystick X", { exact: true }).fill("1");
    await page.getByLabel("Joystick Y", { exact: true }).fill("1");
    assert.deepEqual(await snapshot(), committed);
    assert.ok(
      Math.abs(Number(await pad.locator(".joystick-point").getAttribute("cx")) - Math.SQRT1_2) <
        1e-10,
    );
    await page.getByRole("button", { name: "Cancelar prévia", exact: true }).click();
    assert.deepEqual(await snapshot(), committed);
    await pad.screenshot({ path: screenshotPath });
    console.log(
      "Verified native joystick authoring, real draft preview, cancellation, one-step history, focus and circular range under file/CSP",
    );
  } finally {
    await page.keyboard.press("Escape");
    for (let index = 0; index < edits; index++) await page.keyboard.press("Control+z");
    await page.waitForFunction(
      (original) => localStorage.getItem("edisvg-project") === original,
      before,
    );
  }
}
