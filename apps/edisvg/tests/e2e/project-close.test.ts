import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/**
 * The desktop bridge faked in the page before the editor starts: a project with a drawing, and
 * Fechar/Novo/a request of another tool answered with the projects the main process would give.
 * A string, so tsx adds nothing to it.
 */
const desktop = (drawn: string, blank: string) => `
  (() => {
    const drawn = ${drawn};
    const blank = ${blank};
    const file = { name: "Mascote.edisvg", path: "C:\\\\Mascote.edisvg", dirty: false };
    const none = { name: "Sem arquivo", path: null, dirty: false };
    window.__calls = [];
    window.__requests = [];
    const call = (name, value) => async () => {
      window.__calls.push(name);
      return value;
    };
    window.desktop = {
      projectInitialize: async () => ({ project: drawn, status: file, recovered: false }),
      projectChanged: async () => file,
      projectSave: call("save", { saved: true, ...file }),
      projectClose: call("close", { project: blank, status: none }),
      projectNew: call("new", { project: blank, status: none }),
      aiStatus: async () => ({ available: false, clients: [] }),
      handleAiTools: () => () => undefined,
      onAssistantEvent: () => () => undefined,
      onCommand: (callback) => {
        window.__command = callback;
        return () => undefined;
      },
      onLinkWaiting: (callback) => {
        window.__linkWaiting = callback;
        return () => undefined;
      },
      linkNext: async () => window.__requests.shift() ?? null,
      linkOpenFile: call("open-file", { project: drawn, status: file }),
      linkDone: async () => undefined,
      linkList: async () => [],
    };
  })();`;

test("Fechar projeto leaves EdiSVG open with no project, ready for another", {
  timeout: 60000,
}, async () => {
  const drawn = newProject();
  const board = drawn.artboards[0];
  assert.ok(board);
  board.scene.nodes.push({
    id: "node-sun",
    name: "Sol",
    tag: "circle",
    attrs: { cx: "540", cy: "540", r: "200", fill: "#f1b95b" },
    text: "",
    children: [],
    transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
    visible: true,
    locked: false,
  });
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(desktop(JSON.stringify(drawn), JSON.stringify(newProject())));
    await page.goto(server.url);
    await page.locator('[data-object="node-sun"]').waitFor({ timeout: 5000 });
    const command = (name: string) =>
      page.evaluate(
        (n) => (window as unknown as { __command(c: string): void }).__command(n),
        name,
      );
    const calls = () => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);

    // Fechar projeto (Ctrl+W in the menu): the screen with no project, the app still open.
    await command("close-project");
    const screen = page.getByRole("region", { name: "Nenhum projeto aberto" });
    await screen.waitFor();
    assert.equal(await page.title(), `EdiSVG ${(await import("../../package.json")).version}`);
    assert.equal(await page.locator('[data-object="node-sun"]').count(), 0);
    // It stays: nothing under it counts as an edit, and the editor's keys wait.
    await page.keyboard.press("Control+K");
    await page.waitForTimeout(600);
    assert.equal(await screen.isVisible(), true);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    // Saving has nothing to save.
    await command("save");
    await page.locator("#toast.show", { hasText: "Nenhum projeto aberto" }).waitFor();
    assert.deepEqual(await calls(), ["close"]);

    // A .edisvg given by another tool (or Abrir com) opens in its place.
    await page.evaluate(() => {
      const w = window as unknown as { __requests: unknown[]; __linkWaiting(): void };
      w.__requests.push({ type: "file", name: "Mascote.edisvg" });
      w.__linkWaiting();
    });
    await page.locator('[data-object="node-sun"]').waitFor();
    assert.equal(await screen.count(), 0);

    // Closed again, its own button starts a new project.
    await command("close-project");
    await screen.getByRole("button", { name: /Novo projeto/ }).click();
    await screen.waitFor({ state: "detached" });
    assert.deepEqual(await calls(), ["close", "open-file", "close", "new"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
