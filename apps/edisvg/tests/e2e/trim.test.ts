import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { applyComponent } from "../../src/shared/components";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { type Artboard, contentSnapshot, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { offlineBundle } from "../offlineBundle";
import { rendererServer } from "../rendererServer";
import { trimFixture } from "../trimFixture";
import { vectorEffectFixture } from "../vectorEffectFixture";

test("trim authored with real controls preserves source, keeps degree channels, supports undo/reload and reaches the isolated test player", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture(false),
    before = contentSnapshot(fixture.project()),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const snapshot = async () => {
      const text = await page.evaluate(() => localStorage.getItem("edisvg-project"));
      assert.ok(text);
      return parseProject(JSON.parse(text));
    };
    await page.locator('[data-action="design"]').click();
    await page.locator(`[data-scene-select="${fixture.shapeId}"]`).click();
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page.getByLabel("Início do recorte (%)", { exact: true }).fill("25");
    await page.getByLabel("Fim do recorte (%)", { exact: true }).fill("75");
    await page.getByRole("button", { name: "Adicionar recorte", exact: true }).click();
    const authored = await snapshot(),
      trim = authored.artboards[0]?.rig?.trims?.[0];
    assert.ok(trim);
    assert.equal(trim.start, 0.25);
    assert.equal(trim.end, 0.75);
    assert.equal(authored.artboards[0]?.rig?.version, 3);
    assert.deepEqual(authored.artboards[0]?.scene, fixture.project().artboards[0]?.scene);
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await page
      .getByRole("region", { name: "Recorte animável do caminho", exact: true })
      .screenshot({ path: resolve("../../.cache/edisvg-review/trim-authoring.png") });
    await page.locator('[data-action="undo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), before);
    await page.locator('[data-action="redo"]').click();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(authored));
    await page.reload();
    await page.locator(".scene-artwork>svg").waitFor();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(authored));
    await page.getByRole("button", { name: "Restrições", exact: true }).click();
    await page
      .getByLabel("Restrição do canal de rig", { exact: true })
      .selectOption(JSON.stringify([[], trim.id, "offset"]));
    await page
      .getByLabel("Animação do canal de rig", { exact: true })
      .selectOption(fixture.animationId);
    await page.getByLabel("Quadro do parâmetro", { exact: true }).fill("0");
    await page.getByLabel("Offset da chave (graus)", { exact: true }).fill("90");
    await page.getByRole("button", { name: "Gravar chave de rig", exact: true }).click();
    const keyed = await snapshot();
    assert.equal(keyed.artboards[0]?.rig?.version, 3);
    assert.equal(keyed.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys[0]?.value, 90);
    await page.getByRole("button", { name: "Testar rig", exact: true }).click();
    await page.getByRole("button", { name: "Pausar teste", exact: true }).click();
    await page.getByRole("button", { name: "Resetar teste", exact: true }).click();
    const bounds = await page
      .locator(`.behavior-test-preview [data-edi-object="${fixture.shapeId}"]>path`)
      .evaluate((element) => {
        if (!(element instanceof SVGPathElement)) throw new Error("Missing trimmed shape");
        const box = element.getBBox();
        return { x: box.x, width: box.width };
      });
    assert.ok(Math.abs(bounds.x - 120) < 0.001, JSON.stringify(bounds));
    assert.ok(Math.abs(bounds.width - 100) < 0.001, JSON.stringify(bounds));
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.deepEqual(contentSnapshot(await snapshot()), contentSnapshot(keyed));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("empty trimmed mask/clip sources hide the target and restore their actual silhouette and alpha on later and backward frames", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  board.rig = {
    version: 3,
    bones: [],
    constraints: [],
    targets: [],
    trims: [
      {
        id: "trim-effects",
        targetId: fixture.sourceId,
        start: 0,
        end: 1,
        offset: 0,
        tolerance: 0.001,
        mode: "parallel",
      },
    ],
    parameterClips: [
      {
        animationId: fixture.animationId,
        tracks: [
          {
            id: "track-trim-effects",
            targetId: "trim-effects",
            property: "end",
            keys: [
              { id: "key-trim-effects-zero", frame: 0, value: 0, easing: "linear" },
              { id: "key-trim-effects-full", frame: 10, value: 1, easing: "linear" },
            ],
          },
        ],
      },
    ],
  };
  const project = parseProject(fixture.project),
    before = contentSnapshot(project),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.animationId,
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.setContent("<svg><title>Owned effects host</title></svg>");
    await page.addScriptTag({ content: code });
    const samples = await page.evaluate(
      async ({ blueprint, sourceId }) => {
        const root = document.querySelector("svg"),
          api = window.EdiAssetTest;
        if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing actual effects API");
        const player = await api.createVisualSvgPlayerAsync(root, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
        });
        try {
          const result = [];
          for (const time of [0, 1, 0.5, 0, 1]) {
            player.reset();
            player.advance(time);
            result.push({
              time,
              pixels: await api.svgPixels(root, 100, 100, [
                [60, 40],
                [95, 95],
              ]),
              source: root.querySelector(`[data-edi-object="${sourceId}"]>path`)?.getAttribute("d"),
              clip: root.querySelector("[data-edi-live-effects] clipPath path")?.getAttribute("d"),
              mask: root.querySelector("[data-edi-live-effects] mask path")?.getAttribute("d"),
              alpha: root
                .querySelector("[data-edi-live-effects] mask path")
                ?.getAttribute("opacity"),
            });
          }
          return result;
        } finally {
          await player.destroyAsync();
        }
      },
      { blueprint: compiled.document, sourceId: fixture.sourceId },
    );
    for (const sample of samples) {
      assert.equal(sample.clip, sample.source);
      assert.equal(sample.mask, sample.source);
      if (sample.time === 0) {
        assert.equal(sample.source, "");
        assert.equal(sample.alpha, "0");
        assert.deepEqual(sample.pixels, [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]);
      } else if (sample.time === 1) {
        assert.equal(
          sample.source,
          board.scene.nodes.find((node) => node.id === fixture.sourceId)?.attrs.d,
        );
        assert.equal(sample.alpha, "0.25");
        assert.deepEqual(sample.pixels, [
          [255, 0, 0, 64],
          [0, 0, 0, 0],
        ]);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(contentSnapshot(project), before);
  } finally {
    await browser.close();
  }
});

