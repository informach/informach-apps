import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import { build } from "vite";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { DEFAULT_PRINT_SETTINGS } from "../src/shared/print-format.ts";
import { imposePrintPdf } from "../src/shared/print-layout.ts";
import { plainText } from "../src/shared/text-search.ts";

const root = await mkdtemp(join(tmpdir(), "edipdf-print-pipeline-"));
assert.equal(dirname(root), resolve(tmpdir()));
assert.match(basename(root), /^edipdf-print-pipeline-[a-zA-Z0-9]+$/);
let failure: unknown;
try {
  const pdf = await PDFDocument.create(),
    first = pdf.addPage([600, 800]);
  first.drawText("PRINT_VECTOR_FIRST", { x: 50, y: 700 });
  first.drawRectangle({ x: 50, y: 400, width: 200, height: 100, color: rgb(1, 0, 0) });
  const field = pdf.getForm().createTextField("appearance");
  field.setText("PRINT_FORM_VALUE");
  field.addToPage(first, { x: 50, y: 600, width: 300, height: 30 });
  const second = pdf.addPage([800, 600]);
  second.drawText("PRINT_VECTOR_SECOND", { x: 50, y: 500 });
  second.setCropBox(20, 30, 700, 500);
  second.setRotation(degrees(90));
  pdf.addPage([300, 400]).drawText("PRINT_VECTOR_THIRD", { x: 50, y: 300 });
  await writeFile(join(root, "input.pdf"), await pdf.save());
  await build({
    configFile: false,
    logLevel: "error",
    ssr: { noExternal: true, external: ["electron"] },
    build: {
      ssr: fileURLToPath(new URL("./fixtures/pdf-printer.mts", import.meta.url)),
      outDir: join(root, "runner"),
      rollupOptions: {
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "probe.cjs" },
      },
    },
  });
  const require = createRequire(import.meta.url),
    electron: unknown = require("electron");
  if (typeof electron !== "string") throw new Error("Missing Electron runtime");
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  const cancelDialog =
    process.argv.includes("--cancel-dialog") || process.argv.includes("--html-dialog");
  const appRun = promisify(execFile)(
    electron,
    [
      join(root, "runner/probe.cjs"),
      root,
      ...(cancelDialog ? ["--cancel-dialog"] : []),
      ...(process.argv.includes("--html-dialog") ? ["--html-dialog"] : []),
    ],
    { env: environment, windowsHide: true, timeout: 35_000, maxBuffer: 32768 },
  );
  const runs = await Promise.allSettled([
    appRun,
    ...(cancelDialog
      ? [
          promisify(execFile)(
            "powershell.exe",
            [
              "-NoProfile",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              fileURLToPath(new URL("./respond-native-print.ps1", import.meta.url)),
              "-PidFile",
              join(root, "pid.txt"),
            ],
            { env: environment, windowsHide: true, timeout: 30_000, maxBuffer: 32768 },
          ),
        ]
      : []),
  ]);
  const failures = runs.filter((run) => run.status === "rejected").map((run) => run.reason);
  if (failures.length)
    throw new AggregateError(
      failures,
      "The isolated print pipeline or native cancellation failed.",
    );
  assert.deepEqual(JSON.parse(await readFile(join(root, "result.json"), "utf8")), {
    stage: "flattened",
    warnings: [],
  });
  assert.deepEqual(await readdir(join(root, "temporary")), []);
  const bytes = new Uint8Array(await readFile(join(root, "flattened.pdf"))),
    flat = await PDFDocument.load(bytes);
  assert.equal(flat.getPageCount(), 3);
  assert.equal(flat.getForm().getFields().length, 0);
  assert.ok(flat.getPages().every((page) => (page.node.Annots()?.size() ?? 0) === 0));
  const engine = await LocalPdfEngine.create(
      await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
    ),
    text = engine
      .textDocument(bytes, { includeAnnotations: false })
      .pages.map((page) => plainText(page.glyphs))
      .join(" ");
  for (const value of [
    "PRINT_VECTOR_FIRST",
    "PRINT_FORM_VALUE",
    "PRINT_VECTOR_SECOND",
    "PRINT_VECTOR_THIRD",
  ])
    assert.ok(text.includes(value), value);
  const booklet = await imposePrintPdf(bytes, {
    ...DEFAULT_PRINT_SETTINGS,
    layout: "booklet",
    paper: "a4",
  });
  assert.equal(booklet.pages, 2);
  const composed = engine
    .textDocument(booklet.bytes, { includeAnnotations: false })
    .pages.map((page) => plainText(page.glyphs))
    .join(" ");
  assert.ok(composed.includes("PRINT_FORM_VALUE") && composed.includes("PRINT_VECTOR_THIRD"));
  console.log(
    "Real hidden sandboxed print pipeline preserves vector text, form appearances, rotated crops and booklet content in memory. No physical printer was used.",
  );
  if (cancelDialog)
    console.log(
      "Actual system print dialog was cancelled through its Cancel button; the prepared PDF remained available.",
    );
} catch (error) {
  failure = error;
}
try {
  assert.equal(dirname(root), resolve(tmpdir()));
  await rm(root, { recursive: true, force: true });
} catch (cleanup) {
  if (failure)
    throw new AggregateError(
      [failure, cleanup],
      "The print probe failed and its disposable profile could not be removed.",
    );
  throw cleanup;
}
if (failure) throw failure;
