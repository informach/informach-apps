import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { identityTransform, propertySchema } from "@informach/edi-motion";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { buildPlayerWebExport } from "../../src/renderer/src/behavior/player-web-export";
import { newProject } from "../../src/shared/project";

test("portable SDK isolates sessions, translates public names, rejects writes atomically and joins abort/disposal", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  const board = project.artboards[0];
  assert.ok(board);
  board.scene.nodes = [
    {
      id: "node-ball",
      tag: "circle",
      name: "Bola",
      attrs: { cx: "100", cy: "100", r: "40", fill: "#e05010" },
      text: "",
      visible: true,
      locked: false,
      children: [],
      transform: identityTransform(),
    },
  ];
  project.motion.animations = [0, 1].map((index) => ({
    id: `animation-${index}`,
    name: `Animação ${index}`,
    fps: 30,
    frames: 30,
    mode: "loop",
    tracks: [
      {
        id: `track-${index}`,
        targetId: "node-ball",
        property: "x",
        keys: [
          { id: `key-${index}-0`, frame: 0, value: 0, easing: "linear" },
          { id: `key-${index}-1`, frame: 30, value: index * 80, easing: "linear" },
        ],
      },
    ],
  }));
  board.behavior = {
    ...emptyBehavior(),
    defaultMachineId: "machine-main",
    inputs: [{ id: "input-move", name: "Mover", kind: "boolean", initial: false }],
    machines: [
      {
        id: "machine-main",
        name: "Movimento",
        layers: [
          {
            id: "layer-body",
            name: "Corpo",
            entryStateId: "state-0",
            properties: [...propertySchema.options],
            targetIds: [],
            weight: 1,
            mode: "override",
            states: [0, 1].map((index) => ({
              id: `state-${index}`,
              name: index ? "Andando" : "Parado",
              x: index * 100,
              y: 0,
              speed: 1,
              kind: "animation",
              animationId: `animation-${index}`,
            })),
            transitions: [
              {
                id: "transition-move",
                from: "state-0",
                to: "state-1",
                conditions: [{ inputId: "input-move", operator: "eq", value: true }],
                priority: 0,
                duration: 0,
                exitAt: null,
                easing: "linear",
                interrupt: "never",
              },
            ],
          },
        ],
      },
    ],
  };
  const art = buildPlayerWebExport(project, {
    format: "player-web",
    alt: "Bola",
    reduced: true,
    offscreen: true,
  }).content;
  const runtime = await readFile("out/renderer/edi-web-player.mjs", "utf8");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<svg id="one" viewBox="0 0 10 10"></svg><svg id="two"></svg><svg id="cancel"></svg>',
    );
    const result = await page.evaluate(
      async ({ runtime, art }) => {
        const url = URL.createObjectURL(new Blob([runtime], { type: "text/javascript" }));
        try {
          const sdk: typeof import("@informach/edi-motion/web-player") = await import(url);
          const one = document.querySelector<SVGSVGElement>("#one");
          const two = document.querySelector<SVGSVGElement>("#two");
          const canceled = document.querySelector<SVGSVGElement>("#cancel");
          if (!one || !two || !canceled) throw new Error("Missing roots");
          const controller = new AbortController();
          const a = await sdk.mountWebAnimation(one, art, {
            autoplay: false,
            pauseOffscreen: false,
            signal: controller.signal,
          });
          const b = await sdk.mountWebAnimation(two, art, {
            autoplay: false,
            pauseOffscreen: false,
          });
          let aborted = false,
            atomic = false,
            closed = false;
          try {
            a.setInput("Mover", true);
            a.advance(0.5);
            try {
              a.setInputs({ Mover: false, Desconhecido: true });
            } catch {
              atomic = a.getInput("Mover") === true;
            }
            const first = a.inspect();
            const second = b.inspect();
            const drawingDifferent = one.innerHTML !== two.innerHTML;
            controller.abort();
            await a.destroy();
            await a.destroy();
            try {
              a.inspect();
            } catch {
              closed = true;
            }
            const before = new AbortController();
            before.abort();
            try {
              await sdk.mountWebAnimation(canceled, art, { signal: before.signal });
            } catch {
              aborted = true;
            }
            return {
              first,
              second,
              atomic,
              aborted,
              closed,
              drawingDifferent,
              restored: one.getAttribute("viewBox"),
              empty: one.childElementCount === 0 && canceled.childElementCount === 0,
              secondStillUsable: b.getInput("Mover") === false,
              info: sdk.readWebAnimation(art),
            };
          } finally {
            await a.destroy();
            await b.destroy();
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { runtime, art },
    );
    assert.equal(result.first.machine, "Movimento");
    assert.equal(result.first.layers[0]?.state, "Andando");
    assert.equal(result.second.layers[0]?.state, "Parado");
    assert.equal(result.atomic, true);
    assert.equal(result.aborted, true);
    assert.equal(result.closed, true);
    assert.equal(result.drawingDifferent, true);
    assert.equal(result.restored, "0 0 10 10");
    assert.equal(result.empty, true);
    assert.equal(result.secondStillUsable, true);
    assert.deepEqual(result.info.inputs, [{ name: "Mover", kind: "boolean" }]);
  } finally {
    await browser.close();
  }
});
