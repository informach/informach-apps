const memory = new Map();
window.api = {
  appInfo: async () => ({ version: "teste" }),
  recentDocs: async () => [],
  addRecent: async () => {},
  setDirty: () => {},
  onOpenFiles: () => () => {},
  handleAiTools: () => () => {},
  onAssistantEvent: () => () => {},
  aiSettings: async () => ({
    engine: "codex",
    hasApiKey: false,
    mcpEnabled: false,
    mcpRunning: false,
    mcpPort: 47331,
    mcpUrl: "",
    confirmDeletes: true,
    allowFileWrites: false,
  }),
  readFile: async (path) =>
    memory.get(path) ??
    new Uint8Array(
      await (await fetch("/tests/fixtures/" + path.split(/[\\/]/).pop())).arrayBuffer(),
    ),
  writeFile: async (path, bytes) => {
    memory.set(path, bytes);
  },
  pickSavePath: async (name) => "/test/" + name,
  aiClients: async () => [],
  saveAiSettings: async () => {
    throw new Error("Integração nativa indisponível no teste web.");
  },
};
await import("/src/renderer/src/main.tsx");
if (new URLSearchParams(location.search).get("suite") === "chroma") {
  await import("/tests/app/chroma.js");
  try {
    await globalThis.__chromaTestRun;
  } catch (error) {
    const report = document.createElement("pre");
    report.id = "chroma-test-results";
    report.textContent = error.stack;
    document.body.append(report);
  }
} else if (new URLSearchParams(location.search).get("suite") === "new-document") {
  await import("/tests/browser/new-document.js");
} else {
  await import("/tests/app/vector-tools.js");
  const report = document.createElement("pre");
  report.id = "test-results";
  report.style.cssText =
    "position:fixed;bottom:8px;left:64px;max-width:680px;max-height:140px;overflow:auto;z-index:9999;background:#182b23;color:white;padding:12px;font-size:12px";
  try {
    const vectors = await globalThis.__testRun;
    await import("/tests/app/raster-tools.js");
    const raster = await globalThis.__rasterTestRun;
    await import("/tests/app/parity-tools.js");
    const parity = await globalThis.__parityTestRun;
    await import("/tests/app/selection-modes.js");
    const selections = await globalThis.__selectionTestRun;
    await import("/tests/app/new-document.js");
    const newDocument = await globalThis.__newDocumentTestRun;
    report.textContent = JSON.stringify(
      { vectors, raster, parity, selections, newDocument },
      null,
      2,
    );
    report.dataset.status = "passed";
  } catch (e) {
    report.textContent = e.stack;
    report.dataset.status = "failed";
  }
  document.body.append(report);
}
