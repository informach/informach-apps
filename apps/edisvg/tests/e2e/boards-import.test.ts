import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/** Another project: an empty main artboard and Zappy, a rectangle that jumps ("Pular"). */
function mascot() {
  const project = newProject();
  project.artboards.push({
    id: "artboard-zappy",
    name: "Zappy",
    scene: {
      viewBox: [0, 0, 300, 300],
      nodes: [
        {
          id: "node-corpo",
          name: "Corpo",
          tag: "rect",
          attrs: { x: "100", y: "100", width: "100", height: "120", fill: "#ffb000" },
          text: "",
          children: [],
          transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
          visible: true,
          locked: false,
        },
      ],
    },
  });
  project.motion.animations.push({
    id: "anim-pular",
    name: "Pular",
    fps: 30,
    frames: 30,
    mode: "loop",
    tracks: [
      {
        id: "track-corpo-y",
        targetId: "node-corpo",
        property: "y",
        keys: [
          { id: "key-corpo-y-1", frame: 0, value: 0, easing: "linear" },
          { id: "key-corpo-y-2", frame: 15, value: -50, easing: "linear" },
        ],
      },
    ],
  });
  return parseProject(project);
}

test("artboards of another project come in with their animation, chosen in a dialog, one undo step", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(`(() => {
      const project = ${JSON.stringify(mascot())};
      window.desktop = {
        projectChanged: async () => ({ name: "Sem arquivo", path: null, dirty: true }),
        importBoards: async () => ({ name: "mascote", project }),
      };
    })()`);
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(before);
    const start = parseProject(JSON.parse(before));
    await page.locator('[data-action="import-boards"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Importar pranchetas de outro projeto" });
    await dialog.getByText("Pranchetas de mascote", { exact: true }).waitFor();
    // Zappy (animated) comes chosen; the empty main artboard does not.
    assert.deepEqual(
      await dialog
        .getByRole("checkbox")
        .evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).checked)),
      [false, true],
    );
    await dialog.getByText("Animações: Pular").waitFor();
    await dialog.getByRole("button", { name: "Importar 1 prancheta", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const after = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(after && after !== before);
    const project = parseProject(JSON.parse(after));
    assert.equal(project.artboards.length, start.artboards.length + 1);
    const zappy = project.artboards.at(-1);
    assert.equal(zappy?.name, "Zappy");
    const jump = project.motion.animations.find((animation) => animation.name === "Pular");
    assert.ok(jump);
    assert.equal(jump.tracks[0]?.targetId, zappy?.scene.nodes[0]?.id);
    // The imported artboard is the open one, drawn on the canvas.
    await page.locator(".scene-artwork rect").first().waitFor();
    await page.getByText(/De mascote: 1 prancheta, 1 animação e 0 recursos/).waitFor();
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
