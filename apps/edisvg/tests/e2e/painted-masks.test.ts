import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { applyComponent } from "../../src/shared/components";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><rect width="180" height="120" fill="#f2efe8"/>${body}</svg>`,
  region = 'maskUnits="userSpaceOnUse" x="-20" y="-20" width="220" height="160"',
  art = (mask: string) =>
    `<g mask="url(#${mask})"><rect width="90" height="120" fill="#e33a60"/><rect x="90" width="90" height="120" fill="#2050b0"/></g>`;
export const paintedMaskSources = {
  defaultLuminance: svg(
    `<defs><mask id="m" ${region}><rect x="20" y="20" width="140" height="80" fill="white"/></mask></defs>${art("m")}`,
  ),
  gradient: svg(
    `<defs><linearGradient id="fade"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="m" ${region}><path d="M20 20H160V100H20Z" fill="url(#fade)"/></mask></defs>${art("m")}`,
  ),
  gray: svg(
    `<defs><mask id="m" ${region} mask-type="luminance"><circle cx="90" cy="60" r="45" fill="#808080" fill-opacity="0.7"/></mask></defs>${art("m")}`,
  ),
  alphaGradient: svg(
    `<defs><radialGradient id="r"><stop offset="0" stop-color="#e33a60" stop-opacity="1"/><stop offset="1" stop-color="#e33a60" stop-opacity="0"/></radialGradient><mask id="m" ${region} style="mask-type:alpha"><ellipse cx="90" cy="60" rx="70" ry="45" fill="url(#r)"/></mask></defs>${art("m")}`,
  ),
  stroke: svg(
    `<defs><mask id="m" ${region}><circle cx="90" cy="60" r="35" fill="none" stroke="white" stroke-width="12"/></mask></defs>${art("m")}`,
  ),
  pattern: svg(
    `<defs><pattern id="p" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="6" height="12" fill="#ffffff"/></pattern><mask id="m" ${region}><rect x="10" y="10" width="160" height="100" fill="url(#p)"/></mask></defs>${art("m")}`,
  ),
  transformed: svg(
    `<defs><mask id="m" ${region}><rect x="30" y="30" width="80" height="40" fill="#cccccc" transform="rotate(15 70 50)"/></mask></defs><g transform="translate(10 5) scale(0.9)">${art("m")}</g>`,
  ),
  inherited: svg(
    `<defs><mask id="m" ${region} fill="#ffffff" fill-opacity="0.5"><path d="M10 10H120V110H10Z"/></mask></defs>${art("m")}`,
  ),
};

async function open() {
  const server = await rendererServer(
      new Map([
        [
          "/masks.html",
          { content: '<!doctype html><main><svg id="live"></svg></main>', mime: "text/html" },
        ],
      ]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {}),
    page = await browser.newPage();
  await page.goto(`${server.url}/masks.html`);
  await page.addScriptTag({ content: code });
  return {
    page,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

test("imported luminance and painted masks keep the native browser pixels", {
  timeout: 60000,
}, async () => {
  const session = await open();
  try {
    for (const [name, source] of Object.entries(paintedMaskSources)) {
      const result = await session.page.evaluate(async (source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
        if (!imported.scene)
          return {
            errors: imported.report.issues.map((issue) => issue.message),
            mismatches: -1,
            worst: 0,
            types: [] as string[],
          };
        const reference = document.createElement("div"),
          host = document.createElement("div");
        reference.innerHTML = source;
        host.innerHTML = api.renderScene(imported.scene);
        document.body.append(reference, host);
        const original = reference.querySelector("svg"),
          copy = host.querySelector("svg");
        if (!(original instanceof SVGSVGElement) || !(copy instanceof SVGSVGElement))
          throw new Error("Missing drawings");
        const points: [number, number][] = [];
        for (let y = 1; y < 120; y += 3) for (let x = 1; x < 180; x += 3) points.push([x, y]);
        const expected = await api.svgPixels(original, 180, 120, points),
          actual = await api.svgPixels(copy, 180, 120, points);
        let mismatches = 0,
          worst = 0;
        for (const [index, pixel] of actual.entries()) {
          const delta = Math.max(
            ...pixel.map((value, channel) =>
              Math.abs(value - (expected[index]?.[channel] ?? -999)),
            ),
          );
          worst = Math.max(worst, delta);
          if (delta > 2) mismatches++;
        }
        const types = [...copy.querySelectorAll("mask")].map(
          (element) => element.getAttribute("mask-type") ?? "",
        );
        reference.remove();
        host.remove();
        return { errors: [] as string[], mismatches, worst, types };
      }, source);
      assert.deepEqual(result.errors, [], `${name}: ${JSON.stringify(result.errors)}`);
      assert.equal(
        result.mismatches,
        0,
        `${name} differs from the native SVG (worst ${result.worst})`,
      );
      assert.equal(result.types[0], name === "alphaGradient" ? "alpha" : "luminance", name);
    }
  } finally {
    await session.close();
  }
});

test("painted mask import still refuses regional clipping of strokes and translucent colours", {
  timeout: 60000,
}, async () => {
  const session = await open();
  try {
    const cases: [string, string, RegExp][] = [
      [
        "stroke outside region",
        svg(
          `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="2" y="2" width="96" height="96" fill="none" stroke="white" stroke-width="6"/></mask></defs>${art("m")}`,
        ),
        /Região de máscara precisa conter/,
      ],
      [
        "rgba",
        svg(
          `<defs><mask id="m" ${region}><rect x="20" y="20" width="60" height="60" fill="rgba(255,255,255,0.5)"/></mask></defs>${art("m")}`,
        ),
        /fill-opacity\/stroke-opacity/,
      ],
      [
        "bad type",
        svg(
          `<defs><mask id="m" ${region} mask-type="screen"><rect width="9" height="9"/></mask></defs>${art("m")}`,
        ),
        /alpha ou luminance/,
      ],
    ];
    for (const [name, source, expected] of cases) {
      const result = await session.page.evaluate((source) => {
        const imported = window.EdiAssetTest?.inspectSvgImport(source);
        if (!imported) throw new Error("Missing import bundle");
        return {
          scene: imported.scene !== null,
          errors: imported.report.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message),
        };
      }, source);
      assert.equal(result.scene, false, `${name} must not import`);
      assert.ok(
        result.errors.some((message) => expected.test(message)),
        `${name}: ${JSON.stringify(result.errors)}`,
      );
    }
  } finally {
    await session.close();
  }
});

test("the shared player draws painted masks like the static scene and updates them per frame", {
  timeout: 60000,
}, async () => {
  const session = await open();
  try {
    const scene = await session.page.evaluate((source) => {
      const imported = window.EdiAssetTest?.inspectSvgImport(source);
      if (!imported?.scene) throw new Error("Import failed");
      return imported.scene;
    }, paintedMaskSources.gradient);
    const project = newProject(),
      board = project.artboards[0];
    assert.ok(board);
    board.scene = scene;
    const carrier = scene.nodes.find((node) => node.effects?.mask),
      sourceId = carrier?.effects?.mask?.sourceId;
    assert.ok(carrier && sourceId);
    assert.equal(carrier.effects?.mask?.mode, "luminance");
    project.motion.animations.push({
      id: "animation-mask",
      name: "Máscara",
      fps: 10,
      frames: 10,
      mode: "once",
      tracks: [
        {
          id: "track-mask-x",
          targetId: sourceId,
          property: "x",
          keys: [
            { id: "key-mask-a", frame: 0, value: 0, easing: "linear" },
            { id: "key-mask-b", frame: 10, value: 30, easing: "linear" },
          ],
        },
      ],
    });
    const parsed = parseProject(JSON.parse(JSON.stringify(project))),
      compiled = compileInteractiveArtboard(parsed, board.id, { animationId: "animation-mask" });
    assert.equal(compiled.document.version, 12);
    const result = await session.page.evaluate(
      async ({ blueprint, scene }) => {
        const api = window.EdiAssetTest,
          live = document.querySelector("#live");
        if (!api || !(live instanceof SVGSVGElement)) throw new Error("Missing player host");
        const player = await api.createVisualSvgPlayerAsync(live, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
        });
        const host = document.createElement("div");
        host.innerHTML = api.renderScene(scene);
        document.body.append(host);
        const still = host.querySelector("svg");
        if (!(still instanceof SVGSVGElement)) throw new Error("Missing still");
        const points: [number, number][] = [];
        for (let y = 1; y < 120; y += 4) for (let x = 1; x < 180; x += 4) points.push([x, y]);
        const expected = await api.svgPixels(still, 180, 120, points),
          start = await api.svgPixels(live, 180, 120, points);
        const liveMask = live.querySelector("[data-edi-live-effects] mask"),
          before = liveMask?.querySelector("path")?.getAttribute("transform");
        player.advance(1);
        const after = liveMask?.querySelector("path")?.getAttribute("transform"),
          moved = await api.svgPixels(live, 180, 120, points);
        await player.destroyAsync();
        host.remove();
        let mismatches = 0,
          changed = 0;
        for (const [index, pixel] of start.entries()) {
          if (
            pixel.some(
              (value, channel) => Math.abs(value - (expected[index]?.[channel] ?? -999)) > 2,
            )
          )
            mismatches++;
          if (
            pixel.some((value, channel) => Math.abs(value - (moved[index]?.[channel] ?? -999)) > 2)
          )
            changed++;
        }
        return {
          mismatches,
          changed,
          type: liveMask?.getAttribute("mask-type"),
          fill: liveMask?.querySelector("path")?.getAttribute("fill") ?? "",
          moved: before !== after,
        };
      },
      { blueprint: compiled.document, scene },
    );
    assert.equal(result.mismatches, 0);
    assert.equal(result.type, "luminance");
    assert.match(result.fill, /^url\(#edi-gradient-/);
    assert.equal(result.moved, true);
    assert.ok(result.changed > 0);
  } finally {
    await session.close();
  }
});

test("the effects panel switches a mask to luminance in one undoable edit", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  const node = (id: string, attrs: Record<string, string>) => ({
    id,
    name: id,
    tag: "rect" as const,
    attrs,
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  board.scene.nodes.push(
    node("node-art", { x: "100", y: "100", width: "600", height: "400", fill: "#e33a60" }),
    node("node-fade", { x: "150", y: "150", width: "500", height: "300", fill: "#808080" }),
  );
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      parseProject(project),
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-scene-select="node-art"]').click();
    await page.locator('[data-inspector-section="effects"] > summary').click();
    const panel = page.getByRole("region", { name: "Recortes e máscaras", exact: true });
    await panel
      .getByRole("combobox", { name: "Fonte da máscara alpha", exact: true })
      .selectOption("node-fade");
    await panel
      .getByRole("combobox", { name: "Modo da máscara", exact: true })
      .selectOption("luminance");
    await panel.getByRole("button", { name: "Aplicar recorte / máscara", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.effects?.mask?.mode === "luminance",
    );
    // The editor canvas keeps the authored definition and its live, per-frame copy.
    const live = page.locator('.scene-artwork [data-edi-live-effects] mask[mask-type="luminance"]');
    assert.equal(await live.count(), 1);
    assert.equal(await live.locator('[fill="#808080"]').count(), 1);
    await page.keyboard.press("Control+z");
    await page.waitForFunction((value) => localStorage.getItem("edisvg-project") === value, before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

// Review 2026-10-20: a component drawn inside a parent that sets paint must give its
// painted-mask sources that inherited paint in the player too, as the static scene does.
test("a component scope inherits the paint of its parent viewport for painted masks", {
  timeout: 60000,
}, async () => {
  const session = await open();
  try {
    const scene = await session.page.evaluate((source) => {
      const imported = window.EdiAssetTest?.inspectSvgImport(source);
      if (!imported?.scene) throw new Error("Import failed");
      return imported.scene;
    }, paintedMaskSources.defaultLuminance);
    // An authored source leaves fill-opacity to inheritance (the importer writes it out).
    const sourceId = scene.nodes.find((node) => node.effects?.mask)?.effects?.mask?.sourceId,
      source = scene.nodes
        .flatMap(function walk(node): (typeof scene.nodes)[number][] {
          return [node, ...node.children.flatMap(walk)];
        })
        .find((node) => node.id === sourceId);
    assert.ok(source);
    delete source.attrs["fill-opacity"];
    const project = newProject(),
      root = project.artboards[0];
    assert.ok(root);
    const master = {
      ...structuredClone(root),
      id: "artboard-master",
      name: "Master",
      scene,
      // Logic makes the instance its own player scope instead of inlined artwork.
      behavior: {
        ...emptyBehavior(),
        inputs: [{ id: "input-on", kind: "boolean" as const, name: "On", initial: false }],
      },
    };
    project.artboards.push(master);
    const id = applyComponent(root.scene, {
        type: "component",
        operation: "create",
        name: "Instance",
        instance: {
          artboardId: master.id,
          animationId: null,
          width: 180,
          height: 120,
          fit: "contain",
          speed: 1,
          offsetSeconds: 0,
          overrides: [],
        },
      }),
      instance = root.scene.nodes.find((node) => node.id === id);
    assert.ok(instance);
    instance.attrs = { "fill-opacity": "0.5" };
    const parsed = parseProject(JSON.parse(JSON.stringify(project))),
      compiled = compileInteractiveArtboard(parsed, root.id);
    assert.equal(compiled.document.components?.length, 1);
    const result = await session.page.evaluate(
      async ({ blueprint, still }) => {
        const api = window.EdiAssetTest,
          live = document.querySelector("#live");
        if (!api || !(live instanceof SVGSVGElement)) throw new Error("Missing player host");
        const player = await api.createVisualSvgPlayerAsync(live, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
        });
        const host = document.createElement("div");
        host.innerHTML = still;
        document.body.append(host);
        const image = host.querySelector("svg");
        if (!(image instanceof SVGSVGElement)) throw new Error("Missing still");
        const width = image.viewBox.baseVal.width,
          height = image.viewBox.baseVal.height,
          points: [number, number][] = [];
        for (let y = 1; y < height; y += 6) for (let x = 1; x < width; x += 6) points.push([x, y]);
        const expected = await api.svgPixels(image, width, height, points),
          drawn = await api.svgPixels(live, width, height, points);
        const opacity = live
          .querySelector("[data-edi-live-effects] mask *")
          ?.getAttribute("fill-opacity");
        await player.destroyAsync();
        host.remove();
        let mismatches = 0;
        for (const [index, pixel] of drawn.entries())
          if (
            pixel.some(
              (value, channel) => Math.abs(value - (expected[index]?.[channel] ?? -999)) > 2,
            )
          )
            mismatches++;
        return { mismatches, opacity };
      },
      { blueprint: compiled.document, still: compiled.svg },
    );
    assert.equal(result.opacity, "0.5");
    assert.equal(result.mismatches, 0);
  } finally {
    await session.close();
  }
});
