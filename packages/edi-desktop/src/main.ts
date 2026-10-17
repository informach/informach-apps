import { randomBytes, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EDI_TOOLS } from "@informach/config/edi-tools";
import type { DesktopAppId, ReleaseManifest } from "@informach/edi-contracts";
import {
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  powerMonitor,
  safeStorage,
  shell,
} from "electron";
import type { NsisUpdater } from "electron-updater";
import { lock, unlockSync } from "proper-lockfile";
import { z } from "zod";
import { configureDesktopAccess } from "./access";
import { desktopConfigSchema, recoveryResultSchema } from "./contracts";
import { createDesktopController } from "./controller";
import { electronInstallationFileSystem } from "./electron-installation-filesystem";
import { createFileAuthority, validateIpcValues } from "./files";
import { gateHtml } from "./gate-html";
import { verifyInstalledApplication } from "./installation-integrity";
import { desktopJobs } from "./jobs";
import { createReleaseAcceptance } from "./release-policy";
import { createSignedUpdater, UPDATE_VERIFIER_MARKER } from "./update-provider";
import { createVault } from "./vault";

export { assertDesktopAccess } from "./access";

let authorize: ((event: IpcMainEvent | IpcMainInvokeEvent, channel: string) => void) | undefined;
let fileAuthority: ReturnType<typeof createFileAuthority> | undefined;
let beforeInvoke: ((channel: string, args: unknown[]) => Promise<void>) | undefined;
let afterInvoke: ((channel: string, result: unknown) => Promise<void>) | undefined;
function files() {
  if (!fileAuthority) throw new Error("File capabilities are not initialized");
  return fileAuthority;
}
export const desktopFiles = {
  grantReadAll: (paths: readonly string[]) => files().grantReadAll(paths),
  grantRead: (path: string) => files().grantRead(path),
  assertRead: (path: string) => files().assertRead(path),
  assertWrite: (path: string) => files().assertWrite(path, false),
  assertRelatedExport: (primary: string, path: string) =>
    files().assertRelatedExport(primary, path),
};
/** Composition at the application-owned registration boundary, not mutation of Electron. */
export const desktopIpc = {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown,
  ) {
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
      if (!authorize) throw new Error("Desktop licensing is not initialized");
      authorize(event, channel);
      validateIpcValues(args);
      if (channel === "fs:exists") return files().canReadAll(args[0]);
      await beforeInvoke?.(channel, args);
      const result = await listener(event, ...args);
      await afterInvoke?.(channel, result);
      return result;
    });
  },
  on<TArgs extends unknown[]>(
    channel: string,
    listener: (event: IpcMainEvent, ...args: TArgs) => void,
  ) {
    ipcMain.on(channel, (event, ...args: TArgs) => {
      try {
        if (!authorize) throw new Error("Desktop licensing is not initialized");
        authorize(event, channel);
        validateIpcValues(args);
        listener(event, ...args);
      } catch (error) {
        console.error(
          `[edi] rejected IPC event ${channel}: ${error instanceof Error ? error.name : "unknown"}`,
        );
      }
    });
  },
};

