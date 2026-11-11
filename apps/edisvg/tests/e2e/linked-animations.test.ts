import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/**
 * The desktop bridge of a linked project (packages/edi-link), faked in the page before the
 * editor starts: the requests EdiAula leaves (a queue the test fills), the manifest of the
 * project's linked animations, and the encoder, which counts what it gets. A string, so tsx adds
 * nothing to it.
 */
const linkedDesktop = (project: string) => `
  (() => {
    const project = ${project};
    const status = { name: "Aula 3.edisvg", path: "C:\\\\Aulas\\\\Aula 3.edisvg", dirty: false };
    window.__requests = [];
    window.__done = [];
    window.__registered = [];
    window.__items = [];
    window.__renders = [];
    window.__saves = 0;
    let job = null;
    window.desktop = {
      projectInitialize: async () => ({ project, status, recovered: false }),
      // The file as opened: an edit after the save that follows is the person's own.
      projectChanged: async () => status,
      projectSave: async () => {
        window.__saves++;
        return { saved: true, ...status };
      },
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
      linkOpenProject: async () => ({ same: true, project: null, status }),
      linkOpenFile: async () => null,
      linkDone: async (id) => {
        window.__done.push(id);
      },
      linkList: async () => structuredClone(window.__items),
      linkRegister: async (projectId, input) => {
        window.__registered.push({ projectId, ...input });
        const before = window.__items.find((i) => i.animationId === input.animationId);
        const item = { ...before, ...input, updatedAt: 1 };
        window.__items = [...window.__items.filter((i) => i !== before), item];
        return item;
      },
      linkError: async (projectId, animationId, message) => {
        window.__linkError = message;
      },
      linkRenderStart: async (projectId, spec) => {
        job = { spec, frames: 0, sizes: new Set(), opaque: 0 };
        return "render-1";
      },
      linkRenderFrame: async (id, bytes) => {
        job.frames++;
        job.sizes.add(bytes.length);
        for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) job.opaque++;
      },
      linkRenderFinish: async () => {
        const item = window.__items.find((i) => i.animationId === job.spec.animationId);
        item.render = { file: job.spec.animationId + "-" + job.spec.hash + ".webm", ...job.spec };
        window.__renders.push({ ...job, sizes: [...job.sizes] });
        job = null;
        return item;
      },
      linkRenderCancel: async () => {
        job = null;
      },
    };
  })();`;

test("a linked animation: EdiAula asks for it, it is made at the lesson's size, and each save renders what changed", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(linkedDesktop(JSON.stringify(newProject())));
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();

    // EdiAula's "Nova animação do EdiSVG": a stretch of 1 s, at the lesson's 320×180 and 10 FPS.
    await page.evaluate(() => {
      const w = window as unknown as { __requests: unknown[]; __linkWaiting(): void };
      w.__requests.push({
        version: 1,
        id: "pedido-0001",
        from: "ediaula",
        type: "create",
        project: "C:\\Aulas\\Aula 3.edisvg",
        name: "Parte 6",
        width: 320,
        height: 180,
        fps: 10,
        duration: 1,
      });
      w.__linkWaiting();
    });
    await page.waitForFunction(
      () => (window as unknown as { __renders: unknown[] }).__renders.length === 1,
    );
    const project = parseProject(
      JSON.parse((await page.evaluate(() => localStorage.getItem("edisvg-project"))) ?? "null"),
    );
    const board = project.artboards.find((b) => b.name === "Parte 6");
    assert.deepEqual(board?.scene.viewBox, [0, 0, 320, 180]);
    const animation = project.motion.animations.find((a) => a.name === "Parte 6");
    assert.equal(animation?.fps, 10);
    assert.equal(animation?.frames, 10);
    assert.equal(animation?.mode, "once");
    const seen = (await page.evaluate(
      "({ registered: window.__registered, done: window.__done, saves: window.__saves, renders: window.__renders })",
    )) as {
      registered: { animationId: string; artboardId: string; name: string; requestId: string }[];
      done: string[];
      saves: number;
      renders: { spec: Record<string, unknown>; frames: number; sizes: number[]; opaque: number }[];
    };
    // Linked with the request's id (EdiAula finds its animation by it), saved, then rendered.
    assert.deepEqual(
      seen.registered.map((r) => [r.animationId, r.artboardId, r.name, r.requestId]),
      [[animation?.id, board?.id, "Parte 6", "pedido-0001"]],
    );
    assert.deepEqual(seen.done, ["pedido-0001"]);
    assert.equal(seen.saves, 1);
    const [render] = seen.renders;
    assert.equal(render?.spec.animationId, animation?.id);
    assert.equal(render?.frames, 10);
    assert.deepEqual(render?.sizes, [320 * 180 * 4]);
    // Nothing drawn yet: every pixel transparent.
    assert.equal(render?.opaque, 0);

    // Saving again without changing the animation renders nothing.
    await page.evaluate(() =>
      (window as unknown as { __command(c: string): void }).__command("save"),
    );
    await page.waitForFunction(() => (window as unknown as { __saves: number }).__saves === 2);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate("window.__renders.length"), 1);

    // "Editar no EdiSVG": the animation is chosen, nothing renders, the request is done.
    await page.evaluate((id) => {
      const w = window as unknown as { __requests: unknown[]; __linkWaiting(): void };
      w.__requests.push({
        version: 1,
        id: "pedido-0002",
        from: "ediaula",
        type: "open",
        project: "C:\\Aulas\\Aula 3.edisvg",
        animationId: id,
      });
      w.__linkWaiting();
    }, animation?.id);
    await page.locator("#toast", { hasText: 'Editando "Parte 6" para a aula' }).waitFor();
    assert.deepEqual(await page.evaluate("window.__done"), ["pedido-0001", "pedido-0002"]);
    assert.equal(await page.evaluate("window.__renders.length"), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
