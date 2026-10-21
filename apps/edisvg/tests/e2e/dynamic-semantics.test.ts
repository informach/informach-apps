import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { chromium } from "playwright";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { editScene } from "../../src/shared/scene.js";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

/** A score group whose accessible name and description follow two inputs. */
function scoreProject() {
  const project = newProject(),
    board = project.artboards[0];
  if (!board) throw new Error("Missing board");
  const shape = editScene(board.scene, null, "add", "rect");
  if (!shape) throw new Error("Missing shape");
  const group = shape;
  editScene(board.scene, group, "semantics", {
    kind: "image",
    label: "Placar",
    description: "Partida em andamento",
    live: "polite",
  });
  board.behavior = {
    ...emptyBehavior(),
    inputs: [
      { id: "input-points", name: "Pontos", kind: "number", min: 0, max: 100000, initial: 0 },
      { id: "input-done", name: "Fim", kind: "boolean", initial: false },
    ],
    bindings: [
      {
        id: "binding-label",
        kind: "semantics",
        inputId: "input-points",
        targetId: group,
        property: "label",
        template: "Placar: {valor} pontos",
        direction: "one-way",
      },
      {
        id: "binding-description",
        kind: "semantics",
        inputId: "input-done",
        targetId: group,
        property: "description",
        template: "Partida encerrada: {valor}",
        direction: "one-way",
      },
    ],
  };
  return { project: parseProject(project), boardId: board.id, group };
}

test("bound accessible names and descriptions update the real accessibility tree of a live region", {
  timeout: 60000,
}, async () => {
  const f = scoreProject(),
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
        "scorePlayer",
        await api.createInteractiveSvgPlayerAsync(root, blueprint, { autoplay: false }),
      );
    }, compiled.document);
    const cdp = await page.context().newCDPSession(page),
      find = async (name: string) =>
        (await cdp.send("Accessibility.getFullAXTree")).nodes.find(
          (item) => !item.ignored && item.name?.value === name,
        );
    const initial = await find("Placar: 0 pontos");
    assert.ok(initial, "initial bound name");
    assert.equal(initial.description?.value, "Partida encerrada: não");
    assert.equal(
      initial.properties?.find((property) => property.name === "live")?.value.value,
      "polite",
    );
    await page.evaluate(() => {
      const player = Reflect.get(window, "scorePlayer");
      player.setInput("input-points", 1234.5);
      player.setInput("input-done", true);
      player.advance(0);
    });
    const updated = await find("Placar: 1.234,5 pontos");
    assert.ok(updated, "updated bound name");
    assert.equal(updated.description?.value, "Partida encerrada: sim");
    await cdp.detach();
  } finally {
    await browser.close();
  }
});

test("the semantics panel turns the object into a live region", {
  timeout: 60000,
}, async () => {
  const f = scoreProject(),
    project = structuredClone(f.project),
    board = project.artboards[0],
    group = board?.scene.nodes.find((node) => node.id === f.group);
  assert.ok(board?.behavior && group?.semantics && group.semantics.kind !== "decorative");
  delete group.semantics.live;
  board.behavior.bindings = [];
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
    await page.locator(`[data-scene-select="${f.group}"]`).click();
    const semantics = page.getByRole("region", { name: "Semântica acessível" });
    await semantics.getByLabel("Anunciar mudanças").selectOption("polite");
    await semantics.getByRole("button", { name: "Aplicar semântica", exact: true }).click();
    await page.waitForFunction(
      (id) =>
        JSON.parse(
          localStorage.getItem("edisvg-project") ?? "null",
        )?.artboards[0]?.scene.nodes.find((node: { id: string }) => node.id === id)?.semantics
          ?.live === "polite",
      f.group,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
