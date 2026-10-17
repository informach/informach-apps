import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createEdiDesktop, desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  shell,
} from "electron";
import type { PrintPage, RecentFile, SavedSignature, UnsavedChoice } from "../shared/types.ts";
import { atomicWrite, writeUnique } from "./files.ts";

// Lets automated checks run against a throwaway profile instead of the user's real recents.
app.setPath("userData", join(app.getPath("appData"), "edipdf"));
const desktop = createEdiDesktop({
  appId: "edipdf",
  preloadPath: join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: join(__dirname, "../renderer"),
  getRecoveryWindow: () => win,
  recoveryChannels: [
    "app:title",
    "app:close-now",
    "dialog:unsaved",
    "dialog:message",
    "dialog:save",
    "file:write",
    "recent:add",
    "recent:list",
  ],
});
if (!app.isPackaged && process.env.EDIPDF_USER_DATA)
  app.setPath("userData", process.env.EDIPDF_USER_DATA);

app.setAppUserModelId("br.com.informach.edipdf");

const OPENABLE = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const MAX_RECENT = 24;

let win: BrowserWindow | null = null;
let allowClose = false;
let rendererReady = false;
/** Files that arrived before the renderer asked for them. */
let pendingFiles: string[] = filesFromArgv(process.argv);

function filesFromArgv(argv: string[]): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith("-") && OPENABLE.has(extname(a).toLowerCase()) && existsSync(a));
}

const dataFile = (name: string): string => join(app.getPath("userData"), name);

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const value = JSON.parse(await readFile(dataFile(name), "utf8"));
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
  await atomicWrite(dataFile(name), JSON.stringify(value));
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: "#0D0E11",
    title: "EdiPDF",
    icon: join(app.getAppPath(), "resources", "icon.ico"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#15171C", symbolColor: "#9BA1AE", height: 48 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  win.once("ready-to-show", () => {
    win?.maximize();
    win?.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(console.error);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  // Unsaved documents live in the renderer, so it decides whether the window may close.
  win.on("close", (e) => {
    if (allowClose || !win) return;
    e.preventDefault();
    win.webContents.send("app:close-request");
  });
  win.on("closed", () => (win = null));
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged && process.env.EDIPDF_SNAPSHOT)
    void runSnapshot(win, process.env.EDIPDF_SNAPSHOT);
}

/**
 * Development aid: EDIPDF_SNAPSHOT=out.png runs the optional EDIPDF_SNAPSHOT_JS file in the
 * renderer, waits EDIPDF_SNAPSHOT_DELAY ms, saves a screenshot of the window and quits.
 */
async function runSnapshot(w: BrowserWindow, out: string): Promise<void> {
  await new Promise<void>((r) => w.webContents.once("did-finish-load", () => r()));
  await new Promise((r) => setTimeout(r, 1500));
  const scriptPath = process.env.EDIPDF_SNAPSHOT_JS;
  if (scriptPath) {
    try {
      const result = await w.webContents.executeJavaScript(await readFile(scriptPath, "utf8"));
      if (result !== undefined) console.log("[snapshot script]", JSON.stringify(result));
    } catch (err) {
      console.error("[snapshot script failed]", err);
    }
  }
  await new Promise((r) => setTimeout(r, Number(process.env.EDIPDF_SNAPSHOT_DELAY ?? 2000)));
  const image = await w.webContents.capturePage();
  await writeFile(out, image.toPNG());
  console.log("[snapshot saved]", out);
  allowClose = true;
  app.quit();
}

async function openFile(
  path: string,
): Promise<{ path: string; name: string; bytes: Uint8Array } | null> {
  try {
    return { path, name: basename(path), bytes: new Uint8Array(await readFile(path)) };
  } catch {
    return null;
  }
}

