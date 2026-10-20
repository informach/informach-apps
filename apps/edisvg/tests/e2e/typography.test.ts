import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { applyAsset } from "../../src/shared/assets";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { arabicFontFixture } from "../assetFixtures";
import { rendererServer } from "../rendererServer";

const greeting = "مرحبا بالعالم";
/** One text with a string input bound to it; optionally an embedded font. */
function textProject(text: string, font?: ReturnType<typeof arabicFontFixture>) {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  board.scene.viewBox = [0, 0, 400, 100];
  if (font) applyAsset(project, board.scene, { type: "asset", operation: "put", value: font });
  const textId = editScene(board.scene, null, "add", {
    tag: "text",
    attrs: { x: "300", y: "60", "font-size": "30", fill: "#000000", "text-anchor": "start" },
  });
  if (!textId) throw new Error("Missing text");
  editScene(board.scene, textId, "text", text);
  editScene(board.scene, textId, "text-direction", "auto");
  if (font)
    applyAsset(project, board.scene, {
      type: "asset",
      operation: "set-font",
      targetId: textId,
      assetId: font.id,
      fontFallbackIds: [],
    });
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-text", kind: "string", name: "Texto", initial: text }],
    bindings: [
      {
        id: "binding-text",
        inputId: "input-text",
        targetId: textId,
        kind: "text",
        direction: "two-way",
      },
    ],
  };
  return { project: parseProject(project), boardId: board.id, textId };
}

test("the font without contextual substitutions really draws unjoined forms, and the compiler refuses it", {
  timeout: 60000,
}, async () => {
  const shaped = arabicFontFixture(),
    unjoined = arabicFontFixture(true),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>@font-face{font-family:Shaped;src:url(data:font/ttf;base64,${shaped.data})}@font-face{font-family:Unjoined;src:url(data:font/ttf;base64,${unjoined.data})}</style><svg width="800" height="200"><text id="shaped" x="10" y="60" font-size="40" font-family="Shaped">${greeting}</text><text id="unjoined" x="10" y="140" font-size="40" font-family="Unjoined">${greeting}</text></svg>`,
    );
    const widths = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.fonts].map((font) => font.load()));
      return ["shaped", "unjoined"].map((id) => {
        const text = document.getElementById(id);
        if (!(text instanceof SVGTextElement)) throw new Error("Missing text");
        return text.getComputedTextLength();
      });
    });
    const [joined, isolated] = widths;
    assert.ok(joined && isolated);
    // Isolated letter forms are wider than the joined word: the gate matches a visible defect.
    assert.ok(isolated - joined > 10, JSON.stringify(widths));
    // The portable compiler refuses before any player or export exists.
    const refused = textProject(greeting, unjoined);
    assert.throws(
      () => compileInteractiveArtboard(refused.project, refused.boardId),
      /formas contextuais/,
    );
    // The shaped font compiles and the shared player draws the joined word.
    const accepted = textProject(greeting, shaped),
      compiled = compileInteractiveArtboard(accepted.project, accepted.boardId);
    await page.setContent(compiled.svg);
    await page.addScriptTag({ content: code });
    const drawn = await page.evaluate(
      async ({ blueprint, id }) => {
        const api = window.EdiAssetTest,
          root = document.querySelector("svg");
        if (!api || !root) throw new Error("Missing player host");
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false });
        const text = document.querySelector(`[data-edi-object="${id}"]>text`);
        if (!(text instanceof SVGTextElement)) throw new Error("Missing text");
        return { width: text.getComputedTextLength(), direction: text.getAttribute("direction") };
      },
      { blueprint: compiled.document, id: accepted.textId },
    );
    assert.equal(drawn.direction, "rtl");
    // Same font size as the probe above scaled 30/40: joined, not isolated, widths.
    assert.ok(Math.abs(drawn.width - (joined * 30) / 40) < 2, JSON.stringify({ drawn, widths }));
  } finally {
    await browser.close();
  }
});

test("auto direction re-resolves when bound text changes in the player", {
  timeout: 60000,
}, async () => {
  const fixture = textProject("Olá"),
    compiled = compileInteractiveArtboard(fixture.project, fixture.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>svg{width:800px;height:200px}</style>${compiled.svg.replace("<svg ", '<svg id="live" ')}`,
    );
    await page.addScriptTag({ content: code });
    const read = () =>
      page.evaluate((id) => {
        const text = document.querySelector(`[data-edi-object="${id}"]>text`);
        if (!(text instanceof SVGTextElement)) throw new Error("Missing text");
        const box = text.getBBox();
        return { direction: text.getAttribute("direction"), left: box.x, right: box.x + box.width };
      }, fixture.textId);
    await page.evaluate(async (blueprint) => {
      const api = window.EdiAssetTest,
        root = document.querySelector("#live");
      if (!api || !(root instanceof SVGSVGElement)) throw new Error("Missing player host");
      Reflect.set(
        window,
        "textPlayer",
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false }),
      );
    }, compiled.document);
    const latin = await read();
    assert.equal(latin.direction, "ltr");
    assert.ok(Math.abs(latin.left - 300) < 1, JSON.stringify(latin));
    await page.evaluate(() => {
      Reflect.get(window, "textPlayer").setInput("input-text", "שלום עולם");
      Reflect.get(window, "textPlayer").advance(0);
    });
    const hebrew = await read();
    assert.equal(hebrew.direction, "rtl");
    // Start anchoring in a right-to-left paragraph puts the text's right edge at x.
    assert.ok(Math.abs(hebrew.right - 300) < 1, JSON.stringify(hebrew));
  } finally {
    await browser.close();
  }
});

test("the text inspector applies automatic direction to the saved project and the preview", {
  timeout: 60000,
}, async () => {
  const fixture = textProject("שלום"),
    project = structuredClone(fixture.project),
    board = project.artboards[0],
    node = board?.scene.nodes[0];
  assert.ok(board && node);
  delete node.textDirection;
  node.attrs.direction = "ltr";
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      parseProject(project),
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator(`[data-scene-select="${fixture.textId}"]`).click();
    const panel = page.locator("[data-text-panel]");
    await panel.locator('select[name="direction"]').selectOption("auto");
    await panel.getByRole("button", { name: "Aplicar texto", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.scene.nodes[0]
          ?.textDirection === "auto",
    );
    assert.equal(
      await page
        .locator(`.scene-artwork [data-object="${fixture.textId}"]>text`)
        .getAttribute("direction"),
      "rtl",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
