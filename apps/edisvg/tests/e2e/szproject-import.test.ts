import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";
import { game } from "../szprojectFixture";

test("a studio project becomes one artboard per SVG and a 3× scene built from its program, in one transaction", {
  timeout: 60000,
}, async () => {
  const code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<main>Estúdio</main>");
    // about:blank is not a secure context: no crypto.randomUUID there (the app has it).
    // A string, not a function: tsx would wrap a function with helpers the page does not have.
    await page.addScriptTag({
      content: `if (typeof crypto.randomUUID !== "function")
        Object.defineProperty(crypto, "randomUUID", { value() {
          const b = crypto.getRandomValues(new Uint8Array(16));
          b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
          const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
          return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
        } });`,
    });
    await page.addScriptTag({ content: code });
    const outcome = await page.evaluate(async (source) => {
      const api = window.EdiAssetTest;
      if (!api) throw new Error("Missing test API");
      const plan = api.planSzProjectImport(api.parseSzProject(source), (text) =>
        api.importSvg(text),
      );
      const project = api.newProject(),
        sessionId = crypto.randomUUID(),
        result = api.executeDocumentTransaction(
          { project, sessionId, revision: 0 },
          { projectId: project.id, sessionId, revision: 0, commands: plan.commands },
        );
      const after = result.project,
        scene = after.artboards.find((board) => board.id === plan.sceneArtboardId);
      if (!scene) throw new Error("Missing scene artboard");
      const compiled = api.compileArtboard(after, scene.id),
        holder = document.createElement("div");
      holder.innerHTML = api.renderEditorComposition(compiled);
      const root = holder.querySelector("svg");
      if (!(root instanceof SVGSVGElement)) throw new Error("Missing rendered scene");
      document.body.append(holder);
      // 1440×1080 drawn at 480×360: one pixel here is one pixel of the game.
      const pixels = await api.svgPixels(root, 480, 360, [
        [300, 200], // backdrop
        [50, 170], // the hero, 21..85 × 141..205
        [100, 20], // the warning bar, 8..472 × 8..36
      ]);
      return {
        summary: plan.summary,
        boards: after.artboards.map((board) => [board.name, board.scene.viewBox]),
        nodes: scene.scene.nodes.map((node) => ({
          name: node.name,
          tag: node.tag,
          x: node.transform.x,
          y: node.transform.y,
          box: node.instance ? [node.instance.width, node.instance.height] : null,
          text: node.text,
          size: node.attrs["font-size"] ?? null,
        })),
        pixels,
        project: after,
      };
    }, JSON.stringify(game));

    assert.deepEqual(outcome.boards, [
      ["Prancheta 1", [0, 0, 1080, 1080]],
      ["praia-tropical", [0, 0, 480, 360]],
      ["aventureiro", [0, 0, 64, 64]],
      ["pirata", [0, 0, 64, 64]],
      ["Cena · A Chave do Farol", [0, 0, 1440, 1080]],
    ]);
    assert.deepEqual(outcome.nodes, [
      { name: "Fundo do palco", tag: "rect", x: 0, y: 0, box: null, text: "", size: null },
      {
        name: "Cenário · praia-tropical",
        tag: "g",
        x: 0,
        y: 0,
        box: [1440, 1080],
        text: "",
        size: null,
      },
      {
        name: "personagem · aventureiro",
        tag: "g",
        x: 63,
        y: 423,
        box: [192, 192],
        text: "",
        size: null,
      },
      { name: "fundoAviso", tag: "rect", x: 24, y: 24, box: null, text: "", size: null },
      {
        name: "Texto · aviso",
        tag: "text",
        x: 60,
        y: 84,
        box: null,
        text: "Encontre a chave.",
        size: "48",
      },
    ]);
    assert.deepEqual(outcome.pixels, [
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [0x14, 0x3d, 0x35, 255],
    ]);
    // Never run, never read: the game's JavaScript is not in the project.
    assert.equal(JSON.stringify(outcome.project).includes("never run"), false);
    assert.match(outcome.summary, /^3 imagens viraram pranchetas, e a "Cena" \(1440×1080\)/);
    assert.match(outcome.summary, /Não importadas: foto \(não é SVG\)/);
    assert.match(outcome.summary, /A cena usa imagens que não vieram: veleiro/);
    assert.match(
      outcome.summary,
      /Fica para animar no EdiSVG \(não vem do jogo\): 1 evento do jogo, velocidades, controles do teclado, o que muda a cada quadro/,
    );
    // Saved and opened again: the project format takes it as it is.
    assert.equal(parseProject(outcome.project).artboards.length, 5);
  } finally {
    await browser.close();
  }
});

test("built editor: dropping a .szproject.json imports it as one edit, opens the scene and undoes whole", {
  timeout: 60000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    const before = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    const canceled = await page.evaluate((source) => {
      const data = new DataTransfer();
      data.items.add(
        new File([source], "projeto-final.szproject.json", { type: "application/json" }),
      );
      const event = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
      document.querySelector(".scene-artwork")?.dispatchEvent(event);
      return event.defaultPrevented;
    }, JSON.stringify(game));
    assert.equal(canceled, true);
    await page.locator(".scene-tree-heading small", { hasText: "1440 × 1080" }).waitFor();
    const imported = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    assert.ok(imported && imported !== before);
    const project = parseProject(JSON.parse(imported));
    assert.deepEqual(
      project.artboards.map((board) => board.name),
      ["Prancheta 1", "praia-tropical", "aventureiro", "pirata", "Cena · A Chave do Farol"],
    );
    await page.getByText(/Projeto do Estúdio importado\. 3 imagens viraram pranchetas/).waitFor();
    // The whole import is one edit.
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