test("trim component clocks and parameter bindings remain independently scoped and restore complete source paths", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture(),
    project = fixture.project(),
    master = project.artboards[0];
  assert.ok(master);
  master.behavior = {
    ...emptyBehavior(),
    version: 2,
    inputs: [
      { id: "input-offset", kind: "number", name: "Offset", initial: 0, min: -360, max: 360 },
    ],
    bindings: [
      {
        id: "binding-offset",
        kind: "parameter",
        inputId: "input-offset",
        targetId: "trim-draw",
        property: "offset",
        direction: "two-way",
        scale: 1,
        offset: 0,
      },
    ],
  };
  const board: Artboard = {
    id: "artboard-trim-owner",
    name: "Two trim scopes",
    scene: { viewBox: [0, 0, 500, 200], nodes: [] },
  };
  project.artboards.push(board);
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const id = applyComponent(board.scene, {
      type: "component",
      operation: "create",
      name: "Trim instance",
      instance: {
        artboardId: master.id,
        animationId: fixture.animationId,
        width: 240,
        height: 180,
        fit: "contain",
        speed: index + 1,
        offsetSeconds: 0,
        overrides: [],
        inputOverrides: [{ inputId: "input-offset", value: index * 180 }],
      },
    });
    assert.ok(id);
    ids.push(id);
  }
  const compiled = compileInteractiveArtboard(parseProject(project), board.id),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent("<svg><title>Independent trim scopes</title></svg>");
    await page.addScriptTag({ content: code });
    const values = await page.evaluate(
      async ({ blueprint, ids, shapeIds }) => {
        const svg = document.querySelector("svg"),
          api = window.EdiAssetTest;
        if (!(svg instanceof SVGSVGElement) || !api)
          throw new Error("Missing independent trim API");
        const player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
        });
        try {
          const a = player.getComponent([ids[0] ?? ""]),
            b = player.getComponent([ids[1] ?? ""]);
          const reader = {
            sample() {
              return shapeIds.map((runtimeId) => {
                const shape = svg.querySelector(`[data-edi-object="${runtimeId}"]>path`);
                if (!(shape instanceof SVGPathElement))
                  throw new Error("Missing scoped trim geometry");
                const box = shape.getBBox();
                return { d: shape.getAttribute("d"), x: box.x, width: box.width };
              });
            },
          };
          player.advance(0.25);
          const initial = reader.sample();
          a.setInput("input-offset", 90);
          const changed = reader.sample();
          a.advance(0.25);
          const local = { shapes: reader.sample(), times: [a.time, b.time, player.time] };
          player.reset();
          player.advance(1);
          const full = reader.sample();
          player.reset();
          player.advance(0.25);
          const restored = reader.sample();
          return { initial, changed, local, full, restored };
        } finally {
          await player.destroyAsync();
        }
      },
      {
        blueprint: compiled.document,
        ids,
        shapeIds: ids.map((id) => {
          const component = compiled.document.components?.find(
              (scope) => scope.instancePath.length === 1 && scope.instancePath[0] === id,
            ),
            shape = component?.document.playback.sources.find(
              (source) => source.objectId === fixture.shapeId && source.instancePath.length === 0,
            );
          assert.ok(shape);
          return shape.id;
        }),
      },
    );
    assert.ok(Math.abs((values.initial[0]?.x ?? NaN) - 20) < 0.001);
    assert.ok(Math.abs((values.initial[0]?.width ?? NaN) - 50) < 0.001);
    assert.ok(Math.abs((values.initial[1]?.x ?? NaN) - 120) < 0.001);
    assert.ok(Math.abs((values.initial[1]?.width ?? NaN) - 100) < 0.001);
    assert.ok(Math.abs((values.changed[0]?.x ?? NaN) - 70) < 0.001);
    assert.deepEqual(values.changed[1], values.initial[1]);
    assert.deepEqual(values.local.times, [0.5, 0.5, 0.25]);
    for (const shape of values.full) assert.equal(shape.d, master.scene.nodes[0]?.attrs.d);
    assert.deepEqual(values.restored, values.initial);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("trim arclength and empty/full restoration agree between host SVG, standalone HTML and portable SVG players on backward seeks", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture(),
    project = fixture.project(),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.animationId,
    }),
    runtime = await offlineBundle(),
    assets = await assetTestBundle(),
    html = buildClipExport(
      project,
      fixture.animationId,
      { format: "html", alt: "Trim", reduced: false, offscreen: false },
      runtime,
    ),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const host = await browser.newPage(),
      timeline = await browser.newPage(),
      portable = await browser.newPage(),
      errors: string[] = [];
    for (const page of [host, timeline, portable]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.abort());
    }
    await host.setContent(compiled.svg);
    await host.addScriptTag({ content: runtime });
    await host.evaluate((blueprint) => {
      const root = document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing host SVG API");
      window.interactivePlayer = api.createInteractiveSvgPlayer(root, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    await timeline.setContent(html.content);
    await timeline.waitForFunction(() => !!window.ediSVGPlayer);
    await timeline.evaluate(() => window.ediSVGPlayer?.pause());
    await portable.setContent("<svg><title>Empty portable host</title></svg>");
    await portable.addScriptTag({ content: assets });
    await portable.evaluate(async (blueprint) => {
      const root = document.querySelector("svg"),
        api = window.EdiAssetTest;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing portable SVG API");
      window.interactivePlayer = await api.createVisualSvgPlayerAsync(root, blueprint, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    for (const time of [0, 0.5, 1, 0.2, 0.8, 0]) {
      for (const page of [host, portable])
        await page.evaluate((time) => {
          window.interactivePlayer?.reset();
          window.interactivePlayer?.advance(time);
        }, time);
      await timeline.evaluate((time) => window.ediSVGPlayer?.seek(time), time);
      for (const page of [host, timeline, portable]) {
        const shape = await page
          .locator(`[data-edi-object="${fixture.shapeId}"]>path`)
          .evaluate((element) => {
            if (!(element instanceof SVGPathElement)) throw new Error("Missing real trimmed path");
            const box = element.getBBox();
            return { d: element.getAttribute("d"), x: box.x, width: box.width };
          });
        if (time === 0) {
          assert.equal(shape.d, "");
          assert.equal(shape.width, 0);
        } else {
          assert.ok(
            Math.abs(shape.x - 20) < 0.001,
            JSON.stringify({
              time,
              player: page === host ? "host" : page === timeline ? "timeline" : "portable",
              shape,
            }),
          );
          assert.ok(Math.abs(shape.width - 200 * time) < 0.001, JSON.stringify({ time, shape }));
        }
        if (time === 1) assert.equal(shape.d, project.artboards[0]?.scene.nodes[0]?.attrs.d);
      }
    }
    assert.deepEqual(errors, []);
    for (const page of [host, portable])
      await page.evaluate(() => window.interactivePlayer?.destroy());
    await timeline.evaluate(() => window.ediSVGPlayer?.destroy());
  } finally {
    await browser.close();
  }
});
