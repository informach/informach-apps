import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: resolve("."),
  plugins: [react()],
  resolve: { alias: { "@": resolve("src/renderer/src"), "@shared": resolve("src/shared") } },
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
const results = [];
const output = resolve("../../.cache/edifoto-tests");
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  const options = { headless: true };
  if (process.env.EDIFOTO_TEST_BROWSER_EXECUTABLE)
    options.executablePath = process.env.EDIFOTO_TEST_BROWSER_EXECUTABLE;
  else if (!existsSync(chromium.executablePath()) && process.platform === "win32")
    options.channel = "msedge";
  browser = await chromium.launch(options);
  await mkdir(output, { recursive: true });
  for (const suite of process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["default", "safety", "fidelity", "workspace", "assistant", "refinements", "chroma"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${address.port}/tests/browser/index.html${suite === "default" ? "" : `?suite=${suite}`}`,
    );
    const selector = suite === "chroma" ? "#chroma-test-results" : "#test-results[data-status]";
    await page.locator(selector).waitFor({ timeout: 60000 });
    const text = await page.locator(selector).textContent();
    const status =
      suite === "chroma"
        ? text.startsWith("{")
          ? "passed"
          : "failed"
        : await page.locator(selector).getAttribute("data-status");
    await page.screenshot({ path: resolve(output, `${suite}.png`) });
    if (suite === "workspace" && status === "passed") {
      await page.setViewportSize({ width: 1100, height: 680 });
      await page.waitForFunction(() => {
        const dock = document.querySelector(".dock");
        return dock && dock.getBoundingClientRect().right <= innerWidth;
      });
      const layout = await page.evaluate(() => {
        const dock = document.querySelector(".dock").getBoundingClientRect(),
          workspace = document.querySelector(".workspace").getBoundingClientRect();
        return {
          dockLeft: dock.left,
          dockRight: dock.right,
          workspaceLeft: workspace.left,
          workspaceRight: workspace.right,
        };
      });
      if (layout.dockLeft < layout.workspaceLeft || layout.dockRight > layout.workspaceRight) {
        process.exitCode = 1;
        errors.push("Dock escapes workspace at minimum window size");
      }
      await page.screenshot({ path: resolve(output, "workspace-1100.png") });
    }
    results.push({ suite, status, errors, text });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
    if (status !== "passed" || errors.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  await browser?.close();
  await server.close();
}
