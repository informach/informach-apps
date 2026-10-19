import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { _electron } from "playwright";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const root = await mkdtemp(join(tmpdir(), "edipdf-print-probe-"));
assert.equal(dirname(root), resolve(tmpdir()));
assert.match(basename(root), /^edipdf-print-probe-[a-zA-Z0-9]+$/);
const fixture = join(root, "input.pdf"),
  output = join(root, "printed.pdf"),
  entry = join(root, "main.cjs");
const pdf = await PDFDocument.create(),
  page = pdf.addPage([600, 800]);
page.drawText("VECTOR_PRINT_PROBE", { x: 50, y: 700, size: 24 });
page.drawRectangle({ x: 50, y: 400, width: 400, height: 200, color: rgb(1, 0, 0) });
const second = pdf.addPage([800, 600]);
second.drawText("LANDSCAPE_SECOND", { x: 50, y: 500, size: 22 });
second.drawRectangle({ x: 50, y: 200, width: 300, height: 200, color: rgb(0, 0, 1) });
const field = pdf.getForm().createTextField("printed_field");
field.setText("FIELD_VALUE_PRINTED");
field.addToPage(page, { x: 50, y: 650, width: 300, height: 25 });
pdf.addPage([300, 400]).drawText("THIRD_SMALL", { x: 50, y: 300, size: 14 });
await writeFile(fixture, await pdf.save());
await writeFile(
  entry,
  `const {app, BrowserWindow}=require('electron'); app.setPath('userData', ${JSON.stringify(join(root, "profile"))}); app.whenReady().then(async()=>{const w=new BrowserWindow({width:1000,height:1000,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); await w.loadFile(${JSON.stringify(fixture)}); w.show();});`,
);
const environment: Record<string, string> = {};
for (const [name, value] of Object.entries(process.env))
  if (typeof value === "string" && !["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(name))
    environment[name] = value;
const application = await _electron.launch({ args: [entry], env: environment, timeout: 20_000 });
try {
  await application.firstWindow();
  const ready = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Missing isolated PDF viewer window");
    if (!window.isVisible())
      await new Promise<void>((resolve) => window.once("show", () => resolve()));
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      let pixels: Buffer;
      try {
        pixels = (await window.webContents.capturePage()).toBitmap();
      } catch (failure) {
        if (!(failure instanceof Error) || failure.message !== "UnknownVizError") throw failure;
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      let red = 0;
      for (let offset = 0; offset < pixels.length; offset += 4)
        if (pixels[offset + 2] > 220 && pixels[offset + 1] < 30 && pixels[offset] < 30) red++;
      if (red > 10_000) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  });
  assert.equal(ready, true, "The PDF must visibly render the red vector before testing printing.");
  const frames = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; if (!window) throw new Error("Missing PDF viewer");
    return Promise.all(window.webContents.mainFrame.framesInSubtree.map(async (frame) => ({ url: frame.url, elements: await frame.executeJavaScript("Array.from(document.querySelectorAll('embed,iframe,pdf-viewer')).map(element => ({tag: element.tagName, type: element.type, postMessage: typeof element.postMessage, loaded: typeof element.loaded, loadProgress: element.loadProgress}))") })));
  });
  console.log("Isolated PDF frame readiness diagnostics", JSON.stringify(frames));
  const bytes = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Missing PDF viewer");
    return Array.from(
      await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }),
    );
  });
  await writeFile(output, new Uint8Array(bytes));
  const require = createRequire(import.meta.url),
    engine = await LocalPdfEngine.create(
      await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
    );
  const printed = engine.textDocument(new Uint8Array(bytes), { includeAnnotations: false });
  const text = printed.pages.flatMap((page) => page.glyphs.map((glyph) => glyph.text)).join("");
  assert.equal(printed.pages.length, 3);
  assert.ok(
    text.includes("VECTOR_PRINT_PROBE") &&
      text.includes("LANDSCAPE_SECOND") &&
      text.includes("THIRD_SMALL"),
  );
  const ranges = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Missing PDF viewer");
    return Array.from(
      await window.webContents.printToPDF({
        pageRanges: "2",
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
  });
  const selected = engine.textDocument(new Uint8Array(ranges), { includeAnnotations: false });
  const selectedText = selected.pages
    .flatMap((page) => page.glyphs.map((glyph) => glyph.text))
    .join("");
  const pageSizes = (await PDFDocument.load(new Uint8Array(bytes)))
    .getPages()
    .map((page) => page.getSize());
  console.log(
    JSON.stringify({
      electron: await application.evaluate(() => process.versions.electron),
      visiblePluginReady: ready,
      printPages: printed.pages.length,
      originalTextPreserved: text.includes("VECTOR_PRINT_PROBE"),
      printedBytes: bytes.length,
      formAppearancePreserved: text.includes("FIELD_VALUE_PRINTED"),
      pageSizes,
      rangePages: selected.pages.length,
      rangeCorrect:
        selectedText.includes("LANDSCAPE_SECOND") &&
        !selectedText.includes("VECTOR_PRINT_PROBE") &&
        !selectedText.includes("THIRD_SMALL"),
    }),
  );
} finally {
  await application.close();
  assert.equal(dirname(root), resolve(tmpdir()));
  await rm(root, { recursive: true, force: true });
}
