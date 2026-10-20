import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Page } from "playwright";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { compileInteractiveArtboard } from "../../src/shared/interactive";
import { newProject, parseProject } from "../../src/shared/project";
import { assetTestBundle } from "../assetBundle";
import { rendererServer } from "../rendererServer";

const clipId = "animation-order";
/** Three overlapping squares: A at the root, B and C inside group G. */
function fixture() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    boardId = project.defaultArtboardId;
  assert.ok(boardId);
  const run = (commands: unknown[]) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, sessionId, revision, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  const add = (fill: string) => {
    const id = run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: { tag: "rect", attrs: { x: "300", y: "300", width: "480", height: "480", fill } },
      },
    ]).selected;
    assert.ok(id);
    return id;
  };
  const [a, b, c] = [add("#e33a60"), add("#2050b0"), add("#00a080")];
  const group = run([
    { type: "composition", operation: "group", targetIds: [b, c], name: "G" },
  ]).selected;
  assert.ok(group);
  const order = (scopeId: string | null, frame: number, value: string[]) => ({
    type: "motion",
    command: { type: "set-draw-order", animationId: clipId, scopeId, frame, order: value },
  });
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: { id: clipId, name: "Ordem", fps: 10, frames: 10, mode: "loop", tracks: [] },
      },
    },
    order(null, 0, [group, a]),
    order(null, 5, [a, group]),
    order(group, 3, [c, b]),
  ]);
  return { project, boardId, a, b, c, group };
}
/** The object painted at the artboard centre and the stacking of each scope, in DOM order. */
function probe(page: Page, root: string, hook: string) {
  return page.evaluate(
    ({ root, hook }) => {
      const svg = document.querySelector(root);
      if (!(svg instanceof SVGSVGElement)) throw new Error("Missing scene");
      const box = svg.getBoundingClientRect(),
        hit = document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest(`[${hook}]`);
      const groups = [...svg.querySelectorAll(`[${hook}]`)].map((element) => [
        ...(element.parentElement?.children ?? []),
      ]);
      return {
        top: hit?.getAttribute(hook) ?? null,
        stacks: groups.map((siblings) =>
          siblings.flatMap((element) => element.getAttribute(hook) ?? []),
        ),
      };
    },
    { root, hook },
  );
}

test("the shared player restacks scopes in steps and restores the markup on destroy", {
  timeout: 60000,
}, async () => {
  const f = fixture(),
    compiled = compileInteractiveArtboard(f.project, f.boardId, { animationId: clipId }),
    code = await assetTestBundle(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    // Host-owned markup: the interactive player must hand it back as authored.
    const page = await browser.newPage();
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:540px;height:540px}</style>${compiled.svg.replace("<svg ", '<svg id="live" ')}`,
    );
    await page.addScriptTag({ content: code });
    const authored = await probe(page, "#live", "data-edi-object");
    await page.evaluate(async (blueprint) => {
      const api = window.EdiAssetTest,
        live = document.querySelector("#live");
      if (!api || !(live instanceof SVGSVGElement)) throw new Error("Missing host");
      Reflect.set(
        window,
        "orderPlayer",
        await api.createInteractiveSvgPlayerAsync(live, blueprint, {
          autoplay: false,
          pauseOffscreen: false,
          respectReducedMotion: false,
        }),
      );
    }, compiled.document);
    const advance = (seconds: number) =>
      page.evaluate((seconds) => Reflect.get(window, "orderPlayer").advance(seconds), seconds);
    // Frame 0: A above G; inside G the first key (frame 3) already holds: B above C.
    await advance(0);
    assert.equal((await probe(page, "#live", "data-edi-object")).top, f.a);
    await advance(0.29);
    assert.equal((await probe(page, "#live", "data-edi-object")).top, f.a);
    await advance(0.21);
    const swapped = await probe(page, "#live", "data-edi-object");
    assert.equal(swapped.top, f.b);
    assert.ok(swapped.stacks.some((stack) => stack.join() === [f.a, f.group].join()));
    assert.ok(swapped.stacks.some((stack) => stack.join() === [f.c, f.b].join()));
    await page.evaluate(() => Reflect.get(window, "orderPlayer").destroyAsync());
    assert.deepEqual(await probe(page, "#live", "data-edi-object"), authored);
  } finally {
    await browser.close();
  }
});

test("the Animate inspector writes stepped keys and the preview follows the playhead", {
  timeout: 60000,
}, async () => {
  const f = fixture(),
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
      parseProject(f.project),
    );
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();
    await page.locator(`[data-scene-select="${f.a}"]`).click();
    await page.locator('[data-action="animate"]').click();
    const panel = page.getByRole("region", { name: "Ordem de desenho animada" }),
      stack = panel.getByRole("list", { name: "Pilha no quadro atual" });
    await stack.waitFor();
    // Front first: A, the selected object, holds the top at frame 0.
    assert.equal(await stack.getByRole("listitem").count(), 2);
    assert.equal(await stack.getByRole("listitem").first().getAttribute("aria-current"), "true");
    const scene = ".scene-artwork>svg";
    assert.equal((await probe(page, scene, "data-object")).top, f.a);
    await panel.getByRole("button", { name: "Descer neste quadro", exact: true }).click();
    await page.waitForFunction(
      ({ clipId, a }) =>
        JSON.parse(localStorage.getItem("edisvg-project") ?? "null")?.motion.animations.find(
          (clip: { id: string }) => clip.id === clipId,
        )?.drawOrders?.[0]?.keys[0]?.order[0] === a,
      { clipId, a: f.a },
    );
    // G now covers A at frame 0, and inside G the held first key keeps B on top.
    await page.waitForFunction((b) => {
      const svg = document.querySelector(".scene-artwork>svg");
      if (!svg) return false;
      const box = svg.getBoundingClientRect();
      return (
        document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest("[data-object]")
          ?.getAttribute("data-object") === b
      );
    }, f.b);
    await panel.getByRole("button", { name: "Remover chave de ordem", exact: true }).waitFor();
    for (let frame = 0; frame < 5; frame++) await page.locator('[data-action="next"]').click();
    await panel.getByText(/quadros 0, 5/).waitFor();
    assert.equal(
      await panel.getByRole("button", { name: "Subir neste quadro", exact: true }).isDisabled(),
      false,
    );
    await page.locator('[data-action="design"]').click();
    // Design shows the authored stacking: C is the last authored child of G, A below G.
    assert.equal((await probe(page, scene, "data-object")).top, f.c);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
