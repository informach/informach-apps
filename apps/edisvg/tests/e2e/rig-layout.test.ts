import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLayoutContainer } from "@informach/edi-motion/layout";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { offlineBundle } from "../offlineBundle";
import { rigFixture } from "../rigFixture";

test("IK consumes real layout slot matrices and re-solves after responsive reflow without changing the document", {
  timeout: 60000,
}, async () => {
  const fixture = rigFixture(),
    project = fixture.project(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  board.scene.nodes = board.scene.nodes.filter((node) => node.tag !== "rect");
  const target = board.scene.nodes.find((node) => node.id === "node-target");
  if (!target) throw new Error("Missing target");
  target.transform.x = -400;
  board.layout = {
    version: 1,
    root: { ...defaultLayoutContainer(), flow: "row", gap: [0, 0], justify: "space-between" },
    containers: [],
    items: [],
  };
  const before = structuredClone(project),
    compiled = compileInteractiveArtboard(project, fixture.rootId),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<main style="width:500px;height:200px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: await offlineBundle() });
    await page.evaluate(async (document) => {
      const svg = window.document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(svg instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
      window.interactivePlayer = await api.createInteractiveSvgPlayerAsync(svg, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    const positions = () =>
      page.evaluate(() => {
        const root = document.querySelector("svg"),
          bone = document.querySelector('[data-edi-object="node-lower"]'),
          target = document.querySelector('[data-edi-object="node-target"]');
        if (
          !(root instanceof SVGSVGElement) ||
          !(bone instanceof SVGGraphicsElement) ||
          !(target instanceof SVGGraphicsElement)
        )
          throw new Error("Missing SVG objects");
        const rootMatrix = root.getScreenCTM(),
          boneMatrix = bone.getScreenCTM(),
          targetMatrix = target.getScreenCTM();
        if (!rootMatrix || !boneMatrix || !targetMatrix) throw new Error("Missing matrices");
        const tip = new DOMPoint(100, 0)
            .matrixTransform(boneMatrix)
            .matrixTransform(rootMatrix.inverse()),
          point = new DOMPoint(0, 0)
            .matrixTransform(targetMatrix)
            .matrixTransform(rootMatrix.inverse());
        return {
          tip: { x: tip.x, y: tip.y },
          target: { x: point.x, y: point.y },
          diagnostics: window.interactivePlayer?.inspectRig(),
        };
      });
    const initial = await positions();
    assert.ok(Math.abs(initial.target.x - 100) < 0.01);
    assert.ok(
      Math.hypot(initial.tip.x - initial.target.x, initial.tip.y - initial.target.y) < 0.01,
      JSON.stringify(initial),
    );
    await page.locator("main").evaluate((main) => {
      main.style.width = "300px";
    });
    await page.waitForFunction(
      () => document.querySelector("svg")?.getAttribute("viewBox") === "0 0 300 200",
    );
    const resized = await positions();
    assert.ok(Math.abs(resized.target.x + 100) < 0.01);
    assert.ok(
      Math.hypot(resized.tip.x - resized.target.x, resized.tip.y - resized.target.y) < 0.01,
      JSON.stringify(resized),
    );
    assert.equal(resized.diagnostics?.[0]?.converged, true);
    await page.locator("main").evaluate((main) => {
      main.style.width = "0px";
      main.style.height = "0px";
    });
    await page.waitForFunction(
      () => document.querySelector("svg")?.getAttribute("viewBox") === "0 0 0 0",
    );
    await page.evaluate(() => window.interactivePlayer?.advance(0.1));
    await page.locator("main").evaluate((main) => {
      main.style.width = "500px";
      main.style.height = "200px";
    });
    await page.waitForFunction(
      () => document.querySelector("svg")?.getAttribute("viewBox") === "0 0 500 200",
    );
    const restored = await positions();
    assert.equal(restored.diagnostics?.[0]?.converged, true);
    assert.ok(
      Math.hypot(restored.tip.x - restored.target.x, restored.tip.y - restored.target.y) < 0.01,
    );
    assert.deepEqual(project, before);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.interactivePlayer?.destroy());
  } finally {
    await browser.close();
  }
});
