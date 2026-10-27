import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"',
  svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${XLINK} viewBox="0 0 180 120">${body}</svg>`;
export const svgPatternSources = {
  // Review 2026-10-20: a viewBox overrides patternContentUnits, as in the browser.
  viewBoxBounding: svg(
    '<defs><pattern id="vb" patternUnits="userSpaceOnUse" width="24" height="24" viewBox="0 0 10 10" patternContentUnits="objectBoundingBox"><rect width="5" height="5" fill="#e33a60"/><circle cx="7.5" cy="7.5" r="2" fill="#2050b0"/></pattern></defs><rect x="10" y="10" width="160" height="100" fill="url(#vb)"/>',
  ),
  bounding: svg(
    '<defs><pattern id="p" width="0.25" height="0.25"><rect width="10" height="10" fill="#e33a60"/><circle cx="15" cy="15" r="4" fill="#2050b0"/></pattern></defs><rect width="180" height="120" fill="#f2efe8"/><rect x="10" y="10" width="80" height="80" fill="url(#p)"/>',
  ),
  user: svg(
    '<defs><pattern id="lines" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(30) translate(2 1)"><path d="M0 6H12" stroke="#102030" stroke-width="3" stroke-linecap="round"/><path d="M6 0V12" stroke="#00a080" stroke-opacity="0.6" stroke-width="2"/></pattern></defs><rect width="180" height="120" fill="#ffffff"/><ellipse cx="90" cy="60" rx="80" ry="50" fill="url(#lines)" stroke="#e33a60" stroke-width="4"/>',
  ),
  viewBox: svg(
    '<defs><pattern id="v" patternUnits="userSpaceOnUse" x="5" y="3" width="30" height="20" viewBox="0 0 10 10" preserveAspectRatio="xMaxYMid meet"><polygon points="0 0 10 0 5 10" fill="#ffd000" fill-opacity="0.8"/></pattern></defs><rect width="180" height="120" fill="#202020"/><rect x="0" y="0" width="180" height="120" fill="url(#v)"/>',
  ),
  template: svg(
    '<defs><pattern id="base" patternUnits="userSpaceOnUse" width="16" height="16"><g transform="translate(8 8) rotate(45)" fill="#2050b0"><rect x="-4" y="-4" width="8" height="8"/></g><circle cx="0" cy="0" r="3" fill="#e33a60"/></pattern><pattern id="derived" xlink:href="#base" patternTransform="scale(1.5) translate(3 0)"/></defs><rect width="180" height="120" fill="#f2efe8"/><rect x="20" y="10" width="140" height="100" fill="url(#derived)"/>',
  ),
  evenodd: svg(
    '<defs><pattern id="e" patternUnits="userSpaceOnUse" width="20" height="20" fill="#00a080" fill-rule="evenodd"><path d="M0 0H20V20H0Z M5 5H15V15H5Z"/></pattern></defs><rect width="180" height="120" fill="#ffffff"/><circle cx="90" cy="60" r="55" fill="url(#e)"/>',
  ),
  content: svg(
    '<defs><pattern id="c" width="0.5" height="0.5" patternContentUnits="objectBoundingBox"><rect width="0.25" height="0.25" fill="#e33a60"/><rect x="0.25" y="0.25" width="0.25" height="0.25" fill="#102030"/></pattern></defs><rect width="180" height="120" fill="#f2efe8"/><rect x="40" y="20" width="100" height="80" fill="url(#c)"/>',
  ),
  stroke: svg(
    '<defs><pattern id="s" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="4" height="8" fill="#e33a60"/><rect x="4" width="4" height="8" fill="#2050b0"/></pattern></defs><rect width="180" height="120" fill="#ffffff"/><rect x="20" y="20" width="140" height="80" fill="none" stroke="url(#s)" stroke-width="12"/><text x="40" y="75" font-size="40" font-family="Arial" font-weight="bold" fill="url(#s)">EdiSVG</text>',
  ),
};

test("imported patterns keep the native browser pixels of the original SVG", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([["/patterns.html", { content: "<!doctype html><main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/patterns.html`);
    await page.addScriptTag({ content: code });
    for (const [name, source] of Object.entries(svgPatternSources)) {
      const result = await page.evaluate(async (source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
        if (!imported.scene)
          return { errors: imported.report.issues.map((issue) => issue.message), mismatches: -1 };
        const reference = document.createElement("div"),
          host = document.createElement("div");
        reference.innerHTML = source;
        host.innerHTML = api.renderScene(imported.scene);
        document.body.append(reference, host);
        const original = reference.querySelector("svg"),
          copy = host.querySelector("svg");
        if (!(original instanceof SVGSVGElement) || !(copy instanceof SVGSVGElement))
          throw new Error("Missing compared drawings");
        const points: [number, number][] = [];
        for (let y = 1; y < 120; y += 3) for (let x = 1; x < 180; x += 3) points.push([x, y]);
        const expected = await api.svgPixels(original, 180, 120, points),
          actual = await api.svgPixels(copy, 180, 120, points);
        let mismatches = 0;
        for (const [index, pixel] of actual.entries())
          if (
            pixel.some(
              (value, channel) => Math.abs(value - (expected[index]?.[channel] ?? -999)) > 2,
            )
          )
            mismatches++;
        reference.remove();
        host.remove();
        return {
          errors: [] as string[],
          mismatches,
          patterns: copy.querySelectorAll("pattern").length,
        };
      }, source);
      assert.deepEqual(result.errors, [], `${name}: ${JSON.stringify(result.errors)}`);
      assert.equal(result.mismatches, 0, `${name} differs from the native SVG`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("pattern import refuses nested paint, text, images, group opacity and broken templates", {
  timeout: 60000,
}, async () => {
  const shape = '<rect width="40" height="40" fill="url(#p)"/>',
    cases: [string, string, RegExp][] = [
      [
        "gradient",
        svg(
          `<defs><linearGradient id="g"><stop offset="0"/><stop offset="1" stop-color="red"/></linearGradient><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#g)"/></pattern></defs>${shape}`,
        ),
        /cor sólida/,
      ],
      [
        "text",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><text>A</text></pattern></defs>${shape}`,
        ),
        /fora do perfil/,
      ],
      [
        "image",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><image width="5" height="5"/></pattern></defs>${shape}`,
        ),
        /fora do perfil/,
      ],
      [
        "group opacity",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><g opacity="0.5"><rect width="5" height="5"/></g></pattern></defs>${shape}`,
        ),
        /Opacidade de grupo/,
      ],
      [
        "currentColor",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="currentColor"/></pattern></defs>${shape}`,
        ),
        /currentColor/,
      ],
      [
        "external",
        svg(`<defs><pattern id="p" href="other.svg#q" width="10" height="10"/></defs>${shape}`),
        /referência local/,
      ],
      [
        "cycle",
        svg(`<defs><pattern id="p" href="#q"/><pattern id="q" href="#p"/></defs>${shape}`),
        /ciclo/,
      ],
      [
        "zero",
        svg(
          `<defs><pattern id="p" patternUnits="userSpaceOnUse"><rect width="5" height="5"/></pattern></defs>${shape}`,
        ),
        /largura e altura positivas/,
      ],
      [
        "percent",
        svg(
          `<defs><pattern id="p" patternUnits="userSpaceOnUse" width="10%" height="10"><rect width="5" height="5"/></pattern></defs>${shape}`,
        ),
        /número absoluto/,
      ],
      [
        "empty",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"/></defs>${shape}`,
        ),
        /sem formas/,
      ],
      [
        "too many",
        svg(
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse">${'<rect width="1" height="1"/>'.repeat(65)}</pattern></defs>${shape}`,
        ),
        /64 formas/,
      ],
    ];
  const server = await rendererServer(
      new Map([["/patterns.html", { content: "<!doctype html><main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/patterns.html`);
    await page.addScriptTag({ content: code });
    for (const [name, source, expected] of cases) {
      const result = await page.evaluate((source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
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
    await browser.close();
    await server.close();
  }
});

test("the shared visual player draws patterns like the static scene", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([
        [
          "/patterns.html",
          { content: '<!doctype html><main><svg id="live"></svg></main>', mime: "text/html" },
        ],
      ]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/patterns.html`);
    await page.addScriptTag({ content: code });
    for (const source of [svgPatternSources.template, svgPatternSources.stroke]) {
      const scene = await page.evaluate((source) => {
        const imported = window.EdiAssetTest?.inspectSvgImport(source);
        if (!imported?.scene) throw new Error("Import failed");
        return imported.scene;
      }, source);
      const project = newProject(),
        board = project.artboards[0];
      assert.ok(board);
      board.scene = scene;
      const parsed = parseProject(JSON.parse(JSON.stringify(project))),
        compiled = compileInteractiveArtboard(parsed, board.id);
      assert.equal(compiled.document.version, 12);
      const mismatches = await page.evaluate(
        async ({ document: blueprint, scene }) => {
          const api = window.EdiAssetTest,
            live = window.document.querySelector("#live");
          if (!api || !(live instanceof SVGSVGElement)) throw new Error("Missing player host");
          const player = await api.createVisualSvgPlayerAsync(live, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
          const host = window.document.createElement("div");
          host.innerHTML = api.renderScene(scene);
          window.document.body.append(host);
          const still = host.querySelector("svg");
          if (!(still instanceof SVGSVGElement)) throw new Error("Missing still scene");
          const points: [number, number][] = [];
          for (let y = 1; y < 120; y += 4) for (let x = 1; x < 180; x += 4) points.push([x, y]);
          const expected = await api.svgPixels(still, 180, 120, points),
            actual = await api.svgPixels(live, 180, 120, points);
          await player.destroyAsync();
          host.remove();
          let count = 0;
          for (const [index, pixel] of actual.entries())
            if (
              pixel.some(
                (value, channel) => Math.abs(value - (expected[index]?.[channel] ?? -999)) > 2,
              )
            )
              count++;
          return count;
        },
        { document: compiled.document, scene },
      );
      assert.equal(mismatches, 0);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test("the appearance panel applies a preset tile in one undoable edit and Lottie refuses it", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  board.scene.nodes.push({
    id: "node-patterned",
    name: "Forma com padrão",
    tag: "rect",
    attrs: { x: "100", y: "100", width: "400", height: "300", fill: "#4fe3c1" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  project.motion.animations.push({
    id: "animation-tile",
    name: "Tile",
    fps: 10,
    frames: 10,
    mode: "loop",
    tracks: [],
  });
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
    await page.locator('[data-scene-select="node-patterned"]').click();
    await page.getByText("Gradientes e padrões", { exact: true }).click();
    const form = page.getByRole("form", { name: "Gradiente de preenchimento", exact: true });
    await form
      .getByLabel("Tipo de gradiente de preenchimento", { exact: true })
      .selectOption("pattern");
    await form
      .getByLabel("Modelo do padrão de preenchimento", { exact: true })
      .selectOption("checker");
    await form.getByLabel("Tamanho do tile (px)", { exact: true }).fill("40");
    await form
      .getByRole("button", { name: "Aplicar padrão de preenchimento", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.gradients?.fill?.kind === "pattern",
    );
    const saved = parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ),
      fill = saved.artboards[0]?.scene.nodes[0]?.gradients?.fill;
    assert.equal(fill?.kind, "pattern");
    assert.equal(fill?.kind === "pattern" ? fill.width : 0, 40);
    assert.equal(await page.locator(".scene-artwork pattern").count(), 1);
    await page.getByText("Padrão", { exact: true }).waitFor();
    await page.keyboard.press("Control+z");
    await page.waitForFunction((value) => localStorage.getItem("edisvg-project") === value, before);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.gradients?.fill?.kind === "pattern",
    );
    await page.getByText("Tile").first().click();
    await page.locator('[data-action="export"]').click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('[name="format"][value="lottie"]').check();
    await dialog.getByText(/Padrões \(tiles\) não têm equivalente/).waitFor();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.locator("#close-export").click();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
