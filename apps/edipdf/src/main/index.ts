import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { supportsOutputExtension } from "@informach/edi-desktop/files";
import { createEdiDesktop, desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  MessageChannelMain,
  nativeTheme,
  safeStorage,
  shell,
} from "electron";
import { z } from "zod";
import { batchDigest, readBatchArchive } from "../shared/batch-archive.ts";
import {
  type CompressionSource,
  sameCompressionSource,
} from "../shared/compression-task-format.ts";
import { conversionImportExtensions } from "../shared/conversion-format.ts";
import { recoverySchema } from "../shared/document-format.ts";
import { safeAttachmentName, webUrlSchema } from "../shared/pdf-navigation.ts";
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  recentFileSchema,
  recentFilesSchema,
  signatureSchema,
} from "../shared/preferences.ts";
import { EMPTY_SESSION, sessionSchema } from "../shared/session-format.ts";
import { localTaskRequestSchema } from "../shared/task-format.ts";
import type { RecentFile, SavedSignature, UnsavedChoice } from "../shared/types.ts";
import { commitBatchDirectory } from "./batch-directory.ts";
import { readBoundedFile } from "./bounded-files.ts";
import { readEditorClipboard, writeAnnotationClipboard } from "./clipboard.ts";
import { createFileRevisions } from "./file-revisions.ts";
import { assertCopyDestination, atomicWrite, writeUnique } from "./files.ts";
import { flattenPrint, printPrepared } from "./pdf-printer.ts";
import { createRecoveryStore } from "./recovery-store.ts";
import { describeScanner, listScanners } from "./scanner.ts";
import { createScanTask } from "./scanner-task.ts";
import { createSignatureStore } from "./signature-store.ts";
import { createTaskBroker } from "./task-broker.ts";
import { createTaskStore } from "./task-store.ts";
import { createValidatedStore, type LocalCodec } from "./validated-store.ts";
import { createVersionStore } from "./version-store.ts";

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
    "file:write-copy",
    "recent:add",
    "recent:list",
  ],
});
if (!app.isPackaged && process.env.EDIPDF_USER_DATA)
  app.setPath("userData", process.env.EDIPDF_USER_DATA);

app.setAppUserModelId("br.com.informach.edipdf");

const OPENABLE = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const MAX_RECENT = 24;
const openedPaths = new Set<string>();
const fileRevisions = createFileRevisions();

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
    if (webUrlSchema.safeParse(url).success)
      void confirmWebLink(url).catch((failure) =>
        dialog.showErrorBox(
          "Abrir endereço",
          failure instanceof Error ? failure.message : "Não foi possível abrir o endereço.",
        ),
      );
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
  limit = 512 * 1024 * 1024,
): Promise<{ path: string; name: string; bytes: Uint8Array } | null> {
  const bytes = await readBoundedFile(path, limit);
  openedPaths.add(path);
  fileRevisions.remember(path, bytes);
  return { path, name: basename(path), bytes };
}

