import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { svgEffectImportSources } from "../svgEffectImportFixture";

test("built file import keeps native source choices, independent duplication, undo/recovery and offline HTML artwork", {
  timeout: 60000,
}, async () => {
  const source = svgEffectImportSources[1];
  assert.ok(source);
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
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="import-svg"]').first().click();
    const dialog = page.getByRole("dialog", { name: "Importar SVG", exact: true });
    await dialog.locator('input[name="svg-file"]').setInputFiles({
      name: "Recorte.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(source),
    });
    await dialog.getByRole("button", { name: "Importar nova prancheta", exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards.length === 2,
    );
    const importedText = await page.evaluate(() => localStorage.getItem("edisvg-project")),
      project = parseProject(JSON.parse(importedText ?? "null")),
      board = project.artboards[1],
      target = board?.scene.nodes[0],
      sourceId = target?.effects?.clip?.sourceId;
    assert.ok(board && target && sourceId);
    assert.equal(target.children.find((node) => node.id === sourceId)?.tag, "circle");
    await page.locator(`[data-scene-select="${target.id}"]`).click();
    const panel = page.getByRole("region", { name: "Recortes e máscaras", exact: true });
    assert.equal(
      await panel.getByRole("combobox", { name: "Fonte do recorte", exact: true }).inputValue(),
      sourceId,
    );
    await page.locator(`[data-scene-select="${sourceId}"]`).click();
    await page.locator("[data-scene-visible]").click();
    const shown = await page.evaluate(() => localStorage.getItem("edisvg-project")),
      circle = page.locator(`[data-object="${sourceId}"]>circle`),
      positions = await circle.evaluate((shape) => {
        if (!(shape instanceof SVGCircleElement)) throw new Error("Missing native circle");
        const matrix = shape.getScreenCTM();
        if (!matrix) throw new Error("Missing native screen matrix");
        const start = new DOMPoint(40, 40).matrixTransform(matrix),
          end = new DOMPoint(60, 40).matrixTransform(matrix);
        return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }),
      live = page.locator(".scene-artwork [data-edi-live-effects] clipPath circle").first(),
      originalTransform = await live.getAttribute("transform");
    await page.mouse.move(positions.start.x, positions.start.y);
    await page.mouse.down();
    await page.mouse.move(positions.end.x, positions.end.y, { steps: 4 });
    assert.notEqual(await live.getAttribute("transform"), originalTransform);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), shown);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await live.getAttribute("transform"), originalTransform);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), importedText);
    await page.locator(`[data-scene-select="${target.id}"]`).click();
    await page.locator('[data-scene-operation="duplicate"]').click();
    const duplicated = parseProject(
        await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      ),
      duplicate = duplicated.artboards[1]?.scene.nodes.find(
        (node) => node.id !== target.id && node.name === `${target.name} (cópia)`,
      );
    assert.ok(duplicate?.effects?.clip);
    assert.notEqual(duplicate.effects.clip.sourceId, sourceId);
    assert.ok(
      duplicate.children.some(
        (node) => node.id === duplicate.effects?.clip?.sourceId && node.tag === "circle",
      ),
    );
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), importedText);
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    await page.locator('[data-action="redo"]').click();
    await page.reload();
    await page.locator('[data-action="artboards"]').click();
    await page.locator(`[data-artboard-select="${board.id}"]`).click();
    await page.locator('[data-action="hierarchy"]').click();
    await page.locator(`[data-scene-select="${target.id}"]`).click();
    assert.equal(
      await panel.getByRole("combobox", { name: "Fonte do recorte", exact: true }).inputValue(),
      sourceId,
    );
    await page.locator('[data-action="test"]').click();
    const testing = page.getByRole("dialog", { name: "Testar interação", exact: true });
    await testing
      .locator("[data-edi-live-effects] clipPath circle")
      .first()
      .waitFor({ state: "attached" });
    await testing.screenshot({ path: "../../.cache/edisvg-review/svg-effect-import.png" });
    await testing.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), importedText);
    const html = buildInteractiveExport(
        project,
        {
          format: "interactive-html",
          alt: "Recortes portáteis",
          reduced: false,
          offscreen: false,
          artboardId: board.id,
        },
        await readFile("out/renderer/edi-player.global.js", "utf8"),
      ),
      offline = await browser.newPage(),
      requests: string[] = [];
    offline.on("request", (request) => requests.push(request.url()));
    offline.on("pageerror", (error) => errors.push(error.message));
    await offline.setContent(html.content);
    await offline
      .locator("[data-edi-live-effects] clipPath circle")
      .first()
      .waitFor({ state: "attached" });
    assert.equal(await offline.locator("#player-status").textContent(), "");
    await offline.addScriptTag({ content: await assetTestBundle() });
    const pixels = await offline.evaluate(async (source) => {
      const reference = document.createElement("div");
      reference.innerHTML = source;
      document.body.append(reference);
      const original = reference.querySelector("svg"),
        artwork = document.querySelector("#edi-artwork>svg"),
        api = window.EdiAssetTest;
      if (!api || !original || !(artwork instanceof SVGSVGElement))
        throw new Error("Missing offline drawing");
      const points: [number, number][] = [];
      for (let y = 2; y < 115; y += 7) for (let x = 2; x < 175; x += 7) points.push([x, y]);
      return {
        expected: await api.svgPixels(original, 180, 120, points),
        actual: await api.svgPixels(artwork, 180, 120, points),
      };
    }, source);
    for (const [index, pixel] of pixels.actual.entries())
      assert.ok(
        pixel.every(
          (value, channel) => Math.abs(value - (pixels.expected[index]?.[channel] ?? -1000)) <= 1,
        ),
      );
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await offline.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("imported native silhouettes retain original SVG pixels in isolated players and restore their hosts", {
  timeout: 60000,
}, async () => {
  const cases = [
      { tag: "circle", shape: '<circle cx="40" cy="50" r="28"/>', mask: false },
      {
        tag: "ellipse",
        shape: '<ellipse cx="40" cy="50" rx="28" ry="21" opacity="0.5"/>',
        mask: true,
      },
      { tag: "rect", shape: '<rect x="12" y="20" width="56" height="60" rx="12"/>', mask: false },
      { tag: "polygon", shape: '<polygon points="12 20 65 25 50 80 15 70"/>', mask: false },
      {
        tag: "path",
        shape: '<path d="M12 50A28 24 0 1 1 68 50A28 24 0 1 1 12 50Z"/>',
        mask: false,
      },
    ],
    server = await rendererServer(
      new Map([
        [
          "/native-effects.html",
          {
            content: "<main></main>",
            mime: "text/html",
          },
        ],
      ]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/native-effects.html`);
    await page.addScriptTag({ content: code });
    for (const profile of cases) {
      const kind = profile.mask ? "mask" : "clipPath",
        attrs = profile.mask
          ? 'maskUnits="userSpaceOnUse" x="0" y="0" width="150" height="100" mask-type="alpha"'
          : "",
        source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120"><defs><${kind} id="cut" ${attrs}>${profile.shape}</${kind}></defs><g opacity="0.75" transform="translate(5 10)" ${profile.mask ? "mask" : "clip-path"}="url(#cut)"><rect width="150" height="100" fill="#e33a60"/></g></svg>`,
        scene = await page.evaluate((source) => {
          const result = window.EdiAssetTest?.inspectSvgImport(source);
          if (!result?.scene) throw new Error(JSON.stringify(result?.report));
          return result.scene;
        }, source),
        project = newProject(),
        board = project.artboards[0];
      if (!board) throw new Error("Missing imported board");
      board.scene = scene;
      const target = scene.nodes[0],
        effect = target?.effects?.clip ?? target?.effects?.mask;
      if (!target || !effect) throw new Error("Missing imported local effect");
      project.motion.animations.push({
        id: "animation-imported-effect",
        name: "Native silhouette",
        fps: 10,
        frames: 10,
        mode: "once",
        tracks: [
          {
            id: "track-imported-x",
            targetId: effect.sourceId,
            property: "x",
            keys: [
              { id: "key-imported-a", frame: 0, value: 0, easing: "linear" },
              { id: "key-imported-b", frame: 10, value: 40, easing: "linear" },
            ],
          },
        ],
      });
      const compiled = compileInteractiveArtboard(parseProject(project), board.id, {
          animationId: "animation-imported-effect",
        }),
        before = JSON.stringify(compiled.document);
      const result = await page.evaluate(
        async ({ blueprint, source, tag, targetId }) => {
          const api = window.EdiAssetTest;
          if (!api) throw new Error("Missing real runtime");
          const reference = document.createElement("div"),
            first = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
            second = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          reference.innerHTML = source;
          document.body.append(reference, first, second);
          const original = reference.querySelector("svg");
          if (!original) throw new Error("Missing original SVG");
          const beforeFirst = first.outerHTML,
            beforeSecond = second.outerHTML,
            options = { autoplay: false, pauseOffscreen: false, respectReducedMotion: false },
            firstPlayer = await api.createVisualSvgPlayerAsync(first, blueprint, options),
            secondPlayer = await api.createVisualSvgPlayerAsync(second, blueprint, options);
          try {
            const firstSvg = first,
              secondSvg = second;
            const points: [number, number][] = [];
            for (let y = 2; y < 115; y += 7) for (let x = 2; x < 175; x += 7) points.push([x, y]);
            const initial = await api.svgPixels(original, 180, 120, points);
            firstPlayer.advance(0.5);
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const native = original.querySelector(`defs > * > ${tag}`);
            if (!native) throw new Error("Missing native original definition");
            native.setAttribute("transform", "translate(20 0)");
            const expected = await api.svgPixels(original, 180, 120, points),
              actual = await api.svgPixels(firstSvg, 180, 120, points),
              independent = await api.svgPixels(secondSvg, 180, 120, points),
              firstRef =
                firstSvg
                  .querySelector(`[data-edi-object="${targetId}"]`)
                  ?.getAttribute("clip-path") ??
                firstSvg.querySelector(`[data-edi-object="${targetId}"]`)?.getAttribute("mask"),
              secondRef =
                secondSvg
                  .querySelector(`[data-edi-object="${targetId}"]`)
                  ?.getAttribute("clip-path") ??
                secondSvg.querySelector(`[data-edi-object="${targetId}"]`)?.getAttribute("mask"),
              nativeTag = firstSvg.querySelector(`[data-edi-live-effects] ${tag}`)?.tagName;
            firstPlayer.reset();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const reset = await api.svgPixels(firstSvg, 180, 120, points);
            await firstPlayer.destroyAsync();
            await secondPlayer.destroyAsync();
            return {
              initial,
              expected,
              actual,
              independent,
              reset,
              separate: firstRef !== secondRef,
              nativeTag,
              cleaned: first.outerHTML === beforeFirst && second.outerHTML === beforeSecond,
            };
          } finally {
            await firstPlayer.destroyAsync();
            await secondPlayer.destroyAsync();
            reference.remove();
            first.remove();
            second.remove();
          }
        },
        { blueprint: compiled.document, source, tag: profile.tag, targetId: target.id },
      );
      assert.equal(result.nativeTag, profile.tag);
      assert.equal(result.separate, true);
      assert.equal(result.cleaned, true);
      assert.notDeepEqual(result.actual, result.initial);
      assert.ok(result.expected.filter((pixel) => (pixel[3] ?? 0) > 0).length > 20);
      for (const [actual, expected] of [
        [result.actual, result.expected],
        [result.independent, result.initial],
        [result.reset, result.initial],
      ]) {
        assert.ok(actual && expected);
        for (const [index, pixel] of actual.entries()) {
          const reference = expected[index],
            alpha = pixel[3] ?? 0,
            referenceAlpha = reference?.[3] ?? -1000;
          // Straight RGB is undefined on transparent pixels. Compare visible
          // premultiplied color and keep alpha within one channel unit.
          assert.ok(
            Math.abs(alpha - referenceAlpha) <= 1 &&
              [0, 1, 2].every(
                (channel) =>
                  Math.abs(
                    (pixel[channel] ?? 0) * alpha - (reference?.[channel] ?? 0) * referenceAlpha,
                  ) /
                    255 <=
                  2,
              ),
            JSON.stringify({ tag: profile.tag, index, pixel, expected: reference }),
          );
        }
      }
      assert.equal(JSON.stringify(compiled.document), before);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("real SVG clip/alpha-mask import preserves local transforms, native arcs, winding, group alpha and independent reusable sources", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([["/effect-import.html", { content: "<main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/effect-import.html`);
    await page.addScriptTag({ content: code });
    const results = await page.evaluate(async (sources) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing actual effect importer");
      const results = [];
      for (const source of sources) {
        const reference = document.createElement("div"),
          host = document.createElement("div");
        reference.innerHTML = source;
        document.body.append(reference, host);
        try {
          const original = reference.querySelector("svg"),
            imported = api.inspectSvgImport(source);
          if (!original || !imported.scene) throw new Error(JSON.stringify(imported.report));
          host.innerHTML = api.renderScene(imported.scene);
          const svg = host.querySelector("svg");
          if (!svg) throw new Error("Missing imported effect artwork");
          const points: [number, number][] = [];
          for (let y = 2; y < 115; y += 7) for (let x = 2; x < 175; x += 7) points.push([x, y]);
          const expected = await api.svgPixels(original, 180, 120, points),
            actual = await api.svgPixels(svg, 180, 120, points);
          results.push({
            scene: imported.scene,
            report: imported.report,
            expected,
            actual,
          });
        } finally {
          reference.remove();
          host.remove();
        }
      }
      return results;
    }, svgEffectImportSources);
    for (const [index, result] of results.entries()) {
      assert.equal(result.report.errors, 0);
      assert.ok(result.expected.filter((pixel) => (pixel[3] ?? 0) > 0).length > 20);
      for (const [point, expected] of result.expected.entries()) {
        const actual = result.actual[point];
        assert.ok(actual);
        assert.ok(
          actual.every((value, channel) => Math.abs(value - (expected[channel] ?? -1000)) <= 1),
          JSON.stringify({
            index,
            point,
            actual,
            expected,
          }),
        );
      }
    }
    const second = results[1];
    assert.ok(second);
    const sources = second.scene.nodes.map((node) => node.effects?.clip?.sourceId);
    assert.equal(new Set(sources).size, 2);
    assert.ok(
      second.scene.nodes.every((node) =>
        node.children.some(
          (child) => child.visible === false && child.tag === "circle" && child.attrs.r === "28",
        ),
      ),
    );
    const first = results[0]?.scene.nodes[0];
    assert.ok(first);
    assert.deepEqual(first.semantics, { kind: "image", label: "Arte recortada" });
    assert.equal(first.tag, "g");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("SVG effect import refuses unsafe/ambiguous/oversized profiles atomically and keeps fatal errors visible after warning limits", {
  timeout: 60000,
}, async () => {
  const wrap = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
    path = '<path d="M2 2H8V8H2Z"/>',
    target = '<rect width="10" height="10" clip-path="url(#cut)"/>',
    maskTarget = '<rect width="10" height="10" mask="url(#cut)"/>',
    mask = (attrs: string, child = path) =>
      `<defs><mask id="cut" ${attrs}>${child}</mask></defs>${maskTarget}`,
    validMask = 'maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10" mask-type="alpha"',
    cases = [
      wrap(
        `<defs><clipPath id="cut" clipPathUnits="objectBoundingBox">${path}</clipPath></defs>${target}`,
      ),
      wrap(`<defs><clipPath id="cut"><use href="#elsewhere"/></clipPath></defs>${target}`),
      wrap(`<defs><clipPath id="cut"><g>${path}</g></clipPath></defs>${target}`),
      wrap(`<defs><clipPath id="cut"><script>bad()</script></clipPath></defs>${target}`),
      wrap(
        `<defs><clipPath id="cut"><path d="M0 0H10V10Z" onload="bad()"/></clipPath></defs>${target}`,
      ),
      wrap(`<defs><clipPath id="cut" clip-path="url(#cut)">${path}</clipPath></defs>${target}`),
      wrap(`<defs><clipPath id="cut">${path}${path}</clipPath></defs>${target}`),
      wrap(
        `<defs><clipPath id="cut"><path xmlns="urn:foreign" d="M0 0H10V10Z"/></clipPath></defs>${target}`,
      ),
      wrap(`<defs><clipPath id="cut"><path id="cut" d="M0 0H10V10Z"/></clipPath></defs>${target}`),
      wrap(
        `<defs><clipPath id="cut"><path d="M0 0H10V10Z" visibility="hidden"/></clipPath></defs>${target}`,
      ),
      wrap(
        `<defs><clipPath id="cut"><path d="M0 0H10V10Z" style="fill:red;background:url(https://example.com/x)"/></clipPath></defs>${target}`,
      ),
      wrap('<rect clip-path="url(#missing)"/>'),
      wrap('<rect clip-path="url(https://example.com/cut)"/>'),
      wrap(`<defs><clipPath id="cut">${path}</clipPath></defs>${maskTarget}`),
      wrap(mask('maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10"')),
      wrap(mask(validMask.replace('mask-type="alpha"', 'mask-type="luminance"'))),
      wrap(mask(validMask.replace('maskUnits="userSpaceOnUse"', 'maskUnits="objectBoundingBox"'))),
      wrap(mask(`${validMask} maskContentUnits="objectBoundingBox"`)),
      wrap(mask(validMask.replace('width="10"', 'width="4"'))),
      wrap(mask(validMask.replace('width="10"', 'width="100%"'))),
      wrap(mask(validMask, '<path d="M2 2H8V8Z" fill="url(#gradient)"/>')),
      wrap(mask(validMask, '<path d="M2 2H8V8Z" fill="white" stroke="red"/>')),
      wrap(mask(`${validMask} opacity="0.5"`)),
      wrap(
        `<defs><clipPath id="cut"><polygon points="${"1 1 ".repeat(4001)}"/></clipPath></defs>${target}`,
      ),
      wrap(`<defs><clipPath id="cut">${path}</clipPath></defs>${target.repeat(257)}`),
    ],
    generated = wrap(
      `<defs><clipPath id="cut">${path}</clipPath></defs>${Array.from({ length: 1500 }, (_, index) => (index < 256 ? target : '<rect width="10" height="10"/>')).join("")}`,
    ),
    server = await rendererServer(
      new Map([["/effect-adversarial.html", { content: "<main></main>", mime: "text/html" }]]),
    ),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/effect-adversarial.html`);
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      ({ sources, generated }) => {
        const api = window.EdiAssetTest;
        if (!api) throw new Error("Missing real effect parser");
        const invalid = sources.map((source) => api.inspectSvgImport(source)),
          excessive = api.inspectSvgImport(generated);
        return {
          rejected: invalid.map((item) => item.scene === null && item.report.errors > 0),
          excessive,
          bounded: invalid.every(
            (item) =>
              item.report.issues.length <= 100 &&
              item.report.issues.every((issue) => issue.message.length <= 2000),
          ),
        };
      },
      { sources: cases, generated },
    );
    assert.equal(result.rejected.every(Boolean), true, JSON.stringify(result.rejected));
    assert.equal(result.bounded, true);
    assert.equal(result.excessive.scene, null);
    assert.ok(result.excessive.report.warnings > 100);
    assert.ok(result.excessive.report.omitted > 0);
    assert.equal(result.excessive.report.issues[0]?.severity, "error");
    assert.match(result.excessive.report.issues[0]?.message ?? "", /2000/);
  } finally {
    await browser.close();
    await server.close();
  }
});
