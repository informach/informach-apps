import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { build } from "vite";
import type { runSchedulerScenario } from "../../../../packages/edi-motion/tests/frame-loop-browser";

declare global {
  interface Window {
    runSchedulerScenario?: typeof runSchedulerScenario;
  }
}
test("real browser scheduler reports and propagates synchronous render failures instead of returning a ready player", {
  timeout: 60000,
}, async () => {
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      lib: {
        entry: resolve("../../packages/edi-motion/tests/frame-loop-browser.ts"),
        formats: ["iife"],
        name: "FrameLoopTest",
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!output || !("output" in output)) throw new Error("Missing test bundle");
  const code = output.output.find((item) => item.type === "chunk")?.code;
  if (!code) throw new Error("Missing scheduler test code");
  const channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent('<svg viewBox="0 0 100 100"></svg>');
    await page.addScriptTag({ content: code });
    assert.deepEqual(await page.evaluate(() => window.runSchedulerScenario?.()), {
      rejected: true,
      updatedRejected: true,
      playing: false,
      errors: ["initial paint failed", "updated paint failed"],
    });
  } finally {
    await browser.close();
  }
});
