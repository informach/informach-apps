import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { buildClipExport } from "../../src/renderer/src/clipExport";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { joystickFixture } from "../joystickFixture";
import { offlineBundle } from "../offlineBundle";

async function vectorSnapshot(page: Page, targetId: string, shapeId: string) {
  return page.evaluate(
    ({ targetId, shapeId }) => {
      const root = document.querySelector("svg"),
        target = document.querySelector(`[data-edi-object="${targetId}"]`),
        path = document.querySelector(`[data-edi-object="${shapeId}"]>path`);
      if (
        !(root instanceof SVGSVGElement) ||
        !(target instanceof SVGGraphicsElement) ||
        !(path instanceof SVGPathElement)
      )
        throw new Error("Joystick runtime geometry missing");
      const rootMatrix = root.getScreenCTM(),
        targetMatrix = target.getScreenCTM(),
        pathMatrix = path.getScreenCTM();
      if (!rootMatrix || !targetMatrix || !pathMatrix)
        throw new Error("Joystick runtime matrix missing");
      const origin = new DOMPoint(0, 0)
          .matrixTransform(targetMatrix)
          .matrixTransform(rootMatrix.inverse()),
        geometryMatrix = pathMatrix.multiply(rootMatrix.inverse()),
        length = path.getTotalLength(),
        samples = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const point = path.getPointAtLength(length * fraction).matrixTransform(geometryMatrix);
          return { x: point.x, y: point.y };
        });
      return { origin: { x: origin.x, y: origin.y }, samples };
    },
    { targetId, shapeId },
  );
}

test("interactive SVG, standalone HTML and sampled SVG share both joystick axes, IK and skinned geometry through backward seeks", {
  timeout: 60_000,
}, async () => {
  const fixture = joystickFixture({ animated: true }),
    project = fixture.project(),
    before = JSON.stringify(project),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.clipId,
    }),
    runtime = await offlineBundle(),
    html = buildClipExport(
      project,
      fixture.clipId,
      { format: "html", alt: "Joystick", reduced: false, offscreen: false },
      runtime,
    ),
    svg = buildClipExport(
      project,
      fixture.clipId,
      { format: "svg", alt: "Joystick", reduced: false, offscreen: false },
      "",
    ),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const interactive = await browser.newPage(),
      htmlPage = await browser.newPage(),
      sampled = await browser.newPage(),
      errors: string[] = [];
    for (const page of [interactive, htmlPage, sampled]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.abort());
    }
    await interactive.setContent(compiled.svg);
    await interactive.addScriptTag({ content: runtime });
    await interactive.evaluate((document) => {
      const root = window.document.querySelector("svg"),
        api = window.EdiSVGRuntime;
      if (!(root instanceof SVGSVGElement) || !api) throw new Error("Joystick runtime absent");
      window.interactivePlayer = api.createInteractiveSvgPlayer(root, document, {
        autoplay: false,
        pauseOffscreen: false,
      });
    }, compiled.document);
    await htmlPage.setContent(html.content);
    await htmlPage.waitForFunction(() => !!window.ediSVGPlayer);
    await htmlPage.evaluate(() => window.ediSVGPlayer?.pause());
    await sampled.setContent(svg.content);
    await sampled.evaluate(() => document.querySelector("svg")?.pauseAnimations());
    for (const frame of [0, 5, 10, 5, 0]) {
      await interactive.evaluate((time) => {
        window.interactivePlayer?.reset();
        window.interactivePlayer?.advance(time);
      }, frame / 10);
      await htmlPage.evaluate((time) => window.ediSVGPlayer?.seek(time), frame / 10);
      await sampled.evaluate(
        (time) => document.querySelector("svg")?.setCurrentTime(time),
        frame / 10,
      );
      const vectors = await Promise.all(
        [interactive, htmlPage, sampled].map((page) =>
          vectorSnapshot(page, fixture.targetId, fixture.shapeId),
        ),
      );
      const requested = frame / 10,
        divisor = Math.max(1, Math.hypot(requested, -requested)),
        expected = {
          x: 100 - frame * 10 + (requested / divisor) * 40,
          y: 100 - (requested / divisor) * 40,
        };
      const reference = vectors[0];
      assert.ok(reference);
      for (const [index, vector] of vectors.entries()) {
        assert.ok(
          Math.hypot(vector.origin.x - expected.x, vector.origin.y - expected.y) < 0.02,
          JSON.stringify({ index, frame, actual: vector.origin, expected }),
        );
        for (let point = 0; point < vector.samples.length; point++) {
          const actual = vector.samples[point],
            target = reference.samples[point];
          assert.ok(actual && target);
          assert.ok(
            Math.hypot(actual.x - target.x, actual.y - target.y) < 0.05,
            JSON.stringify({ index, frame, point, actual, target }),
          );
        }
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(JSON.stringify(project), before);
    await interactive.evaluate(() => window.interactivePlayer?.destroy());
    await htmlPage.evaluate(() => window.ediSVGPlayer?.destroy());
  } finally {
    await browser.close();
  }
});
