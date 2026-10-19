import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWrite } from "@informach/edi-desktop/files";
import { createEdiDesktop, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { connectMcpClient } from "@informach/edi-desktop/mcp-config";
import { ASSET_BYTES } from "@informach/edi-motion/assets";
import { app, BrowserWindow, dialog, Menu } from "electron";
import { newProject, parseProject } from "../shared/project.js";
import { createBridge } from "./aiBridge.js";
import { readBoundedBytes } from "./boundedBytes";
import { readBoundedText, SVG_BYTES } from "./boundedText.ts";
import { createEngineRunner, locateClient } from "./engines.js";
import { parseExportPayload } from "./exportPayload";
import { startMcpServer } from "./mcpServer.js";
import { createProjectFiles } from "./projectFiles.js";
import { createRecoveryStore } from "./recoveryStore.ts";
import { smoke } from "./smoke.js";

app.setPath("userData", join(app.getPath("appData"), "edisvg"));
if (!app.isPackaged && process.env.EDISVG_USER_DATA)
  app.setPath("userData", process.env.EDISVG_USER_DATA);
app.setAppUserModelId("br.com.informach.edisvg");
const here = fileURLToPath(new URL(".", import.meta.url));
const desktop = createEdiDesktop({
  appId: "edisvg",
  projectFileMode: "native-dialog",
  preloadPath: join(here, "../preload/edi-gate.cjs"),
  rendererRoot: join(here, "../renderer"),
  getRecoveryWindow: () => win,
  recoveryChannels: [
    "project:initialize",
    "project:changed",
    "project:save",
    "ai:stop",
    "ai:result",
  ],
});
let win,
  mcp,
  runner,
  files,
  mcpError = "";
let allowClose = false,
  checkingClose = false,
  initialized = false,
  initializing = false;
const bridge = createBridge(() => win);
const rendererFile = join(here, "../renderer/index.html");
const rendererUrl =
  (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) || pathToFileURL(rendererFile).href;
const smokeMode = !app.isPackaged && process.argv.includes("--smoke-test");
function trusted(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    new URL(event.senderFrame.url).href.split("#")[0] !== new URL(rendererUrl).href.split("#")[0]
  )
    throw new Error("Origem IPC não autorizada.");
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    return callback(...args);
  });
}
function menu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Arquivo",
        submenu: [
          {
            label: "Novo projeto",
            accelerator: "CmdOrCtrl+N",
            click: () => win.webContents.send("app:command", "new"),
          },
          {
            label: "Importar SVG…",
            accelerator: "CmdOrCtrl+I",
            click: () => win.webContents.send("app:command", "import-svg"),
          },
          {
            label: "Abrir projeto…",
            accelerator: "CmdOrCtrl+O",
            click: () => win.webContents.send("app:command", "open"),
          },
          {
            label: "Salvar",
            accelerator: "CmdOrCtrl+S",
            click: () => win.webContents.send("app:command", "save"),
          },
          {
            label: "Salvar projeto como…",
            accelerator: "CmdOrCtrl+Shift+S",
            click: () => win.webContents.send("app:command", "save-as"),
          },
          { type: "separator" },
          { role: "quit", label: "Sair" },
        ],
      },
      {
        label: "Editar",
        submenu: [
          { label: "Desfazer edição", click: () => win.webContents.send("app:command", "undo") },
          { label: "Refazer edição", click: () => win.webContents.send("app:command", "redo") },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "Exibir",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "IA",
        submenu: [
          {
            label: "Assistente Claude / Codex",
            click: () => win.webContents.send("app:command", "assistant"),
          },
        ],
      },
    ]),
  );
}
async function createWindow() {
  allowClose = false;
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    title: "EdiSVG",
    backgroundColor: "#0d0e11",
    show: false,
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  win.once("ready-to-show", () => {
    if (!smokeMode) win.show();
  });
  win.on("close", (event) => {
    if (allowClose || smokeMode) return;
    event.preventDefault();
    if (checkingClose) return;
    checkingClose = true;
    void files
      .canClose()
      .then((ok) => {
        if (ok) {
          allowClose = true;
          win.close();
        }
      })
      .catch((error) => dialog.showErrorBox("EdiSVG", error.message))
      .finally(() => {
        checkingClose = false;
      });
  });
  win.on("closed", () => {
    bridge.close();
    runner?.stop();
    win = null;
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await win.loadURL(rendererUrl);
  else await win.loadFile(rendererFile);
  menu();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      await desktop.start();
      await mkdir(app.getPath("userData"), { recursive: true });
      try {
        mcp = await startMcpServer((name, input) =>
          !initialized || files?.isBusy() || checkingClose
            ? Promise.resolve({ ok: false, text: "Aguarde a operação de arquivo." })
            : bridge.call(name, input),
        );
      } catch (error) {
        mcpError = `MCP indisponível na porta 47322: ${error.message}`;
      }
      runner = createEngineRunner(
        join(app.getPath("userData"), "ai-workspace"),
        "http://127.0.0.1:47322/mcp",
        (event) => {
          if (win && !win.isDestroyed()) win.webContents.send("ai:event", event);
        },
      );
      handle("ai:status", () => ({
        clients: ["claude", "codex"].map((id) => ({ id, installed: !!locateClient(id) })),
        mcp: { ready: !!mcp, url: "http://127.0.0.1:47322/mcp", error: mcpError },
      }));
      handle("ai:connect", async (client) => {
        if (!["claude", "codex"].includes(client)) throw new Error("Cliente inválido.");
        if (!locateClient(client))
          return { ok: false, message: "Cliente oficial não encontrado neste computador." };
        return connectMcpClient({
          client: client === "claude" ? "claude-code" : "codex",
          home: homedir(),
          name: "edisvg",
          port: 47322,
        });
      });
      handle("ai:send", (request) => {
        if (!initialized) throw new Error("Aguarde a recuperação do projeto.");
        if (!mcp) throw new Error(mcpError);
        return runner.send(request || {});
      });
      handle("ai:stop", () => runner.stop());
      handle("ai:result", (id, result) => {
        if (
          typeof id !== "string" ||
          typeof result?.ok !== "boolean" ||
          typeof result?.text !== "string" ||
          result.text.length > 1000000
        )
          throw new Error("Resposta inválida.");
        bridge.result(id, result);
      });
      const recovery = createRecoveryStore(
        join(app.getPath("userData"), "recovery-v1.json"),
        parseProject,
      );
      files = createProjectFiles({
        checkpoint: (project) => recovery.save(project),
        onDiscard: () =>
          win.webContents.executeJavaScript("localStorage.removeItem('edisvg-project')"),
        chooseOpen: async () => {
          const r = await dialog.showOpenDialog(win, {
            defaultPath: files.status().path || app.getPath("documents"),
            filters: [{ name: "Projeto EdiSVG", extensions: ["edisvg", "json"] }],
            properties: ["openFile", "dontAddToRecent"],
          });
          return r.canceled ? null : r.filePaths[0];
        },
        chooseSave: async (current) => {
          const r = await dialog.showSaveDialog(win, {
            defaultPath: current || join(app.getPath("documents"), "Personagem.edisvg"),
            filters: [{ name: "Projeto EdiSVG", extensions: ["edisvg"] }],
            properties: ["dontAddToRecent"],
          });
          return r.canceled ? null : r.filePath;
        },
        confirm: async () => {
          const r = await dialog.showMessageBox(win, {
            type: "question",
            message: "Salvar as alterações do projeto?",
            detail: "Há alterações que ainda não foram gravadas em arquivo.",
            buttons: ["Salvar", "Descartar", "Cancelar"],
            defaultId: 0,
            cancelId: 2,
          });
          return ["save", "discard", "cancel"][r.response];
        },
      });
      handle("project:initialize", async (legacy) => {
        if (initializing || files.isBusy() || runner.busy())
          throw new Error("Aguarde a operação em andamento.");
        initializing = true;
        initialized = false;
        try {
          const stored = await recovery.load();
          let project = stored.project;
          if (!stored.exists && legacy !== null && legacy !== undefined) {
            if (typeof legacy !== "string" || Buffer.byteLength(legacy, "utf8") > 8_000_000)
              throw new Error("Cópia local inválida. Ela foi preservada.");
            project = parseProject(JSON.parse(legacy));
          }
          if (project) {
            const choice = await dialog.showMessageBox(win, {
              type: "question",
              message: "Há um projeto não salvo para recuperar.",
              detail:
                "Recuperar abre uma cópia sem substituir o arquivo original. Descartar remove somente esta cópia de recuperação.",
              buttons: ["Recuperar", "Descartar cópia"],
              defaultId: 0,
              cancelId: 0,
            });
            if (choice.response === 1) {
              await recovery.save(null);
              project = null;
            }
          }
          const result = await files.recover(project ?? newProject(), { persist: false });
          initialized = true;
          return { ...result, recovered: !!project };
        } finally {
          initializing = false;
        }
      });
      handle("project:changed", (project) => {
        if (!initialized) throw new Error("A recuperação precisa terminar antes da edição.");
        return files.changed(project);
      });
      handle("project:new", () => {
        if (!initialized) throw new Error("A recuperação precisa terminar antes da edição.");
        if (runner.busy()) throw new Error("Interrompa a IA antes de criar um projeto.");
        return files.new();
      });
      handle("svg:import", async () => {
        if (!initialized) throw new Error("Aguarde a recuperação do projeto.");
        const result = await dialog.showOpenDialog(win, {
          defaultPath: app.getPath("documents"),
          filters: [{ name: "SVG", extensions: ["svg"] }],
          properties: ["openFile", "dontAddToRecent"],
        });
        if (result.canceled) return null;
        const source = await readBoundedText(result.filePaths[0], SVG_BYTES);
        return source;
      });
      handle("asset:import", async () => {
        if (!initialized) throw new Error("Aguarde a recuperação do projeto.");
        const result = await dialog.showOpenDialog(win, {
          defaultPath: app.getPath("documents"),
          filters: [{ name: "Recursos PNG/WAV/TTF/OTF", extensions: ["png", "wav", "ttf", "otf"] }],
          properties: ["openFile", "dontAddToRecent"],
        });
        if (result.canceled) return null;
        const path = result.filePaths[0];
        const bytes = await readBoundedBytes(path, ASSET_BYTES);
        desktop.assertAccess();
        return { name: basename(path), bytes };
      });
      handle("project:open", () => {
        if (!initialized) throw new Error("A recuperação precisa terminar antes da edição.");
        if (runner.busy()) throw new Error("Interrompa a IA antes de abrir outro projeto.");
        return files.open();
      });
      handle("project:save", async (project, as = false) => {
        if (!initialized) throw new Error("A recuperação precisa terminar antes do salvamento.");
        await files.changed(project);
        return files.save(as === true);
      });
      handle("export:save", async (payload) => {
        if (!initialized) throw new Error("Aguarde a recuperação do projeto.");
        const exported = parseExportPayload(payload);
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          defaultPath: join(app.getPath("documents"), `projeto.${exported.extension}`),
          properties: ["dontAddToRecent"],
          filters: [
            { name: "Exportação EdiSVG", extensions: [exported.extension.split(".").pop()] },
          ],
        });
        if (canceled) return { saved: false };
        desktop.assertAccess();
        await atomicWrite(filePath, exported.content);
        return { saved: true };
      });
      await createWindow();
      if (smokeMode) {
        try {
          await smoke(win, bridge, app.getPath("userData"));
          app.exit(0);
        } catch (error) {
          await writeFile(
            join(app.getPath("userData"), "smoke-result.json"),
            JSON.stringify({ ok: false, error: error.stack }),
          );
          app.exit(1);
        }
      }
    })
    .catch((error) => {
      dialog.showErrorBox("EdiSVG", error.message);
      app.quit();
    });
  app.on("activate", () => {
    if (!win) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => {
    runner?.stop();
    bridge.close();
    mcp?.close();
  });
}
