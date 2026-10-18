import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { gradientFixture } from "../gradientFixture";
import { rendererServer } from "../rendererServer";

test("real SVG inline importance preserves native paint/gradient pixels and never hides unsafe overridden declarations", {
  timeout: 60000,
}, async () => {
  const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><defs><linearGradient id="paint"><stop offset="0" style="stop-color:red!important;stop-color:blue"/><stop offset="1" style="stop-color:red!important;stop-color:blue"/></linearGradient></defs><rect width="40" height="40" style="Fill:#00ff00!important;fill:blue"/><rect x="40" width="40" height="40" fill="url(#paint)"/><rect x="80" width="40" height="40" style="fill:url(#paint)!important;fill:blue"/></svg>',
    server = await rendererServer(
      new Map([["/inline-style.html", { content: source, mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/inline-style.html`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(async (source) => {
      const api = window.EdiAssetTest,
        original = document.querySelector("svg");
      if (!api || !original) throw new Error("Missing real inline-style renderer");
      const imported = api.inspectSvgImport(source);
      if (!imported.scene) throw new Error(JSON.stringify(imported.report));
      const host = document.createElement("div");
      host.innerHTML = api.renderScene(imported.scene);
      document.body.append(host);
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("Missing imported SVG");
      const points: [number, number][] = [
          [10, 10],
          [50, 10],
          [110, 10],
        ],
        expected = await api.svgPixels(original, 120, 40, points),
        actual = await api.svgPixels(svg, 120, 40, points),
        rejected = [
          '<rect width="10" height="10" style="fill:red!important;fill:url(https://example.com/paint)"/>',
          '<rect style="fill:red!important;unknown:blue"/>',
          '<defs><linearGradient id="bad"><stop offset="0" style="stop-color:red!important;stop-color:var(--unsafe)"/></linearGradient></defs><rect fill="url(#bad)"/>',
        ].map((body) =>
          api.inspectSvgImport(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
          ),
        );
      return {
        expected,
        actual,
        rejected: rejected.map((item) => !item.scene && item.report.errors > 0),
      };
    }, source);
    assert.deepEqual(result.expected, [
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
    ]);
    assert.deepEqual(result.actual, result.expected);
    assert.equal(result.rejected.every(Boolean), true);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("linear/radial SVG gradients render actual pixels, pool by content and reject mismatched definitions before player ownership", {
  timeout: 60000,
}, async () => {
  const fixture = gradientFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: code });
    const linear = await page.evaluate(async (document) => {
      const api = window.EdiAssetTest,
        svg = window.document.querySelector("svg");
      if (!api || !svg) throw new Error("Missing gradient runtime");
      const player = await api.createInteractiveSvgPlayerAsync(svg, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
      const pixels = await api.svgPixels(svg, 100, 100, [
        [5, 50],
        [50, 50],
        [94, 50],
      ]);
      await player.destroyAsync();
      svg.querySelector("stop")?.setAttribute("stop-color", "#00ff00");
      const before = svg.outerHTML;
      let refused = false;
      try {
        await api.createInteractiveSvgPlayerAsync(svg, document, { autoplay: false });
      } catch (error) {
        refused = error instanceof Error && error.message.includes("definição tipada");
      }
      return { pixels, refused, intact: svg.outerHTML === before };
    }, compiled.document);
    assert.equal(linear.refused, true);
    assert.equal(linear.intact, true);
    assert.equal(linear.pixels[0]?.[3], 255);
    assert.ok(Math.abs((linear.pixels[0]?.[0] ?? 0) - 241) <= 1);
    assert.ok(Math.abs((linear.pixels[0]?.[2] ?? 0) - 14) <= 1);
    assert.ok(Math.abs((linear.pixels[1]?.[0] ?? 0) - 126) <= 1);
    assert.ok(Math.abs((linear.pixels[1]?.[2] ?? 0) - 129) <= 1);
    assert.ok(Math.abs((linear.pixels[2]?.[2] ?? 0) - 241) <= 1);
    const board = fixture.project.artboards[0];
    if (!board) throw new Error("Missing gradient board");
    editScene(board.scene, fixture.shapeId, "gradients", {
      fill: {
        kind: "radial",
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        fx: 0.5,
        fy: 0.5,
        units: "objectBoundingBox",
        spread: "pad",
        stops: fixture.gradient.stops,
      },
    });
    const radialCompiled = compileInteractiveArtboard(fixture.project, fixture.boardId);
    await page.setContent(radialCompiled.svg);
    const radial = await page.evaluate(async () => {
      const api = window.EdiAssetTest,
        svg = window.document.querySelector("svg");
      if (!api || !svg) throw new Error("Missing radial SVG");
      return api.svgPixels(svg, 100, 100, [
        [50, 50],
        [95, 50],
      ]);
    });
    assert.ok((radial[0]?.[0] ?? 0) > 248 && (radial[0]?.[2] ?? 255) < 7);
    assert.ok((radial[1]?.[0] ?? 255) < 28 && (radial[1]?.[2] ?? 0) > 227);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("built gradient editor authors stops/opacity/geometry, refuses unsorted edits atomically and preserves history and recovery", {
  timeout: 60000,
}, async () => {
  const fixture = gradientFixture(),
    node = fixture.project.artboards[0]?.scene.nodes[0];
  if (!node) throw new Error("Missing shape");
  delete node.gradients;
  const server = await rendererServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((project) => {
      if (!localStorage.getItem("edisvg-project"))
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, fixture.project);
    await page.goto(server.url);
    await page.locator(`[data-layer-name="${fixture.shapeId}"]`).click();
    const form = page.getByRole("form", { name: "Gradiente de preenchimento", exact: true });
    await form
      .getByLabel("Tipo de gradiente de preenchimento", { exact: true })
      .selectOption("linear");
    await form.getByLabel("Cor 1", { exact: true }).fill("#ff0000");
    await form.getByLabel("Cor 2", { exact: true }).fill("#0000ff");
    await form
      .getByRole("button", { name: "Aplicar gradiente de preenchimento", exact: true })
      .click();
    assert.equal(await page.locator(".scene-artwork linearGradient stop").count(), 2);
    await form
      .getByRole("button", { name: "Adicionar parada de preenchimento", exact: true })
      .click();
    await form.getByLabel("Posição 2", { exact: true }).fill("0.5");
    await form.getByLabel("Posição 1", { exact: true }).fill("0.8");
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await form
      .getByRole("button", { name: "Aplicar gradiente de preenchimento", exact: true })
      .click();
    await form.getByRole("alert").filter({ hasText: "ordenadas" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await form.getByLabel("Posição 1", { exact: true }).fill("0");
    await form.getByLabel("Opacidade 3", { exact: true }).fill("0.75");
    await form
      .getByRole("button", { name: "Aplicar gradiente de preenchimento", exact: true })
      .click();
    assert.equal(await page.locator(".scene-artwork linearGradient stop").count(), 3);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator(".scene-artwork linearGradient stop").count(), 2);
    await page.locator('[data-action="redo"]').click();
    assert.equal(await page.locator(".scene-artwork linearGradient stop").count(), 3);
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.reload();
    await page.locator(".scene-artwork linearGradient").waitFor({ state: "attached" });
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stored);
    await page.locator(`[data-layer-name="${fixture.shapeId}"]`).click();
    await mkdir(resolve("../../.cache/edisvg-review"), { recursive: true });
    await form
      .getByLabel("Tipo de gradiente de preenchimento", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve("../../.cache/edisvg-review/gradient-authoring.png") });
    await form
      .getByRole("list", { name: "Paradas de preenchimento", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve("../../.cache/edisvg-review/gradient-stops.png") });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test("real SVG gradient import preserves original pixels, inheritance, style priority and template defaults while refusing unsafe/ambiguous profiles", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle(),
    server = await rendererServer(
      new Map([["/gradient-fixture.js", { content: code, mime: "text/javascript" }]]),
    );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL;
    browser = await chromium.launch(channel ? { channel } : {});
    const page = await browser.newPage(),
      requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.addScriptTag({ url: `${server.url}/gradient-fixture.js` });
    const result = await page.evaluate(async () => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing actual import API");
      const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="url(#linear)"><defs>
        <linearGradient id="linear" x2="100%" gradientTransform="translate(.1 .05)"><stop offset="0" stop-color="#f00"/><stop offset="100%" style="stop-color:rgb(0,0,255);stop-opacity:1"/></linearGradient>
        <linearGradient id="derived" href="#linear" y2="100%" gradientTransform="matrix(.9 .2 -.1 1 .1 0)"/>
        <radialGradient id="radial"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="rgba(0,0,255,0.5)" stop-opacity="0.8"/></radialGradient>
        <radialGradient id="focus" href="#radial" cx="20%"/>
      </defs><g fill="url(#derived)"><rect id="inherited" x="0" y="0" width="50" height="50"/><rect id="solid" x="50" y="0" width="50" height="50" fill="url(#linear)" style="fill:#00ff00"/></g><rect id="radial-shape" x="0" y="50" width="100" height="50" fill="url(#focus)"/></svg>`,
        imported = api.inspectSvgImport(source);
      if (!imported.scene) throw new Error(JSON.stringify(imported.report));
      const host = window.document.createElement("div");
      host.innerHTML = source;
      window.document.body.append(host);
      const original = host.querySelector("svg");
      if (!original) throw new Error("Missing original SVG");
      const points: [number, number][] = [
          [5, 5],
          [20, 20],
          [40, 30],
          [70, 20],
          [20, 75],
          [50, 75],
          [80, 75],
        ],
        expected = await api.svgPixels(original, 100, 100, points);
      host.innerHTML = api.renderScene(imported.scene);
      const normalized = host.querySelector("svg");
      if (!normalized) throw new Error("Missing normalized SVG");
      const actual = await api.svgPixels(normalized, 100, 100, points),
        focus = imported.scene.nodes
          .flatMap((node) => [node, ...node.children])
          .find((node) => node.name === "radial-shape")?.gradients?.fill;
      const unsafe = [
        `<defs><linearGradient id="g" href="https://unsafe.invalid/paint.svg#g"/></defs><rect width="100" height="100" fill="url(#g)"/>`,
        `<defs><linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/></defs>`,
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><rect id="g"/>`,
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><rect fill="url(https://unsafe.invalid/paint.svg#g)"/>`,
        `<defs><linearGradient id="g" href=""/></defs>`,
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#f008" stop-opacity="2"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>`,
        `<defs><filter id="effect"/></defs><rect width="100" height="100"/>`,
        `<defs><linearGradient id="g"><stop offset="0"><animate attributeName="stop-color"/></stop><stop offset="1"/></linearGradient></defs>`,
        `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x2="100%"><stop offset="0"/><stop offset="1"/></linearGradient></defs>`,
      ];
      const rejected = unsafe.map((body) => {
        const result = api.inspectSvgImport(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
        );
        return result.scene === null && result.report.errors > 0;
      });
      const chain = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g0"><stop offset="0"/><stop offset="1"/></linearGradient>${Array.from({ length: 9 }, (_, index) => `<linearGradient id="g${index + 1}" href="#g${index}"/>`).join("")}</defs></svg>`,
        blockedChain = api.inspectSvgImport(chain);
      return {
        expected,
        actual,
        focus,
        rejected,
        chain: blockedChain.scene === null && blockedChain.report.errors > 0,
        defs: normalized.querySelectorAll("linearGradient,radialGradient").length,
      };
    });
    for (const [index, expected] of result.expected.entries()) {
      const actual = result.actual[index];
      assert.ok(actual);
      assert.ok(
        expected.every((channel, index) => Math.abs(channel - (actual[index] ?? -1000)) <= 1),
        JSON.stringify({ expected, actual }),
      );
    }
    assert.equal(result.focus?.kind, "radial");
    if (result.focus?.kind === "radial") {
      assert.equal(result.focus.cx, 0.2);
      assert.equal(result.focus.fx, 0.2);
    }
    assert.equal(result.rejected.every(Boolean), true);
    assert.equal(result.chain, true);
    assert.equal(result.defs, 3);
    assert.equal(
      requests.some((url) => /^https?:/.test(url) && !url.startsWith(server.url)),
      false,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
});
