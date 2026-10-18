// Electron main for tests/personKey.test.ts: runs the editor's own worker
// (src/renderer/src/lib/personKeyWorker.ts, bundled by the test the way the build does) in a
// module worker of a page, with the same messages lib/personKey.ts sends it: "init" with the
// model's bytes and the module build of the runtime, then "segment" with raw RGBA frames. Writes
// the masks it answers (one byte of alpha per pixel, frames back to back) and prints
// "TIMES <json>" with the load time and the worker's milliseconds per frame, then quits.
const { app, BrowserWindow, ipcMain } = require("electron");
const { copyFileSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const arg = (name) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!found) throw new Error(`missing --${name}`);
  return found.slice(name.length + 3);
};
const frames = arg("frames");
const width = Number(arg("width"));
const height = Number(arg("height"));
const model = arg("model");
const vision = arg("vision");
const workerFile = arg("worker");
const out = arg("out");

const url = (path) => pathToFileURL(path).href;

const page = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' file:; style-src 'self' 'unsafe-inline'">
<script src="./page.js"></script>`;

const pageScript = `
const worker = new Worker("./worker.mjs", { type: "module" });
worker.onerror = (event) => window.harness.done({ error: event.message || "worker error" });
window.harness.input().then((input) => {
  const began = performance.now();
  let load = 0;
  worker.onmessage = ({ data }) => {
    if (data.kind === "ready") {
      load = performance.now() - began;
      const pixels = input.width * input.height;
      worker.postMessage({
        kind: "segment",
        id: 1,
        data: input.frames,
        count: input.frames.length / (pixels * 4),
        width: input.width,
        height: input.height,
      });
    } else if (data.kind === "masks") window.harness.done({ masks: data.masks, ms: data.ms, load });
    else window.harness.done({ error: data.message });
  };
  worker.postMessage({ kind: "init", model: input.model, files: input.files });
});
`;

const preload = `
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("harness", {
  input: () => ipcRenderer.invoke("input"),
  done: (result) => ipcRenderer.invoke("done", result),
});
`;

app.whenReady().then(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-person-key-"));
  copyFileSync(workerFile, join(dir, "worker.mjs"));
  writeFileSync(join(dir, "page.html"), page);
  writeFileSync(join(dir, "page.js"), pageScript);
  writeFileSync(join(dir, "preload.cjs"), preload);
  ipcMain.handle("input", () => ({
    model: new Uint8Array(readFileSync(model)),
    frames: new Uint8Array(readFileSync(frames)),
    width,
    height,
    files: {
      loader: url(join(vision, "wasm", "vision_wasm_module_internal.js")),
      wasm: url(join(vision, "wasm", "vision_wasm_module_internal.wasm")),
    },
  }));
  ipcMain.handle("done", (_event, result) => {
    if (result.error) {
      process.stderr.write(`${result.error}\n`);
      app.exit(1);
      return;
    }
    writeFileSync(
      out,
      Buffer.from(result.masks.buffer, result.masks.byteOffset, result.masks.length),
    );
    process.stdout.write(`TIMES ${JSON.stringify({ load: result.load, ms: result.ms })}\n`);
    app.exit(0);
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(dir, "preload.cjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadFile(join(dir, "page.html"));
});
