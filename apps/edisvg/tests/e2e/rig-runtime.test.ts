import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { compileArtboard } from "../../src/shared/components";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { offlineBundle } from "../offlineBundle";
import { rendererServer } from "../rendererServer";
import { rigFixture } from "../rigFixture";

test("unsupported animated IK profiles fail before publishing player clocks, and editor preview errors preserve Design and source", {
  timeout: 60000,
}, async (context) => {
  const fixture = rigFixture();
  fixture.run([
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: fixture.clipId,
        targetId: "node-upper",
        property: "sx",
        frame: 0,
        value: 1,
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: fixture.clipId,
        targetId: "node-upper",
        property: "sx",
        frame: 10,
        value: 2,
      },
    },
  ]);
  const source = fixture.project(),
    before = structuredClone(source),
    compiled = compileInteractiveArtboard(source, fixture.rootId, { animationId: fixture.clipId }),
    playback = compileArtboard(source, fixture.rootId).playback,
    server = await rendererServer();
  context.after(() => server.close());
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage(),
      runtime = await offlineBundle();
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: runtime });
    const result = await page.evaluate(
      ({ document, playback, id }) => {
        const root = window.document.querySelector("svg"),
          api = window.EdiSVGRuntime;
        if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
        const interactive = api.createInteractiveSvgPlayer(root, document, {
            autoplay: false,
            pauseOffscreen: false,
          }),
          before = interactive.inspect().time;
        let rejected = false;
        try {
          interactive.advance(0.5);
        } catch (error) {
          rejected = error instanceof Error;
        }
        const after = interactive.inspect().time;
        interactive.destroy();
        const timeline = api.createSvgPlayer(root, playback, {
          animationId: id,
          autoplay: false,
          pauseOffscreen: false,
        });
        let seekRejected = false;
        try {
          timeline.seek(0.5);
        } catch (error) {
          seekRejected = error instanceof Error;
        }
        const time = timeline.time;
        timeline.destroy();
        return { before, after, rejected, time, seekRejected };
      },
      { document: compiled.document, playback, id: fixture.clipId },
    );
    assert.deepEqual(result, { before: 0, after: 0, rejected: true, time: 0, seekRejected: true });
    const editor = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    editor.on("pageerror", (error) => errors.push(error.message));
    editor.on("dialog", (dialog) => dialog.accept());
    await editor.addInitScript((project) => {
      if (localStorage.getItem("edisvg-project") === null)
        localStorage.setItem("edisvg-project", JSON.stringify(project));
    }, source);
    await editor.goto(server.url);
    await editor.locator(".scene-artwork>svg").waitFor();
    await editor.locator(`[data-clip="${fixture.clipId}"]`).click();
    await editor.locator('[data-action="end"]').click();
    await editor
      .locator("[data-preview-error]")
      .filter({ hasText: "Prévia interrompida" })
      .waitFor();
    assert.deepEqual(
      await editor.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
      before,
    );
    await editor.locator('[data-action="design"]').click();
    assert.equal(await editor.locator("[data-preview-error]").isVisible(), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

async function tip(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("svg"),
      bone = document.querySelector('[data-edi-object="node-lower"]');
    if (!(root instanceof SVGSVGElement) || !(bone instanceof SVGGraphicsElement))
      throw new Error("Missing rig SVG");
    const rootMatrix = root.getScreenCTM(),
      boneMatrix = bone.getScreenCTM();
    if (!rootMatrix || !boneMatrix) throw new Error("Missing matrices");
    const point = new DOMPoint(100, 0)
      .matrixTransform(boneMatrix)
      .matrixTransform(rootMatrix.inverse());
    return { x: point.x, y: point.y };
  });
}
for (const animatedStrength of [false, true])
  test(`interactive, offline HTML and independent sampled SVG reproduce IK ${animatedStrength ? "with animated strength" : "at full strength"}`, {
    timeout: 60000,
  }, async () => {
    const fixture = rigFixture();
    if (animatedStrength)
      fixture.run([
        {
          type: "rig",
          operation: "replace",
          value: {
            ...fixture.project().artboards[0]?.rig,
            version: 2,
            parameterClips: [
              {
                animationId: fixture.clipId,
                tracks: [
                  {
                    id: "track-strength",
                    targetId: "constraint-hand",
                    property: "strength",
                    keys: [
                      { id: "key-zero", frame: 0, value: 0, easing: "linear" },
                      { id: "key-full", frame: 10, value: 1, easing: "linear" },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ]);
    const project = fixture.project(),
      runtime = await offlineBundle(),
      compiled = compileInteractiveArtboard(project, fixture.rootId, {
        animationId: fixture.clipId,
      }),
      html = buildClipExport(
        project,
        fixture.clipId,
        { format: "html", alt: "Rig", reduced: false, offscreen: false },
        runtime,
      ),
      svg = buildClipExport(
        project,
        fixture.clipId,
        { format: "svg", alt: "Rig", reduced: false, offscreen: false },
        "",
      ),
      channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
      browser = await chromium.launch(channel ? { channel } : {});
    try {
      const interactive = await browser.newPage(),
        timeline = await browser.newPage(),
        sampled = await browser.newPage(),
        errors: string[] = [];
      for (const page of [interactive, timeline, sampled]) {
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) => route.abort());
      }
      await interactive.setContent(compiled.svg);
      await interactive.addScriptTag({ content: runtime });
      await interactive.evaluate((document) => {
        const root = window.document.querySelector("svg"),
          api = window.EdiSVGRuntime;
        if (!(root instanceof SVGSVGElement) || !api) throw new Error("Missing runtime");
        window.interactivePlayer = api.createInteractiveSvgPlayer(root, document, {
          autoplay: false,
          pauseOffscreen: false,
        });
      }, compiled.document);
      await timeline.setContent(html.content);
      await timeline.waitForFunction(() => !!window.ediSVGPlayer);
      await timeline.evaluate(() => window.ediSVGPlayer?.pause());
      await sampled.setContent(svg.content);
      await sampled.evaluate(() => document.querySelector("svg")?.pauseAnimations());
      for (const time of [0, 0.5, 1]) {
        await interactive.evaluate((time) => {
          window.interactivePlayer?.reset();
          window.interactivePlayer?.advance(time);
        }, time);
        await timeline.evaluate((time) => window.ediSVGPlayer?.seek(time), time);
        await sampled.evaluate((time) => document.querySelector("svg")?.setCurrentTime(time), time);
        for (const page of [interactive, timeline, sampled]) {
          const point = await tip(page);
          const x = 100 - time * 100,
            q = Math.acos((x * x + 10000 - 20000) / 20000),
            theta = Math.atan2(100, x) - Math.atan2(Math.sin(q), 1 + Math.cos(q)),
            strength = animatedStrength ? time : 1,
            expected = {
              x: 100 * Math.cos(theta * strength) + 100 * Math.cos((theta + q) * strength),
              y: 100 * Math.sin(theta * strength) + 100 * Math.sin((theta + q) * strength),
            };
          assert.ok(
            Math.abs(point.x - expected.x) < 0.01,
            JSON.stringify({ time, point, expected }),
          );
          assert.ok(
            Math.abs(point.y - expected.y) < 0.01,
            JSON.stringify({ time, point, expected }),
          );
        }
      }
      assert.deepEqual(errors, []);
      await interactive.evaluate(() => window.interactivePlayer?.destroy());
      await timeline.evaluate(() => window.ediSVGPlayer?.destroy());
    } finally {
      await browser.close();
    }
  });
