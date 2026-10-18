import assert from "node:assert/strict";
import { test } from "node:test";
import { identityTransform, propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import type {
  createInteractiveSvgPlayer,
  createInteractiveSvgPlayerAsync,
} from "@informach/edi-motion/runtime";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { offlineBundle } from "../offlineBundle";

declare global {
  interface Window {
    EdiSVGRuntime?: {
      createInteractiveSvgPlayer: typeof createInteractiveSvgPlayer;
      createInteractiveSvgPlayerAsync: typeof createInteractiveSvgPlayerAsync;
      createSvgPlayer: typeof import("@informach/edi-motion/runtime").createSvgPlayer;
    };
    interactivePlayer?: ReturnType<typeof createInteractiveSvgPlayer>;
    interactiveEvents?: string[];
  }
}
test("interactive runtime executes authored logic and DOM bindings, keyboard/pointer listeners, cleanup and reduced motion", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  const body = editScene(board.scene, null, "add", "rect"),
    text = editScene(board.scene, null, "add", "text");
  if (!body || !text) throw new Error("Missing fixture objects");
  editScene(board.scene, text, "text-layout", { lineHeight: 1.3 });
  editScene(board.scene, text, "attrs", { x: "20", y: "60", "text-anchor": "start" });
  project.motion = {
    version: 2,
    animations: [0, 100].map((x, index) => ({
      id: `animation-${index}`,
      name: `Clip ${index}`,
      fps: 60,
      frames: 60,
      mode: "once",
      tracks: [
        {
          id: `track-${index}`,
          targetId: body,
          property: "x",
          keys: [{ id: `key-${index}`, frame: 0, value: x, easing: "linear" }],
        },
      ],
    })),
  };
  board.behavior = {
    ...emptyBehavior(),
    defaultMachineId: "machine-main",
    inputs: [
      { id: "input-click", name: "Clique", kind: "trigger" },
      { id: "input-name", name: "Nome", kind: "string", initial: "Ana\nمرحبا" },
      { id: "input-x", name: "Cursor", kind: "number", initial: 0, min: 0, max: 1 },
    ],
    machines: [
      {
        id: "machine-main",
        name: "Interação",
        layers: [
          {
            id: "layer-main",
            name: "Corpo",
            entryStateId: "state-a",
            properties: [...propertySchema.options],
            targetIds: [],
            weight: 1,
            mode: "override",
            states: [0, 1].map((index) => ({
              id: index ? "state-b" : "state-a",
              name: `State ${index}`,
              x: index * 200,
              y: 0,
              speed: 1,
              kind: "animation",
              animationId: `animation-${index}`,
            })),
            transitions: [
              {
                id: "transition-main",
                from: "state-a",
                to: "state-b",
                conditions: [{ inputId: "input-click", operator: "trigger" }],
                priority: 0,
                duration: 0.2,
                exitAt: null,
                easing: "linear",
                interrupt: "never",
              },
            ],
          },
        ],
      },
    ],
    bindings: [
      {
        id: "binding-name",
        kind: "text",
        inputId: "input-name",
        targetId: text,
        direction: "two-way",
      },
    ],
    listeners: [
      {
        id: "listener-click",
        targetId: body,
        event: "activate",
        actions: [{ kind: "trigger", inputId: "input-click" }],
      },
      {
        id: "listener-move",
        targetId: null,
        event: "move",
        actions: [{ kind: "pointer-coordinate", inputId: "input-x", axis: "x", normalized: true }],
      },
    ],
    events: [{ id: "event-wave", animationId: "animation-1", frame: 6, name: "acenou", data: {} }],
  };
  const compiled = compileInteractiveArtboard(project, board.id),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel))
    throw new Error("Unsupported browser channel");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<main style="width:500px">${compiled.svg}</main>`);
    await page.addScriptTag({ content: await offlineBundle() });
    await page.evaluate((document) => {
      const root = window.document.querySelector("svg");
      if (!(root instanceof SVGSVGElement) || !window.EdiSVGRuntime)
        throw new Error("Missing interactive runtime");
      window.interactiveEvents = [];
      window.interactivePlayer = window.EdiSVGRuntime.createInteractiveSvgPlayer(root, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
      window.interactivePlayer.onEvent((event) => window.interactiveEvents?.push(event.name));
    }, compiled.document);
    assert.equal(await page.locator("text tspan").count(), 2);
    await page.evaluate(() => window.interactivePlayer?.setInput("input-name", "<script>&\nBia"));
    assert.equal(await page.locator("text tspan").first().textContent(), "<script>&");
    assert.equal(await page.locator("svg script").count(), 0);
    const object = page.locator(`[data-edi-object="${body}"]`);
    assert.equal(await object.getAttribute("role"), "button");
    await object.focus();
    await object.press("Enter");
    assert.equal(
      await page.evaluate(() => window.interactivePlayer?.inspect().layers[0]?.stateId),
      "state-b",
    );
    await page.evaluate(() => window.interactivePlayer?.advance(0.1));
    assert.match((await object.getAttribute("transform")) ?? "", /translate\(50 0\)/);
    assert.deepEqual(await page.evaluate(() => window.interactiveEvents), ["acenou"]);
    await page.evaluate(() => window.interactivePlayer?.advance(0.1));
    assert.match((await object.getAttribute("transform")) ?? "", /translate\(100 0\)/);
    await page.evaluate(() => window.interactivePlayer?.reset());
    await object.click();
    assert.equal(
      await page.evaluate(() => window.interactivePlayer?.inspect().layers[0]?.stateId),
      "state-b",
    );
    const svg = page.locator("svg");
    await svg.focus();
    await svg.press("ArrowRight");
    assert.ok((await page.evaluate(() => window.interactivePlayer?.getInput("input-x"))) !== 0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.interactivePlayer?.advance(0.2));
    assert.match((await object.getAttribute("transform")) ?? "", /translate\(0 0\)/);
    await page.evaluate(() => {
      const player = window.interactivePlayer;
      if (!player) throw new Error("Missing player");
      const before = player.getInput("input-name");
      try {
        player.setInput("input-name", "a\n".repeat(200));
        throw new Error("Expected budget rejection");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("linhas")) throw error;
      }
      if (player.getInput("input-name") !== before) throw new Error("Invalid input published");
      player.destroy();
      player.destroy();
      try {
        player.trigger("input-click");
        throw new Error("Expected destroyed rejection");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("encerrado")) throw error;
      }
    });
    assert.equal(await object.getAttribute("role"), null);
    assert.equal(await object.getAttribute("tabindex"), null);
    assert.deepEqual(errors, []);
    assert.deepEqual(project.artboards[0]?.scene.nodes[0]?.transform, identityTransform());
  } finally {
    await browser.close();
  }
});
