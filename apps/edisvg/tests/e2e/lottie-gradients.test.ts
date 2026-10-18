import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { compileLottie } from "../../src/shared/lottie/compile";
import { assetTestBundle } from "../assetBundle";
import { lottieBoxGradientFixture, lottieBoxGradientProfiles } from "../lottieBoxGradientFixture";
import {
  lottieGradientFixture,
  lottieGradientProfiles,
  lottiePaintHierarchyFixture,
} from "../lottieGradientFixture";
import { compareLottiePixels } from "../lottiePixels";
import { rendererServer } from "../rendererServer";

test("independent Lottie gradient pixels preserve typed RGB/alpha, local painting, transforms and hierarchy on forward/reset-backward frames", {
  timeout: 60000,
}, async () => {
  const require = createRequire(import.meta.url),
    light = await readFile(require.resolve("lottie-web/build/player/lottie_light.js"), "utf8"),
    code = await assetTestBundle(),
    server = await rendererServer(
      new Map([
        [
          "/gradient-fixture.html",
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
    await page.goto(`${server.url}/gradient-fixture.html`);
    await page.addScriptTag({ content: code });
    await page.addScriptTag({ content: light });
    const cases = [
      ...lottieGradientProfiles.map((profile) => ({
        profile,
        fixture: lottieGradientFixture(profile),
      })),
      ...lottieBoxGradientProfiles.map((profile) => ({
        profile: `relative-${profile}`,
        fixture: lottieBoxGradientFixture(profile),
      })),
    ];
    for (const { profile, fixture } of cases) {
      const before = JSON.stringify(fixture.project),
        compiled = compileInteractiveArtboard(fixture.project, fixture.boardId, {
          animationId: fixture.clipId,
        }),
        exported = compileLottie(fixture.project, {
          artboardId: fixture.boardId,
          animationId: fixture.clipId,
          confirmSampling: true,
          confirmRendererPrecision: true,
        }),
        last = exported.document.op - 1,
        middle = Math.floor(last / 2),
        result = await compareLottiePixels(page, {
          blueprint: compiled.document,
          animation: exported.document,
          frames: [
            0,
            Math.floor(last / 6),
            Math.max(0, middle - 1),
            middle,
            Math.min(last, middle + 1),
            Math.max(0, last - 1),
            last,
            middle,
            0,
          ],
          strokes: true,
          checkPrecision: false,
        });
      assert.equal(result.loaded, true);
      assert.ok(result.painted > 20);
      assert.deepEqual(result.differences, [], `${profile}: ${JSON.stringify(result.differences)}`);
      assert.equal(JSON.stringify(fixture.project), before);
      assert.equal(await page.locator("#lottie>svg").count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("built gradient Lottie export reports the closed profile, requires consent, downloads real gf data and refuses finer stop offsets without changing the project", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    for (const profile of [
      "compatible",
      "relative",
      "offset",
      "hierarchy",
      "move-only",
      "native-lines",
    ] as const) {
      const fixture =
        profile === "native-lines"
          ? lottieBoxGradientFixture("skin-linear")
          : profile === "hierarchy"
            ? lottiePaintHierarchyFixture("gradient", 29)
            : profile === "relative" || profile === "move-only"
              ? lottieBoxGradientFixture("matrix")
              : lottieGradientFixture("linear-matrix");
      if (profile === "move-only") {
        const node = fixture.project.artboards[0]?.scene.nodes[0];
        assert.ok(node);
        node.attrs.d += " M-20 -30";
      }
      if (profile === "offset") {
        const gradient = fixture.project.artboards[0]?.scene.nodes[0]?.gradients?.fill;
        assert.ok(gradient?.stops[1]);
        gradient.stops[1].offset = 0.333;
      }
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      await page.addInitScript(
        (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
        fixture.project,
      );
      await page.goto(server.url);
      await page.locator(".scene-artwork>svg").waitFor();
      const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
      await page.locator('[data-action="export"]').click();
      const dialog = page.locator("#export-dialog");
      await dialog.locator('[name="format"][value="lottie"]').check();
      await dialog.getByText(/Preenchimentos sólidos e gradientes userSpaceOnUse\/pad/).waitFor();
      assert.equal(await dialog.getByText(/texto, imagens, gradientes, recortes/).count(), 0);
      if (profile === "compatible" || profile === "relative") {
        await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
        await dialog.getByText(/offsets em porcentagens inteiras/).waitFor();
        assert.equal(await dialog.locator("#download").isDisabled(), true);
        await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
        assert.equal(await dialog.locator("#download").isDisabled(), true);
        await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
        const downloading = page.waitForEvent("download");
        await dialog.locator("#download").click();
        const path = await (await downloading).path();
        assert.ok(path);
        const downloaded = JSON.parse(await readFile(path, "utf8")),
          expected = compileLottie(fixture.project, {
            artboardId: fixture.boardId,
            animationId: fixture.clipId,
            alt: fixture.project.name,
            confirmSampling: true,
            confirmRendererPrecision: true,
          });
        assert.deepEqual(downloaded, expected.document);
        assert.ok(JSON.stringify(downloaded).includes('"ty":"gf"'));
      } else {
        await dialog
          .getByText(
            profile === "offset"
              ? /arredonda offsets para porcentagens inteiras/
              : profile === "hierarchy"
                ? /Hierarquia Lottie com pintura local excede a profundidade/
                : profile === "move-only"
                  ? /subcaminho isolado apenas de mover/
                  : /segmentos cúbicos na fonte/,
          )
          .waitFor();
        assert.equal(await dialog.locator("#download").isDisabled(), true);
        await dialog.locator("#close-export").click();
      }
      assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
