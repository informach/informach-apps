import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { identityTransform, inverse, multiply } from "@informach/edi-motion";
import { chromium } from "playwright";
import { prepareCubicConversion } from "../../src/shared/cubicConversion";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { compileLottie } from "../../src/shared/lottie/compile";
import { editScene, flattenScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { lottieFixture, lottieRigFixture, lottieStrokeFixture } from "../lottieFixture";
import { compareLottiePixels } from "../lottiePixels";
import { rendererServer } from "../rendererServer";

test("built stroke inspection validates the entire animation and downloads only compatible captured contours", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    for (const profile of ["compatible", "anisotropic", "dense"] as const) {
      const supported = profile === "compatible";
      const fixture = lottieStrokeFixture({ cap: "round", animated: true, reflection: false }),
        board = fixture.project.artboards[0],
        clip = fixture.project.motion.animations[0];
      assert.ok(board && clip);
      const parent = board.scene.nodes[0];
      assert.ok(parent);
      parent.attrs["stroke-dasharray"] = profile === "dense" ? "1e-300 1e-300" : "8 4 2";
      if (profile === "anisotropic")
        clip.tracks.push({
          id: "track-late-anisotropy",
          targetId: fixture.shapeId,
          property: "sx",
          keys: [
            { id: "key-late-a", frame: 0, value: 1, easing: "hold" },
            { id: "key-late-b", frame: 30, value: 2, easing: "linear" },
          ],
        });
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
      if (supported) {
        await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
        assert.equal(await dialog.locator("#download").isDisabled(), true);
        await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
        assert.equal(await dialog.locator("#download").isDisabled(), true);
        await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
        await dialog.screenshot({ path: "../../.cache/edisvg-review/lottie-stroke.png" });
        const downloading = page.waitForEvent("download");
        await dialog.locator("#download").click();
        const download = await downloading,
          path = await download.path();
        assert.ok(path);
        const actual = JSON.parse(await readFile(path, "utf8")),
          expected = compileLottie(fixture.project, {
            artboardId: board.id,
            animationId: clip.id,
            alt: fixture.project.name,
            confirmSampling: true,
            confirmRendererPrecision: true,
          });
        assert.deepEqual(actual, expected.document);
      } else {
        await dialog
          .getByText(
            profile === "dense" ? /Densidade de tracejados/ : /Contorno Lottie requer matriz total/,
          )
          .first()
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

test("independent Lottie renderer checks pixels, paint-space regression and compensated-transform precision", {
  timeout: 60000,
}, async () => {
  const require = createRequire(import.meta.url),
    light = await readFile(require.resolve("lottie-web/build/player/lottie_light.js"), "utf8"),
    code = await assetTestBundle(),
    server = await rendererServer(
      new Map([
        [
          "/lottie-fixture.html",
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
    await page.goto(`${server.url}/lottie-fixture.html`);
    await page.addScriptTag({ content: code });
    await page.addScriptTag({ content: light });
    for (const profile of [
      "identity",
      "once",
      "loop",
      "ping-pong",
      "deformation",
      "skin",
      "stroke-butt",
      "stroke-round",
      "stroke-square",
      "stroke-animated",
      "stroke-reflection",
      "stroke-alpha-010",
      "stroke-alpha-025",
      "stroke-alpha-050",
      "stroke-alpha-090",
      "stroke-fill-alpha",
      "stroke-turns",
      "stroke-converted-lines",
      "stroke-converted-arcs",
      "stroke-converted-arcs-exact",
      "stroke-dash-even",
      "stroke-dash-odd",
      "stroke-dash-zeros",
      "stroke-dash-dots",
      "stroke-dash-animated",
      "stroke-dash-reflection",
      "stroke-dash-compensated-global",
      "stroke-dash-global-rotation",
      "stroke-dash-viewbox",
    ] as const) {
      const stroked = profile.startsWith("stroke"),
        fixture = stroked
          ? lottieStrokeFixture({
              cap:
                profile === "stroke-butt"
                  ? "butt"
                  : profile === "stroke-square"
                    ? "square"
                    : "round",
              animated: profile === "stroke-animated" || profile === "stroke-dash-animated",
              reflection: profile === "stroke-reflection" || profile === "stroke-dash-reflection",
              alpha:
                profile === "stroke-alpha-010"
                  ? 0.1
                  : profile === "stroke-alpha-025"
                    ? 0.25
                    : profile === "stroke-alpha-050"
                      ? 0.5
                      : profile === "stroke-alpha-090"
                        ? 0.9
                        : 0.75,
              fillAlpha: profile === "stroke-fill-alpha" ? 0.25 : undefined,
              turns: profile === "stroke-turns",
            })
          : profile === "deformation" || profile === "skin"
            ? lottieRigFixture(profile)
            : lottieFixture(),
        board = fixture.project.artboards[0],
        clip = fixture.project.motion.animations[0];
      assert.ok(board);
      assert.ok(clip);
      if (profile.startsWith("stroke-dash")) {
        const parent = board.scene.nodes[0];
        assert.ok(parent?.tag === "g");
        if (profile === "stroke-dash-compensated-global") {
          fixture.project.transforms = {
            ...fixture.project.transforms,
            x: 150,
            y: 0,
            sx: 2,
            sy: 1,
            rotation: 0,
          };
          assert.ok(parent.basis);
          parent.basis = multiply(inverse([2, 0, 0, 1, 0, 0]), parent.basis);
        }
        if (profile === "stroke-dash-global-rotation") fixture.project.transforms.rotation = 173;
        if (profile === "stroke-dash-viewbox") board.scene.viewBox = [10, 20, 300, 200];
        parent.attrs["stroke-dasharray"] =
          profile === "stroke-dash-odd"
            ? "8 4 2"
            : profile === "stroke-dash-zeros"
              ? "0 0 0"
              : profile === "stroke-dash-dots"
                ? "0 12"
                : "8 4";
        // One child overrides the inherited pattern, another remains solid.
        const open = parent.children[1],
          solid = parent.children[2];
        assert.ok(open && solid);
        open.attrs["stroke-dasharray"] = "5 3";
        solid.attrs["stroke-dasharray"] = "none";
      }
      if (profile.startsWith("stroke-converted")) {
        const first = flattenScene(board.scene).find(({ node }) => node.tag === "path")?.node;
        assert.ok(first);
        const authored =
          profile === "stroke-converted-lines"
            ? "M20 35L90 35L55 90Z"
            : "M90 55A35 25 0 1 1 20 55A35 25 0 1 1 90 55Z";
        // Compare the explicitly authored converted document, never claim
        // identical native primitive/line antialiasing before conversion.
        first.attrs.d = prepareCubicConversion(authored).pathData;
        if (profile === "stroke-converted-arcs-exact") {
          fixture.project.transforms = { ...identityTransform(), opacity: 100 };
          for (const { node } of flattenScene(board.scene)) {
            node.transform = identityTransform();
            delete node.basis;
          }
        }
      }
      const mode = profile === "loop" || profile === "ping-pong" ? profile : "once";
      clip.mode = mode;
      if (!stroked && profile !== "deformation" && profile !== "skin") {
        if (profile !== "identity") {
          fixture.project.transforms = {
            ...fixture.project.transforms,
            x: 8,
            y: -4,
            rotation: 9,
            sx: 0.9,
            sy: 1.05,
            opacity: 80,
          };
          const first = board.scene.nodes[0];
          assert.ok(first);
          first.basis = [1, 0.1, -0.05, 1, 3, -2];
          first.transform = {
            ...first.transform,
            rotation: 11,
            px: 35,
            py: 40,
            skewX: 6,
            sx: -1.1,
            sy: 0.95,
          };
        }
        const first = board.scene.nodes[0];
        assert.ok(first);
        editScene(board.scene, first.id, "attrs", {
          d: "M20 30L110 30L110 120L20 120Z M40 50L80 50L80 90L40 90Z",
          "fill-rule": "evenodd",
        });
        const secondId = editScene(board.scene, null, "add", {
          tag: "path",
          attrs: { d: "M85 40L145 40L145 105L85 105Z", fill: "#2368e5", stroke: "none" },
        });
        assert.ok(secondId);
        board.scene.nodes = [
          {
            ...structuredClone(first),
            id: "node-lottie-group",
            name: "Grupo",
            tag: "g",
            attrs: { opacity: "50%" },
            transform: { ...first.transform, x: 4, y: 6 },
            children: board.scene.nodes,
          },
        ];
      }
      const compiled = compileInteractiveArtboard(fixture.project, board.id, {
          animationId: clip.id,
        }),
        exported = compileLottie(fixture.project, {
          artboardId: board.id,
          animationId: clip.id,
          confirmSampling: true,
          confirmRendererPrecision: true,
        });
      const result = await compareLottiePixels(page, {
        blueprint: compiled.document,
        animation: exported.document,
        strokes: stroked,
        checkPrecision:
          profile === "stroke-converted-arcs" || profile === "stroke-dash-compensated-global",
        frames:
          mode === "ping-pong"
            ? [
                0,
                Math.floor(clip.frames / 6),
                clip.frames / 2,
                clip.frames,
                clip.frames * 1.5,
                clip.frames * 2 - 1,
              ]
            : [
                0,
                Math.floor(clip.frames / 6),
                clip.frames / 2,
                clip.frames - 1,
                ...(mode === "once" ? [clip.frames] : []),
              ],
      });
      assert.equal(result.loaded, true);
      assert.ok(result.painted > 20, "Fidelity fixture must contain visible painted pixels");
      assert.equal(result.totalFrames, exported.document.op);
      if (profile === "stroke-converted-arcs") {
        // Regression for the former frame-29 compositing failure. Preserving
        // global stroke paint space fixes it; precision consent is not a fix.
        assert.ok(
          result.geometricError < 0.001,
          `Measured geometric error ${result.geometricError}`,
        );
        assert.equal(exported.report.requiresRendererPrecisionConsent, true);
        assert.ok(exported.report.issues.some((issue) => issue.code === "renderer-precision"));
      }
      if (profile === "stroke-dash-compensated-global") {
        // Isolated consumer-factor precision canary, not permission to widen
        // tolerances or regress the pixel-certified paint-space profiles.
        assert.ok(
          result.differences.some(
            (difference) => difference.point[0] === 188 && difference.point[1] === 93,
          ),
        );
        assert.ok(
          result.geometricError < 0.001,
          `Measured compensated error ${result.geometricError}`,
        );
        assert.equal(exported.report.requiresRendererPrecisionConsent, true);
      } else if (["once", "loop", "ping-pong", "deformation", "skin"].includes(profile)) {
        // Independent SVG rasterizers agree on interiors but differ at a few
        // subpixel edges. Bound both the number of edge samples and their
        // premultiplied color/alpha error; all stroke/paint profiles stay exact.
        const skinned = profile === "skin";
        assert.ok(
          result.differenceCount <= (skinned ? 20 : 10),
          `${profile}: ${JSON.stringify(result.differences)}`,
        );
        for (const difference of result.differences) {
          const actualAlpha = difference.actual[3] ?? 0,
            expectedAlpha = difference.expected[3] ?? 0;
          assert.ok(
            Math.abs(actualAlpha - expectedAlpha) <= (skinned ? 40 : 20),
            `${profile}: ${JSON.stringify(difference)}`,
          );
          for (let channel = 0; channel < 3; channel++) {
            const actual = difference.actual[channel] ?? 0,
              expected = difference.expected[channel] ?? 0;
            assert.ok(
              Math.abs(actual * actualAlpha - expected * expectedAlpha) / 255 <=
                (skinned ? 25 : 15),
              `${profile}: ${JSON.stringify(difference)}`,
            );
            if (actualAlpha >= 240 && expectedAlpha >= 240)
              assert.ok(
                Math.abs(actual - expected) <= 2,
                `${profile}: opaque ${JSON.stringify(difference)}`,
              );
          }
        }
      } else
        assert.deepEqual(
          result.differences,
          [],
          `${profile}: ${JSON.stringify(result.differences)}`,
        );
      assert.equal(await page.locator("#lottie>svg").count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("built Lottie dialog inspects compatibility, requires consent, exports the captured animation and cancels without late downloads", {
  timeout: 60000,
}, async () => {
  const fixture = lottieFixture(),
    source = structuredClone(fixture.project),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [],
      downloads: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      source,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="animate"]').click();
    await page.locator(`[data-clip="${fixture.clipId}"]`).click();
    await page.locator('[data-action="export"]').first().click();
    const dialog = page.locator("#export-dialog");
    await dialog.locator('input[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    assert.equal(await dialog.locator("#reduced").isDisabled(), true);
    assert.equal(await dialog.locator("#reduced").isVisible(), false);
    assert.equal(await dialog.locator("#export-machine").isVisible(), false);
    assert.equal(await dialog.locator("[data-animation-confirm]").isVisible(), false);
    assert.equal(
      await dialog.getByLabel("Nome da composição", { exact: true }).inputValue(),
      source.name,
    );
    const cancelBox = await dialog.locator("#cancel-export").boundingBox(),
      viewport = page.viewportSize();
    assert.ok(cancelBox);
    assert.ok(viewport);
    assert.ok(cancelBox.y >= 0 && cancelBox.y + cancelBox.height <= viewport.height);
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    const captures = resolve("../../.cache/edisvg-review");
    await mkdir(captures, { recursive: true });
    await dialog.screenshot({ path: resolve(captures, "lottie-export.png") });
    const downloadPromise = page.waitForEvent("download");
    await dialog.locator("#download").click();
    const download = await downloadPromise,
      path = await download.path();
    assert.ok(path);
    assert.equal(download.suggestedFilename(), "projeto.lottie.json");
    const actual = JSON.parse(await readFile(path, "utf8")),
      expected = compileLottie(source, {
        artboardId: fixture.boardId,
        animationId: fixture.clipId,
        confirmSampling: true,
        confirmRendererPrecision: true,
        alt: source.name,
      });
    assert.deepEqual(actual, expected.document);
    await dialog.waitFor({ state: "hidden" });
    const stored = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="export"]').first().click();
    await dialog.locator('input[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    await page.waitForFunction(() => {
      const button = document.querySelector("#download");
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    // Both real handlers run in one task: cancellation wins before a worker
    // result can be delivered. No timer or injected worker is involved.
    await page.evaluate(() => {
      const submit = document.querySelector("#download"),
        cancel = document.querySelector("#cancel-export");
      if (!(submit instanceof HTMLButtonElement) || !(cancel instanceof HTMLButtonElement))
        throw new Error("Missing export controls");
      submit.click();
      cancel.click();
    });
    await dialog.waitFor({ state: "hidden" });
    // Reopening and finishing a fresh inspection proves task ownership was
    // released synchronously and the prior React island was unmounted.
    await page.locator('[data-action="export"]').first().click();
    await dialog.locator('input[name="format"][value="lottie"]').check();
    await dialog.getByText(/Compatível com o perfil inicial/).waitFor();
    await dialog.getByLabel("Subdivisões Lottie", { exact: true }).selectOption("2");
    await dialog.getByText(/61 quadros · 60 FPS/).waitFor();
    assert.equal(await dialog.locator("#download").isDisabled(), true);
    await dialog.getByLabel("Confirmar amostragem Lottie", { exact: true }).check();
    await dialog.getByLabel("Confirmar diferenças de precisão Lottie", { exact: true }).check();
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#download")?.disabled,
    );
    // An asynchronous editor/MCP command may replace the legacy containers
    // while a modal exists. Use the actual public navigation handler to prove
    // that render disposes the export island and aborts its worker first.
    await page.evaluate(() => {
      const submit = document.querySelector("#download"),
        navigation = document.querySelector('[data-action="design"]');
      if (!(submit instanceof HTMLButtonElement) || !(navigation instanceof HTMLButtonElement))
        throw new Error("Missing editor navigation");
      submit.click();
      navigation.click();
    });
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(downloads, ["projeto.lottie.json"]);
    // Options for one format must not leak into another format's strict
    // contract. Exercise the real dialog, not only the pure ZIP compiler.
    await page.locator('[data-action="export"]').first().click();
    await dialog.locator('input[name="format"][value="react"]').check();
    const reactDownload = page.waitForEvent("download");
    await dialog.locator("#download").click();
    const archive = await reactDownload,
      archivePath = await archive.path();
    assert.ok(archivePath);
    assert.equal(archive.suggestedFilename(), "projeto.react.zip");
    assert.equal((await readFile(archivePath)).readUInt32LE(0), 0x04034b50);
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stored);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
