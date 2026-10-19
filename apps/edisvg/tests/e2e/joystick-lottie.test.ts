import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { compileLottie } from "../../src/shared/lottie/compile";
import { assetTestBundle } from "../assetBundle";
import { joystickFixture } from "../joystickFixture";
import { compareLottiePixels } from "../lottiePixels";
import { rendererServer } from "../rendererServer";

test("sampled joystick/IK/skinned cubic path agrees with independent Lottie SVG light on forward and backward frames", {
  timeout: 60_000,
}, async () => {
  const fixture = joystickFixture({ animated: true }),
    project = fixture.project(),
    before = JSON.stringify(project),
    blueprint = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.clipId,
    }),
    lottie = compileLottie(project, {
      artboardId: fixture.boardId,
      animationId: fixture.clipId,
      confirmSampling: true,
      confirmRendererPrecision: true,
    }),
    require = createRequire(import.meta.url),
    light = await readFile(require.resolve("lottie-web/build/player/lottie_light.js"), "utf8"),
    code = await assetTestBundle(),
    server = await rendererServer(
      new Map([
        [
          "/joystick.html",
          {
            mime: "text/html",
            content: '<main id="edi"><svg></svg></main><main id="lottie"></main>',
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
    await page.goto(`${server.url}/joystick.html`);
    await page.addScriptTag({ content: code });
    await page.addScriptTag({ content: light });
    const result = await compareLottiePixels(page, {
      blueprint: blueprint.document,
      animation: lottie.document,
      frames: [0, 2, 5, 9, 10, 5, 0],
      strokes: true,
      checkPrecision: false,
    });
    assert.equal(result.loaded, true);
    assert.ok(result.painted > 20);
    assert.deepEqual(result.differences, []);
    assert.deepEqual(errors, []);
    assert.equal(JSON.stringify(project), before);
  } finally {
    await browser.close();
    await server.close();
  }
});
