import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildInteractiveExport } from "../../src/renderer/src/behavior/export";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { semanticFixture } from "../semanticFixture";

test("semantic SVG exposes actual accessible names/descriptions, keyboard activation and decorative exclusion without cross-player IDs", {
  timeout: 60000,
}, async () => {
  const fixture = semanticFixture(),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<svg aria-label="Primeiro"><title>Host original</title></svg><svg aria-label="Segundo"></svg>',
    );
    await page.addScriptTag({ content: code });
    const owners = await page.evaluateHandle(async (blueprint) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing semantic runtime");
      const roots = [...document.querySelectorAll("svg")],
        players = [];
      for (const root of roots)
        players.push(
          await api.createVisualSvgPlayerAsync(root, blueprint, {
            autoplay: false,
            pauseOffscreen: false,
          }),
        );
      return { roots, players };
    }, compiled.document);
    try {
      const buttons = page.getByRole("button", { name: "Acenar para você", exact: true });
      assert.equal(await buttons.count(), 2);
      await buttons.first().focus();
      await page.keyboard.press("Space");
      assert.deepEqual(
        await owners.evaluate(({ players }) =>
          players.map((player) => player.getInput("input-active")),
        ),
        [true, false],
      );
      await owners.evaluate(({ players }) => players[0]?.reset());
      await page.keyboard.press("Enter");
      assert.deepEqual(
        await owners.evaluate(({ players }) =>
          players.map((player) => player.getInput("input-active")),
        ),
        [true, false],
      );
      assert.equal(
        await page
          .locator(`[data-edi-object="${fixture.decorativeId}"]`)
          .first()
          .getAttribute("aria-hidden"),
        "true",
      );
      assert.equal(
        await page
          .locator(`[data-edi-object="${fixture.decorativeId}"]`)
          .first()
          .getAttribute("tabindex"),
        null,
      );
      const cdp = await page.context().newCDPSession(page),
        tree = await cdp.send("Accessibility.getFullAXTree");
      const exposed = tree.nodes.filter(
        (node) =>
          !node.ignored && node.role?.value === "button" && node.name?.value === "Acenar para você",
      );
      assert.equal(exposed.length, 2);
      for (const node of exposed)
        assert.equal(node.description?.value, "Ativa o aceno pelo teclado ou toque.");
      await cdp.detach();
      await owners.evaluate(async ({ players }) => {
        for (const player of players) await player.destroyAsync();
      });
      assert.equal(await page.locator("svg").first().innerHTML(), "<title>Host original</title>");
      assert.equal(await page.getByRole("button", { name: "Acenar para você" }).count(), 0);
    } finally {
      await owners.evaluate(async ({ players }) => {
        for (const player of players) await player.destroyAsync();
      });
      await owners.dispose();
    }
    const html = buildInteractiveExport(
      fixture.project,
      { format: "interactive-html", alt: "Semântica", reduced: false, offscreen: false },
      await readFile("out/renderer/edi-player.global.js", "utf8"),
    );
    await page.setContent(html.content);
    await page.getByRole("button", { name: "Acenar para você", exact: true }).waitFor();
    assert.equal(await page.locator("#player-status").textContent(), "");
    await page.getByRole("button", { name: "Acenar para você", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => Reflect.get(window, "ediSVGInteractivePlayer")?.getInput("input-active") === true,
    );
  } finally {
    await browser.close();
  }
});

test("built semantic inspector authors metadata transactionally and preserves undo, recovery and isolated Testar", {
  timeout: 60000,
}, async () => {
  const fixture = semanticFixture(),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 960 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.evaluate(
      (project) => localStorage.setItem("edisvg-project", JSON.stringify(project)),
      fixture.project,
    );
    await page.reload();
    await page.locator(`.scene-artwork [data-object="${fixture.buttonId}"]`).click();
    await page.locator('[data-inspector-section="semantics"] > summary').click();
    const panel = page.getByRole("region", { name: "Semântica acessível", exact: true });
    // A section with an accessible name is exposed as a region by the browser.
    await panel.getByLabel("Nome acessível", { exact: true }).fill("Cumprimentar");
    await panel
      .getByLabel("Descrição acessível", { exact: true })
      .fill("Ação configurada pelo autor.");
    await panel.getByLabel("Tipo acessível", { exact: true }).selectOption("decorative");
    await panel.getByLabel("Tipo acessível", { exact: true }).selectOption("button");
    assert.equal(
      await panel.getByLabel("Nome acessível", { exact: true }).inputValue(),
      "Cumprimentar",
    );
    assert.equal(
      await panel.getByLabel("Descrição acessível", { exact: true }).inputValue(),
      "Ação configurada pelo autor.",
    );
    const previous = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(previous?.includes("Acenar para você"));
    await panel.getByRole("button", { name: "Aplicar semântica", exact: true }).click();
    await page.waitForFunction(() =>
      localStorage.getItem("edisvg-project")?.includes("Cumprimentar"),
    );
    await page.locator('[data-action="undo"]').click();
    await page.waitForFunction(() =>
      localStorage.getItem("edisvg-project")?.includes("Acenar para você"),
    );
    await page.locator('[data-action="redo"]').click();
    await page.reload();
    await page.waitForFunction(() =>
      localStorage.getItem("edisvg-project")?.includes("Cumprimentar"),
    );
    const persisted = parseProject(
      await page.evaluate(() => JSON.parse(localStorage.getItem("edisvg-project") ?? "null")),
    );
    assert.equal(persisted.artboards[0]?.scene.nodes[0]?.semantics?.kind, "button");
    const stable = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    await page.locator('[data-action="test"]').click();
    const dialog = page.getByRole("dialog", { name: "Testar interação", exact: true }),
      button = dialog.getByRole("button", { name: "Cumprimentar", exact: true });
    await button.waitFor();
    await button.focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Fechar teste", exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stable);
    await page.locator(`.scene-artwork [data-object="${fixture.buttonId}"]`).click();
    await page.locator('[data-inspector-section="semantics"] > summary').click();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "../../.cache/edisvg-review/semantic-authoring.png" });
    await page.locator(".scene-artwork").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      document.querySelector('[data-action="play"]')?.textContent?.includes("Ⅱ"),
    );
    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      document.querySelector('[data-action="play"]')?.textContent?.includes("▶"),
    );
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), stable);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
