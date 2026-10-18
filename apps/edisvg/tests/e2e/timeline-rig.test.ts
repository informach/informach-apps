import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { animationKeySelectionId } from "../../src/shared/animationKeyReference";
import { contentSnapshot, parseProject } from "../../src/shared/project";
import {
  animationTimelineFixture,
  denseAnimationTimelineFixture,
} from "../animationTimelineFixture";
import { deformationFixture } from "../deformationFixture";
import { rendererServer } from "../rendererServer";

const snapshot = async (page: Page) => {
  const text = await page.evaluate(() => localStorage.getItem("edisvg-project"));
  assert.ok(text);
  return parseProject(JSON.parse(text));
};
const keySelector = (id: string) => `[data-clip-key=${JSON.stringify(id)}]`;

test("dense mixed timeline virtualizes both axes, preserves scroll across renders and reveals selected keys in clustered pixels", {
  timeout: 60000,
}, async () => {
  const fixture = denseAnimationTimelineFixture(),
    server = await rendererServer(),
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
    }, fixture.source);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="animate"]').click();
    assert.equal(fixture.count * fixture.keys * 2, 32000);
    assert.ok((await page.locator("[data-clip-key]").count()) < 3000);
    assert.ok((await page.locator("[data-track-id]").count()) < 20);
    const id = animationKeySelectionId({
        kind: "rig",
        artboardId: fixture.boardId,
        trackId: "track-rig-0",
        keyId: "key-rig-0-0",
      }),
      key = page.locator(keySelector(id));
    assert.equal(await key.count(), 0, "Offscreen rig rows are not mounted");
    await page.locator(".timeline-body").evaluate((element, row) => {
      element.scrollTop = row * 24;
    }, fixture.count - 2);
    await key.waitFor();
    const top = await page.locator(".timeline-body").evaluate((element) => element.scrollTop);
    assert.ok(top > 0);
    await key.click();
    assert.equal(
      await page.locator(".timeline-body").evaluate((element) => element.scrollTop),
      top,
    );
    for (let index = 0; index < 3; index++)
      await page.locator('[data-action="timeline-zoom-in"]').click();
    await page.locator('[data-action="edit-key"]').click();
    await page.getByLabel("Quadro", { exact: true }).fill("999");
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    assert.equal(await key.evaluate((element) => element === document.activeElement), true);
    assert.equal(await key.getAttribute("data-clip-frame"), "999");
    assert.ok((await page.locator(".timeline-body").evaluate((element) => element.scrollLeft)) > 0);
    assert.ok((await page.locator("[data-clip-key]").count()) < 3000);
    assert.ok((await page.locator("[data-track-id]").count()) < 20);
    const edited = await snapshot(page);
    assert.equal(
      edited.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.at(-1)?.id,
      "key-rig-0-0",
    );
    assert.equal(
      edited.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.length,
      fixture.keys,
    );
    assert.deepEqual(edited.motion, fixture.source.motion);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), contentSnapshot(fixture.source));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("unified timeline distinguishes equal motion/rig IDs, edits mixed keys atomically and preserves draft cancellation, history and reload", {
  timeout: 60000,
}, async () => {
  const fixture = animationTimelineFixture(),
    server = await rendererServer(),
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
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="animate"]').click();
    const before = contentSnapshot(await snapshot(page)),
      motion = page.locator(keySelector(animationKeySelectionId(fixture.motion))),
      rig = page.locator(keySelector(animationKeySelectionId(fixture.rig))),
      pair = async () => {
        await motion.click();
        await rig.click({ modifiers: ["Shift"] });
        assert.equal(await page.locator('[data-clip-key][aria-pressed="true"]').count(), 2);
      };
    assert.equal(await page.locator(".virtual-track-row .track").count(), 2);
    await pair();
    // A mixed pointer preview must cancel without a content transaction.
    const box = await rig.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 3 });
    assert.deepEqual(contentSnapshot(await snapshot(page)), before);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(contentSnapshot(await snapshot(page)), before);
    for (const operation of ["move-keys", "copy-keys"]) {
      await page.locator('[data-action="retime-keys"]').click();
      await page.getByRole("combobox", { name: "Operação", exact: true }).selectOption(operation);
      await page.getByLabel("Deslocamento em quadros", { exact: true }).fill("2");
      await page.getByRole("button", { name: "Aplicar às chaves", exact: true }).click();
      const project = await snapshot(page),
        tracks = [
          project.motion.animations[0]?.tracks[0],
          project.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0],
        ];
      for (const track of tracks) {
        assert.ok(track);
        assert.deepEqual(
          track.keys.map((key) => key.frame),
          operation === "move-keys" ? [2, 10] : [0, 2, 10],
        );
      }
      await page.locator('[data-action="undo"]').click();
      assert.deepEqual(contentSnapshot(await snapshot(page)), before);
      await pair();
    }
    await page.locator('[data-action="delete-key"]').click();
    const deleted = await snapshot(page);
    assert.equal(deleted.motion.animations[0]?.tracks[0]?.keys.length, 1);
    assert.equal(deleted.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys.length, 1);
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), before);
    await rig.click();
    await rig.press("Enter");
    await page
      .getByRole("combobox", { name: "Interpolação de saída", exact: true })
      .selectOption("cubic-bezier");
    const handle = page.getByRole("button", { name: "Controle Bézier 1", exact: true });
    await handle.focus();
    await handle.press("ArrowRight");
    assert.ok(
      Math.abs(Number(await page.getByLabel("x1", { exact: true }).inputValue()) - 0.43) < 1e-9,
    );
    await handle.press("Enter");
    assert.equal(
      await page
        .getByLabel("x1", { exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.getByLabel("y1", { exact: true }).fill("");
    assert.equal(
      await page.getByRole("button", { name: "Aplicar chave", exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await page.locator("[data-curve-line]").count(),
      0,
      "Invalid drafts cannot display the last valid curve",
    );
    assert.deepEqual(contentSnapshot(await snapshot(page)), before);
    await page.getByLabel("y1", { exact: true }).fill("0.8");
    await page.getByLabel("Valor", { exact: true }).fill("0.25");
    assert.equal(await page.locator("[data-elastic-options]").isVisible(), false);
    await page.setViewportSize({ width: 980, height: 680 });
    const footer = await page.locator("#clip-dialog .dialog-footer").boundingBox();
    assert.ok(footer && footer.y >= 0 && footer.y + footer.height <= 680);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.setViewportSize({ width: 1600, height: 1000 });
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await page.screenshot({ path: resolve("../../.cache/edisvg-review/timeline-rig-curve.png") });
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    const edited = await snapshot(page),
      rigKey = edited.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys[0];
    assert.ok(rigKey);
    assert.equal(rigKey.value, 0.25);
    assert.deepEqual(rigKey.easing, { kind: "cubic-bezier", points: [0.43, 0.8, 0.58, 1] });
    assert.deepEqual(edited.motion, fixture.project().motion);
    for (let index = 0; index < 3; index++)
      await page.locator('[data-action="timeline-zoom-in"]').click();
    await page.locator('[data-action="edit-key"]').click();
    await page.getByLabel("Quadro", { exact: true }).fill("9");
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    assert.equal(
      await rig.evaluate((element) => element === document.activeElement),
      true,
      "Editing beyond the viewport must reveal and focus the same virtual key",
    );
    assert.equal(await rig.isVisible(), true);
    assert.equal(await rig.getAttribute("data-clip-frame"), "9");
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), contentSnapshot(edited));
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), contentSnapshot(edited));
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(contentSnapshot(await snapshot(page)), contentSnapshot(edited));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("solo timeline keys retain integer indices and mandatory hold without losing morph or path channels", {
  timeout: 60000,
}, async () => {
  const fixture = deformationFixture(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project(),
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="animate"]').click();
    const before = await snapshot(page),
      id = animationKeySelectionId({
        kind: "rig",
        artboardId: fixture.rootId,
        trackId: "track-solo",
        keyId: "key-solo-start",
      });
    await page.locator(keySelector(id)).click();
    await page.locator('[data-action="edit-key"]').click();
    const value = page.getByLabel("Valor", { exact: true }),
      easing = page.getByRole("combobox", { name: "Interpolação de saída", exact: true });
    assert.equal(await value.getAttribute("step"), "1");
    assert.equal(await value.getAttribute("min"), "-1");
    assert.equal(await value.getAttribute("max"), "1");
    assert.equal(await easing.isDisabled(), true);
    assert.equal(await easing.inputValue(), "hold");
    assert.equal(
      await page.getByRole("button", { name: "Usar curva Suave", exact: true }).isDisabled(),
      true,
    );
    await value.fill("0.5");
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    assert.deepEqual(contentSnapshot(await snapshot(page)), contentSnapshot(before));
    assert.equal(
      await value.evaluate(
        (element) => element instanceof HTMLInputElement && element.validity.stepMismatch,
      ),
      true,
    );
    await value.fill("-1");
    await page.getByRole("button", { name: "Aplicar chave", exact: true }).click();
    const edited = await snapshot(page),
      tracks = edited.artboards[0]?.rig?.parameterClips?.[0]?.tracks;
    assert.ok(tracks);
    assert.deepEqual(
      tracks.slice(0, 2),
      before.artboards[0]?.rig?.parameterClips?.[0]?.tracks.slice(0, 2),
    );
    assert.deepEqual(tracks[2]?.keys[0], {
      id: "key-solo-start",
      frame: 0,
      value: -1,
      easing: "hold",
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