async function confirmWebLink(raw: unknown): Promise<void> {
  const url = webUrlSchema.parse(raw);
  if (!win) return;
  const result = await dialog.showMessageBox(win, {
    type: "question",
    message: "Abrir este endereço no navegador?",
    detail: url,
    buttons: ["Abrir endereço", "Cancelar"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) await shell.openExternal(url);
}

function registerIpc(): void {
  const recentStore = createValidatedStore(
    app.getPath("userData"),
    "recent.json",
    recentFilesSchema,
    [],
  );
  const preferenceStore = createValidatedStore(
    app.getPath("userData"),
    "preferences.json",
    preferencesSchema,
    DEFAULT_PREFERENCES,
  );
  const codec: LocalCodec = {
    encode(value) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("O Windows não disponibilizou proteção para os dados locais.");
      return safeStorage.encryptString(value);
    },
    decode(value) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("A proteção local do Windows está indisponível.");
      return safeStorage.decryptString(Buffer.from(value));
    },
  };
  const recovery = createRecoveryStore(join(app.getPath("userData"), "recovery"), codec);
  const signatureStore = createSignatureStore(app.getPath("userData"), codec);
  const sessionStore = createValidatedStore(
    app.getPath("userData"),
    "session.bin",
    sessionSchema,
    EMPTY_SESSION,
    codec,
  );
  const versions = createVersionStore(join(app.getPath("userData"), "versions"), codec);
  const taskStore = createTaskStore(join(app.getPath("userData"), "pending-tasks"), codec);
  const reviewedSources = new Map<string, CompressionSource>();
  const taskBroker = createTaskBroker({
    createScanner: createScanTask,
    flattenPrint,
    print: printPrepared,
    begin: (stop) => desktop.jobs.begin({ stop }),
    preserve: (task, checkpoint) => taskStore.save(task, checkpoint),
    preserveInput: async (task, checkpoint) => {
      const source = task.input.source;
      if (
        source.kind === "file" &&
        (!isAbsolute(source.path) || !fileRevisions.matches(source.path, source.sha256))
      )
        throw new Error("A origem não corresponde ao arquivo escolhido nesta sessão.");
      await taskStore.saveInput(task, checkpoint);
    },
    remove: taskStore.remove,
    async save(request, result, checkpoint) {
      if (request.printOnly) throw new Error("A tarefa autoriza somente impressão.");
      if (!win) throw new Error("A janela do documento foi fechada.");
      await checkpoint();
      if (request.kind === "batch") {
        const detail = result.detail;
        if (detail?.kind !== "batch" || detail.stage !== "review" || result.extension !== "zip")
          throw new Error("Conclua e revise todos os arquivos do lote antes de salvar.");
        if ((await batchDigest(result.pdf)) !== detail.sourceSha256)
          throw new Error("A origem protegida não corresponde ao lote revisado.");
        const files = await readBatchArchive(result.bytes, detail);
        await checkpoint();
        const selected = await dialog.showOpenDialog(win, {
          title: "Escolher pasta para o lote revisado",
          properties: ["openDirectory", "createDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        return commitBatchDirectory(
          selected.filePaths[0],
          request.label,
          detail.settings.operation,
          files,
          checkpoint,
        );
      }
      const selected = request.destination
        ? { canceled: false, filePath: request.destination.path }
        : await dialog.showSaveDialog(win, {
            title: "Salvar resultado revisado",
            defaultPath: safeAttachmentName(request.defaultName),
            filters: [
              {
                name: `Arquivo ${request.extension.toUpperCase()}`,
                extensions: [request.extension],
              },
            ],
          });
      if (selected.canceled || !selected.filePath) return null;
      await checkpoint();
      if (extname(selected.filePath).toLowerCase() !== `.${request.extension}`)
        throw new Error("Conserve a extensão do formato revisado ao escolher o destino.");
      const origins = [...new Set([...openedPaths, ...request.originPaths])];
      if (request.destination?.unique) {
        const saved = await writeUnique(selected.filePath, result.bytes, {
          checkpoint,
          beforeCommit: (target) => assertCopyDestination(target, origins),
        });
        fileRevisions.remember(saved, result.bytes);
        return saved;
      }
      await assertCopyDestination(selected.filePath, origins);
      await atomicWrite(selected.filePath, result.bytes, checkpoint);
      fileRevisions.remember(selected.filePath, result.bytes);
      return selected.filePath;
    },
  });
  app.once("will-quit", () => taskBroker.dispose());
  let preferredTheme = DEFAULT_PREFERENCES.theme;
  const applyTheme = () => {
    const dark =
      preferredTheme === "dark" || (preferredTheme === "system" && nativeTheme.shouldUseDarkColors);
    win?.setTitleBarOverlay({
      color: dark ? "#15171C" : "#FFFFFF",
      symbolColor: dark ? "#9BA1AE" : "#353C48",
    });
    win?.setBackgroundColor(dark ? "#0D0E11" : "#F3F4F7");
  };
  nativeTheme.on("updated", applyTheme);
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
      const domain = channel.split(":")[0];
      const group = ["preferences", "recovery", "versions", "session"].includes(domain)
        ? "profile"
        : domain;
      if (["recent", "signatures", "profile", "clipboard"].includes(group)) {
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
  handle("clipboard:copy", (_event, annotations: unknown) =>
    writeAnnotationClipboard({ version: 1, annotations }),
  );
  handle("clipboard:paste", () => readEditorClipboard());
  handle("recovery:list", () => recovery.list());
  const protectOrigins = (document: Awaited<ReturnType<typeof recovery.load>>) => {
    for (const path of document.originPaths ?? []) openedPaths.add(path);
    return document;
  };
  handle("recovery:load", async (_event, id: string) => protectOrigins(await recovery.load(id)));
  handle("recovery:save", async (_event, document: unknown) => {
    await recovery.save(document);
    const parsed = recoverySchema.parse(document);
    try {
      await versions.save(parsed, await preferenceStore.read());
      return {};
    } catch (failure) {
      return {
        versionError: failure instanceof Error ? failure.message : "Falha no histórico local.",
      };
    }
  });
  handle("recovery:remove", (_event, id: string) => recovery.remove(id));
  handle("versions:list", async () => {
    await versions.prune(await preferenceStore.read());
    return versions.list();
  });
  handle("versions:load", async (_event, id: string) => protectOrigins(await versions.load(id)));
  handle("versions:save", async (_event, document: unknown) =>
    versions.save(document, await preferenceStore.read(), true),
  );
  handle("versions:remove", (_event, id: string) => versions.remove(id));
  handle("versions:clear", () => versions.clear());
  handle("session:load", async () => {
    if (!(await preferenceStore.read()).restoreSession)
      return { session: EMPTY_SESSION, unavailable: 0 };
    const session = await sessionStore.read();
    const available = [];
    let unavailable = 0;
    for (const tab of session.tabs) {
      try {
        await desktopFiles.grantRead(tab.path);
        available.push(tab);
      } catch (failure) {
        if (
          failure instanceof Error &&
          "code" in failure &&
          ["ENOENT", "EACCES", "EPERM"].includes(String(failure.code))
        )
          unavailable++;
        else throw failure;
      }
    }
    return { session: { ...session, tabs: available }, unavailable };
  });
  handle("session:save", async (_event, raw: unknown) => {
    if ((await preferenceStore.read()).restoreSession)
      await sessionStore.update(() => sessionSchema.parse(raw));
  });
  handle("session:clear", async () => {
    await sessionStore.write(EMPTY_SESSION);
  });
  handle("preferences:get", async () => {
    const value = await preferenceStore.read();
    preferredTheme = value.theme;
    applyTheme();
    return value;
  });
  handle("preferences:set", async (_event, raw: unknown) => {
    const value = await preferenceStore.update(() => preferencesSchema.parse(raw));
    if (!value.restoreSession) await sessionStore.write(EMPTY_SESSION);
    await versions.prune(value);
    preferredTheme = value.theme;
    applyTheme();
    return value;
  });
  handle("preferences:repair", async (_event, raw: unknown) => {
    const kind = z.enum(["preferences", "recents", "signatures", "session"]).parse(raw);
    const store =
      kind === "preferences"
        ? preferenceStore
        : kind === "recents"
          ? recentStore
          : kind === "session"
            ? sessionStore
            : signatureStore;
    return { backup: !!(await store.reset()).backup };
  });
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
      if (res.filePaths.length > 100) throw new Error("Escolha até 100 arquivos por lote.");
      let total = 0;
      for (const path of res.filePaths) {
        const size = await stat(path);
        if (!size.isFile() || size.size < 1) throw new Error("Escolha apenas arquivos não vazios.");
        total += size.size;
        if (total > 512 * 1024 * 1024)
          throw new Error("O lote excede 512 MB. Divida a seleção em lotes menores.");
      }
      const files = [];
      let remaining = 512 * 1024 * 1024;
      for (const path of res.filePaths) {
        const file = await openFile(path, remaining);
        if (file) {
          files.push(file);
          remaining -= file.bytes.length;
        }
      }
      return files.filter(Boolean);
    },
  );
  handle("file:read", (_e, path: string) => openFile(path));
  const discoverScanner = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const owner = win;
    if (!owner) throw new Error("A janela de digitalização foi fechada.");
    const controller = new AbortController(),
      stop = () => controller.abort();
    owner.once("closed", stop);
    try {
      return await run(controller.signal);
    } finally {
      owner.removeListener("closed", stop);
      controller.abort();
    }
  };
  handle("scanner:list", () => discoverScanner(listScanners));
  handle("scanner:sources", (_event, id: unknown) =>
    discoverScanner((signal) => describeScanner(z.string().min(1).max(4096).parse(id), signal)),
  );
  handle("data:pick", async (_event, raw: unknown) => {
    const kind = z.enum(["attachment", "formdata", "font", "office"]).parse(raw);
    if (!win) return null;
    const filters =
      kind === "formdata"
        ? [{ name: "Dados de formulário", extensions: ["json", "csv"] }]
        : kind === "office"
          ? [
              {
                name: "Documentos e digitalizações locais",
                extensions: conversionImportExtensions,
              },
            ]
          : kind === "font"
            ? [{ name: "Fonte TrueType estática", extensions: ["ttf"] }]
            : [{ name: "Todos os arquivos", extensions: ["*"] }];
    const result = await dialog.showOpenDialog(win, {
      title:
        kind === "attachment"
          ? "Escolher anexo"
          : kind === "office"
            ? "Converter arquivo para PDF"
            : kind === "font"
              ? "Importar fonte"
              : "Importar dados de formulário",
      filters,
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    if (kind === "font" && !/\.ttf$/i.test(path))
      throw new Error("Escolha uma fonte TrueType estática (.ttf).");
    await desktopFiles.grantReadAll([path]);
    const maximum = (kind === "font" ? 8 : 64) * 1024 * 1024;
    if ((await stat(path)).size > maximum)
      throw new Error(`O arquivo excede o limite local de ${kind === "font" ? 8 : 64} MB.`);
    const file = await openFile(path, maximum);
    if (!file) throw new Error("Não foi possível ler o arquivo escolhido.");
    return file;
  });
  handle("shell:open-web", async (_event, raw: unknown) => {
    await confirmWebLink(raw);
  });
  handle(
    "dialog:save",
    async (_e, defaultName: string, kind: "pdf" | "png" | "jpg" | "data" = "pdf") => {
      if (!win) return null;
      kind = z.enum(["pdf", "png", "jpg", "data"]).parse(kind);
      defaultName = safeAttachmentName(z.string().min(1).max(1000).parse(defaultName));
      if (kind === "data" && !supportsOutputExtension(defaultName)) defaultName += ".bin";
      const filters = {
        pdf: { name: "Documento PDF", extensions: ["pdf"] },
        png: { name: "Imagem PNG", extensions: ["png"] },
        jpg: { name: "Imagem JPEG", extensions: ["jpg"] },
        data: { name: "Todos os arquivos", extensions: ["*"] },
      };
      const res = await dialog.showSaveDialog(win, {
        title: "Salvar como",
        defaultPath: defaultName,
        filters: [filters[kind]],
      });
      return res.canceled ? null : (res.filePath ?? null);
    },
  );
  handle("dialog:folder", async (_e, title?: string) => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: title ?? "Escolher pasta",
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  handle("file:write", (_e, path: string, bytes: Uint8Array) => fileRevisions.write(path, bytes));
  handle("file:write-copy", async (_e, path: string, bytes: Uint8Array) => {
    if (typeof path !== "string" || !(bytes instanceof Uint8Array))
      throw new Error("Saída de arquivo inválida.");
    const destination = await desktopFiles.assertWrite(path);
    await assertCopyDestination(destination, [...openedPaths]);
    await atomicWrite(destination, bytes);
    fileRevisions.remember(destination, bytes);
  });
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
    const list = await recentStore.read();
    return list
      .map((entry) => ({ ...entry, available: existsSync(entry.path) }))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.openedAt - a.openedAt);
  });
  handle("recent:add", async (_e, entry: RecentFile) => {
    entry = recentFileSchema.parse(entry);
    const preferences = await preferenceStore.read();
    if (!preferences.rememberRecents) return recentStore.read();
    if (!preferences.recentThumbnails) delete entry.thumb;
    const current = await recentStore.read();
    entry.pinned = current.find(
      (item) => item.path.toLowerCase() === entry.path.toLowerCase(),
    )?.pinned;
    const list = current.filter(
      (r) => r && typeof r.path === "string" && r.path.toLowerCase() !== entry.path.toLowerCase(),
    );
    const next = [entry, ...list]
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.openedAt - a.openedAt)
      .slice(0, MAX_RECENT);
    await recentStore.write(next);
    app.addRecentDocument(entry.path);
    return next;
  });
  handle("recent:remove", async (_e, path: string) => {
    const next = (await recentStore.read()).filter(
      (r) => r && typeof r.path === "string" && r.path !== path,
    );
    await recentStore.write(next);
    return next;
  });
  handle("recent:pin", async (_event, rawPath: unknown, rawPinned: unknown) => {
    const path = z.string().min(1).max(32768).parse(rawPath),
      pinned = z.boolean().parse(rawPinned);
    return recentStore.update((entries) =>
      entries
        .map((entry) => (entry.path === path ? { ...entry, pinned } : entry))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.openedAt - a.openedAt),
    );
  });

  handle("signatures:list", async () =>
    (await signatureStore.read()).filter(
      (s) => s && typeof s.id === "string" && typeof s.src === "string",
    ),
  );
  handle("signatures:save", async (_e, sig: SavedSignature) => {
    sig = signatureSchema.parse(sig);
    const next = [sig, ...(await signatureStore.read()).filter((s) => s && s.id !== sig.id)].slice(
      0,
      8,
    );
    await signatureStore.write(next);
    return next;
  });
  handle("signatures:remove", async (_e, id: string) => {
    const next = (await signatureStore.read()).filter((s) => s && s.id !== id);
    await signatureStore.write(next);
    return next;
  });

  handle("recent:clear", async () => {
    await recentStore.write([]);
    app.clearRecentDocuments();
    return [];
  });
  handle("recent:remove-thumbnails", () =>
    recentStore.update((entries) => entries.map(({ thumb: _thumb, ...entry }) => entry)),
  );
  handle("signatures:clear", async () => {
    await signatureStore.write([]);
    return [];
  });

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

  handle("task:list", () => taskStore.list());
  handle("printers:list", async () => {
    if (!win) return [];
    return (await win.webContents.getPrintersAsync()).map((printer) => ({
      name: printer.name,
      label: printer.displayName || printer.name,
    }));
  });
  handle("task:input", async (_event, id: unknown) => {
    const pending = await taskStore.loadInput(z.uuid().parse(id));
    for (const path of pending.request.originPaths) openedPaths.add(path);
    const source = pending.input.source;
    if (source.kind === "snapshot") return pending;
    if (!isAbsolute(source.path)) throw new Error("Caminho da origem protegida inválido.");
    const metadata = await stat(source.path);
    if (!metadata.isFile() || metadata.size !== source.length)
      throw new Error("O arquivo de origem mudou. A tarefa foi preservada.");
    const bytes = await readBoundedFile(source.path, source.length);
    if (
      bytes.length !== source.length ||
      createHash("sha256").update(bytes).digest("hex") !== source.sha256
    )
      throw new Error("O arquivo de origem mudou. A tarefa foi preservada.");
    fileRevisions.remember(source.path, bytes);
    openedPaths.add(source.path);
    return { ...pending, fileBytes: bytes };
  });
  handle("task:load", async (_event, id: unknown) => {
    const task = await taskStore.load(z.uuid().parse(id));
    if (task.request.kind === "compression" && task.request.inputIdentity)
      reviewedSources.set(task.request.id, task.request.inputIdentity);
    for (const path of task.request.originPaths) openedPaths.add(path);
    return task;
  });
  handle("task:remove", (_event, id: unknown) => taskStore.remove(z.uuid().parse(id)));
  handle("task:run", async (event, raw: unknown) => {
    const request = localTaskRequestSchema.parse(raw);
    const reviewed = reviewedSources.get(request.id);
    if (
      request.inputIdentity?.kind === "file" &&
      (!isAbsolute(request.inputIdentity.path) ||
        (!fileRevisions.matches(request.inputIdentity.path, request.inputIdentity.sha256) &&
          (!reviewed || !sameCompressionSource(reviewed, request.inputIdentity))))
    )
      throw new Error("Escolha novamente o arquivo antes de iniciar a tarefa.");
    if (request.destination)
      request.destination.path = await desktopFiles.assertWrite(request.destination.path);
    request.defaultName = safeAttachmentName(request.defaultName);
    if (extname(request.defaultName).toLowerCase() !== `.${request.extension}`)
      throw new Error("O nome da tarefa não corresponde ao formato escolhido.");
    request.originPaths = [...new Set([...request.originPaths, ...openedPaths])];
    const channel = new MessageChannelMain();
    try {
      const run = taskBroker.run(request, {
        send: (message) => channel.port1.postMessage(message),
        close: () => channel.port1.close(),
        onMessage: (listener) => {
          channel.port1.on("message", (message) => listener(message.data));
        },
        onClose: (listener) => {
          channel.port1.on("close", listener);
        },
      });
      channel.port1.start();
      event.sender.postMessage("task:port", request.id, [channel.port2]);
      return await run;
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

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
