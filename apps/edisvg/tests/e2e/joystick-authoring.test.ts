import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import type { Project } from "../../src/shared/project";
import { joystickFixture } from "../joystickFixture";
import { rendererServer } from "../rendererServer";

test("joystick pad previews real IK without history, commits once and supports keyboard, invalid fields, cancellation, undo and reload", {
  timeout: 60_000,
}, async (context) => {
  const fixture = joystickFixture(),
    server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (!localStorage.getItem("edisvg-project"))
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = () =>
        page.evaluate((): Project => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      target = page.locator(`.scene-artwork [data-object="${fixture.targetId}"]`),
      skin = page.locator(`.scene-artwork [data-object="${fixture.shapeId}"] path`);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Editar joystick", { exact: true }).selectOption(fixture.joystickId);
    const pad = page.getByRole("button", { name: "Pad 2D de Mão", exact: true });
    await pad.scrollIntoViewIfNeeded();
    const baseline = await snapshot(),
      transform = await target.getAttribute("transform"),
      geometry = await skin.getAttribute("d"),
      box = await pad.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6, { steps: 5 });
    assert.deepEqual(await snapshot(), baseline);
    assert.notEqual(await target.getAttribute("transform"), transform);
    assert.notEqual(await skin.getAttribute("d"), geometry);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await snapshot(), baseline);
    assert.equal(await target.getAttribute("transform"), transform);
    assert.equal(await skin.getAttribute("d"), geometry);
    for (const reason of ["capture", "pointercancel", "blur", "resize", "unmount"] as const) {
      await pad.scrollIntoViewIfNeeded();
      const rect = await pad.boundingBox();
      assert.ok(rect);
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await pad.evaluate((element) => {
        element.removeAttribute("data-test-pointer");
        element.addEventListener(
          "pointerdown",
          (event) => {
            if (event instanceof PointerEvent)
              element.setAttribute("data-test-pointer", String(event.pointerId));
          },
          { once: true },
        );
      });
      await page.mouse.down();
      const pointer = Number(await pad.getAttribute("data-test-pointer"));
      assert.ok(pointer > 0, reason);
      await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.3);
      assert.notEqual(await target.getAttribute("transform"), transform);
      assert.deepEqual(await snapshot(), baseline);
      if (reason === "capture")
        await pad.evaluate((element, id) => element.releasePointerCapture(id), pointer);
      else if (reason === "pointercancel")
        await pad.dispatchEvent("pointercancel", { pointerId: pointer });
      else if (reason === "blur")
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else if (reason === "resize") await page.setViewportSize({ width: 1590, height: 1000 });
      else
        await page.locator('[data-action="design"]').evaluate((element) => {
          if (!(element instanceof HTMLButtonElement)) throw new Error("Missing navigation");
          element.click();
        });
      await page.mouse.up();
      assert.deepEqual(await snapshot(), baseline, reason);
      assert.equal(await target.getAttribute("transform"), transform, reason);
      assert.equal(await skin.getAttribute("d"), geometry, reason);
      if (reason === "unmount") {
        await page.getByRole("button", { name: "Restrições", exact: true }).click();
        await page.getByLabel("Editar joystick", { exact: true }).selectOption(fixture.joystickId);
      }
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await pad.scrollIntoViewIfNeeded();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6, { steps: 6 });
    await page.mouse.up();
    const committed = await snapshot(),
      joystick = committed.artboards[0]?.rig?.joysticks?.[0];
    assert.ok(joystick);
    assert.ok(Math.abs(joystick.x - 0.6) < 0.01 && Math.abs(joystick.y - 0.24) < 0.01);
    assert.equal(await pad.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(committed.artboards[0]?.scene, baseline.artboards[0]?.scene);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(), baseline);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(await snapshot(), committed);
    await pad.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("ArrowRight");
    assert.deepEqual(await snapshot(), committed);
    await page.keyboard.up("ArrowRight");
    const nudged = await snapshot();
    assert.ok(
      Math.abs((nudged.artboards[0]?.rig?.joysticks?.[0]?.x ?? 0) - joystick.x - 0.2) < 1e-10,
    );
    assert.equal(await pad.evaluate((element) => element === document.activeElement), true);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(), committed);
    const x = page.getByLabel("Joystick X", { exact: true }),
      y = page.getByLabel("Joystick Y", { exact: true });
    await x.fill("");
    assert.equal(await pad.locator(".joystick-point").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Aplicar eixos", exact: true }).isDisabled(),
      true,
    );
    assert.deepEqual(await snapshot(), committed);
    await x.press("Escape");
    assert.equal(await x.inputValue(), String(joystick.x));
    await x.fill("1");
    await y.fill("1");
    const effective = await pad.locator(".joystick-point").getAttribute("cx");
    assert.ok(Math.abs(Number(effective) - Math.SQRT1_2) < 1e-10);
    assert.deepEqual(await snapshot(), committed);
    await y.press("Enter");
    const corner = await snapshot();
    assert.equal(corner.artboards[0]?.rig?.joysticks?.[0]?.x, 1);
    assert.equal(corner.artboards[0]?.rig?.joysticks?.[0]?.y, 1);
    assert.equal(await y.evaluate((element) => element === document.activeElement), true);
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(await snapshot(), corner);
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Editar joystick", { exact: true }).selectOption(fixture.joystickId);
    await page.getByRole("button", { name: "Remover joystick", exact: true }).click();
    const removed = await snapshot();
    assert.equal(removed.artboards[0]?.rig?.joysticks?.length, 0);
    assert.deepEqual(removed.artboards[0]?.scene, corner.artboards[0]?.scene);
    await page.getByLabel("Nome do joystick", { exact: true }).fill("Nova mão");
    await page.getByLabel("Alvo do joystick", { exact: true }).selectOption(fixture.targetId);
    await page.getByLabel("Extensão do joystick X", { exact: true }).fill("60");
    await page.getByLabel("Extensão do joystick Y", { exact: true }).fill("30");
    await page.getByLabel("Limite do joystick", { exact: true }).selectOption("square");
    await page.getByRole("button", { name: "Adicionar joystick", exact: true }).click();
    const added = await snapshot(),
      newController = added.artboards[0]?.rig?.joysticks?.[0];
    assert.ok(newController);
    assert.deepEqual(
      { ...newController, id: "new" },
      {
        id: "new",
        name: "Nova mão",
        targetId: fixture.targetId,
        rangeX: 60,
        rangeY: 30,
        limit: "square",
        x: 0,
        y: 0,
      },
    );
    await page.getByLabel("Joystick X", { exact: true }).fill("1");
    await page.getByLabel("Joystick Y", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Aplicar eixos", exact: true }).click();
    assert.equal(await page.locator(".joystick-point").getAttribute("cx"), "1");
    assert.equal(await page.locator(".joystick-point").getAttribute("cy"), "1");
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(await snapshot(), added);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
