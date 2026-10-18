import assert from "node:assert/strict";
import type { Page } from "playwright";

/** Actual shipped ESM + FontFace under Electron file origin/CSP. The remote
 * handle owns the temporary host/player until the active-font screenshot. */
export async function verifyNativeFontFallback(
  page: Page,
  compiled: { document: unknown },
  screenshotPath: string,
) {
  const owner = await page.evaluateHandle(async ({ document: blueprint }) => {
    const before = localStorage.getItem("edisvg-project"),
      host = document.createElement("div"),
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    host.setAttribute("data-native-rig-fixture", "");
    host.style.cssText =
      "width:360px;height:120px;position:fixed;right:40px;bottom:220px;z-index:9999;background:white";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.setAttribute("viewBox", "0 0 3 3");
    title.textContent = "Native font host";
    svg.append(title);
    host.append(svg);
    document.body.append(host);
    let player:
      | Awaited<
          ReturnType<typeof import("@informach/edi-motion/runtime").createVisualSvgPlayerAsync>
        >
      | undefined;
    try {
      const runtime: typeof import("@informach/edi-motion/runtime") = await import(
          new URL("edi-player.mjs", location.href).href
        ),
        nextPlayer = await runtime.createVisualSvgPlayerAsync(svg, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
        });
      player = nextPlayer;
      const shape = svg.querySelector("text");
      if (!shape) {
        await player.destroyAsync();
        throw new Error("Missing native text");
      }
      const previous = {
        input: player.getInput("input-text"),
        text: shape.textContent,
        time: player.time,
      };
      let refused = false;
      try {
        player.setInput("input-text", "Texto 中");
      } catch (error) {
        refused = error instanceof Error && error.message.includes("U+4E2D");
      }
      const result = {
        family: shape.getAttribute("font-family"),
        text: shape.textContent,
        length: shape.getComputedTextLength(),
        loaded: [...document.fonts]
          .filter((font) => font.family.startsWith("edi-asset-") && font.status === "loaded")
          .map((font) => font.family),
        refused,
        previous,
        after: { input: player.getInput("input-text"), text: shape.textContent, time: player.time },
      };
      return { host, svg, title, player, result, before };
    } catch (error) {
      try {
        await player?.destroyAsync();
      } finally {
        host.remove();
      }
      throw error;
    }
  }, compiled);
  try {
    const result = await (await owner.getProperty("result")).jsonValue();
    assert.equal(result.refused, true);
    assert.deepEqual(result.previous, result.after);
    assert.equal(result.text, "Texto 𝒜");
    assert.ok(result.length > 0);
    assert.ok(result.family?.includes(", "));
    for (const id of result.family?.split(", ") ?? []) assert.ok(result.loaded.includes(id));
    const host = await owner.getProperty("host"),
      element = host.asElement();
    if (!element) throw new Error("Missing owned native font host");
    await element.screenshot({ path: screenshotPath });
    const cleanup = await owner.evaluate(async (bundle) => {
      await bundle.player.destroyAsync();
      return {
        restored:
          bundle.svg.childNodes.length === 1 &&
          bundle.svg.firstChild === bundle.title &&
          bundle.svg.getAttribute("viewBox") === "0 0 3 3",
        preserved: localStorage.getItem("edisvg-project") === bundle.before,
        released: ![...document.fonts].some((font) =>
          bundle.result.family?.split(", ").includes(font.family),
        ),
      };
    });
    assert.deepEqual(cleanup, { restored: true, preserved: true, released: true });
    console.log(
      "Verified native embedded font fallback, missing-input atomic refusal, active metrics and resource cleanup under file/CSP",
    );
  } finally {
    await owner.evaluate(async (bundle) => {
      try {
        await bundle.player.destroyAsync();
      } finally {
        bundle.host.remove();
      }
    });
    await owner.dispose();
  }
}
