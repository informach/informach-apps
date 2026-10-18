// Electron main for tests/personKey.test.ts: runs the person segmentation model the way the
// editor's worker does (src/renderer/src/lib/personKeyWorker.ts: @mediapipe/tasks-vision in a
// module worker, the module build of its runtime, the CPU, the model handed over as bytes) on
// raw RGBA frames, and writes each frame's confidence (Float32, one per pixel) back to back.
// Prints "TIMES <json>" with the load time and the milliseconds of each frame, then quits.
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
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
const out = arg("out");

const url = (path) => pathToFileURL(path).href;

const worker = `
import { ImageSegmenter } from ${JSON.stringify(url(join(vision, "vision_bundle.mjs")))};
self.onmessage = async ({ data }) => {
  try {
    const began = performance.now();
    const segmenter = await ImageSegmenter.createFromOptions(
      {
        wasmLoaderPath: ${JSON.stringify(url(join(vision, "wasm", "vision_wasm_module_internal.js")))},
        wasmBinaryPath: ${JSON.stringify(url(join(vision, "wasm", "vision_wasm_module_internal.wasm")))},
      },
      {
        baseOptions: { modelAssetBuffer: data.model, delegate: "CPU" },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      },
    );
    const load = performance.now() - began;
    const pixels = data.width * data.height;
    const count = data.frames.length / (pixels * 4);
    const confidence = new Float32Array(count * pixels);
    const times = [];
    for (let i = 0; i < count; i++) {
      const rgba = new Uint8ClampedArray(data.frames.subarray(i * pixels * 4, (i + 1) * pixels * 4));
      const started = performance.now();
      const result = segmenter.segment(new ImageData(rgba, data.width, data.height));
      const mask = result.confidenceMasks[0];
      if (mask.width !== data.width || mask.height !== data.height)
        throw new Error("mask of another size: " + mask.width + "x" + mask.height);
      confidence.set(mask.getAsFloat32Array(), i * pixels);
      result.close();
      times.push(performance.now() - started);
    }
    self.postMessage({ confidence, load, times });
  } catch (error) {
    self.postMessage({ error: String((error && error.stack) || error) });
  }
};
`;

const page = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' media: data: blob:; media-src 'self' media: blob:; connect-src 'self' media: ws:; style-src 'self' 'unsafe-inline'; font-src 'self' data:">
<script src="./page.js"></script>`;

const pageScript = `
const worker = new Worker("./worker.mjs", { type: "module" });
worker.onmessage = ({ data }) => window.harness.done(data);
worker.onerror = (event) => window.harness.done({ error: event.message || "worker error" });
window.harness.input().then((input) => worker.postMessage(input));
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
  writeFileSync(join(dir, "worker.mjs"), worker);
  writeFileSync(join(dir, "page.html"), page);
  writeFileSync(join(dir, "page.js"), pageScript);
  writeFileSync(join(dir, "preload.cjs"), preload);
  ipcMain.handle("input", () => ({
    model: new Uint8Array(readFileSync(model)),
    frames: new Uint8Array(readFileSync(frames)),
    width,
    height,
  }));
  ipcMain.handle("done", (_event, result) => {
    if (result.error) {
      process.stderr.write(`${result.error}\n`);
      app.exit(1);
      return;
    }
    writeFileSync(out, Buffer.from(result.confidence.buffer));
    process.stdout.write(`TIMES ${JSON.stringify({ load: result.load, times: result.times })}\n`);
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
