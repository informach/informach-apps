import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { trimFixture } from "../trimFixture";

async function capture(page: Page, selector: string) {
  const image = await page.locator(selector).screenshot();
  return `data:image/png;base64,${image.toString("base64")}`;
}

test("each paint row keeps its own trim in the shared player and in animated SVG", {
  timeout: 60000,
}, async () => {
  const fixture = trimFixture();
  fixture.run([
    {
      type: "scene",
      operation: "paint-layers",
      targetId: fixture.shapeId,
      value: [
        {
          id: "paint-core",
          kind: "stroke",
          color: "#1040c0",
          opacity: 1,
          visible: true,
          width: 3,
        },
        {
          id: "paint-hand",
          kind: "stroke",
          color: "#10c040",
          opacity: 1,
          visible: true,
          width: 12,
        },
      ],
    },
  ]);
  const rig = fixture.project().artboards[0]?.rig;
  assert.ok(rig?.trims);
  // Only the green layer is cut to its last fifth; the shape's own trim draws on.
  fixture.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...rig,
        trims: [
          ...rig.trims,
          {
            id: "trim-hand",
            targetId: fixture.shapeId,
            layerId: "paint-hand",
            start: 0.8,
            end: 1,
            offset: 0,
            tolerance: 0.001,
            mode: "parallel",
          },
        ],
      },
    },
  ]);
  const project = fixture.project();
  const exported = buildClipExport(
      project,
      fixture.animationId,
      {
        format: "svg",
        alt: "Camadas",
        reduced: false,
        offscreen: false,
        artboardId: fixture.boardId,
      },
      "",
    ),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.animationId,
    });
  assert.equal(
    exported.content.match(/<animate attributeName="d"/g)?.length,
    3,
    "the shape, the untrimmed copy and the trimmed copy each step on their own path",
  );
  const server = await rendererServer(
      new Map([
        [
          "/layers.html",
          {
            content:
              '<!doctype html><style>body{margin:0;background:#fff}main{width:360px;height:360px}main>svg{display:block;width:360px;height:360px}</style><main id="live"><svg viewBox="0 0 1080 1080"></svg></main><main id="smil"></main>',
            mime: "text/html",
          },
        ],
      ]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/layers.html`);
    await page.addScriptTag({ content: code });
    await page.evaluate(
      async ({ markup, blueprint }) => {
        const api = window.EdiAssetTest,
          live = document.querySelector("#live>svg"),
          host = document.querySelector("#smil");
        if (!api || !(live instanceof SVGSVGElement) || !host) throw new Error("Missing hosts");
        host.innerHTML = markup;
        const smil = host.querySelector("svg");
        if (!(smil instanceof SVGSVGElement)) throw new Error("Missing exported SVG");
        smil.pauseAnimations();
        Reflect.set(
          window,
          "layerPlayer",
          await api.createVisualSvgPlayerAsync(live, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
            respectReducedMotion: false,
          }),
        );
      },
      { markup: exported.content, blueprint: compiled.document },
    );
    let previous = 0;
    for (const frame of [2, 5, 10]) {
      const copies = await page.evaluate(
        ({ delta, time }) => {
          Reflect.get(window, "layerPlayer").advance(delta);
          const smil = document.querySelector("#smil>svg");
          if (!(smil instanceof SVGSVGElement)) throw new Error("Missing exported SVG");
          smil.setCurrentTime(time);
          // Horizontal extent of each path's own geometry: shape, plain copy, trimmed copy.
          const [base, core, hand] = [
            "#live [data-edi-object] > path:first-child",
            '#live [data-edi-paint-layer="paint-core"]',
            '#live [data-edi-paint-layer="paint-hand"]',
          ].map((selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof SVGGraphicsElement)) throw new Error(`Missing ${selector}`);
            const box = element.getBBox();
            return [Math.round(box.x), Math.round(box.x + box.width)];
          });
          return { base, core, hand };
        },
        { delta: (frame - previous) / 10, time: frame / 10 + 0.001 },
      );
      previous = frame;
      assert.deepEqual(copies.base, [20, 20 + 20 * frame], `frame ${frame}: the shape draws on`);
      assert.deepEqual(copies.core, [20, 220], `frame ${frame}: a copy without a trim is whole`);
      assert.deepEqual(copies.hand, [180, 220], `frame ${frame}: a copy keeps its own trim`);
      const stats = await page.evaluate(
        async ({ a, b }) => {
          const [left, right] = await Promise.all(
            [a, b].map(async (source) => {
              const bitmap = await createImageBitmap(await (await fetch(source)).blob()),
                canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
                context = canvas.getContext("2d");
              if (!context) throw new Error("Missing canvas");
              context.drawImage(bitmap, 0, 0);
              return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
            }),
          );
          if (!left || !right) throw new Error("Missing captures");
          let mismatches = 0,
            blue = 0;
          for (let offset = 0; offset < left.length; offset += 4) {
            if ((left[offset + 2] ?? 0) > 150 && (left[offset + 1] ?? 255) < 100) blue++;
            for (let channel = 0; channel < 3; channel++)
              if (Math.abs((left[offset + channel] ?? 0) - (right[offset + channel] ?? 0)) > 2) {
                mismatches++;
                break;
              }
          }
          return { mismatches, blue };
        },
        { a: await capture(page, "#live>svg"), b: await capture(page, "#smil>svg") },
      );
      assert.equal(stats.mismatches, 0, `frame ${frame}: animated SVG matches the player`);
      if (frame === 2)
        assert.ok(stats.blue > 10, "the untrimmed layer shows past the shape's trim");
    }
    await page.evaluate(() => Reflect.get(window, "layerPlayer").destroyAsync());
  } finally {
    await browser.close();
    await server.close();
  }
});

test("the inspector adds, edits, hides and removes extra paint layers", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push({
    id: "node-box",
    name: "Caixa",
    tag: "rect",
    attrs: { x: "10", y: "10", width: "80", height: "80", fill: "#4fe3c1" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    await page.locator('[data-scene-select="node-box"]').click();
    const saved = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0]?.scene.nodes[0];
    const type = async (label: string, value: string) => {
      const input = page.getByLabel(label, { exact: true });
      await input.fill(value);
      await input.press("Enter");
    };

    await page.getByRole("button", { name: "Adicionar preenchimento ou contorno" }).click();
    await page.getByRole("button", { name: "Preenchimento", exact: true }).click();
    assert.equal((await saved())?.paintLayers?.[0]?.kind, "fill");
    const copy = page.locator('[data-object="node-box"] > [data-edi-paint-layer]');
    assert.equal(await copy.getAttribute("fill"), "#747474");
    assert.equal(await copy.getAttribute("width"), "80", "the copy repeats the geometry");

    await type("Cor hexadecimal de preenchimento extra 1", "aa2200");
    await type("Opacidade de preenchimento extra 1 (%)", "50");
    assert.deepEqual(
      {
        color: (await saved())?.paintLayers?.[0]?.color,
        opacity: (await saved())?.paintLayers?.[0]?.opacity,
      },
      { color: "#aa2200", opacity: 0.5 },
    );
    assert.equal(await copy.getAttribute("fill"), "#aa2200");

    await page.getByRole("button", { name: "Adicionar preenchimento ou contorno" }).click();
    await page.getByRole("button", { name: "Contorno", exact: true }).click();
    assert.equal((await saved())?.attrs.stroke, "#000000", "a missing base paint comes first");
    await page.getByRole("button", { name: "Adicionar preenchimento ou contorno" }).click();
    await page.getByRole("button", { name: "Contorno", exact: true }).click();
    await type("Espessura de contorno extra 1", "5");
    assert.equal((await saved())?.paintLayers?.[1]?.width, 5);

    await page.getByRole("button", { name: "Ocultar preenchimento extra 1" }).click();
    assert.equal((await saved())?.paintLayers?.[0]?.visible, false);
    assert.equal(await copy.count(), 1, "only the visible stroke layer is drawn");
    await page.getByRole("button", { name: "Remover preenchimento extra 1" }).click();
    await page.getByRole("button", { name: "Remover contorno extra 1" }).click();
    assert.equal((await saved())?.paintLayers, undefined);
    await page.locator('[data-action="undo"]').click();
    assert.equal((await saved())?.paintLayers?.length, 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("a stroke row's options set its ends and its own trim, which goes with the layer", {
  timeout: 60000,
}, async () => {
  const project = newProject();
  project.artboards[0]?.scene.nodes.push({
    id: "node-arm",
    name: "Braço",
    tag: "path",
    attrs: { d: "M10 50 L90 50", fill: "none", stroke: "#373d4c", "stroke-width": "20" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
    paintLayers: [
      { id: "paint-hand", kind: "stroke", color: "#2c3039", opacity: 1, visible: true, width: 16 },
    ],
  });
  const server = await rendererServer();
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor({ timeout: 5000 });
    await page.locator('[data-scene-select="node-arm"]').click();
    const saved = async () =>
      parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ).artboards[0];
    const shape = page.locator('[data-object="node-arm"] > path:first-child'),
      copy = page.locator('[data-object="node-arm"] > [data-edi-paint-layer="paint-hand"]');

    await page.getByRole("button", { name: "Opções e efeitos de contorno extra 1" }).click();
    const name = page.getByLabel("Nome de contorno extra 1");
    assert.equal(await name.getAttribute("placeholder"), "Contorno 1");
    await name.fill("Mão");
    await name.press("Enter");
    assert.equal((await saved())?.scene.nodes[0]?.paintLayers?.[0]?.name, "Mão");
    await page.getByRole("button", { name: "Ponta arredondada" }).click();
    assert.equal((await saved())?.scene.nodes[0]?.paintLayers?.[0]?.linecap, "round");
    assert.equal(
      await page.getByRole("button", { name: "Ponta arredondada" }).getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("tab", { name: "Efeitos" }).click();
    await page.getByRole("button", { name: "Adicionar trim" }).click();
    const input = page.getByLabel("Início do trim (%)", { exact: true });
    await input.fill("75");
    await input.press("Enter");
    const trim = (await saved())?.rig?.trims?.[0];
    assert.deepEqual(
      { layerId: trim?.layerId, start: trim?.start, end: trim?.end },
      { layerId: "paint-hand", start: 0.75, end: 1 },
    );
    // Only the layer is cut: the hand is the last quarter, the arm stays whole.
    assert.equal(await shape.getAttribute("d"), "M10 50 L90 50");
    const [start] = ((await copy.getAttribute("d")) ?? "").match(/[\d.]+/g)?.map(Number) ?? [];
    assert.equal(Math.round(start ?? 0), 70);

    // The shape's own row has its own effects: no trim there yet.
    await page.getByRole("button", { name: "Opções e efeitos de contorno", exact: true }).click();
    await page.getByRole("button", { name: "Junção arredondada" }).click();
    assert.equal((await saved())?.scene.nodes[0]?.attrs["stroke-linejoin"], "round");
    await page.getByRole("tab", { name: "Efeitos" }).click();
    await page.getByRole("button", { name: "Adicionar trim" }).waitFor();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Remover contorno extra 1" }).click();
    let board = await saved();
    assert.equal(board?.scene.nodes[0]?.paintLayers, undefined);
    assert.equal(board?.rig?.trims?.length ?? 0, 0, "the layer's trim goes with it");
    await page.locator('[data-action="undo"]').click();
    board = await saved();
    assert.equal(board?.rig?.trims?.[0]?.layerId, "paint-hand");
    assert.equal(board?.scene.nodes[0]?.paintLayers?.length, 1);
  } finally {
    await browser.close();
    await server.close();
  }
});