export function createEdiDesktop(options: {
  appId: DesktopAppId;
  preloadPath: string;
  rendererRoot: string;
  recoveryChannels?: readonly string[];
  onRecovery?: () => void;
  getRecoveryWindow?: () => BrowserWindow | null | undefined;
}) {
  const config = desktopConfigSchema.parse(JSON.parse(process.env.EDI_DESKTOP_CONFIG ?? "{}"));
  fileAuthority = createFileAuthority(
    EDI_TOOLS.find((tool) => tool.id === options.appId)?.projectExtensions ?? [],
  );
  const directory =
    !app.isPackaged && process.env.EDI_SUITE_TEST_PROFILE
      ? resolve(process.env.EDI_SUITE_TEST_PROFILE)
      : join(app.getPath("appData"), "Informach", "Edi", config.environment);
  let gate: BrowserWindow | undefined;
  let controller: ReturnType<typeof createDesktopController> | undefined;
  let releaseAcceptance: ((manifest: ReleaseManifest) => Promise<void>) | undefined;
  let updater: NsisUpdater | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeVault: ReturnType<typeof watch> | undefined;
  let runtimeLock: (() => Promise<void>) | undefined;
  let quitting = false;
  let pendingInstaller: string | undefined;
  let verifyingQuit = false;
  let quitVerified = false;
  let releaseStartup: (() => void) | undefined;
  const recoveryRequests = new Map<
    string,
    { senderId: number; complete: (saved: boolean) => void }
  >();
  const recoveryChannels = new Set(options.recoveryChannels ?? []);
  const logFailure = (operation: string, error: unknown) => {
    console.error(
      `[edi:${options.appId}] ${operation}: ${error instanceof Error ? error.name : "unknown"}`,
    );
  };
  const safeRefresh = () => {
    desktopJobs.checkDeadlines();
    controller?.refresh().catch((error: unknown) => {
      logFailure("license_validation_failed", error);
    });
  };
  function validToolSender(event: IpcMainEvent | IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Untrusted subframe");
    const frame = event.senderFrame;
    if (!frame || !BrowserWindow.fromWebContents(event.sender)) throw new Error("Untrusted window");
    const url = new URL(frame.url);
    if (
      !app.isPackaged &&
      process.env.ELECTRON_RENDERER_URL &&
      url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    )
      return;
    if (url.protocol !== "file:") throw new Error("Untrusted renderer origin");
    const path = relative(options.rendererRoot, fileURLToPath(url));
    if (path.startsWith("..") || isAbsolute(path))
      throw new Error("Renderer outside application bundle");
  }
  function validControlSender(event: IpcMainInvokeEvent) {
    if (gate && event.sender === gate.webContents && event.senderFrame === event.sender.mainFrame)
      return;
    validToolSender(event);
  }
  function requireController() {
    if (!controller) throw new Error("Desktop session is not ready");
    return controller;
  }
  function showGate() {
    if (gate && !gate.isDestroyed()) {
      gate.show();
      gate.focus();
      return;
    }
    gate = new BrowserWindow({
      width: 720,
      height: 680,
      minWidth: 620,
      minHeight: 600,
      backgroundColor: "#f5f3ed",
      title: "Suíte Edi · acesso",
      autoHideMenuBar: true,
      webPreferences: {
        preload: options.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: !app.isPackaged,
      },
    });
    gate.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    gate.webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });
    gate.on("close", (event) => {
      if (!quitting && controller?.status().state !== "licensed") {
        event.preventDefault();
        app.quit();
      }
    });
    gate.on("closed", () => {
      gate = undefined;
    });
    gate
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gateHtml)}`)
      .catch((error: unknown) => {
        logFailure("gate_load_failed", error);
        app.quit();
      });
  }
  authorize = (event, channel) => {
    validToolSender(event);
    if (!recoveryChannels.has(channel)) requireController().assertAccess();
    if (
      ["fs:write", "file:write", "project:save", "dialog:save", "library:save"].includes(channel) &&
      controller?.status().state !== "licensed" &&
      ![...recoveryRequests.values()].some((request) => request.senderId === event.sender.id)
    )
      throw new Error("Use Salvar trabalho existente para recuperar seu projeto.");
  };
  const pathValue = z.string().min(1).max(32768);
  const readAtFirst = new Set([
    "fs:read",
    "file:read",
    "project:open",
    "media:probe",
    "media:thumb",
    "media:waveform",
    "media:still",
    "key:detect",
    "key:frame",
    "cursor:cached",
  ]);
  const readAtSecond = new Set(["media:proxy", "key:render", "whisper:transcribe", "cursor:begin"]);
  beforeInvoke = async (channel, args) => {
    if (readAtFirst.has(channel)) args[0] = await files().assertRead(pathValue.parse(args[0]));
    if (readAtSecond.has(channel)) args[1] = await files().assertRead(pathValue.parse(args[1]));
    if (["fs:write", "file:write", "file:write-unique", "project:save"].includes(channel)) {
      args[0] = await files().assertWrite(
        pathValue.parse(args[0]),
        requireController().status().state !== "licensed",
      );
      if (channel !== "project:save" && !(args[1] instanceof Uint8Array))
        throw new Error("Expected binary file content");
    }
    if (channel === "recent:add") {
      const entry = z.object({ path: pathValue }).parse(args[0]);
      await files().assertRead(entry.path);
    }
    if (channel === "file:write-many") {
      const folder = pathValue.parse(args[0]);
      const entries = z
        .array(z.object({ name: z.string().min(1).max(255), bytes: z.instanceof(Uint8Array) }))
        .max(5000)
        .parse(args[1]);
      for (const entry of entries) {
        if (entry.name !== basename(entry.name)) throw new Error("Invalid output filename");
        await files().assertWrite(join(folder, entry.name), false);
      }
    }
    if (channel === "dialog:save" && requireController().status().state !== "licensed") {
      const kind = args[1];
      if (
        (options.appId === "edifoto" && kind !== "doc") ||
        (options.appId === "edipdf" && kind !== undefined && kind !== "pdf")
      )
        throw new Error("A recuperação não permite novas exportações.");
    }
  };
  function nativePaths(result: unknown): string[] {
    if (typeof result === "string") return isAbsolute(result) ? [result] : [];
    if (Array.isArray(result)) return result.flatMap(nativePaths);
    if (result && typeof result === "object")
      return [
        "path",
        "proxy",
        "thumb",
        "waveform",
        "video",
        "audio",
        "screen",
        "camera",
        "narration",
        "systemAudio",
        "cursor",
      ].flatMap((field) => {
        const value: unknown = Reflect.get(result, field);
        return typeof value === "string" && isAbsolute(value) ? [value] : [];
      });
    return [];
  }
  const nativeRead = new Set([
    "dialog:media",
    "dialog:project",
    "dialog:images",
    "dialog:document",
    "dialog:open",
    "project:create",
    "project:recent",
    "recent:list",
    "app:pending",
    "recorder:pickNarration",
    "media:probe",
    "media:thumb",
    "media:waveform",
    "media:proxy",
    "media:still",
    "media:saveNarration",
    "media:saveGenerated",
    "key:render",
    "cursor:cached",
    "cursor:end",
    "recorder:stop",
  ]);
  afterInvoke = async (channel, result) => {
    if (channel === "dialog:folder" && typeof result === "string")
      await files().grantDirectory(result);
    for (const path of nativePaths(result)) {
      if (["dialog:save", "dialog:export"].includes(channel)) await files().grantWrite(path);
      else if (nativeRead.has(channel)) {
        try {
          await files().grantRead(path);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
    }
  };
  return {
    ipc: desktopIpc,
    jobs: desktopJobs,
    dataDirectory: directory,
    assertAccess: () => requireController().assertAccess(),
    acceptRelease: (manifest: ReleaseManifest) => {
      if (!releaseAcceptance) throw new Error("Release policy is not initialized");
      return releaseAcceptance(manifest);
    },
    async start() {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      runtimeLock = await lock(join(directory, `${options.appId}.runtime`), {
        realpath: false,
        stale: 30000,
        update: 5000,
        retries: 0,
      });
      app.on("before-quit", () => {
        quitting = true;
        controller?.cancelConnect();
      });
      app.on("will-quit", (event) => {
        if (pendingInstaller && updater && !quitVerified) {
          // All editor close/save handlers have completed by will-quit. Recheck
          // the actual cached bytes immediately before the updater can execute.
          event.preventDefault();
          if (verifyingQuit) return;
          verifyingQuit = true;
          const activeUpdater = updater;
          activeUpdater
            .verifyUpdateCodeSignature([UPDATE_VERIFIER_MARKER], pendingInstaller)
            .then(
              (rejection) => {
                if (rejection) {
                  activeUpdater.autoInstallOnAppQuit = false;
                  logFailure("pending_update_rejected", new Error(rejection));
                }
              },
              (error: unknown) => {
                activeUpdater.autoInstallOnAppQuit = false;
                logFailure("pending_update_verification_failed", error);
              },
            )
            .finally(() => {
              quitVerified = true;
              app.quit();
            });
          return;
        }
        if (timer) clearInterval(timer);
        desktopJobs.dispose();
        if (expiryTimer) clearTimeout(expiryTimer);
        unsubscribeVault?.close();
        powerMonitor.removeListener("resume", safeRefresh);
        if (runtimeLock) {
          try {
            unlockSync(join(directory, `${options.appId}.runtime`), { realpath: false });
          } catch (error) {
            logFailure("runtime_lock_release_failed", error);
          }
        }
      });
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("O armazenamento protegido do sistema operacional está indisponível.");
      const vault = createVault({
        directory,
        seal: (value) => safeStorage.encryptString(value),
        unseal: (value) => safeStorage.decryptString(value),
      });
      releaseAcceptance = createReleaseAcceptance({
        vault,
        currentVersion: app.getVersion(),
        channel: config.updateChannel,
      });
      const token = await vault.use(async (data) => {
        data.mcpTokens[options.appId] ??= randomBytes(32).toString("hex");
        const value = data.mcpTokens[options.appId];
        if (!value) throw new Error("Local MCP token missing");
        return value;
      });
      configureDesktopAccess({ token, assertAccess: () => requireController().assertAccess() });
      controller = createDesktopController({
        ...config,
        appId: options.appId,
        clientVersion: app.getVersion(),
        vault,
        openExternal: (url) => shell.openExternal(url),
        changed: (status) => {
          desktopJobs.setAccess(status.state === "licensed");
          for (const window of BrowserWindow.getAllWindows())
            window.webContents.send("edi:status-changed", status);
          if (expiryTimer) clearTimeout(expiryTimer);
          if (status.state === "licensed") {
            if (status.expiresAt)
              expiryTimer = setTimeout(
                () => {
                  controller?.expire();
                  safeRefresh();
                },
                Math.max(1, Date.parse(status.expiresAt) - Date.now()),
              );
            if (releaseStartup) {
              const resume = releaseStartup;
              releaseStartup = undefined;
              // The editor must exist before closing the last access window;
              // otherwise Electron emits window-all-closed and quits during login.
              app.once("browser-window-created", (_event, window) => {
                if (gate && window !== gate && !gate.isDestroyed()) gate.close();
              });
              resume();
            } else if (gate && !gate.isDestroyed()) gate.close();
          }
        },
      });
      ipcMain.on("edi:file-drop", (event, raw: unknown) => {
        try {
          validToolSender(event);
          requireController().assertAccess();
          files().deferRead(pathValue.parse(raw));
        } catch (error) {
          logFailure("file_drop_rejected", error);
        }
      });
      const operations = {
        "edi:status": () => requireController().status(),
        "edi:connect": () => requireController().connect(),
        "edi:logout": () => requireController().logout(),
        "edi:refresh": () => requireController().refresh(),
        "edi:account": () => shell.openExternal(`${new URL(config.portalUrl).origin}/conta`),
        "edi:update": () => updater?.checkForUpdates(),
        "edi:recover": async () => {
          options.onRecovery?.();
          const editor = options.getRecoveryWindow?.();
          if (!editor || editor.isDestroyed())
            throw new Error("Não há trabalho aberto nesta ferramenta.");
          const id = randomUUID();
          const saved = await new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => {
              recoveryRequests.delete(id);
              reject(new Error("O salvamento não foi confirmado. Seu trabalho permanece aberto."));
            }, 60000);
            recoveryRequests.set(id, {
              senderId: editor.webContents.id,
              complete: (value) => {
                clearTimeout(timeout);
                recoveryRequests.delete(id);
                resolve(value);
              },
            });
            editor.webContents.send("edi:recover-request", id);
          });
          if (!saved)
            throw new Error("O salvamento foi cancelado ou falhou. Seu trabalho permanece aberto.");
        },
      };
      for (const [channel, action] of Object.entries(operations))
        ipcMain.handle(channel, (event, ...args: unknown[]) => {
          validControlSender(event);
          if (args.length) throw new Error("Unexpected control arguments");
          return action();
        });
      ipcMain.handle("edi:recovery-result", (event, raw: unknown) => {
        validToolSender(event);
        const result = recoveryResultSchema.parse(raw);
        const pending = recoveryRequests.get(result.id);
        if (!pending || pending.senderId !== event.sender.id)
          throw new Error("Unknown recovery request");
        pending.complete(result.ok);
      });
      if (app.isPackaged) {
        if (config.environment !== "production")
          throw new Error("Packaged applications require commercial configuration");
        const updaterConfiguration = await readFile(
          join(process.resourcesPath, "app-update.yml"),
          "utf8",
        );
        if (
          !updaterConfiguration.split(/\r?\n/).includes(`publisherName: ${UPDATE_VERIFIER_MARKER}`)
        )
          throw new Error("Mandatory signed-update verifier is not configured");
        await verifyInstalledApplication({
          directory: resolve(process.resourcesPath, ".."),
          appId: options.appId,
          version: app.getVersion(),
          trustedKeys: config.updateKeys,
          fileSystem: electronInstallationFileSystem,
        });
        updater = createSignedUpdater({
          appId: options.appId,
          repository: config.distributionRepository,
          trustedKeys: config.updateKeys,
          channel: config.updateChannel,
          acceptRelease: releaseAcceptance,
        });
        updater.on("checking-for-update", () => {
          controller?.setUpdate("checking");
        });
        updater.on("update-not-available", () => {
          controller?.setUpdate("idle");
        });
        updater.on("download-progress", () => {
          controller?.setUpdate("downloading");
        });
        updater.on("update-downloaded", (event) => {
          pendingInstaller = event.downloadedFile;
          controller?.setUpdate("ready");
        });
        updater.on("error", (error) => {
          controller?.setUpdate("error");
          logFailure("update_failed", error);
        });
        await updater.checkForUpdates().catch((error: unknown) => {
          logFailure("update_check_failed", error);
        });
      }
      await controller.refresh();
      unsubscribeVault = watch(directory, { persistent: false }, (_kind, name) => {
        if (name === "session.v1.bin")
          controller?.synchronize().catch((error: unknown) => {
            logFailure("session_sync_failed", error);
          });
      });
      timer = setInterval(() => {
        safeRefresh();
        updater?.checkForUpdates().catch((error: unknown) => {
          logFailure("update_check_failed", error);
        });
      }, 15 * 60000);
      powerMonitor.on("resume", safeRefresh);
      if (options.appId === "edi-hub" || controller.status().state === "licensed") return;
      showGate();
      await new Promise<void>((resolve) => {
        releaseStartup = resolve;
      });
    },
    showAccount: showGate,
  };
}
