import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

test("Um projeto com a prancheta padrão vazia abre na prancheta que tem o desenho", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards.push({
    id: "artboard-drawing",
    name: "Desenho",
    scene: {
      viewBox: [0, 0, 1080, 1080],
      nodes: [
        {
          id: "node-sun",
          name: "Sol",
          tag: "circle",
          attrs: { cx: "540", cy: "540", r: "200", fill: "#f1b95b" },
          text: "",
          children: [],
          transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
          visible: true,
          locked: false,
        },
      ],
    },
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
    await page.locator('[data-object="node-sun"]').waitFor({ timeout: 5000 });
    await page.locator('[data-scene-select="node-sun"]').waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
