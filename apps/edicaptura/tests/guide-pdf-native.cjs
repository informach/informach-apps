const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const electron = require("electron");
const { renderGuideHtml } = require("../src/domain/guide.ts");

// One synthetic step image (solid PNG) made without any capture.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("o PDF do guia sai do Chromium real, com uma página por passo alto e sem sobras", {
  timeout: 120000,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edicaptura-guide-pdf-"));
  try {
    const assetId = randomUUID();
    const steps = [1, 2, 3].map((n) => ({
      id: randomUUID(),
      assetId,
      title: `Passo com acentuação ${n}: ação, coração`,
      description: "Descrição com “aspas” e emoji ✓",
      alt: `Imagem ${n}`,
      width: 800,
      height: 900,
    }));
    const html = renderGuideHtml(
      {
        version: 1,
        id: randomUUID(),
        title: "Guia de teste — Unicode",
        description: "",
        layout: "tutorial",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        deletedAt: null,
        steps,
      },
      new Map([[assetId, PNG_1X1]]),
    );
    const input = path.join(root, "guia.html");
    const output = path.join(root, "guia.pdf");
    await fs.writeFile(input, html);
    // Electron must start as an app: not as plain Node, nor as a child of this test runner.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_TEST_CONTEXT;
    await new Promise((resolve, reject) =>
      execFile(
        electron,
        [
          path.join(__dirname, "fixtures/guide-pdf-main.cjs"),
          `--fixture-html=${input}`,
          `--fixture-output=${output}`,
          `--fixture-profile=${path.join(root, "profile")}`,
        ],
        { timeout: 90000, env },
        (error) => (error ? reject(error) : resolve()),
      ),
    ).catch(async (error) => {
      const failure = await fs.readFile(`${output}.error`, "utf8").catch(() => "");
      throw new Error(`${error.message}\n${failure}`);
    });
    const report = JSON.parse(await fs.readFile(`${output}.json`, "utf8"));
    const pdf = await fs.readFile(output);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(report.bytes, pdf.length);
    assert.equal(report.leftovers, 0, "the temporary HTML is removed");
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.ok(pages >= 3, `three tall steps need at least three pages, got ${pages}`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
