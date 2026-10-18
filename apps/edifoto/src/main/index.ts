import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { extname, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { createEdiDesktop, desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { app, BrowserWindow, dialog, shell } from "electron";
import { z } from "zod";
import { personalAiChanges } from "../shared/personalAi.ts";
import type {
  AiClientId,
  AiSettingsChanges,
  AiSettingsView,
  AssistantEvent,
  RecentDoc,
  SaveKind,
} from "../shared/types.ts";
import { callTool, cancelToolRun } from "./aiBridge.ts";
import {
  clientStatus,
  connectClient,
  DEFAULT_MCP_PORT,
  mcpUrl,
  readStored,
  writeStored,
} from "./aiSettings.ts";
import { resetEngineSession, runClaudeCode, runCodex, stopEngineRun } from "./engines.ts";
import { startMcpServer } from "./mcpServer.ts";
import { saveProjectFile } from "./projectFiles.ts";

// Lets automated checks run against a throwaway profile instead of the user's real settings.
app.setPath("userData", join(app.getPath("appData"), "edifoto"));
const desktop = createEdiDesktop({
  appId: "edifoto",
  preloadPath: join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: join(__dirname, "../renderer"),
  getRecoveryWindow: () => win,
  recoveryChannels: [
    "app:info",
    "app:dirty",
    "app:closeSaved",
    "dialog:save",
    "fs:write",
    "recent:list",
    "recent:add",
    "assistant:stop",
    "assistant:reset",
    "ai:result",
  ],
});
if (!app.isPackaged && process.env.EDIFOTO_USER_DATA)
  app.setPath("userData", process.env.EDIFOTO_USER_DATA);
else if (!app.isPackaged && process.argv.includes("--edifoto-nova-versao"))
  app.setPath("userData", join(app.getAppPath(), ".perfil-nova-versao"));

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];
const DOC_EXT = "edifoto";

let win: BrowserWindow | null = null;
let dirty = false;

/** Image or document paths given on the command line ("Abrir com", drag onto the shortcut). */
const filesFromArgs = (argv: string[]): string[] =>
  argv
    .slice(1)
    .filter(
      (a) =>
        !a.startsWith("-") &&
        [...IMAGE_EXT, DOC_EXT].includes(extname(a).slice(1).toLowerCase()) &&
        existsSync(a),
    );

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: "#111113",
    title: "EdiFoto 0.2.0",
    icon: join(app.getAppPath(), "resources", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  win.webContents.on("did-start-navigation", () => {
    for (const id of assistantRuns.keys()) stopAssistantRun(id);
  });
  win.once("ready-to-show", () => {
    if (!app.isPackaged && process.env.EDIFOTO_SNAPSHOT) win?.showInactive();
    else win?.maximize();
    win?.show();
  });
  win.webContents.once("did-finish-load", async () => {
    const files = filesFromArgs(process.argv);
    try {
      await desktopFiles.grantReadAll(files);
      if (files.length) win?.webContents.send("app:openFiles", files);
    } catch {
      dialog.showErrorBox("EdiFoto", "Não foi possível abrir os arquivos recebidos.");
    }
  });
  win.on("close", (e) => {
    if (!dirty || (!app.isPackaged && process.env.EDIFOTO_SNAPSHOT)) return;
    const choice = dialog.showMessageBoxSync(win!, {
      type: "question",
      buttons: ["Salvar e sair", "Sair sem salvar", "Cancelar"],
      defaultId: 0,
      cancelId: 2,
      title: "EdiFoto",
      message: "Há alterações não salvas.",
      detail: "Se sair agora, as mudanças desde o último salvamento serão perdidas.",
    });
    e.preventDefault();
    if (choice === 1) win?.webContents.send("app:discardBeforeClose");
    if (choice === 0) win?.webContents.send("app:saveBeforeClose");
  });
  win.on("closed", () => {
    for (const id of assistantRuns.keys()) stopAssistantRun(id);
    win = null;
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged && process.env.EDIFOTO_SNAPSHOT)
    void snapshot(win, process.env.EDIFOTO_SNAPSHOT);
}

/**
 * Development aid: EDIFOTO_SNAPSHOT=out.png runs the optional EDIFOTO_SNAPSHOT_JS file in the
 * renderer, waits EDIFOTO_SNAPSHOT_DELAY ms, saves a screenshot of the window and quits.
 */
async function snapshot(w: BrowserWindow, out: string): Promise<void> {
  await new Promise<void>((r) => w.webContents.once("did-finish-load", () => r()));
  await new Promise((r) => setTimeout(r, 1500));
  const scriptPath = process.env.EDIFOTO_SNAPSHOT_JS;
  if (scriptPath) {
    try {
      const result = await w.webContents.executeJavaScript(await readFile(scriptPath, "utf8"));
      if (result !== undefined) console.log("[snapshot script]", JSON.stringify(result));
    } catch (err) {
      console.error("[snapshot script failed]", err);
    }
  }
  await new Promise((r) => setTimeout(r, Number(process.env.EDIFOTO_SNAPSHOT_DELAY ?? 1500)));
  const image = await w.webContents.capturePage();
  await writeFile(out, image.toPNG());
  app.exit(0);
}

/* ----- Files ----- */

const recentFile = (): string => join(app.getPath("userData"), "recent.json");

async function readRecent(): Promise<RecentDoc[]> {
  try {
    return (JSON.parse(await readFile(recentFile(), "utf8")) as RecentDoc[]).filter((r) =>
      existsSync(r.path),
    );
  } catch {
    return [];
  }
}

const SAVE_FILTERS: Record<SaveKind, Electron.FileFilter> = {
  doc: { name: "Documento EdiFoto", extensions: [DOC_EXT] },
  png: { name: "PNG", extensions: ["png"] },
  jpeg: { name: "JPEG", extensions: ["jpg", "jpeg"] },
  webp: { name: "WebP", extensions: ["webp"] },
};

function registerIpc(): void {
  ipcMain.handle("app:closeSaved", () => {
    if (dirty) throw new Error("Há alterações não salvas.");
    win?.close();
  });
  ipcMain.handle("app:info", () => ({ version: app.getVersion() }));
  ipcMain.handle("dialog:images", async (_e, multi: boolean) => {
    const r = await dialog.showOpenDialog(win!, {
      title: multi ? "Inserir imagens" : "Abrir imagem",
      properties: multi ? ["openFile", "multiSelections"] : ["openFile"],
      filters: [
        { name: "Imagens e documentos", extensions: [...IMAGE_EXT, DOC_EXT] },
        { name: "Imagens", extensions: IMAGE_EXT },
        { name: "Documento EdiFoto", extensions: [DOC_EXT] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("dialog:document", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Abrir",
      properties: ["openFile"],
      filters: [{ name: "Imagens e documentos", extensions: [...IMAGE_EXT, DOC_EXT] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("dialog:save", async (_e, defaultName: string, kind: SaveKind) => {
    const r = await dialog.showSaveDialog(win!, {
      title: kind === "doc" ? "Salvar documento" : "Exportar imagem",
      defaultPath: join(app.getPath("pictures"), defaultName),
      filters: [SAVE_FILTERS[kind]],
    });
    return r.canceled || !r.filePath ? null : r.filePath;
  });
  ipcMain.handle("fs:read", async (_e, path: string) => new Uint8Array(await readFile(path)));
  ipcMain.handle("fs:write", (_e, path: string, bytes: Uint8Array) =>
    /\.edifoto$/i.test(path) ? saveProjectFile(path, bytes) : atomicWrite(path, bytes),
  );
  ipcMain.handle("recent:list", () => readRecent());
  ipcMain.handle("recent:add", async (_e, doc: RecentDoc) => {
    const list = (await readRecent()).filter(
      (r) => r.path.toLowerCase() !== doc.path.toLowerCase(),
    );
    await writeFile(recentFile(), JSON.stringify([doc, ...list].slice(0, 16)));
  });
  ipcMain.handle("recent:remove", async (_e, path: string) => {
    const list = (await readRecent()).filter((r) => r.path.toLowerCase() !== path.toLowerCase());
    await writeFile(recentFile(), JSON.stringify(list));
  });
  ipcMain.handle("shell:showItem", (_e, path: string) => shell.showItemInFolder(path));
  ipcMain.on("app:dirty", (_e, value: boolean) => {
    dirty = value;
  });
}

/* ----- AI: MCP server for Claude Code / Codex, settings and the in-app assistant ----- */

let mcp: { server: Server | null; port: number; error?: string } = {
  server: null,
  port: DEFAULT_MCP_PORT,
};

const assistantRuns = new Map<
  string,
  {
    conversationId: string;
    documentId: string;
    workspaceId: number;
    stopped: boolean;
    job: ReturnType<typeof desktop.jobs.begin>;
  }
>();
function stopAssistantRun(runId: string): void {
  const run = assistantRuns.get(runId);
  if (!run) return;
  run.stopped = true;
  cancelToolRun(runId);
  stopEngineRun(run.conversationId);
}

async function applyMcp(): Promise<void> {
  const stored = await readStored();
  const enabled = stored.mcpEnabled ?? true;
  const port =
    stored.mcpPort ??
    (!app.isPackaged && process.argv.includes("--edifoto-nova-versao") ? 47332 : DEFAULT_MCP_PORT);
  if (mcp.server && (!enabled || mcp.port !== port)) {
    await new Promise<void>((r) => mcp.server!.close(() => r()));
    mcp = { server: null, port };
  }
  if (enabled && !mcp.server) {
    try {
      const server = await startMcpServer(port, (name, input, runId) => {
        if (!runId) return callTool(win, name, input, "mcp");
        const run = assistantRuns.get(runId);
        if (!run || run.stopped)
          return Promise.resolve({ ok: false, text: "Este pedido já foi encerrado." });
        run.job.check();
        return callTool(win, name, input, "assistant", {
          runId,
          documentId: run.documentId,
          workspaceId: run.workspaceId,
        });
      });
      mcp = { server, port };
    } catch (err) {
      mcp = {
        server: null,
        port,
        error:
          (err as NodeJS.ErrnoException).code === "EADDRINUSE"
            ? `A porta ${port} já está em uso por outro programa.`
            : (err as Error).message,
      };
    }
  }
}

async function aiView(): Promise<AiSettingsView> {
  const stored = await readStored();
  return {
    engine: stored.engine ?? "claude-code",
    claudeModel: stored.claudeModel ?? "default",
    mcpEnabled: stored.mcpEnabled ?? true,
    mcpPort: mcp.port,
    mcpUrl: mcpUrl(mcp.port),
    mcpRunning: !!mcp.server,
    mcpError: mcp.error,
    confirmDeletes: stored.confirmDeletes ?? true,
    allowFileWrites: stored.allowFileWrites ?? false,
  };
}

function registerAiIpc(): void {
  ipcMain.handle("ai:settings", () => aiView());
  ipcMain.handle("ai:saveSettings", async (_e, changes: AiSettingsChanges) => {
    const stored = await readStored();
    const valid = personalAiChanges.parse(changes);
    await writeStored({ ...stored, ...valid });
    await applyMcp();
    return aiView();
  });
  ipcMain.handle("ai:clients", () => clientStatus(mcp.port));
  ipcMain.handle("ai:connect", (_e, id: AiClientId) =>
    connectClient(z.enum(["claude-code", "codex"]).parse(id), mcp.port),
  );
  ipcMain.handle(
    "assistant:send",
    async (
      _e,
      conversationId: string,
      text: string,
      documentId: string,
      runId: string,
      workspaceId: number,
    ) => {
      z.object({
        conversationId: z.string().min(1).max(100),
        text: z.string().min(1).max(30000),
        documentId: z.string().min(1).max(100),
        runId: z.string().min(1).max(100),
        workspaceId: z.number().int().positive(),
      }).parse({ conversationId, text, documentId, runId, workspaceId });
      if (assistantRuns.size) throw new Error("Aguarde o pedido anterior terminar.");
      const job = desktop.jobs.begin({ preserveForMs: 0, stop: () => stopAssistantRun(runId) });
      const run = { conversationId, documentId, workspaceId, stopped: false, job };
      assistantRuns.set(runId, run);
      const emit = (event: AssistantEvent): void => {
        if (win && !win.isDestroyed() && (!run.stopped || event.type === "done"))
          win.webContents.send("assistant:event", runId, event);
      };
      const check = (): void => {
        job.check();
        if (run.stopped) throw new Error("Pedido interrompido.");
      };
      try {
        const view = await aiView();
        check();
        if (!view.mcpRunning)
          throw new Error("Ligue a conexão em Configurações › Inteligência artificial.");
        if (view.engine === "claude-code")
          await runClaudeCode(conversationId, text, mcp.port, view.claudeModel, emit, runId, check);
        else await runCodex(conversationId, text, mcp.port, emit, runId, check);
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        cancelToolRun(runId);
        assistantRuns.delete(runId);
        job.finish();
        emit({ type: "done" });
      }
    },
  );
  ipcMain.handle("assistant:stop", (_e, runId: string) => stopAssistantRun(runId));
  ipcMain.handle("assistant:reset", (_e, conversationId: string) => {
    for (const [id, run] of assistantRuns)
      if (run.conversationId === conversationId) stopAssistantRun(id);
    resetEngineSession(conversationId);
  });
}

/** Same id as the desktop shortcut, so the open window groups with the pinned icon. */
export const APP_USER_MODEL_ID = "br.com.informach.edifoto";
if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);

// One EdiFoto at a time (two would fight over the AI connection port): a second launch
// brings the open window to the front and opens the files it was given.
if ((app.isPackaged || !process.env.EDIFOTO_SNAPSHOT) && !app.requestSingleInstanceLock())
  app.quit();
app.on("second-instance", async (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const files = filesFromArgs(argv);
  try {
    await desktopFiles.grantReadAll(files);
    if (files.length) win?.webContents.send("app:openFiles", files);
  } catch {
    dialog.showErrorBox("EdiFoto", "Não foi possível abrir os arquivos recebidos.");
  }
});

app
  .whenReady()
  .then(async () => {
    await desktop.start();
    registerIpc();
    registerAiIpc();
    createWindow();
    if (!process.env.EDIFOTO_NO_MCP) void applyMcp();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error: unknown) => {
    dialog.showErrorBox(
      "EdiFoto",
      error instanceof Error ? error.message : "Falha ao validar o acesso",
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
