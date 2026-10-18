import assert from "node:assert/strict";
import { test } from "node:test";
import { propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { offlineBundle } from "../offlineBundle";

test("bundled layout performs real reflow, clipping, keyboard/wheel scroll and destroys ownership under a WASM-only CSP", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  board.behavior = {
    ...emptyBehavior(),
    defaultMachineId: "machine-layout",
    machines: [
      {
        id: "machine-layout",
        name: "Layout",
        layers: [
          {
            id: "layer-layout",
            name: "Layout",
            entryStateId: "state-layout",
            targetIds: [],
            properties: [...propertySchema.options],
            weight: 1,
            mode: "override",
            transitions: [],
            states: [{ id: "state-layout", name: "Base", kind: "base", speed: 1, x: 0, y: 0 }],
          },
        ],
      },
    ],
  };
  const ids = Array.from({ length: 4 }, () => editScene(board.scene, null, "add", "rect"));
  if (ids.some((id) => !id)) throw new Error("Missing objects");
  board.scene.viewBox = [20, 30, 400, 200];
  for (const id of ids)
    editScene(board.scene, id, "attrs", { x: "0", y: "0", width: "100", height: "50" });
  board.layout = {
    version: 1,
    root: {
      ...defaultLayoutContainer(),
      flow: "grid",
      columns: { kind: "auto-fit", minWidth: 120 },
      gap: [10, 10],
      clip: true,
      scroll: { axis: "y", friction: 5, spring: 100, damping: 20, bounce: true },
    },
    containers: [],
    items: ids.map((id) => {
      if (!id) throw new Error("Missing id");
      return {
        ...defaultLayoutItem(id),
        width: { kind: "fill", weight: 1 },
        height: { kind: "fixed", value: 70 },
      };
    }),
  };
  const compiled = compileInteractiveArtboard(project, board.id),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [],
      requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline';"><main style="width:400px;height:200px">${compiled.svg}</main>`,
    );
    await page.addScriptTag({ content: await offlineBundle() });
    await page.evaluate(async (blueprint) => {
      const root = document.querySelector("svg"),
        runtime = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !runtime) throw new Error("Missing runtime");
      window.interactivePlayer = await runtime.createInteractiveSvgPlayerAsync(root, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    assert.equal(await page.locator("[data-edi-layout]").count(), 4);
    const boxes = await page.evaluate(() => [
      ...(window.interactivePlayer?.inspectLayout()?.boxes ?? []),
    ]);
    assert.equal(boxes[0]?.[1].x, 0);
    assert.ok(Math.abs((boxes[2]?.[1].x ?? 0) - 273.3333) < 0.01);
    assert.equal(boxes[3]?.[1].y, 105);
    await page.locator("main").evaluate((element) => {
      element.style.width = "250px";
      element.style.height = "100px";
    });
    await page.waitForFunction(
      () => document.querySelector("svg")?.getAttribute("viewBox") === "20 30 250 100",
    );
    assert.equal(
      await page.evaluate(
        () => [...(window.interactivePlayer?.inspectLayout()?.boxes.values() ?? [])][2]?.y,
      ),
      80,
    );
    assert.equal(await page.locator("clipPath rect").getAttribute("width"), "250");
    await page.locator("svg").focus();
    await page.locator("svg").press("ArrowDown");
    assert.equal(
      await page.evaluate(() => window.interactivePlayer?.getScroll(null).y.position),
      40,
    );
    await page.locator("svg").dispatchEvent("wheel", { deltaY: 100, deltaMode: 0 });
    assert.equal(
      await page.evaluate(() => window.interactivePlayer?.getScroll(null).y.position),
      50,
    );
    await page.evaluate(() => window.interactivePlayer?.reset());
    assert.equal(
      await page.evaluate(() => window.interactivePlayer?.getScroll(null).y.position),
      0,
    );
    await page.evaluate(() => window.interactivePlayer?.destroy());
    assert.equal(await page.locator("[data-edi-layout]").count(), 0);
    assert.equal(await page.locator("clipPath").count(), 0);
    assert.equal(await page.locator("svg").getAttribute("viewBox"), "20 30 400 200");
    assert.equal(await page.locator("svg").getAttribute("tabindex"), null);
    assert.equal(
      await page.locator("main svg > [data-scene-motion] > [data-edi-object]").count(),
      4,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test("layout measures unmanaged group contents with their real local transforms and never stretches text glyphs", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const a = editScene(board.scene, null, "add", "rect"),
    b = editScene(board.scene, null, "add", "rect"),
    text = editScene(board.scene, null, "add", "text");
  if (!a || !b || !text) throw new Error("Missing objects");
  for (const id of [a, b])
    editScene(board.scene, id, "attrs", { x: "0", y: "0", width: "20", height: "20" });
  const first = board.scene.nodes.find((node) => node.id === a),
    second = board.scene.nodes.find((node) => node.id === b),
    label = board.scene.nodes.find((node) => node.id === text);
  if (!first || !second || !label) throw new Error("Missing fixture");
  second.transform.x = 100;
  board.scene.nodes = [
    {
      id: "node-group",
      name: "Grupo",
      tag: "g",
      attrs: {},
      text: "",
      transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
      visible: true,
      locked: false,
      children: [first, second],
    },
    label,
  ];
  label.text = "";
  board.layout = {
    version: 1,
    root: defaultLayoutContainer(),
    containers: [],
    items: [
      {
        ...defaultLayoutItem(text),
        width: { kind: "fill", weight: 1 },
        height: { kind: "fixed", value: 40 },
      },
    ],
  };
  const compiled = compileInteractiveArtboard(project, board.id),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<main style="width:400px;height:200px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: await offlineBundle() });
    await page.evaluate(async (blueprint) => {
      const root = document.querySelector("svg");
      if (!(root instanceof SVGSVGElement) || !window.EdiSVGRuntime)
        throw new Error("Missing runtime");
      window.interactivePlayer = await window.EdiSVGRuntime.createInteractiveSvgPlayerAsync(
        root,
        blueprint,
        { autoplay: false, pauseOffscreen: false },
      );
    }, compiled.document);
    assert.equal(
      await page.evaluate(
        () => window.interactivePlayer?.inspectLayout()?.boxes.get("node-group")?.width,
      ),
      120,
    );
    assert.match(
      (await page.locator(`[data-edi-layout="${text}"]`).getAttribute("transform")) ?? "",
      /^translate\(/,
    );
    await page.evaluate(() => window.interactivePlayer?.destroy());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
