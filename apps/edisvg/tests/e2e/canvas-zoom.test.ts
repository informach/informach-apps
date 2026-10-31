import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("Ctrl + roda dá zoom no artboard em torno do ponteiro, sem editar o documento", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push({
    id: "node-box",
    name: "Caixa",
    tag: "rect",
    attrs: { x: "200", y: "200", width: "100", height: "100", fill: "#4fe3c1" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    const box = page.locator('[data-object="node-box"]'),
      zoom = page.getByRole("combobox", { name: "Zoom" });
    const before = await box.boundingBox();
    assert.ok(before);
    const pointer = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.mouse.move(pointer.x, pointer.y);

    // Without Ctrl the wheel does not zoom.
    await page.mouse.wheel(0, -200);
    assert.equal(await zoom.inputValue(), "75%");

    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    const after = await box.boundingBox();
    assert.ok(after);
    const ratio = after.width / before.width;
    assert.ok(ratio > 1.3, `zoomed in (${ratio})`);
    assert.equal(await zoom.inputValue(), `${Math.round(75 * ratio)}%`, "the select shows it");
    // The point under the pointer stays under it.
    assert.ok(Math.abs(after.x + after.width / 2 - pointer.x) < 1.5);
    assert.ok(Math.abs(after.y + after.height / 2 - pointer.y) < 1.5);

    await page.keyboard.down("Control");
    for (let step = 0; step < 20; step++) await page.mouse.wheel(0, 400);
    await page.keyboard.up("Control");
    assert.equal(await zoom.inputValue(), "10%", "zoom out stops at 10%");

    assert.equal(
      await page.evaluate(() => localStorage.getItem("edisvg-project")),
      stored,
      "zoom is a view setting, not a document edit",
    );
    await page.getByRole("button", { name: "Centralizar" }).click();
    assert.equal(await zoom.inputValue(), "75%");
    const reset = await box.boundingBox();
    assert.ok(reset);
    assert.ok(Math.abs(reset.width - before.width) < 0.5);
  } finally {
    await browser.close();
    await server.close();
  }
});
