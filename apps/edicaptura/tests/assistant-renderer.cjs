const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { GuideStore } = require("../src/main/guides.ts");
const { taskContextSchema } = require("../src/domain/assistant.ts");

// The assistant's review, proposals and undo in real Chromium. The main process is a stand-in
// that records what would be sent and answers like a finished run; no client is started.
async function run() {
  const parent = path.resolve(__dirname, "../test-results/assistant-renderer");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "case-"));
  const store = new GuideStore(root);
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    configFile: false,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const sent = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => failures.push(error.message));
    await page.exposeFunction("taskSent", (input) => {
      // What would cross to the main process must already satisfy the main's schema.
      taskContextSchema.parse(input.context);
      sent.push(input);
    });
    await page.exposeFunction("guideSave", ({ guide, assets }) =>
      store.save(
        guide,
        assets.map((a) => ({ id: a.id, bytes: Uint8Array.from(a.bytes) })),
      ),
    );
    await page.exposeFunction("guideRead", (id) => store.read(id));
    await page.exposeFunction("guideList", () => store.list());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/renderer.html`);
    await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const { createAssistant, mountCaptureAssistant } = await import("/src/editor/assistant.js");
      const { mountGuides } = await import("/src/editor/guides.js");
      const source = document.createElement("canvas");
      source.width = 300;
      source.height = 160;
      const ctx = source.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 300, 160);
      ctx.fillStyle = "#c00";
      ctx.fillRect(0, 0, 60, 60);
      const extras = document.createElement("div");
      extras.className = "editor-extras";
      const actions = document.createElement("section");
      actions.className = "main-actions";
      const canvas = document.createElement("canvas");
      document.body.append(actions, extras, canvas);
      const engine = new CanvasEditor(canvas, {
        change() {},
        selection() {},
        text: async () => "",
      });
      await engine.load({ dataUrl: source.toDataURL(), annotations: [] });
      engine.addAnnotation("redact", { x: 0, y: 0, x2: 60, y2: 60 });
      const fixture = {
        updates: [],
        stops: 0,
        clients: [{ id: "claude-code", name: "Claude Code", installed: true, version: "2.1" }],
        toasts: [],
      };
      window.aiFixture = fixture;
      let listener = null;
      let doc = {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "image",
        name: "Captura 3",
        tags: ["antigo"],
      };
      const api = {
        aiClients: async () => fixture.clients,
        aiTaskStart: async (input) => {
          await window.taskSent(input);
          const runId = crypto.randomUUID();
          fixture.reply = (proposal, targetId) => {
            listener({
              runId,
              type: "tool",
              title: "Ler a tarefa",
              status: "done",
              id: "t",
              name: "get_task",
            });
            listener({
              runId,
              type: "proposal",
              task: input.context.task,
              targetId: targetId ?? input.context.targetId,
              proposal,
            });
            listener({ runId, type: "ended" });
          };
          return { runId };
        },
        aiTaskStop: async () => {
          fixture.stops++;
        },
        onAiEvent: (callback) => {
          listener = callback;
        },
        update: async (value) => fixture.updates.push(value),
        guideSave: ({ guide, assets }) =>
          window.guideSave({
            guide,
            assets: assets.map((a) => ({ id: a.id, bytes: Array.from(a.bytes) })),
          }),
        guideRead: (id) => window.guideRead(id),
        guideList: () => window.guideList(),
      };
      const assistant = createAssistant({ api });
      fixture.panel = mountCaptureAssistant({
        assistant,
        engine,
        current: () => doc,
        visibleText: () => "Relatório de vendas",
        toast: (message) => fixture.toasts.push(message),
        apply: async ({ name, tags }) => {
          await api.update({ id: doc.id, name, tags });
          doc = { ...doc, name, tags };
        },
      });
      fixture.panel.activate(doc);
      fixture.switchTo = (next) => {
        doc = next;
        fixture.panel.activate(next);
      };
      fixture.guides = mountGuides({
        api,
        engine,
        current: () => doc,
        toast: (m) => fixture.toasts.push(m),
        assistant,
      });
      document.querySelector("#ai-panel").open = true;
    });
    // 1. The review shows the sanitized image and keeps the text out unless the person adds it.
    await page.locator("#ai-capture-details").click();
    await page.waitForFunction(() => document.querySelector("#ai-review").open);
    assert.equal(await page.locator("#ai-review-images img").count(), 1);
    assert.equal(await page.locator("#ai-review-text").inputValue(), "Relatório de vendas");
    assert.equal(await page.locator("#ai-review-include-text").isChecked(), false);
    const shown = await page.locator("#ai-review-images img").getAttribute("src");
    const pixel = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const probe = document.createElement("canvas");
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      probe.getContext("2d").drawImage(image, 0, 0);
      return [...probe.getContext("2d").getImageData(10, 10, 1, 1).data.slice(0, 3)];
    }, shown);
    assert.ok(
      pixel.every((value) => value < 30),
      `masked area must be black, got ${pixel}`,
    );
    await page.locator("#ai-review-send").click();
    await page.waitForFunction(() => window.aiFixture.reply);
    assert.equal(sent[0].client, "claude-code");
    assert.equal(sent[0].context.text, "", "visible text is opt-in");
    // 2. The proposal is previewed, applied through the metadata update and undone the same way.
    await page.evaluate(() =>
      window.aiFixture.reply({ title: "Relatório de vendas de outubro", tags: ["vendas"] }),
    );
    await page.waitForFunction(() => !document.querySelector("#ai-proposal").hidden);
    assert.match(
      await page.locator("#ai-proposal-text").textContent(),
      /Relatório de vendas de outubro/,
    );
    await page.locator("#ai-apply").click();
    await page.waitForFunction(() => !document.querySelector("#ai-undo").hidden);
    await page.locator("#ai-undo").click();
    await page.waitForFunction(() => window.aiFixture.updates.length === 2);
    const updates = await page.evaluate(() => window.aiFixture.updates);
    assert.deepEqual(
      updates.map((u) => [u.name, u.tags]),
      [
        ["Relatório de vendas de outubro", ["vendas"]],
        ["Captura 3", ["antigo"]],
      ],
    );
    // 3. With the text, then a document switch: the task stops and its proposal never applies.
    await page.locator("#ai-capture-details").click();
    await page.locator("#ai-review-include-text").check();
    await page.locator("#ai-review-send").click();
    await page.waitForFunction(
      () => document.querySelector("#ai-stop") && !document.querySelector("#ai-stop").hidden,
    );
    assert.equal(sent[1].context.text, "Relatório de vendas");
    const stopsBefore = await page.evaluate(() => window.aiFixture.stops);
    await page.evaluate(() =>
      window.aiFixture.switchTo({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        kind: "image",
        name: "Outra",
        tags: [],
      }),
    );
    assert.equal(await page.evaluate(() => window.aiFixture.stops), stopsBefore + 1);
    await page.evaluate(() => window.aiFixture.reply({ title: "Tarde demais", tags: [] }));
    assert.equal(await page.locator("#ai-proposal").isHidden(), true, "late proposal is ignored");
    // 4. No client installed: the review explains and cannot send.
    await page.evaluate(() => {
      window.aiFixture.clients = [];
    });
    await page.locator("#ai-capture-details").click();
    await page.waitForFunction(() => document.querySelector("#ai-review").open);
    assert.match(await page.locator("#ai-review-problem").textContent(), /Nenhum assistente/);
    assert.equal(await page.locator("#ai-review-send").isDisabled(), true);
    await page.locator("#ai-review-cancel").click();
    // 5. Guide texts: proposed per step, applied together and undone together.
    await page.evaluate(() => {
      window.aiFixture.clients = [{ id: "codex", name: "Codex", installed: true }];
    });
    await page.locator("#guides").click();
    await page.locator("#guide-new").click();
    await page.waitForFunction(() =>
      /salvo neste/.test(document.querySelector("#guide-status").textContent),
    );
    await page.locator("#guide-add-current").click();
    await page.waitForFunction(() => document.querySelectorAll(".guide-step").length === 1);
    await page.waitForTimeout(700);
    await page.locator("#guide-ai").click();
    await page.waitForFunction(() => document.querySelector("#ai-review").open);
    await page.locator("#ai-review-send").click();
    await page.waitForFunction(() => window.aiFixture.reply);
    const guideTask = sent.at(-1);
    assert.equal(guideTask.client, "codex");
    assert.equal(guideTask.context.task, "guide-texts");
    const stepId = guideTask.context.steps[0].stepId;
    await page.evaluate(
      (id) =>
        window.aiFixture.reply({
          steps: [
            {
              stepId: id,
              title: "Abra o relatório",
              description: "Clique em Vendas.",
              alt: "Tela com o relatório de vendas",
            },
          ],
        }),
      stepId,
    );
    await page.locator("#guide-ai-apply").click();
    const alt = page.locator(".guide-step input").nth(1);
    assert.equal(await alt.inputValue(), "Tela com o relatório de vendas");
    await page.locator("#guide-ai-undo").click();
    assert.equal(await page.locator(".guide-step input").nth(1).inputValue(), "");
    assert.deepEqual(failures, []);
    console.log(
      JSON.stringify({
        reviewImageMasked: true,
        textOptIn: true,
        applyUndo: true,
        lateProposalIgnored: true,
        noClient: true,
        guideTexts: true,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
