import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { defaultLayoutContainer } from "@informach/edi-motion/layout";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { offlineBundle } from "../offlineBundle";

const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline';">`;

function sizedProject(rootSize: {
  width: "fixed" | "hug" | "fill";
  height: "fixed" | "hug" | "fill";
}) {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  board.scene.viewBox = [0, 0, 300, 200];
  const id = editScene(board.scene, null, "add", "rect");
  if (!id) throw new Error("Missing rect");
  editScene(board.scene, id, "attrs", { x: "0", y: "0", width: "100", height: "50" });
  board.layout = {
    version: 1,
    root: defaultLayoutContainer(),
    rootSize,
    containers: [],
    items: [],
  };
  return compileInteractiveArtboard(project, board.id);
}

test("the player sizes the artboard root as fixed, hug or the host viewport", {
  timeout: 60000,
}, async () => {
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const viewBox = async (
      compiled: ReturnType<typeof sizedProject>,
      options: { dropViewBox?: boolean } = {},
    ) => {
      await page.setContent(`${csp}<main style="width:500px;height:400px">${compiled.svg}</main>`);
      await page.addScriptTag({ content: await offlineBundle() });
      return page.evaluate(
        async ({ blueprint, dropViewBox }) => {
          const root = document.querySelector("svg"),
            runtime = window.EdiSVGRuntime;
          if (!(root instanceof SVGSVGElement) || !runtime) throw new Error("Missing runtime");
          if (dropViewBox) root.removeAttribute("viewBox");
          const player = await runtime.createInteractiveSvgPlayerAsync(root, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
          const value = root.getAttribute("viewBox");
          player.destroy();
          return value;
        },
        { blueprint: compiled.document, dropViewBox: options.dropViewBox ?? false },
      );
    };
    assert.equal(await viewBox(sizedProject({ width: "fixed", height: "fixed" })), "0 0 300 200");
    assert.equal(await viewBox(sizedProject({ width: "hug", height: "hug" })), "0 0 100 50");
    assert.equal(await viewBox(sizedProject({ width: "fill", height: "fixed" })), "0 0 500 200");
    // Without an authored viewBox there is no design size; fixed falls back to the host.
    assert.equal(
      await viewBox(sizedProject({ width: "fixed", height: "fixed" }), { dropViewBox: true }),
      "0 0 500 400",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("the player binds another instance of the artboard model and reset returns to the default", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-price", name: "Preço", kind: "number", min: 0, max: 1000, initial: 0 }],
    data: {
      version: 1,
      models: [
        {
          id: "model-product",
          name: "Produto",
          fields: [{ id: "field-price", name: "Valor", kind: "number", min: 0, max: 1000 }],
        },
      ],
      instances: [
        {
          id: "instance-a",
          name: "Caneca",
          modelId: "model-product",
          value: { "field-price": 30 },
        },
        {
          id: "instance-b",
          name: "Camiseta",
          modelId: "model-product",
          value: { "field-price": 80 },
        },
      ],
      context: { modelId: "model-product", instanceId: "instance-a" },
      links: [
        {
          id: "link-price",
          instanceId: null,
          path: ["field-price"],
          inputId: "input-price",
          direction: "one-way",
        },
      ],
    },
  };
  const compiled = compileInteractiveArtboard(project, board.id),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`${csp}<main style="width:400px;height:400px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: await offlineBundle() });
    const result = await page.evaluate(async (blueprint) => {
      const root = document.querySelector("svg"),
        runtime = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !runtime) throw new Error("Missing runtime");
      const player = await runtime.createInteractiveSvgPlayerAsync(root, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
      let notified = 0;
      player.onDataChange(() => notified++);
      const before = {
        instance: player.getDataInstance(),
        price: player.getInput("input-price"),
        data: player.getData(),
      };
      const version = player.dataVersion;
      player.bindDataInstance("instance-b");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const after = {
        instance: player.getDataInstance(),
        price: player.getInput("input-price"),
        data: player.getData(),
        versionChanged: player.dataVersion > version,
        notified,
      };
      let refused = "";
      try {
        player.bindDataInstance("instance-missing");
      } catch (error) {
        refused = error instanceof Error ? error.message : String(error);
      }
      player.reset();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const reset = { instance: player.getDataInstance(), price: player.getInput("input-price") };
      player.destroy();
      return { before, after, refused, reset };
    }, compiled.document);
    assert.deepEqual(result.before, {
      instance: "instance-a",
      price: 30,
      data: { "field-price": 30 },
    });
    assert.deepEqual(result.after, {
      instance: "instance-b",
      price: 80,
      data: { "field-price": 80 },
      versionChanged: true,
      notified: 1,
    });
    assert.match(result.refused, /modelo da prancheta/);
    assert.deepEqual(result.reset, { instance: "instance-a", price: 30 });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
