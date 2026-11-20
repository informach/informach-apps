import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { executeDocumentTransaction } from "../../src/shared/documentCommands";
import { newProject, parseProject } from "../../src/shared/project";
import { rendererServer } from "../rendererServer";

/**
 * The desktop bridge of a linked project (packages/edi-link), faked in the page before the
 * editor starts: the requests EdiAula leaves (a queue the test fills), the manifest of the
 * project's linked animations, the render queue (the open project as last saved, and the
 * projects `left` by the last session, each with its links), and the encoder, which counts what
 * it gets. A render of the item in `window.__hold` waits at its first frame until it leaves the
 * queue. A string, so tsx adds nothing to it.
 */
const linkedDesktop = (project: string, left = "[]") => `
  (() => {
    const project = ${project};
    const status = { name: "Aula 3.edisvg", path: "C:\\\\Aulas\\\\Aula 3.edisvg", dirty: false };
    window.__requests = [];
    window.__done = [];
    window.__registered = [];
    window.__items = [];
    window.__renders = [];
    window.__saves = 0;
    window.__saved = project;
    window.__queue = ${left};
    window.__removed = [];
    let job = null;
    let release = null;
    const queued = (id) => window.__queue.find((item) => item.id === id);
    const linksOf = (id) => (queued(id)?.links ?? window.__items);
    window.desktop = {
      projectInitialize: async () => ({ project, status, recovered: false }),
      // The file as opened: an edit after the save that follows is the person's own.
      projectChanged: async () => status,
      projectSave: async (saved) => {
        window.__saves++;
        window.__saved = saved;
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
      linkQueue: async () => window.__queue.map(({ id, name }) => ({ id, name })),
      // The open project: queued once, by its file, when it has linked animations.
      linkQueueAdd: async () => {
        if (!window.__items.length) return null;
        if (!window.__queue.some((item) => item.id === "fila-aberto"))
          window.__queue.push({ id: "fila-aberto", name: "Aula 3" });
        return "fila-aberto";
      },
      linkQueueLoad: async (id) => {
        const item = queued(id);
        if (!item) throw new Error("Este render já saiu da fila.");
        return structuredClone(
          item.project ? { project: item.project, links: item.links } : { project: window.__saved, links: window.__items },
        );
      },
      linkQueueRemove: async (id) => {
        window.__removed.push(id);
        window.__queue = window.__queue.filter((item) => item.id !== id);
        if (window.__hold === id) release?.();
      },
      linkQueueRegister: async (id, input) => {
        window.__registered.push({ queue: id, ...input });
        return { ...input, updatedAt: 1 };
      },
      linkError: async (id, animationId, message) => {
        window.__linkError = message;
      },
      linkRenderStart: async (id, spec) => {
        job = { queue: id, spec, frames: 0, sizes: new Set(), opaque: 0 };
        return "render-1";
      },
      linkRenderFrame: async (id, bytes) => {
        if (window.__hold === job.queue && !window.__removed.includes(job.queue))
          await new Promise((resolve) => {
            release = resolve;
          });
        job.frames++;
        job.sizes.add(bytes.length);
        for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) job.opaque++;
      },
      linkRenderFinish: async () => {
        const item = linksOf(job.queue).find((i) => i.animationId === job.spec.animationId);
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

/** A lesson's saved project with one linked animation of `frames` frames at 10 FPS. */
function lessonProject(name: string, frames: number) {
  const project = newProject();
  const sessionId = crypto.randomUUID();
  const animationId = `animation-${crypto.randomUUID()}`;
  const result = executeDocumentTransaction(
    { project, revision: 0, sessionId },
    {
      projectId: project.id,
      sessionId,
      revision: 0,
      commands: [
        { type: "scene", operation: "add", targetId: null, value: "rect" },
        {
          type: "motion",
          command: {
            type: "create-animation",
            animation: { id: animationId, name, frames, fps: 10, mode: "once", tracks: [] },
          },
        },
      ],
    },
  );
  const board = result.project.artboards[0];
  assert.ok(board);
  return {
    project: result.project,
    links: [{ animationId, artboardId: board.id, name, updatedAt: 1 }],
  };
}

test("renders left in the queue go on at start, one project at a time, and one can be stopped from the list", {
  timeout: 90000,
}, async () => {
  const server = await rendererServer(),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const left = [
      { id: "fila-1", name: "Aula 1", ...lessonProject("Abertura", 40) },
      { id: "fila-2", name: "Aula 2", ...lessonProject("Fechamento", 6) },
    ];
    // The open project is another one: the queue renders projects that are not open.
    await page.addInitScript(linkedDesktop(JSON.stringify(newProject()), JSON.stringify(left)));
    await page.addInitScript(() => {
      (window as unknown as { __hold: string }).__hold = "fila-1";
    });
    await page.goto(server.url);
    await page.locator(".scene-artwork>svg").waitFor();

    // Aula 1 renders first (held at its first frame); Aula 2 waits behind it.
    const status = page.locator("[data-link-status]");
    await status.filter({ hasText: "Abertura · quadro 0 de 40 · +1 na fila" }).waitFor();
    await status.click();
    const list = page.locator("#link-queue");
    await list.waitFor();
    assert.deepEqual(await list.locator("li strong").allTextContents(), ["Aula 1", "Aula 2"]);
    assert.equal(await list.locator("li").nth(1).locator("span").textContent(), "Na fila");

    // Stopping Aula 1 takes it out; Aula 2 renders whole and leaves the queue too.
    await list.getByRole("button", { name: "Parar: Aula 1" }).click();
    await page.waitForFunction(
      () => (window as unknown as { __renders: unknown[] }).__renders.length === 1,
    );
    const seen = (await page.evaluate(
      "({ renders: window.__renders, removed: window.__removed, queue: window.__queue })",
    )) as {
      renders: { queue: string; spec: { animationId: string }; frames: number }[];
      removed: string[];
      queue: unknown[];
    };
    assert.deepEqual(
      seen.renders.map((r) => [r.queue, r.spec.animationId, r.frames]),
      [["fila-2", left[1]?.links[0]?.animationId, 6]],
    );
    await page.waitForFunction(() =>
      (window as unknown as { __removed: string[] }).__removed.includes("fila-2"),
    );
    assert.deepEqual(await page.evaluate("window.__removed"), ["fila-1", "fila-2"]);
    await status.waitFor({ state: "hidden" });
    await list.locator("text=Nada na fila.").waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
