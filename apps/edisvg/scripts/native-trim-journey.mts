import assert from "node:assert/strict";
import type { Page } from "playwright";

/** Shipped portable runtime under Electron file/CSP, isolated from the editor draft. */
export async function verifyNativeTrim(
  page: Page,
  blueprint: unknown,
  shapeId: string,
  screenshotPath: string,
) {
  const owner = await page.evaluateHandle(
    async ({ blueprint, shapeId }) => {
      const host = document.createElement("div"),
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        before = localStorage.getItem("edisvg-project");
      host.setAttribute("data-native-trim-fixture", "");
      host.style.cssText =
        "position:fixed;right:40px;bottom:220px;width:360px;height:180px;z-index:9999;background:white";
      svg.style.cssText = "width:100%;height:100%";
      host.append(svg);
      document.body.append(host);
      try {
        const runtime: typeof import("@informach/edi-motion/runtime") = await import(
            new URL("edi-player.mjs", location.href).href
          ),
          player = await runtime.createVisualSvgPlayerAsync(svg, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          });
        return { host, svg, player, before, shapeId };
      } catch (error) {
        host.remove();
        throw error;
      }
    },
    { blueprint, shapeId },
  );
  try {
    const result = await owner.evaluate(({ svg, player, before, shapeId }) => {
      const output = [];
      for (const time of [0, 0.5, 1, 0.2, 0]) {
        player.reset();
        player.advance(time);
        const shape = svg.querySelector(`[data-edi-object="${shapeId}"]>path`);
        if (!(shape instanceof SVGPathElement)) throw new Error("Missing native trim shape");
        output.push({ time, d: shape.getAttribute("d"), length: shape.getTotalLength() });
      }
      player.advance(0.5);
      return { output, preserved: localStorage.getItem("edisvg-project") === before };
    });
    for (const sample of result.output) {
      assert.ok(Math.abs(sample.length - 200 * sample.time) < 0.001, JSON.stringify(sample));
      if (sample.time === 0) assert.equal(sample.d, "");
      if (sample.time === 1) assert.equal(sample.d, "M20 80 C20 80 220 80 220 80");
    }
    assert.equal(result.preserved, true);
    await page.locator("[data-native-trim-fixture]").screenshot({ path: screenshotPath });
    console.log(
      "Verified native trim empty/full restoration, nonlinear cubic arclength and backward seeks without changing the draft",
    );
  } finally {
    await owner.evaluate(async ({ host, player }) => {
      await player.destroyAsync();
      host.remove();
    });
    await owner.dispose();
  }
}
