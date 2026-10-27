import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("o seletor visual aplica preenchimento e opacidade em uma edição reversível", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  const board = project.artboards[0];
  assert.ok(board);
  board.scene.nodes.push({
    id: "node-paint-target",
    name: "Forma colorida",
    tag: "rect",
    attrs: { x: "10", y: "10", width: "80", height: "80", fill: "#4fe3c1" },
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      parseProject(project),
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    await page.locator('[data-scene-select="node-paint-target"]').click();
    await page.getByRole("button", { name: "Escolher cor de preenchimento" }).click();
    const picker = page.getByRole("dialog", { name: "Escolher cor de preenchimento" });
    const bounds = await picker.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= 800);
    const square = picker.getByRole("slider", { name: "Saturação e luminosidade" });
    await square.click({ position: { x: 170, y: 35 } });
    await picker.getByRole("slider", { name: "Opacidade" }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    assert.equal(await picker.getByText("1%", { exact: true }).count(), 1);
    await picker.getByRole("button", { name: "Aplicar cor" }).click();
    const saved = parseProject(
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    assert.match(saved.artboards[0]?.scene.nodes[0]?.attrs.fill ?? "", /^#[\da-f]{6}$/);
    assert.notEqual(saved.artboards[0]?.scene.nodes[0]?.attrs.fill, "#4fe3c1");
    assert.equal(saved.artboards[0]?.scene.nodes[0]?.attrs["fill-opacity"], "0.01");
    await page.locator('[data-action="undo"]').click();
    const restored = parseProject(
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    assert.equal(restored.artboards[0]?.scene.nodes[0]?.attrs.fill, "#4fe3c1");
    assert.equal(restored.artboards[0]?.scene.nodes[0]?.attrs["fill-opacity"], undefined);
  } finally {
    await browser.close();
    await server.close();
  }
});
