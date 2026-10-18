import assert from "node:assert/strict";
import type { Page } from "playwright";

/** Real keyboard input in a temporary native player, never the open document. */
export async function verifyNativeSemantics(
  page: Page,
  blueprint: unknown,
  screenshotPath: string,
) {
  const owner = await page.evaluateHandle(async (data) => {
    const host = document.createElement("dialog"),
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      before = localStorage.getItem("edisvg-project");
    host.setAttribute("data-native-semantic-fixture", "");
    host.style.cssText =
      "position:fixed;right:40px;bottom:220px;width:360px;height:120px;z-index:9999;background:white";
    svg.style.cssText = "width:100%;height:100%";
    host.append(svg);
    document.body.append(host);
    host.setAttribute("aria-label", "Verificação nativa isolada de semântica");
    // Match the real Testar isolation: keyboard input must not operate editor transport.
    host.showModal();
    try {
      const runtime: typeof import("@informach/edi-motion/runtime") = await import(
          new URL("edi-player.mjs", location.href).href
        ),
        player = await runtime.createVisualSvgPlayerAsync(svg, data, {
          autoplay: false,
          pauseOffscreen: false,
        });
      return { host, svg, player, before };
    } catch (error) {
      host.remove();
      throw error;
    }
  }, blueprint);
  try {
    const host = page.locator("[data-native-semantic-fixture]"),
      button = host.getByRole("button", { name: "Acenar para você", exact: true });
    await button.focus();
    await page.keyboard.press("Space");
    assert.equal(await owner.evaluate(({ player }) => player.getInput("input-active")), true);
    await owner.evaluate(({ player }) => player.reset());
    await button.focus();
    await page.keyboard.press("Enter");
    assert.equal(await owner.evaluate(({ player }) => player.getInput("input-active")), true);
    assert.equal(
      await button.locator(":scope>desc").textContent(),
      "Ativa o aceno pelo teclado ou toque.",
    );
    assert.equal(await host.locator('[aria-hidden="true"]').count(), 1);
    assert.equal(await host.locator('[aria-hidden="true"][tabindex]').count(), 0);
    await host.screenshot({ path: screenshotPath });
    const result = await owner.evaluate(async ({ player, svg, before }) => {
      await player.destroyAsync();
      return {
        restored: !svg.childNodes.length && !svg.hasAttribute("viewBox"),
        preserved: localStorage.getItem("edisvg-project") === before,
      };
    });
    assert.deepEqual(result, { restored: true, preserved: true });
    console.log(
      "Verified native semantic label/description, Enter/Space, decorative exclusion and exact host cleanup under file/CSP",
    );
  } finally {
    try {
      await owner.evaluate(async ({ player, host }) => {
        try {
          await player.destroyAsync();
        } finally {
          host.remove();
        }
      });
    } finally {
      await owner.dispose();
    }
  }
}
