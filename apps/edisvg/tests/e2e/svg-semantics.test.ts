import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { svgSemanticSource } from "../svgSemanticFixture";

test("real SVG semantic import resolves local names/descriptions, preserves pixels and text, and refuses ambiguous or unsafe profiles atomically", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([["/semantic-fixture.html", { content: svgSemanticSource, mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/semantic-fixture.html`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (source) => {
      const api = window.EdiAssetTest,
        original = document.querySelector("svg");
      if (!api || !original) throw new Error("Missing real semantic parser");
      const expected = await api.svgPixels(original, 300, 100, [
          [30, 30],
          [270, 40],
        ]),
        imported = api.inspectSvgImport(source);
      if (!imported.scene) throw new Error(JSON.stringify(imported.report));
      const host = document.createElement("div");
      host.innerHTML = api.renderScene(imported.scene);
      document.body.append(host);
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("Missing imported SVG");
      const actual = await api.svgPixels(svg, 300, 100, [
        [30, 30],
        [270, 40],
      ]);
      const broken = [
        '<rect aria-labelledby="missing"/>',
        '<rect aria-labelledby="https://example.com/name"/>',
        '<rect aria-label=""/>',
        '<rect aria-label="x" role="button"/>',
        '<g role="none"><rect/></g>',
        '<g role="presentation"><rect/></g>',
        '<rect aria-hidden="auto"/>',
        '<rect aria-hidden="true" aria-label="Oculto"/>',
        '<title id="same">Nome</title><desc id="same">Outro</desc>',
        "<rect><title>Um</title><title>Dois</title></rect>",
        "<rect><title><tspan>Rico</tspan></title></rect>",
        '<rect><title onload="alert(1)">Nome</title></rect>',
        '<rect><title xml:lang="en">Name</title></rect>',
        `<rect aria-label="${"x".repeat(501)}"/>`,
        `<rect aria-label="x"><desc>${"x".repeat(2001)}</desc></rect>`,
        '<title id="name">Nome</title><rect aria-labelledby="name name"/>',
        '<title id="name">Nome</title><desc id="help">Ajuda</desc><rect aria-labelledby="name\u00a0help"/>',
        '<text id="name">Outro texto</text><rect aria-labelledby="name"/>',
      ].map((body) =>
        api.inspectSvgImport(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
        ),
      );
      const descriptionOnly = api.inspectSvgImport(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc>Sem nome inventado</desc><rect width="5" height="5"/></svg>',
      );
      const injection = api.inspectSvgImport(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect aria-label="&lt;script&gt;alert(1)&lt;/script&gt;" width="5" height="5"/></svg>',
      );
      if (!injection.scene) throw new Error("Safe XML text was rejected");
      return {
        scene: imported.scene,
        report: imported.report,
        expected,
        actual,
        text: svg.querySelector("text")?.textContent,
        broken: broken.map((entry) => entry.scene === null && entry.report.errors > 0),
        descriptionOnly: {
          scene: !!descriptionOnly.scene,
          warnings: descriptionOnly.report.warnings,
        },
        injection: api.renderScene(injection.scene),
      };
    }, svgSemanticSource);
    assert.equal(result.report.errors, 0);
    assert.equal(result.report.warnings, 3);
    assert.deepEqual(result.actual, result.expected);
    assert.equal(result.text, "Texto visível");
    assert.equal(result.broken.every(Boolean), true);
    assert.deepEqual(result.descriptionOnly, { scene: true, warnings: 1 });
    assert.match(result.injection, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(result.injection, /<script>/);
    const project = newProject(),
      board = project.artboards[0];
    assert.ok(board);
    board.scene = result.scene;
    const parsed = parseProject(project),
      compiled = compileInteractiveArtboard(parsed, board.id);
    assert.equal(
      compiled.document.content.find((entry) => entry.name === "paint")?.semantics?.kind,
      "image",
    );
    assert.equal(
      compiled.document.content.find((entry) => entry.name === "caption")?.visual?.text,
      "Texto visível",
    );
    const html = buildInteractiveExport(
      parsed,
      { format: "interactive-html", alt: "Importação", reduced: false, offscreen: false },
      await readFile("out/renderer/edi-player.global.js", "utf8"),
    );
    await page.setContent(html.content);
    const rect = page.getByRole("img", { name: "Retângulo", exact: true });
    await rect.waitFor();
    assert.equal(await rect.locator(":scope>desc").textContent(), "Forma vermelha.");
    assert.equal(await page.locator("#player-status").textContent(), "");
    const cdp = await page.context().newCDPSession(page),
      ax = await cdp.send("Accessibility.getFullAXTree");
    assert.ok(
      ax.nodes.some(
        (node) =>
          !node.ignored &&
          node.name?.value === "Retângulo" &&
          node.description?.value === "Forma vermelha.",
      ),
    );
    await cdp.detach();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("built import dialog stores editable semantics in a new artboard with undo, recovery and isolated testing", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="import-svg"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
    await dialog.locator('input[name="svg-file"]').setInputFiles({
      name: "Arte semântica.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svgSemanticSource),
    });
    await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length === 2,
    );
    const project = parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ),
      imported = project.artboards[1];
    assert.ok(imported);
    assert.equal(imported.scene.source, svgSemanticSource);
    const root = imported.scene.nodes[0],
      rect = root?.children.find((node) => node.name === "paint");
    assert.ok(rect);
    assert.deepEqual(rect.semantics, {
      kind: "image",
      label: "Retângulo",
      description: "Forma vermelha.",
    });
    await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length === 1,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="redo"]').click();
    await page.locator('[data-action="artboards"]').click();
    await page.locator(`[data-artboard-select="${imported.id}"]`).click();
    await page.reload();
    await page.locator(`.scene-artwork [data-object="${rect.id}"]`).click();
    assert.equal(
      await page.getByLabel("Nome acessível", { exact: true }).inputValue(),
      "Retângulo",
    );
    const stable = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="test"]').click();
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    await testing.getByRole("img", { name: "Retângulo", exact: true }).waitFor();
    await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stable);
    await page.screenshot({ path: "../../.cache/edisvg-review/svg-semantic-import.png" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
