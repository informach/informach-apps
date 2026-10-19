import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { build } from "vite";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import type { mountReactFixture } from "../fixtures/react-player";

declare global {
  interface Window {
    EdiReactFixture?: { mountReactFixture: typeof mountReactFixture };
    reactHarness?: ReturnType<typeof mountReactFixture>;
  }
}
test("React 19 adapter survives StrictMode, updates callbacks/inputs without recreating clocks and releases its handle on unmount", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing artboard");
  const bodyId = editScene(board.scene, null, "add", "rect"),
    textId = editScene(board.scene, null, "add", "text");
  if (!bodyId || !textId) throw new Error("Missing objects");
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
          targetId: bodyId,
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
      { id: "input-name", kind: "string", name: "Nome", initial: "Ana" },
      { id: "input-go", name: "Clicar", kind: "trigger" },
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
            mode: "override",
            weight: 1,
            targetIds: [],
            properties: [...propertySchema.options],
            states: [0, 1].map((index) => ({
              id: index ? "state-b" : "state-a",
              name: `State ${index}`,
              kind: "animation",
              animationId: `animation-${index}`,
              speed: 1,
              x: index * 200,
              y: 0,
            })),
            transitions: [
              {
                id: "transition-go",
                from: "state-a",
                to: "state-b",
                conditions: [{ inputId: "input-go", operator: "trigger" }],
                exitAt: null,
                duration: 0.2,
                easing: "linear",
                interrupt: "never",
                priority: 0,
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
        targetId: textId,
        direction: "two-way",
      },
    ],
    events: [{ id: "event-wave", animationId: "animation-1", frame: 6, name: "acenou", data: {} }],
  };
  const compiled = compileInteractiveArtboard(project, board.id),
    built = await build({
      configFile: false,
      mode: "development",
      define: { "process.env.NODE_ENV": JSON.stringify("development") },
      logLevel: "error",
      build: {
        write: false,
        minify: true,
        lib: {
          entry: resolve("tests/fixtures/react-player.tsx"),
          formats: ["iife"],
          name: "EdiReactFixture",
        },
      },
    }),
    output = Array.isArray(built) ? built[0] : built;
  if (!output || !("output" in output)) throw new Error("No React fixture build");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("No React fixture script");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  if (channel && !["msedge", "chrome"].includes(channel)) throw new Error("Unsupported channel");
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="host" style="width:400px;height:400px"></div>');
    await page.addScriptTag({ content: chunk.code });
    assert.deepEqual(errors, []);
    await page.evaluate(
      ({ document, bodyId, textId }) => {
        const host = window.document.querySelector("#host");
        if (!(host instanceof HTMLElement) || !window.EdiReactFixture)
          throw new Error("Missing React host");
        window.reactHarness = window.EdiReactFixture.mountReactFixture(
          host,
          document,
          bodyId,
          textId,
        );
      },
      { document: compiled.document, bodyId, textId },
    );
    await page.waitForFunction(
      () =>
        (window.reactHarness?.metrics().ready ?? 0) > 0 ||
        (window.reactHarness?.metrics().errors.length ?? 0) > 0,
    );
    assert.deepEqual(await page.evaluate(() => window.reactHarness?.metrics().errors), []);
    assert.equal(await page.locator("text").textContent(), "Ana");
    const readies = await page.evaluate(() => window.reactHarness?.metrics().ready);
    await page.evaluate(() => window.reactHarness?.update({ label: "latest", value: "Bia" }));
    await page.waitForFunction(() => document.querySelector("text")?.textContent === "Bia");
    assert.equal(await page.evaluate(() => window.reactHarness?.metrics().ready), readies);
    await page.evaluate(() => {
      window.reactHarness?.handle().trigger("input-go");
      window.reactHarness?.handle().advance(0.1);
    });
    assert.deepEqual(await page.evaluate(() => window.reactHarness?.metrics().events), [
      "latest:acenou",
    ]);
    assert.match(
      (await page.locator(`[data-edi-object="${bodyId}"]`).getAttribute("transform")) ?? "",
      /translate\(50 0\)/,
    );
    await page.evaluate(() => window.reactHarness?.update({ value: 7 }));
    await page.locator('[role="alert"]').waitFor();
    assert.equal(await page.locator("text").textContent(), "Bia");
    assert.equal(
      await page.evaluate(() => window.reactHarness?.handle().getInput("input-name")),
      "Bia",
    );
    await page.evaluate(() => window.reactHarness?.update({ value: "Caio" }));
    await page.waitForFunction(() => document.querySelector("text")?.textContent === "Caio");
    const time = await page.evaluate(() => window.reactHarness?.handle().inspect().time ?? 0);
    await page.evaluate(() => window.reactHarness?.update({ autoplay: true }));
    await page.waitForFunction(() => window.reactHarness?.handle().playing === true);
    await page.evaluate(() =>
      window.reactHarness?.update({
        autoplay: false,
        respectReducedMotion: false,
        pauseOffscreen: true,
        machineId: window.reactHarness?.handle().inspect().machineId ?? undefined,
      }),
    );
    await page.waitForFunction(() => window.reactHarness?.handle().playing === false);
    assert.equal(await page.evaluate(() => window.reactHarness?.metrics().ready), readies);
    assert.ok(
      (await page.evaluate(() => window.reactHarness?.handle().inspect().time ?? 0)) >= time,
    );
    assert.equal(await page.locator("text").textContent(), "Caio");
    const replacement = structuredClone(compiled.document);
    replacement.behavior.bindings = [];
    await page.evaluate((document) => {
      const harness = window.reactHarness;
      if (!harness) throw new Error("Missing harness");
      Reflect.set(window, "oldDocumentHandle", harness.handle());
      harness.replaceDocument(document);
    }, replacement);
    await page.waitForFunction(
      () => document.querySelector("text")?.textContent?.trim() === "Base",
    );
    assert.ok(
      (await page.evaluate(() => window.reactHarness?.metrics().ready ?? 0)) > (readies ?? 0),
    );
    await page.evaluate(() => {
      try {
        Reflect.get(window, "oldDocumentHandle").inspect();
        throw new Error("Expected old document release");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("encerrado")) throw error;
      }
    });
    assert.match(
      (await page.locator(`[data-edi-object="${bodyId}"]`).getAttribute("transform")) ?? "",
      /translate\(0 0\)/,
    );
    await page.evaluate(() => {
      const harness = window.reactHarness;
      if (!harness) throw new Error("No harness");
      const handle = harness.handle();
      harness.unmount();
      try {
        handle.trigger("input-go");
        throw new Error("Expected released handle");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("encerrado")) throw error;
      }
    });
    assert.equal(await page.locator("svg").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
