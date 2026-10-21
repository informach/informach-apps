import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { compileLottie } from "../../src/shared/lottie/compile";
import type { Project } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { compareLottiePixels } from "../lottiePixels";
import { rendererServer } from "../rendererServer";
import { trimFixture } from "../trimFixture";

/** Original fixture (end 0→1, empty first frame) and a sequential, wrapping, two-contour one. */
function fixtures(): { name: string; project: Project; boardId: string; animationId: string }[] {
  const drawn = trimFixture(),
    sequential = trimFixture();
  sequential.run([
    {
      type: "scene",
      operation: "attrs",
      targetId: sequential.shapeId,
      value: { d: "M20 40 C80 10 160 70 220 40 M20 120 C80 150 160 90 220 120" },
    },
  ]);
  const rig = sequential.project().artboards[0]?.rig;
  if (!rig) throw new Error("Missing trim rig");
  const value = structuredClone(rig);
  for (const trim of value.trims ?? []) Object.assign(trim, { mode: "sequential", offset: 250 });
  sequential.run([{ type: "rig", operation: "replace", value }]);
  return [drawn, sequential].map((fixture, index) => ({
    name: index ? "sequential" : "drawn",
    project: fixture.project(),
    boardId: fixture.boardId,
    animationId: fixture.animationId,
  }));
}

test("the sampled SVG export steps trim exactly at every frame like the shared player", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(
      new Map([
        [
          "/trim.html",
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
    await page.goto(`${server.url}/trim.html`);
    await page.addScriptTag({ content: code });
    for (const fixture of fixtures()) {
      const exported = buildClipExport(
          fixture.project,
          fixture.animationId,
          {
            format: "svg",
            alt: "Trim",
            reduced: false,
            offscreen: false,
            artboardId: fixture.boardId,
          },
          "",
        ),
        compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
          animationId: fixture.animationId,
        });
      assert.match(
        exported.content,
        /<animate attributeName="d"[^>]*calcMode="discrete"[^>]*keyTimes=/,
      );
      // SMIL state lives in the document timeline, not in serialized markup: compare what the
      // page actually paints for the paused export and for the live shared player.
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
            "trimPlayer",
            await api.createVisualSvgPlayerAsync(live, blueprint, {
              autoplay: false,
              pauseOffscreen: false,
              respectReducedMotion: false,
            }),
          );
        },
        { markup: exported.content, blueprint: compiled.document },
      );
      const result: { frame: number; mismatches: number; painted: number }[] = [];
      let previous = 0;
      for (const frame of [0, 2, 5, 7, 10]) {
        await page.evaluate(
          ({ delta, time }) => {
            Reflect.get(window, "trimPlayer").advance(delta);
            const smil = document.querySelector("#smil>svg");
            if (!(smil instanceof SVGSVGElement)) throw new Error("Missing exported SVG");
            // Just after the frame's keyTime: the discrete value of that frame is active.
            smil.setCurrentTime(time);
          },
          { delta: (frame - previous) / 10, time: frame / 10 + 0.001 },
        );
        previous = frame;
        const [expected, actual] = await Promise.all([
            page.locator("#live>svg").screenshot(),
            page.locator("#smil>svg").screenshot(),
          ]),
          stats = await page.evaluate(
            async ({ a, b }) => {
              const read = await Promise.all(
                [a, b].map(async (source) => {
                  const bitmap = await createImageBitmap(await (await fetch(source)).blob()),
                    canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
                    context = canvas.getContext("2d");
                  if (!context) throw new Error("Missing canvas");
                  context.drawImage(bitmap, 0, 0);
                  return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
                }),
              );
              const [left, right] = read;
              if (!left || !right) throw new Error("Missing captures");
              let mismatches = 0,
                painted = 0;
              for (let offset = 0; offset < left.length; offset += 4) {
                if ((left[offset] ?? 255) < 250) painted++;
                for (let channel = 0; channel < 3; channel++)
                  if (
                    Math.abs((left[offset + channel] ?? 0) - (right[offset + channel] ?? 0)) > 2
                  ) {
                    mismatches++;
                    break;
                  }
              }
              return { mismatches, painted };
            },
            {
              a: `data:image/png;base64,${expected.toString("base64")}`,
              b: `data:image/png;base64,${actual.toString("base64")}`,
            },
          );
        result.push({ frame, ...stats });
      }
      await page.evaluate(() => Reflect.get(window, "trimPlayer").destroyAsync());
      for (const frame of result)
        assert.equal(frame.mismatches, 0, `${fixture.name} frame ${frame.frame}`);
      assert.equal(
        result[0]?.painted,
        fixture.name === "drawn" ? 0 : result[0]?.painted,
        "first frame is empty",
      );
      assert.ok((result.at(-1)?.painted ?? 0) > 20, `${fixture.name}: last frame draws the path`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Lottie samples trim with hold keys that lottie-web draws like the shared player", {
  timeout: 60000,
}, async () => {
  const require = createRequire(import.meta.url),
    light = await readFile(require.resolve("lottie-web/build/player/lottie_light.js"), "utf8"),
    code = await assetTestBundle(),
    server = await rendererServer(
      new Map([
        [
          "/lottie-trim.html",
          {
            content: '<main id="edi"><svg></svg></main><main id="lottie"></main>',
            mime: "text/html",
          },
        ],
      ]),
    ),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.url}/lottie-trim.html`);
    await page.addScriptTag({ content: code });
    await page.addScriptTag({ content: light });
    for (const fixture of fixtures()) {
      const exported = compileLottie(fixture.project, {
          artboardId: fixture.boardId,
          animationId: fixture.animationId,
          alt: "Trim",
          confirmSampling: true,
          confirmRendererPrecision: true,
        }),
        shapes = JSON.stringify(exported.document);
      assert.match(shapes, /"h":1/);
      const compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
          animationId: fixture.animationId,
        }),
        result = await compareLottiePixels(page, {
          blueprint: compiled.document,
          animation: exported.document,
          strokes: true,
          checkPrecision: false,
          frames: [0, 2, 5, 7, 10],
        });
      assert.equal(result.loaded, true);
      assert.ok(result.painted > 20, `${fixture.name}: painted ${result.painted}`);
      // Same per-pixel bounds as the Lottie fidelity suite. Cubic pieces cut at arbitrary
      // parameters add sparse edge antialiasing differences in lottie-web (its float precision,
      // covered by the renderer-precision consent), so only the count of edge samples is wider.
      assert.ok(
        result.differenceCount <= 40,
        `${fixture.name}: ${result.differenceCount} ${JSON.stringify(result.differences.slice(0, 4))}`,
      );
      for (const difference of result.differences) {
        const actualAlpha = difference.actual[3] ?? 0,
          expectedAlpha = difference.expected[3] ?? 0;
        assert.ok(
          Math.abs(actualAlpha - expectedAlpha) <= 20,
          `${fixture.name}: ${JSON.stringify(difference)}`,
        );
        for (let channel = 0; channel < 3; channel++) {
          const actual = difference.actual[channel] ?? 0,
            expected = difference.expected[channel] ?? 0;
          assert.ok(
            Math.abs(actual * actualAlpha - expected * expectedAlpha) / 255 <= 15,
            `${fixture.name}: ${JSON.stringify(difference)}`,
          );
          if (actualAlpha >= 240 && expectedAlpha >= 240)
            assert.ok(
              Math.abs(actual - expected) <= 2,
              `${fixture.name}: opaque ${JSON.stringify(difference)}`,
            );
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
