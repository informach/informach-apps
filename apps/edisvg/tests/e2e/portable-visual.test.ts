import assert from "node:assert/strict";
import { test } from "node:test";
import { describeVisualDocument, serializeVisualElement } from "@informach/edi-motion/visual";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { gradientFixture } from "../gradientFixture";
import { legacyInteractive } from "../legacyInteractive";
import { portableVisualFixture } from "../portableVisualFixture";
import { vectorEffectFixture } from "../vectorEffectFixture";

test("portable native SVG arcs retain original pixels in both shape and live clip, and pre-aborted mounting preserves the host", {
  timeout: 60000,
}, async () => {
  const fixture = vectorEffectFixture(),
    board = fixture.project.artboards[0];
  if (!board) throw new Error("Missing arc board");
  const arc = "M10 50A40 40 0 1 0 90 50A40 40 0 1 0 10 50Z";
  editScene(board.scene, fixture.sourceId, "attrs", { d: arc });
  editScene(board.scene, fixture.sourceId, "transform", { x: 0, y: 0, opacity: 100 });
  editScene(board.scene, fixture.targetId, "effects", {
    clip: { sourceId: fixture.sourceId, rule: "nonzero" },
  });
  const compiled = compileInteractiveArtboard(fixture.project, board.id),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<main id="host"><svg><title>Original</title></svg></main><div id="reference"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="original-clip"><path d="${arc}"/></clipPath></defs><rect width="100" height="100" fill="#ff0000" clip-path="url(#original-clip)"/></svg></div>`,
    );
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, sourceId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("#host>svg"),
          reference = document.querySelector("#reference>svg");
        if (!api || !(svg instanceof SVGSVGElement) || !(reference instanceof SVGSVGElement))
          throw new Error("Missing native arc fixture");
        const before = svg.outerHTML,
          abort = new AbortController();
        abort.abort();
        let canceled = false;
        try {
          await api.createVisualSvgPlayerAsync(svg, blueprint, { autoplay: false }, abort.signal);
        } catch (error) {
          canceled = error instanceof DOMException && error.name === "AbortError";
        }
        const preserved = svg.outerHTML === before,
          player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
        try {
          const points: [number, number][] = [
              [10, 50],
              [11, 43],
              [22, 22],
              [49, 10],
              [50, 50],
              [89, 50],
              [95, 50],
            ],
            actual = await api.svgPixels(svg, 100, 100, points),
            expected = await api.svgPixels(reference, 100, 100, points),
            sourceD = svg.querySelector(`[data-edi-object="${sourceId}"]>path`)?.getAttribute("d"),
            clipD = svg.querySelector("[data-edi-live-effects] clipPath path")?.getAttribute("d");
          return { actual, expected, sourceD, clipD, canceled, preserved };
        } finally {
          await player.destroyAsync();
        }
      },
      { blueprint: compiled.document, sourceId: fixture.sourceId },
    );
    assert.equal(result.canceled, true);
    assert.equal(result.preserved, true);
    assert.equal(result.sourceD, arc);
    assert.equal(result.clipD, arc);
    assert.deepEqual(result.actual, result.expected);
  } finally {
    await browser.close();
  }
});

test("portable SVG ownership refuses competing loads, releases canceled resources and permits remount after destroy", {
  timeout: 60000,
}, async () => {
  const fixture = portableVisualFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent('<svg viewBox="0 0 3 3"><title>Owned host</title></svg>');
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, fontId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("svg");
        if (!api || !svg) throw new Error("Missing ownership fixture");
        const original = svg.outerHTML,
          abort = new AbortController(),
          pending = api.createVisualSvgPlayerAsync(
            svg,
            blueprint,
            { autoplay: false },
            abort.signal,
          );
        let competingPending = false;
        try {
          await api.createVisualSvgPlayerAsync(svg, blueprint, { autoplay: false });
        } catch (error) {
          competingPending = error instanceof Error && error.message.includes("montagem visual");
        }
        abort.abort();
        let canceled = false;
        try {
          await pending;
        } catch (error) {
          canceled = error instanceof DOMException && error.name === "AbortError";
        }
        const canceledHost = svg.outerHTML === original,
          canceledFonts = ![...document.fonts].some((font) => font.family === `edi-${fontId}`),
          first = await api.createVisualSvgPlayerAsync(svg, blueprint, { autoplay: false }),
          mounted = svg.outerHTML;
        let competingActive = false;
        try {
          await api.createVisualSvgPlayerAsync(svg, blueprint, { autoplay: false });
        } catch (error) {
          competingActive = error instanceof Error && error.message.includes("montagem visual");
        }
        const activePreserved = svg.outerHTML === mounted;
        await first.destroyAsync();
        const restored = svg.outerHTML === original,
          second = await api.createVisualSvgPlayerAsync(svg, blueprint, { autoplay: false });
        await second.destroyAsync();
        return {
          competingPending,
          canceled,
          canceledHost,
          canceledFonts,
          competingActive,
          activePreserved,
          restored,
          remounted: svg.outerHTML === original,
        };
      },
      { blueprint: compiled.document, fontId: fixture.font.id },
    );
    assert.deepEqual(result, {
      competingPending: true,
      canceled: true,
      canceledHost: true,
      canceledFonts: true,
      competingActive: true,
      activePreserved: true,
      restored: true,
      remounted: true,
    });
  } finally {
    await browser.close();
  }
});

test("portable player builds actual validated graphics from one root catalog, loads fonts/PNG, emits muted captions and restores host ownership", {
  timeout: 60000,
}, async () => {
  const fixture = portableVisualFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
      animationId: fixture.animationId,
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  assert.equal(fixture.project.assets.length, 4);
  assert.equal(compiled.document.assets?.length, 3);
  assert.equal(compiled.document.audioAssets, undefined);
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      '<svg viewBox="0 0 3 3"><title>Host title</title><g id="host-original"></g></svg>',
    );
    await page.addScriptTag({ content: code });
    const result = await page.evaluate(
      async ({ blueprint, fontId, sourceId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("svg");
        if (!api || !svg) throw new Error("Missing portable loader");
        const original = [...svg.childNodes],
          originalBox = svg.getAttribute("viewBox"),
          captions: string[] = [];
        const player = await api.createVisualSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
          onAudioCue(cue) {
            captions.push(cue.caption);
          },
        });
        const loaded = [...document.fonts].some(
          (font) => font.family === `edi-${fontId}` && font.status === "loaded",
        );
        player.advance(0.5);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const pixels = await api.svgPixels(svg, 100, 100, [
            [20, 50],
            [40, 50],
            [60, 50],
          ]),
          imageDefinitions = svg.querySelectorAll("defs image").length,
          slices = svg.querySelectorAll("[data-edi-slice]>svg").length,
          nativeD = svg.querySelector(`[data-edi-object="${sourceId}"]>path`)?.getAttribute("d"),
          fontCss = [...svg.querySelectorAll("style")].some((style) =>
            style.textContent?.includes("@font-face"),
          );
        await player.destroyAsync();
        const restored =
            original.every((node, index) => svg.childNodes[index] === node) &&
            svg.childNodes.length === original.length &&
            svg.getAttribute("viewBox") === originalBox,
          releasedFont = ![...document.fonts].some((font) => font.family === `edi-${fontId}`);
        return {
          pixels,
          loaded,
          captions,
          imageDefinitions,
          slices,
          nativeD,
          fontCss,
          restored,
          releasedFont,
        };
      },
      { blueprint: compiled.document, fontId: fixture.font.id, sourceId: fixture.sourceId },
    );
    assert.equal(result.loaded, true);
    assert.equal(result.releasedFont, true);
    assert.equal(result.restored, true);
    assert.equal(result.imageDefinitions, 1);
    assert.equal(result.slices, 9);
    assert.equal(result.fontCss, false);
    assert.deepEqual(result.captions, ["Confirmação portátil"]);
    assert.deepEqual(
      result.pixels.map((pixel) => pixel[3]),
      [0, 64, 64],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("historical interactive blueprints v1 through v8 still run, including v5 CSS fonts, nine-slice, PCM and live effects", {
  timeout: 60000,
}, async () => {
  const plain = gradientFixture();
  const shape = plain.project.artboards[0]?.scene.nodes[0];
  if (!shape) throw new Error("Missing legacy shape");
  delete shape.gradients;
  const basic = compileInteractiveArtboard(plain.project, plain.boardId, {
      animationId: "animation-gradient",
    }),
    full = portableVisualFixture(),
    fullCompiled = compileInteractiveArtboard(full.project, full.boardId, {
      animationId: full.animationId,
    }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addScriptTag({ content: code });
    for (const version of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      await page.setContent(basic.svg);
      const result = await page.evaluate(
        async (blueprint) => {
          const api = window.EdiAssetTest,
            svg = document.querySelector("svg");
          if (!api || !svg) throw new Error("Missing legacy player");
          const player = await api.createInteractiveSvgPlayerAsync(svg, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
          player.advance(0.25);
          const time = player.time;
          await player.destroyAsync();
          return time;
        },
        legacyInteractive(basic.document, version),
      );
      assert.equal(result, 0.25);
    }
    await page.setContent(
      serializeVisualElement(
        describeVisualDocument(fullCompiled.document, { embeddedFonts: true }),
      ),
    );
    const result = await page.evaluate(
      async ({ blueprint, fontId }) => {
        const api = window.EdiAssetTest,
          svg = document.querySelector("svg"),
          captions: string[] = [];
        if (!api || !svg) throw new Error("Missing legacy graphics");
        const player = await api.createInteractiveSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
          onAudioCue(cue) {
            captions.push(cue.caption);
          },
        });
        player.advance(0.5);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const pixels = await api.svgPixels(svg, 100, 100, [
            [20, 50],
            [40, 50],
            [60, 50],
          ]),
          font = [...document.fonts].some(
            (font) =>
              font.family.replace(/^["']|["']$/g, "") === `edi-${fontId}` &&
              font.status === "loaded",
          ),
          slices = svg.querySelectorAll("[data-edi-slice]>svg").length;
        await player.destroyAsync();
        return { pixels, font, slices, captions };
      },
      { blueprint: legacyInteractive(fullCompiled.document, 5), fontId: full.font.id },
    );
    assert.deepEqual(
      result.pixels.map((pixel) => pixel[3]),
      [0, 64, 64],
    );
    assert.equal(result.font, true);
    assert.equal(result.slices, 9);
    assert.deepEqual(result.captions, ["Confirmação portátil"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