/** Renders the given page images in a hidden window and opens the system print dialog. */
async function printPages(pages: PrintPage[], jobName: string): Promise<boolean> {
  // One named @page rule per size keeps mixed portrait/landscape documents correct.
  const sizes = [...new Set(pages.map((p) => `${p.width}x${p.height}`))];
  const pageRules = sizes
    .map((s, i) => {
      const [w, h] = s.split("x");
      return `@page s${i} { size: ${w}pt ${h}pt; margin: 0 } .s${i} { page: s${i} }`;
    })
    .join("\n");
  const body = pages
    .map((p) => {
      const cls = sizes.indexOf(`${p.width}x${p.height}`);
      return `<div class="p s${cls}" style="width:${p.width}pt;height:${p.height}pt"><img src="${p.src}"></div>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${jobName.replace(/</g, "")}</title><style>
    html,body{margin:0;padding:0}
    @page { margin: 0 }
    ${pageRules}
    .p{break-after:page;overflow:hidden}
    .p:last-child{break-after:auto}
    .p img{width:100%;height:100%;display:block}
  </style></head><body>${body}</body></html>`;
  const tmp = join(app.getPath("temp"), `edipdf-print-${Date.now()}.html`);
  await writeFile(tmp, html);
  const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await printWin.loadFile(tmp);
    return await new Promise<boolean>((resolve) => {
      printWin.webContents.print({ printBackground: true, margins: { marginType: "none" } }, (ok) =>
        resolve(ok),
      );
    });
  } finally {
    printWin.destroy();
    await unlink(tmp).catch(() => undefined);
  }
}

function registerIpc(): void {
  const pending = new Map<string, Promise<unknown>>();
  const validSender = (event: IpcMainInvokeEvent | IpcMainEvent): boolean => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      return false;
    const expected =
      (!app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined) ??
      pathToFileURL(join(__dirname, "../renderer/index.html")).href;
    return event.senderFrame.url.split("#")[0] === expected.split("#")[0];
  };
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
  ): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!validSender(event)) throw new Error("Origem não autorizada");
      const group = channel.split(":")[0];
      if (group === "recent" || group === "signatures") {
        const next = (pending.get(group) ?? Promise.resolve()).then(() => listener(event, ...args));
        pending.set(
          group,
          next.catch(() => undefined),
        );
        return next;
      }
      return listener(event, ...args);
    });
  };
  handle(
    "dialog:open",
    async (_e, opts?: { images?: boolean; multi?: boolean; title?: string }) => {
      if (!win) return [];
      const filters = opts?.images
        ? [
            { name: "PDF e imagens", extensions: ["pdf", "png", "jpg", "jpeg"] },
            { name: "Imagens", extensions: ["png", "jpg", "jpeg"] },
          ]
        : [{ name: "Documentos PDF", extensions: ["pdf"] }];
      const res = await dialog.showOpenDialog(win, {
        title: opts?.title ?? "Abrir PDF",
        filters,
        properties: opts?.multi === false ? ["openFile"] : ["openFile", "multiSelections"],
      });
      if (res.canceled) return [];
      const files = await Promise.all(res.filePaths.map(openFile));
      return files.filter(Boolean);
    },
  );
  handle("file:read", (_e, path: string) => openFile(path));
  handle("dialog:save", async (_e, defaultName: string, kind: "pdf" | "png" | "jpg" = "pdf") => {
    if (!win) return null;
    const filters = {
      pdf: { name: "Documento PDF", extensions: ["pdf"] },
      png: { name: "Imagem PNG", extensions: ["png"] },
      jpg: { name: "Imagem JPEG", extensions: ["jpg"] },
    };
    const res = await dialog.showSaveDialog(win, {
      title: "Salvar como",
      defaultPath: defaultName,
      filters: [filters[kind]],
    });
    return res.canceled ? null : (res.filePath ?? null);
  });
  handle("dialog:folder", async (_e, title?: string) => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: title ?? "Escolher pasta",
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  handle("file:write", (_e, path: string, bytes: Uint8Array) => atomicWrite(path, bytes));
  handle(
    "file:write-many",
    async (_e, folder: string, files: { name: string; bytes: Uint8Array }[]) => {
      const written: string[] = [];
      for (const f of files) {
        if (!f.name || basename(f.name) !== f.name || f.name === "." || f.name === "..")
          throw new Error("Nome de arquivo inválido");
        const p = await writeUnique(join(folder, f.name), f.bytes);
        written.push(p);
      }
      return written;
    },
  );
  handle("file:write-unique", (_e, path: string, bytes: Uint8Array) => writeUnique(path, bytes));
  handle("shell:show", (_e, path: string) => shell.showItemInFolder(path));

  handle("recent:list", async () => {
    const list = await readJson<RecentFile[]>("recent.json", []);
    return list.filter((r) => r && typeof r.path === "string" && existsSync(r.path));
  });
  handle("recent:add", async (_e, entry: RecentFile) => {
    const list = (await readJson<RecentFile[]>("recent.json", [])).filter(
      (r) => r && typeof r.path === "string" && r.path.toLowerCase() !== entry.path.toLowerCase(),
    );
    const next = [entry, ...list].slice(0, MAX_RECENT);
    await writeJson("recent.json", next);
    app.addRecentDocument(entry.path);
    return next;
  });
  handle("recent:remove", async (_e, path: string) => {
    const next = (await readJson<RecentFile[]>("recent.json", [])).filter(
      (r) => r && typeof r.path === "string" && r.path !== path,
    );
    await writeJson("recent.json", next);
    return next;
  });

  handle("signatures:list", async () =>
    (await readJson<SavedSignature[]>("signatures.json", [])).filter(
      (s) => s && typeof s.id === "string" && typeof s.src === "string",
    ),
  );
  handle("signatures:save", async (_e, sig: SavedSignature) => {
    const next = [
      sig,
      ...(await readJson<SavedSignature[]>("signatures.json", [])).filter(
        (s) => s && s.id !== sig.id,
      ),
    ].slice(0, 8);
    await writeJson("signatures.json", next);
    return next;
  });
  handle("signatures:remove", async (_e, id: string) => {
    const next = (await readJson<SavedSignature[]>("signatures.json", [])).filter(
      (s) => s && s.id !== id,
    );
    await writeJson("signatures.json", next);
    return next;
  });

  handle("print", (_e, pages: PrintPage[], jobName: string) => printPages(pages, jobName));

  handle("dialog:unsaved", async (_e, names: string[]): Promise<UnsavedChoice> => {
    if (!win) return "cancel";
    const one = names.length === 1;
    const res = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Alterações não salvas",
      message: one
        ? `Salvar as alterações em "${names[0]}"?`
        : `${names.length} documentos têm alterações não salvas.`,
      detail: one ? "Se não salvar, as alterações serão perdidas." : names.join("\n"),
      buttons: [one ? "Salvar" : "Salvar todos", "Não salvar", "Cancelar"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return (["save", "discard", "cancel"] as const)[res.response];
  });
  handle(
    "dialog:message",
    async (
      _e,
      o: {
        type?: "info" | "warning" | "error" | "question";
        title?: string;
        message: string;
        detail?: string;
        buttons?: string[];
      },
    ) => {
      if (!win) return 0;
      const res = await dialog.showMessageBox(win, {
        type: o.type ?? "info",
        title: o.title ?? "EdiPDF",
        message: o.message,
        detail: o.detail,
        buttons: o.buttons ?? ["OK"],
        noLink: true,
      });
      return res.response;
    },
  );

  handle("app:pending", () => {
    rendererReady = true;
    const files = pendingFiles;
    pendingFiles = [];
    return files;
  });
  ipcMain.on("app:close-now", (event) => {
    if (!validSender(event)) return;
    allowClose = true;
    win?.close();
  });
  ipcMain.on("app:title", (event, title: string) => {
    if (validSender(event)) win?.setTitle(title);
  });
}

// A second launch (e.g. double-clicking another PDF) hands its files to the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", async (_e, argv) => {
    const files = filesFromArgv(argv);
    try {
      await desktopFiles.grantReadAll(files);
    } catch {
      dialog.showErrorBox("EdiPDF", "Não foi possível abrir os arquivos recebidos.");
      return;
    }
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (files.length && rendererReady) win.webContents.send("app:open-files", files);
      else pendingFiles.push(...files);
    } else pendingFiles.push(...files);
  });
  app
    .whenReady()
    .then(async () => {
      await desktop.start();
      registerIpc();
      createWindow();
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "EdiPDF",
        error instanceof Error ? error.message : "Falha ao validar o acesso",
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
