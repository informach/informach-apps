import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

const D = "M100 500 C300 500 500 500 700 500";

test("Editar vértices no Animar grava chaves de vértices no quadro atual, sem mudar o Design", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push({
    id: "node-arm",
    name: "Braço",
    tag: "path",
    attrs: { d: D, fill: "none", stroke: "#373d4c", "stroke-width": "20" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  project.motion.animations.push({
    id: "animation-arm",
    name: "Braço",
    fps: 10,
    frames: 10,
    mode: "loop",
    tracks: [],
  });
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((value) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(value));
    }, project);
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    const saved = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0];
    const shape = page.locator('[data-object="node-arm"] > path:first-child');
    await page.locator('[data-action="animate"]').click();
    await page.locator('[data-scene-select="node-arm"]').click();
    await page.locator('[data-action="end"]').click();

    await page.locator("[data-path-enter]").click();
    await page.getByRole("heading", { name: "ANIMAR VÉRTICES" }).waitFor();
    assert.match((await page.locator("[data-vertex-keying]").textContent()) ?? "", /Quadro 10/);
    // Raise the end of the arm by dragging its last point.
    const anchor = page.locator('.vertex-anchor[data-vertex-index="1"]'),
      box = await anchor.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    let board = await saved();
    const key = board?.vertexClips?.[0]?.keys[0];
    assert.equal(key?.frame, 10);
    assert.ok((key?.geometry[0]?.points[1]?.y ?? 500) < 450, "the point moved up");
    assert.equal(board?.scene.nodes[0]?.attrs.d, D, "the Design path stays as drawn");
    assert.equal(await page.locator('[data-action="animate"].active').count(), 1);
    await page.getByText("Braço · Vértices").first().waitFor();

    // Adding points is a Design edit.
    await page.locator(".scene-artwork svg").dblclick({ position: { x: 20, y: 20 } });
    await page.keyboard.press("Escape");
    await page.locator('[data-action="start"]').click();
    await page.locator("[data-path-enter]").click();
    assert.match((await page.locator("[data-vertex-keying]").textContent()) ?? "", /Quadro 0/);
    // A key at frame 0 with the first point nudged: frame 0 and 10 now differ.
    await page.keyboard.press("ArrowDown");
    board = await saved();
    assert.deepEqual(
      board?.vertexClips?.[0]?.keys.map((value) => value.frame),
      [0, 10],
    );
    await page.keyboard.press("Escape");
    const atZero = await shape.getAttribute("d");
    await page.locator('[data-action="end"]').click();
    const atTen = await shape.getAttribute("d");
    assert.notEqual(atZero, atTen, "the path moves between the keys");

    await page.locator('[data-action="design"]').click();
    assert.equal(await shape.getAttribute("d"), D, "Design shows the drawn path");
    await page.locator('[data-action="undo"]').click();
    assert.equal((await saved())?.vertexClips?.[0]?.keys.length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
