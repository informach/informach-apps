import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior, parseFormulaText } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

/** A text showing a computed label and a rect moved by a time-driven wave. */
function formulaProject(withFormulas = true) {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const label = editScene(board.scene, null, "add", "text"),
    dot = editScene(board.scene, null, "add", "rect");
  if (!label || !dot) throw new Error("Missing objects");
  board.behavior = {
    ...emptyBehavior(),
    inputs: [
      { id: "input-points", name: "Pontos", kind: "number", min: 0, max: 100, initial: 3 },
      { id: "input-label", name: "Rótulo", kind: "string", initial: "" },
      { id: "input-wave", name: "Onda", kind: "number", min: -200, max: 200, initial: 0 },
    ],
    bindings: [
      {
        id: "binding-label",
        kind: "text",
        inputId: "input-label",
        targetId: label,
        direction: "one-way",
      },
      {
        id: "binding-wave",
        kind: "transform",
        inputId: "input-wave",
        targetId: dot,
        property: "x",
        scale: 1,
        offset: 0,
        direction: "one-way",
      },
    ],
    ...(withFormulas
      ? {
          formulas: [
            {
              id: "formula-label",
              inputId: "input-label",
              expression: parseFormulaText(
                'se($input-points >= 10, "Recorde!", texto("Pontos: ", $input-points * 2))',
              ),
            },
            {
              id: "formula-wave",
              inputId: "input-wave",
              expression: parseFormulaText("arredondar(sen(tempo) * 100)"),
            },
          ],
        }
      : {}),
  };
  return { project: parseProject(project), boardId: board.id, label, dot };
}

test("the player recomputes formulas on input writes and on the clock", {
  timeout: 60000,
}, async () => {
  const f = formulaProject(),
    compiled = compileInteractiveArtboard(f.project, f.boardId),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(compiled.svg.replace("<svg ", '<svg id="live" '));
    await page.addScriptTag({ content: code });
    await page.evaluate(async (blueprint) => {
      const api = window.EdiAssetTest,
        root = document.querySelector("#live");
      if (!api || !(root instanceof SVGSVGElement)) throw new Error("Missing host");
      Reflect.set(
        window,
        "formulaPlayer",
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false }),
      );
    }, compiled.document);
    const read = () =>
      page.evaluate(
        ({ label, dot }) => ({
          text: document.querySelector(`[data-edi-object="${label}"]>text`)?.textContent,
          transform: document
            .querySelector(`[data-edi-object="${dot}"]`)
            ?.getAttribute("transform"),
        }),
        { label: f.label, dot: f.dot },
      );
    assert.equal((await read()).text, "Pontos: 6");
    await page.evaluate(() => Reflect.get(window, "formulaPlayer").setInput("input-points", 12));
    await page.evaluate(() => Reflect.get(window, "formulaPlayer").advance(0));
    assert.equal((await read()).text, "Recorde!");
    const refused = await page.evaluate(() => {
      try {
        Reflect.get(window, "formulaPlayer").setInput("input-label", "x");
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    assert.match(refused, /somente leitura/);
    // sin(π/2)·100 = 100: the rect moved by the wave.
    await page.evaluate(() => Reflect.get(window, "formulaPlayer").advance(Math.PI / 2));
    assert.match((await read()).transform ?? "", /translate\(100[ ,]/);
  } finally {
    await browser.close();
  }
});

test("the Fórmulas tab compiles authoring text into a stored formula", {
  timeout: 60000,
}, async () => {
  const f = formulaProject(false),
    server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(
      (value) => localStorage.setItem("edisvg-project", JSON.stringify(value)),
      f.project,
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator('[data-action="machine"]').click();
    await page.getByRole("button", { name: "Fórmulas", exact: true }).click();
    const form = page.getByRole("form", { name: "Fórmula", exact: true });
    await form.getByLabel("Input calculado").selectOption("input-label");
    await form.getByRole("textbox", { name: "Fórmula" }).fill('texto("Total ", $input-points)');
    await form.getByRole("button", { name: "Criar fórmula", exact: true }).click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.artboards[0]?.behavior
          ?.formulas?.[0]?.expression?.op === "concat",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
