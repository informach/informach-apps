import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
export const svgUseSources = {
  reused: `<svg xmlns="http://www.w3.org/2000/svg" ${XLINK} viewBox="0 0 180 120"><defs><path id="leaf" d="M0 0C20 -10 40 10 30 30C10 34 -4 20 0 0Z"/></defs><use href="#leaf" x="20" y="20" fill="#e33a60"/><use xlink:href="#leaf" x="90" y="40" fill="#2050b0" transform="rotate(10 90 40)" opacity="0.7"/><use href="#leaf" transform="translate(130 60) scale(1.5)" fill="#00a080" stroke="#102030" stroke-width="2"/></svg>`,
  viewport: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><symbol id="badge" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid slice"><circle cx="25" cy="25" r="30" fill="#00a080"/><rect x="10" y="10" width="30" height="30" fill="#ffd000"/></symbol><rect width="180" height="120" fill="#f2efe8"/><use href="#badge" x="10" y="10" width="80" height="40"/><use href="#badge" x="100" y="10" width="60" height="90" opacity="0.6"/></svg>`,
  aspect: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><symbol id="mark" viewBox="-10 -10 40 20" preserveAspectRatio="xMaxYMin meet" fill="#e33a60"><rect x="-10" y="-10" width="40" height="20"/><circle cx="10" cy="0" r="8" fill="#ffffff"/></symbol><symbol id="stretch" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M0 0H10V10Z" fill="#2050b0"/></symbol><use href="#mark" x="5" y="5" width="90" height="60"/><use href="#stretch" x="100" y="20" width="70" height="30"/></svg>`,
  nested: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><defs><linearGradient id="paint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e33a60"/><stop offset="1" stop-color="#2050b0"/></linearGradient><rect id="tile" width="20" height="20" rx="4" fill="url(#paint)"/></defs><symbol id="row" overflow="visible"><use href="#tile"/><use href="#tile" x="25"/><use href="#tile" x="50" opacity="0.5"/></symbol><use href="#row" x="10" y="10"/><use href="#row" x="10" y="50" transform="skewX(10)"/><g transform="translate(100 20)"><use href="#row" y="40" fill="#000"/></g></svg>`,
};

test("imported use/symbol copies keep the native browser pixels of the original SVG", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([["/use.html", { content: "<!doctype html><main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/use.html`);
    await page.addScriptTag({ content: code });
    for (const [name, source] of Object.entries(svgUseSources)) {
      const result = await page.evaluate(async (source) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing import bundle");
        const imported = api.inspectSvgImport(source);
        if (!imported.scene)
          return { issues: imported.report.issues, mismatches: -1, warnings: [], tags: [] };
        const reference = document.createElement("div"),
          host = document.createElement("div");
        reference.innerHTML = source;
        host.innerHTML = api.renderScene(imported.scene);
        document.body.append(reference, host);
        const original = reference.querySelector("svg"),
          svg = host.querySelector("svg");
        if (!(original instanceof SVGSVGElement) || !(svg instanceof SVGSVGElement))
          throw new Error("Missing compared drawings");
        const points: [number, number][] = [];
        for (let y = 1; y < 120; y += 3) for (let x = 1; x < 180; x += 3) points.push([x, y]);
        const expected = await api.svgPixels(original, 180, 120, points),
          actual = await api.svgPixels(svg, 180, 120, points);
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
          issues: [],
          mismatches,
          warnings: imported.report.issues.map((issue) => issue.message),
          tags: [...svg.querySelectorAll("*")].map((element) => element.localName),
        };
      }, source);
      assert.deepEqual(result.issues, [], `${name}: ${JSON.stringify(result.issues)}`);
      assert.equal(result.mismatches, 0, `${name} differs from the native SVG`);
      assert.ok(result.warnings.some((message) => message.includes("cópias editáveis")));
      assert.equal(result.tags.includes("use") || result.tags.includes("symbol"), false);
      if (name === "viewport")
        assert.ok(result.warnings.some((message) => message.includes("recorte retangular")));
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("use/symbol import refuses external, missing, circular and out-of-profile references atomically", {
  timeout: 60000,
}, async () => {
  const wrap = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${XLINK} viewBox="0 0 100 100">${body}</svg>`;
  const nestedChain = Array.from(
    { length: 10 },
    (_, index) =>
      `<g id="level-${index}">${index ? `<use href="#level-${index - 1}"/>` : '<rect width="4" height="4"/>'}</g>`,
  ).join("");
  const cases: [string, string, RegExp][] = [
    ["external", wrap('<use href="sprites.svg#icon"/>'), /referência local/],
    ["remote", wrap('<use xlink:href="https://example.com/a.svg#b"/>'), /referência local/],
    ["missing", wrap('<use href="#nothing"/>'), /ausente: #nothing/],
    ["self", wrap('<g id="loop"><use href="#loop"/></g>'), /circular/],
    [
      "mutual",
      wrap(
        '<symbol id="a" overflow="visible"><use href="#b"/></symbol><symbol id="b" overflow="visible"><use href="#a"/></symbol><use href="#a"/>',
      ),
      /circular/,
    ],
    [
      "both hrefs",
      wrap('<rect id="r" width="5" height="5"/><use href="#r" xlink:href="#r"/>'),
      /ambíguo/,
    ],
    [
      "child",
      wrap('<rect id="r" width="5" height="5"/><use href="#r"><rect width="1" height="1"/></use>'),
      /apenas title/,
    ],
    [
      "style",
      wrap(
        '<symbol id="s" viewBox="0 0 1 1" style="overflow:visible"><rect width="1" height="1"/></symbol><use href="#s" width="5" height="5"/>',
      ),
      /Estilo inline em symbol/,
    ],
    [
      "size",
      wrap(
        '<symbol id="s" viewBox="0 0 1 1"><rect width="1" height="1"/></symbol><use href="#s"/>',
      ),
      /width e height numéricos/,
    ],
    [
      "percent",
      wrap(
        '<symbol id="s" viewBox="0 0 1 1"><rect width="1" height="1"/></symbol><use href="#s" width="50%" height="10"/>',
      ),
      /número absoluto/,
    ],
    [
      "aspect",
      wrap(
        '<symbol id="s" viewBox="0 0 1 1" preserveAspectRatio="defer xMidYMid"><rect width="1" height="1"/></symbol><use href="#s" width="5" height="5"/>',
      ),
      /preserveAspectRatio/,
    ],
    [
      "duplicate",
      wrap('<rect id="r" width="5" height="5"/><circle id="r" r="2"/><use href="#r"/>'),
      /duplicados/,
    ],
    ["depth", wrap(`<defs>${nestedChain}</defs><use href="#level-9"/>`), /8 níveis/],
    [
      "unsupported",
      wrap(
        '<defs><image id="photo" href="data:image/png;base64,AAAA"/></defs><use href="#photo"/>',
      ),
      /referências externas|Elemento não suportado/,
    ],
    [
      "budget",
      wrap(
        `<defs><g id="many">${'<rect width="1" height="1"/>'.repeat(400)}</g></defs>${'<use href="#many"/>'.repeat(6)}`,
      ),
      /2000 elementos/,
    ],
  ];
  const server = await rendererServer(
      new Map([["/use.html", { content: "<!doctype html><main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/use.html`);
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

test("importing a sprite SVG through the dialog names the copies and edits them independently", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="import-svg"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
    await dialog.locator('input[name="svg-file"]').setInputFiles({
      name: "Sprites.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svgUseSources.reused),
    });
    await dialog.getByText(/cópias editáveis independentes/).waitFor();
    await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length === 2,
    );
    const project = parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ),
      nodes = project.artboards[1]?.scene.nodes ?? [];
    assert.deepEqual(
      nodes.map((node) => node.name),
      ["Uso de leaf", "Uso de leaf", "Uso de leaf"],
    );
    const leaves = nodes.map((node) => node.children[0]);
    assert.deepEqual(
      leaves.map((node) => [node?.tag, node?.name]),
      [
        ["path", "leaf"],
        ["path", "leaf"],
        ["path", "leaf"],
      ],
    );
    assert.equal(new Set(leaves.map((node) => node?.id)).size, 3);
    assert.equal(nodes[1]?.attrs.opacity, "0.7");
    assert.match(nodes[1]?.attrs.transform ?? "", /rotate\(10 90 40\) translate\(90 40\)/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
