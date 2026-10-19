const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

// Real Chromium, the Captura's own OCR worker and the models copied by scripts/copy-ocr.mjs.
// Synthetic images only: no screenshot, clipboard or personal data.
async function run() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: path.resolve(__dirname, ".."),
    publicDir: path.resolve(__dirname, "../src/assets"),
    configFile: false,
    // Pre-bundle the engine's CommonJS dependency so Vite never reloads the page mid-test.
    optimizeDeps: { include: ["@informach/edi-ocr > tesseract.js", "zod"] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/renderer.html`);
    await page.evaluate(async () => {
      const { CanvasEditor } = await import("/src/editor/canvas.js");
      const { mountTextPanel } = await import("/src/editor/text-panel.js");
      const draw = (width, height, lines) => {
        const source = document.createElement("canvas");
        source.width = width;
        source.height = height;
        const ctx = source.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#111";
        ctx.font = "44px Arial, sans-serif";
        for (const [text, y] of lines) ctx.fillText(text, 24, y);
        return source.toDataURL();
      };
      const extras = document.createElement("div");
      extras.className = "editor-extras";
      const canvas = document.createElement("canvas");
      document.body.append(extras, canvas);
      const engine = new CanvasEditor(canvas, {
        change() {},
        selection() {},
        text: async () => "",
      });
      const fixture = { copied: [], saved: [], edits: [], toasts: [] };
      window.ocrFixture = fixture;
      let doc = null;
      const api = {
        ocrRead: async () => null,
        ocrSave: async ({ id, languages, resultJson }) => {
          const result = JSON.parse(resultJson);
          fixture.saved.push({ id, words: result.words.length, height: result.height });
          fixture.last = {
            version: 1,
            source: { sha256: "0".repeat(64), width: result.width, height: result.height },
            languages,
            recognizedAt: new Date().toISOString(),
            status: result.words.some((word) => word.text.trim()) ? "text" : "empty",
            result,
            edits: {},
          };
          return fixture.last;
        },
        ocrEdit: async ({ edits }) => {
          fixture.edits.push(edits);
          fixture.last = { ...fixture.last, edits };
          return fixture.last;
        },
        ocrDelete: async () => true,
        ocrCopyText: async (text) => fixture.copied.push(text),
      };
      const panel = mountTextPanel({
        api,
        engine,
        current: () => doc,
        toast: (message) => fixture.toasts.push(message),
      });
      fixture.open = async (id, lines, width = 980, height = 320) => {
        await engine.load({ dataUrl: draw(width, height, lines), annotations: [] });
        doc = { id, kind: "image" };
        panel.activate(doc);
        document.querySelector("#ocr-panel").open = true;
        await new Promise((resolve) => setTimeout(resolve, 0));
      };
      fixture.engine = engine;
    });
    const status = () => page.locator("#ocr-status").textContent();
    const recognize = async () => {
      await page.locator("#ocr-run").click();
      await page.waitForFunction(
        () =>
          /reconhecidas|Nenhum texto|indisponível/.test(
            document.querySelector("#ocr-status").textContent,
          ),
        null,
        { timeout: 120000 },
      );
    };
    // 1. Recognize, review, correct and copy only what the final image still shows.
    await page.evaluate(() =>
      window.ocrFixture.open("11111111-1111-4111-8111-111111111111", [
        ["Protocolo 8841 aprovado", 70],
        ["CPF 529.982.247-25", 160],
        ["contato maria@exemplo.com.br", 250],
      ]),
    );
    await recognize();
    assert.match(await status(), /3 linhas reconhecidas/);
    const lines = await page
      .locator("#ocr-lines input")
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert.match(lines[0], /Protocolo 8841/);
    assert.match(lines[1], /529\.982\.247-25/);
    assert.match(lines[2], /maria@exemplo\.com\.br/);
    // A correction is kept apart from what was read and used by the copy.
    const first = page.locator("#ocr-lines input").first();
    await first.fill("Protocolo 8847 aprovado");
    await first.press("Tab");
    try {
      await page.waitForFunction(() => window.ocrFixture.edits.length === 1, null, {
        timeout: 5000,
      });
    } catch (error) {
      console.error(
        "Correction diagnostic",
        JSON.stringify(
          await page.evaluate(() => ({
            toasts: window.ocrFixture.toasts,
            inputs: [...document.querySelectorAll("#ocr-lines input")].map((input) => ({
              value: input.value,
              handler: typeof input.onchange,
            })),
            status: document.querySelector("#ocr-status").textContent,
          })),
        ),
      );
      throw error;
    }
    // 2. Assisted detection proposes CPF and e-mail; masking adds opaque masks in one change.
    await page.locator("#ocr-sensitive").click();
    const findings = await page.locator("#ocr-findings label").allTextContents();
    assert.ok(
      findings.some((text) => text.startsWith(" CPF")),
      findings.join(" | "),
    );
    assert.ok(
      findings.some((text) => text.startsWith(" E-mail")),
      findings.join(" | "),
    );
    const before = await page.evaluate(() => window.ocrFixture.engine.annotations.length);
    await page.locator("#ocr-mask").click();
    const masks = await page.evaluate(
      () => window.ocrFixture.engine.annotations.filter((a) => a.kind === "redact").length,
    );
    assert.ok(masks >= 2 && masks - before >= 2);
    await page.evaluate(() => window.ocrFixture.engine.undo());
    assert.equal(
      await page.evaluate(() => window.ocrFixture.engine.annotations.length),
      before,
      "one undo removes every proposed mask",
    );
    await page.evaluate(() => window.ocrFixture.engine.redo());
    await page.locator("#ocr-copy").click();
    const copied = await page.evaluate(() => window.ocrFixture.copied.at(-1));
    assert.match(copied, /Protocolo 8847 aprovado/);
    assert.doesNotMatch(copied, /529\.982|maria@/, "masked text never leaves with the image");
    // 3. A scroll-length capture is cut into tiles; text at both ends comes back in place.
    await page.evaluate(() =>
      window.ocrFixture.open(
        "22222222-2222-4222-8222-222222222222",
        [
          ["Inicio da pagina longa", 80],
          ["Final da pagina longa", 11900],
        ],
        900,
        12000,
      ),
    );
    await recognize();
    const tall = await page
      .locator("#ocr-lines input")
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert.ok(
      tall.some((text) => /Inicio/.test(text)) && tall.some((text) => /Final/.test(text)),
      tall.join(" | "),
    );
    assert.equal((await page.evaluate(() => window.ocrFixture.saved.at(-1))).height, 12000);
    // 4. Cancel stops the engine and keeps nothing; switching captures discards late results.
    await page.evaluate(() =>
      window.ocrFixture.open("33333333-3333-4333-8333-333333333333", [["Cancelar agora", 80]]),
    );
    const saves = await page.evaluate(() => window.ocrFixture.saved.length);
    await page.locator("#ocr-run").click();
    await page.locator("#ocr-cancel").click();
    await page.waitForFunction(() =>
      /cancelado/.test(document.querySelector("#ocr-status").textContent),
    );
    await page.locator("#ocr-run").click();
    await page.evaluate(() =>
      window.ocrFixture.open("44444444-4444-4444-8444-444444444444", [["Outra captura", 80]]),
    );
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 3000)));
    assert.equal(await page.evaluate(() => window.ocrFixture.saved.length), saves);
    assert.match(await status(), /ainda não reconhecido/);
    // 5. Steps: explicit renumbering in reading order and number edits that swap, each undoable.
    const steps = await page.evaluate(() => {
      const engine = window.ocrFixture.engine;
      engine.annotations = [];
      engine.addAnnotation("steps", { number: 3, x: 50, y: 20 });
      engine.addAnnotation("steps", { number: 3, x: 300, y: 20 });
      engine.addAnnotation("steps", { number: 1, x: 50, y: 200 });
      const plan = engine.renumberPlan("reading");
      engine.renumberSteps("reading");
      const renumbered = engine.annotations.map((a) => a.number);
      engine.setStepNumber(2, 1);
      const swapped = engine.annotations.map((a) => a.number);
      engine.undo();
      return { plan, renumbered, swapped, undone: engine.annotations.map((a) => a.number) };
    });
    assert.deepEqual(steps.renumbered, [1, 2, 3]);
    assert.deepEqual(steps.swapped, [3, 2, 1]);
    assert.deepEqual(steps.undone, [1, 2, 3]);
    assert.deepEqual(
      steps.plan.map(([, from, to]) => [from, to]),
      [
        [3, 1],
        [3, 2],
        [1, 3],
      ],
    );
    assert.deepEqual(failures, []);
    console.log(
      JSON.stringify({
        ocrReal: true,
        lines: lines.length,
        sensitiveFindings: findings.length,
        masks,
        maskedTextCopied: false,
        tiledHeight: 12000,
        cancel: true,
        lateResultDiscarded: true,
        steps,
      }),
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
