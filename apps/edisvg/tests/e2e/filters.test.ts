import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const svg = (body: string, root = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"${root}><rect width="180" height="120" fill="#f2efe8"/>${body}</svg>`;
export const svgFilterSources = {
  scaledBlur: svg(
    '<defs><filter id="b"><feGaussianBlur stdDeviation="2"/></filter></defs><rect x="10" y="10" width="30" height="20" fill="#e33a60" transform="scale(2)" filter="url(#b)"/>',
  ),
  dropShadow: svg(
    '<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="5" dy="4" stdDeviation="3" flood-color="#102030" flood-opacity="0.6"/></filter></defs><circle cx="90" cy="60" r="35" fill="#2050b0" filter="url(#s)"/>',
  ),
  named: svg(
    '<defs><filter id="m" color-interpolation-filters="sRGB" x="-30%" y="-30%" width="160%" height="160%"><feOffset in="SourceAlpha" dx="4" dy="4" result="moved"/><feGaussianBlur in="moved" stdDeviation="3" result="soft"/><feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M30 90L90 20L150 90Z" fill="#00a080" filter="url(#m)"/>',
  ),
  colors: svg(
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#e33a60"/><stop offset="0.5" stop-color="#ffd000"/><stop offset="1" stop-color="#2050b0"/></linearGradient><filter id="sat"><feColorMatrix type="saturate" values="0.3"/></filter><filter id="hue"><feColorMatrix type="hueRotate" values="120"/></filter><filter id="mat"><feColorMatrix values="0 1 0 0 0  1 0 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter><filter id="lum"><feColorMatrix type="luminanceToAlpha"/></filter></defs><rect x="5" y="5" width="80" height="50" fill="url(#g)" filter="url(#sat)"/><rect x="95" y="5" width="80" height="50" fill="url(#g)" filter="url(#hue)"/><rect x="5" y="65" width="80" height="50" fill="url(#g)" filter="url(#mat)"/><rect x="95" y="65" width="80" height="50" fill="url(#g)" filter="url(#lum)"/>',
  ),
  glow: svg(
    '<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/><feFlood flood-color="#4fe3c1" flood-opacity="0.9" result="color"/><feComposite in="color" in2="blur" operator="in" result="shine"/><feMerge><feMergeNode in="shine"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="180" height="120" fill="#15171c"/><text x="20" y="75" font-size="44" font-family="Arial" font-weight="bold" fill="#ffffff" filter="url(#glow)">EdiSVG</text>',
  ),
  blend: svg(
    '<defs><filter id="mul"><feFlood flood-color="#ffd000" result="tint"/><feBlend in="SourceGraphic" in2="tint" mode="multiply" result="mixed"/><feComposite in="mixed" in2="SourceAlpha" operator="in"/></filter><filter id="ar"><feFlood flood-color="#e33a60" flood-opacity="0.5" result="red"/><feComposite in="SourceGraphic" in2="red" operator="arithmetic" k1="0" k2="0.6" k3="0.4" k4="0.05"/></filter></defs><circle cx="50" cy="60" r="40" fill="#2050b0" filter="url(#mul)"/><circle cx="130" cy="60" r="40" fill="#00a080" filter="url(#ar)"/>',
  ),
  groupClip: svg(
    '<defs><clipPath id="c"><rect x="20" y="20" width="140" height="80" rx="16"/></clipPath><filter id="soft"><feGaussianBlur stdDeviation="1.5"/></filter></defs><g filter="url(#soft)" clip-path="url(#c)" transform="translate(5 0)"><rect width="90" height="120" fill="#e33a60"/><rect x="90" width="90" height="120" fill="#2050b0"/></g>',
  ),
  userSpace: svg(
    '<defs><filter id="u" filterUnits="userSpaceOnUse" x="20" y="10" width="140" height="100" primitiveUnits="objectBoundingBox"><feGaussianBlur stdDeviation="0.04 0.01"/></filter></defs><ellipse cx="90" cy="60" rx="60" ry="35" fill="#102030" filter="url(#u)"/>',
  ),
  inherited: svg(
    '<defs><filter id="i"><feGaussianBlur stdDeviation="4"/><feOffset dx="3"/></filter></defs><rect x="40" y="30" width="100" height="60" fill="#ffd000" stroke="#e33a60" stroke-width="6" filter="url(#i)"/>',
    ' color-interpolation-filters="sRGB"',
  ),
};

async function open(path: string) {
  const server = await rendererServer(
      new Map([
        [path, { content: '<!doctype html><main><svg id="live"></svg></main>', mime: "text/html" }],
      ]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {}),
    page = await browser.newPage();
  await page.goto(`${server.url}${path}`);
  await page.addScriptTag({ content: code });
  return {
    page,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

test("imported filters keep the native browser pixels of the original SVG", {
  timeout: 60000,
}, async () => {
  const session = await open("/filters.html");
  try {
    for (const [name, source] of Object.entries(svgFilterSources)) {
      const result = await session.page.evaluate(async (source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
        if (!imported.scene)
          return {
            errors: imported.report.issues.map((issue) => issue.message),
            mismatches: -1,
            worst: 0,
          };
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
        reference.remove();
        host.remove();
        return { errors: [] as string[], mismatches, worst };
      }, source);
      assert.deepEqual(result.errors, [], `${name}: ${JSON.stringify(result.errors)}`);
      assert.equal(
        result.mismatches,
        0,
        `${name} differs from the native SVG (worst ${result.worst})`,
      );
    }
  } finally {
    await session.close();
  }
});

test("filter import refuses CSS functions, background inputs, subregions and unsupported primitives", {
  timeout: 60000,
}, async () => {
  const shape = (filter: string, use = 'filter="url(#f)"') =>
    svg(`<defs><filter id="f">${filter}</filter></defs><rect width="40" height="40" ${use}/>`);
  const cases: [string, string, RegExp][] = [
    ["css", svg('<rect width="40" height="40" style="filter:blur(3px)"/>'), /funções CSS/],
    [
      "css attribute",
      svg('<rect width="40" height="40" filter="drop-shadow(2px 2px 2px black)"/>'),
      /funções CSS/,
    ],
    [
      "background",
      shape('<feBlend in="SourceGraphic" in2="BackgroundImage"/>'),
      /fundo ou pintura/,
    ],
    ["subregion", shape('<feGaussianBlur x="0" stdDeviation="2"/>'), /não suportado: x/],
    ["turbulence", shape('<feTurbulence baseFrequency="0.1"/>'), /feTurbulence fora do perfil/],
    [
      "mixed spaces",
      shape('<feGaussianBlur stdDeviation="1" color-interpolation-filters="sRGB"/>'),
      /espaços de cor diferentes/,
    ],
    [
      "forward",
      shape('<feGaussianBlur in="later" stdDeviation="1"/><feOffset result="later"/>'),
      /resultado anterior/,
    ],
    ["missing in2", shape('<feBlend in="SourceGraphic"/>'), /in2 explícito/],
    [
      "href",
      svg(
        '<defs><filter id="a"><feOffset/></filter><filter id="f" href="#a"/></defs><rect width="9" height="9" filter="url(#f)"/>',
      ),
      /não suportado: href/,
    ],
    [
      "user region",
      svg(
        '<defs><filter id="f" filterUnits="userSpaceOnUse"><feOffset/></filter></defs><rect width="9" height="9" filter="url(#f)"/>',
      ),
      /x, y, width e height explícitos/,
    ],
    ["empty", shape(""), /sem primitivas/],
    ["external", svg('<rect width="9" height="9" filter="url(other.svg#f)"/>'), /referência local/],
  ];
  const session = await open("/filters.html");
  try {
    for (const [name, source, expected] of cases) {
      const result = await session.page.evaluate((source) => {
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
    await session.close();
  }
});

test("the shared visual player draws filters like the static scene", {
  timeout: 60000,
}, async () => {
  const session = await open("/filters.html");
  try {
    for (const source of [
      svgFilterSources.scaledBlur,
      svgFilterSources.groupClip,
      svgFilterSources.glow,
    ]) {
      const scene = await session.page.evaluate((source) => {
        const imported = window.EdiAssetTest?.inspectSvgImport(source);
        if (!imported?.scene) throw new Error("Import failed");
        return imported.scene;
      }, source);
      const project = newProject(),
        board = project.artboards[0];
      assert.ok(board);
      board.scene = scene;
      const compiled = compileInteractiveArtboard(
        parseProject(JSON.parse(JSON.stringify(project))),
        board.id,
      );
      const mismatches = await session.page.evaluate(
        async ({ blueprint, scene }) => {
          const api = window.EdiAssetTest,
            live = document.querySelector("#live");
          if (!api || !(live instanceof SVGSVGElement)) throw new Error("Missing player host");
          const player = await api.createVisualSvgPlayerAsync(live, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
          const host = document.createElement("div");
          host.innerHTML = api.renderScene(scene);
          document.body.append(host);
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
        { blueprint: compiled.document, scene },
      );
      assert.equal(mismatches, 0);
    }
  } finally {
    await session.close();
  }
});

test("the effects panel applies and removes a preset filter in undoable edits; Lottie refuses it", {
  timeout: 60000,
}, async () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  board.scene.nodes.push({
    id: "node-shadowed",
    name: "Cartão",
    tag: "rect",
    attrs: { x: "200", y: "200", width: "400", height: "300", fill: "#4fe3c1" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  project.motion.animations.push({
    id: "animation-shadow",
    name: "Sombra",
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
    await page.locator('[data-scene-select="node-shadowed"]').click();
    const form = page.getByRole("form", { name: "Filtros", exact: true });
    await form.getByText("Sem filtro.").waitFor();
    await form.getByLabel("Desfoque da sombra (px)", { exact: true }).fill("6");
    await form.getByRole("button", { name: "Aplicar filtro", exact: true }).click();
    const hasFilter = () =>
      page.evaluate(
        () =>
          !!JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene
            .nodes[0]?.filter,
      );
    await page.waitForFunction(
      () =>
        !!JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.filter,
    );
    const saved = parseProject(
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    assert.equal(saved.artboards[0]?.scene.nodes[0]?.filter?.primitives[0]?.kind, "dropShadow");
    assert.equal(await page.locator(".scene-artwork filter feDropShadow").count(), 1);
    await form.getByText("Filtro atual: sombra.").waitFor();
    await form.getByRole("button", { name: "Remover filtro", exact: true }).click();
    await page.waitForFunction((value) => localStorage.getItem("edisvg-project") === value, before);
    await page.keyboard.press("Control+z");
    await page.waitForFunction(
      () =>
        !!JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.filter,
    );
    assert.equal(await hasFilter(), true);
    await page.getByText("Sombra").first().click();
    await page.locator('[data-action="export"]').click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('[name="format"][value="lottie"]').check();
    await dialog.getByText(/Filtros \(desfoque, sombra, cor\) não têm equivalente/).waitFor();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.locator("#close-export").click();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
