import { join, resolve } from "node:path";
import { toolIdSchema } from "@informach/edi-contracts";
import { desktopConfigSchema } from "@informach/edi-desktop/contracts";
import { createInstallationManager } from "@informach/edi-desktop/installations";
import { createEdiDesktop, desktopIpc } from "@informach/edi-desktop/main";
import { app, BrowserWindow, dialog } from "electron";

app.setPath(
  "userData",
  !app.isPackaged && process.env.EDI_SUITE_TEST_PROFILE
    ? join(resolve(process.env.EDI_SUITE_TEST_PROFILE), "hub")
    : join(app.getPath("appData"), "Informach", "Edi", "hub"),
);
app.setAppUserModelId("br.com.informach.edi-hub");
const config = desktopConfigSchema.parse(JSON.parse(process.env.EDI_DESKTOP_CONFIG ?? "{}"));
const desktop = createEdiDesktop({
  appId: "edi-hub",
  preloadPath: join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: join(__dirname, "../renderer"),
  recoveryChannels: ["hub:list", "hub:install"],
});
const installations = createInstallationManager({
  ...config,
  localAppData: process.env.LOCALAPPDATA ?? app.getPath("appData"),
  directory: desktop.dataDirectory,
  acceptRelease: desktop.acceptRelease,
});
let window: BrowserWindow | undefined;
let automaticUpdates: ReturnType<typeof setInterval> | undefined;
function createWindow() {
  window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 900,
    minHeight: 660,
    backgroundColor: "#f5f3ed",
    title: "Edi Hub",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, "../renderer/index.html"));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      await desktop.start();
      desktopIpc.handle("hub:list", () => installations.list());
      desktopIpc.handle("hub:install", (_event, id: unknown) =>
        installations.install(toolIdSchema.parse(id)),
      );
      desktopIpc.handle("hub:open", (_event, id: unknown) =>
        installations.open(toolIdSchema.parse(id)),
      );
      createWindow();
      if (app.isPackaged) {
        void installations.updateInstalled();
        automaticUpdates = setInterval(() => {
          void installations.updateInstalled();
        }, 15 * 60000);
      }
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "Edi Hub",
        error instanceof Error ? error.message : "Falha ao iniciar a suíte",
      );
      app.quit();
    });
}
app.on("window-all-closed", () => {
  app.quit();
});
app.on("will-quit", () => {
  if (automaticUpdates) clearInterval(automaticUpdates);
});
