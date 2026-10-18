import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { availableParallelism } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { createClientGrant, listGrants, revokeGrant } from "@informach/edi-desktop/access";
import { desktopJobs } from "@informach/edi-desktop/jobs";
import { createEdiDesktop, desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import {
  app,
  BrowserWindow,
  dialog,
  type OpenDialogOptions,
  protocol,
  type SaveDialogOptions,
  shell,
} from "electron";
import { z } from "zod";
import { EFFORTS, type Effort, resolveModel } from "../shared/aiModels.ts";
import type { ChromaKey } from "../shared/chroma.ts";
import type { FontFamily } from "../shared/fonts.ts";
import { projectSchema } from "../shared/project-schema.ts";
import type {
  AiClientId,
  AiGrantView,
  AiSettingsView,
  AssetKind,
  AssistantEngine,
  AssistantEvent,
  JobProgress,
  ProjectSettings,
} from "../shared/types.ts";
import { VOICE_PRESETS } from "../shared/voiceChain.ts";
import { requestApproval } from "./aiApproval.ts";
import { callTool } from "./aiBridge.ts";
import { setAiPathContext } from "./aiPaths.ts";
import {
  clientStatus,
  clientVersion,
  connectClient,
  DEFAULT_MCP_PORT,
  decryptKey,
  encryptKey,
  locateClient,
  mcpUrl,
  readStored,
  storedEffort,
  writeStored,
} from "./aiSettings.ts";
import { resetConversation, sendMessage, stopConversation, testKey } from "./assistant.ts";
import { getCourseTemplate, saveCourseTemplate } from "./courseTemplates.ts";
import { registerCursorSprites } from "./cursorSprite.ts";
import {
  codexSelfTest,
  resetEngineSession,
  runClaudeCode,
  runCodex,
  stopAllEngineRuns,
  stopEngineRun,
} from "./engines.ts";
import {
  loadQueue,
  type QueueAccess,
  rememberExportFolder,
  removeOrphanOutputs,
  removeOrphanWork,
  saveQueue,
} from "./export/exportQueueStore.ts";
import { fontResolver } from "./export/fonts.ts";
import { SegmentCache } from "./export/segmentCache.ts";
import { exportLesson } from "./export-lesson.ts";
import {
  cancel,
  detectEncoder,
  FFMPEG,
  mediaFacts,
  nextExportEncoder,
  probe,
  proxy,
  run,
  screenMotion,
  stillFrame,
  thumbnail,
  waveform,
  writeFilterScript,
} from "./ffmpeg.ts";
import { ffmpegVersion, filterScriptOption } from "./ffmpeg-arguments.ts";
import { getGlossary, setGlossary } from "./glossary.ts";
import { exportVoice, HEYGEN_FOLDER, locateVideo } from "./heygen.ts";
import { cancelKey, detectScreenColor, grabFrame, renderKeyed } from "./keying.ts";
import { measureLoudness } from "./loudness.ts";
import { CHECK_CLIENT } from "./mcpGuard.ts";
import { startMcpServer } from "./mcpServer.ts";
import { nativeResourcePath } from "./native-resources.ts";
import {
  createProject,
  openProject,
  PROJECT_EXT,
  projectJson,
  projectsDir,
  recentProjects,
  removeRecent,
  saveProject,
} from "./projects.ts";
import { registerRecorder } from "./recorderWindow.ts";
import {
  findCompanions,
  findRelinked,
  MEDIA_EXTENSIONS,
  relinkPickSchema,
  relinkRequestSchema,
} from "./relink.ts";
import {
  closeRestrictedWindows,
  migrateRestrictedConfig,
  openRestrictedClaude,
} from "./restricted.ts";
import { scheduler, type WorkKind } from "./scheduler.ts";
import { rankInWorker } from "./syncPool.ts";
import { renderVoiceCached } from "./voiceFiles.ts";
import { treatVoice } from "./voiceTreat.ts";
import {
  cancelDownload,
  cancelWhisper,
  engineStatus,
  installEngine,
  installModel,
  isEngineVariant,
  isModelName,
  removeStaleDownloads,
  selectModel,
  setExternalModels,
  transcribe,
} from "./whisper.ts";

/* What the renderer may ask of the transcription engine: ids and names never become paths. */
const jobIdSchema = z.string().regex(/^[\w-]{1,64}$/);
const variantSchema = z.string().refine(isEngineVariant, "Variante de motor desconhecida.");
const modelNameSchema = z.string().refine(isModelName, "Modelo desconhecido.");
const transcribeSchema = z.tuple([
  jobIdSchema,
  z.string().min(1).max(32768),
  z
    .number()
    .nonnegative()
    .max(7 * 86400),
  z.string().regex(/^[a-z]{2,3}$/),
  z.array(z.string().max(200)).max(60),
]);

app.setPath("userData", join(app.getPath("appData"), "ediaula"));
const desktop = createEdiDesktop({
  appId: "ediaula",
  preloadPath: join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: join(__dirname, "../renderer"),
  getRecoveryWindow: () => win,
  // Signed out: the chat's runs and the restricted Claude Code windows end with their tokens.
  onSignedOut: () => {
    stopAllEngineRuns();
    closeRestrictedWindows();
  },
  recoveryChannels: [
    "app:info",
    "project:save",
    "project:recent",
    "job:cancel",
    "assistant:stop",
    "assistant:reset",
    "ai:result",
    "recorder:stop",
    "recorder:halt",
    "recorder:cancel",
    "recorder:systemChunk",
    "recorder:uiRects",
    "recorder:teleprompterLine",
    "recorder:status",
    "recorder:elapsed",
    "recorder:guidedCancel",
    "recorder:guidedWebStop",
    "recorder:guidedSave",
    "recorder:interactive",
    "recorder:clock",
    "recorder:overAnchor",
    "app:dirty",
  ],
});

const FONTS_DIR = nativeResourcePath("fonts");
const bundledFonts = async (): Promise<FontFamily[]> => {
  const fonts: FontFamily[] = JSON.parse(
    await readFile(join(app.getAppPath(), "resources", "fonts.json"), "utf8"),
  );
  for (const family of fonts)
    for (const item of family.files) {
      if (!/^[A-Za-z0-9_.-]+\.(?:ttf|otf|woff2?)$/i.test(item.file))
        throw new Error("Invalid bundled font filename");
      await desktopFiles.grantRead(join(FONTS_DIR, item.file));
    }
  return fonts;
};
/** The files burned captions are drawn with, for the segments' keys: the bundle's or Windows'. */
const captionFonts = fontResolver({
  bundled: async () => ({ dir: FONTS_DIR, families: await bundledFonts() }),
  system: [
    join(process.env.WINDIR ?? "C:\\Windows", "Fonts"),
    ...(process.env.LOCALAPPDATA
      ? [join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")]
      : []),
  ],
});

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".json": "application/json",
};

// Lets automated checks run against a throwaway profile instead of the user's real projects.
if (!app.isPackaged && process.env.EDIAULA_USER_DATA) {
  app.setPath("userData", process.env.EDIAULA_USER_DATA);
  app.setPath("documents", join(process.env.EDIAULA_USER_DATA, "documents"));
}

// media://local/<encoded absolute path> serves local files to the renderer with HTTP range support,
// which <video> needs for seeking.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

// The dev renderer runs on http://localhost, so fetch() of media:// needs CORS headers.
const CORS = { "Access-Control-Allow-Origin": "*" };

async function serveMedia(request: Request): Promise<Response> {
  const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
  await desktopFiles.assertRead(path);
  if (!existsSync(path)) return new Response("not found", { status: 404, headers: CORS });
  const size = statSync(path).size;
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (!range) {
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": type,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }
  let start = range[1] ? Number(range[1]) : 0;
  let end = range[2] ? Number(range[2]) : size - 1;
  if (!range[1] && range[2]) {
    start = size - Number(range[2]);
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end)
    return new Response(null, {
      status: 416,
      headers: { ...CORS, "Content-Range": `bytes */${size}` },
    });
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: {
      ...CORS,
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

let win: BrowserWindow | null = null;
const exportJobs = new Map<string, { cancelled: boolean; cancellation: AbortController }>();

/** Segments and sounds of past exports, reused while they still show the same thing. */
let segments: SegmentCache | null = null;
const segmentCache = (): SegmentCache =>
  (segments ??= new SegmentCache(join(app.getPath("userData"), "cache", "segments")));
const exportQueueFile = (): string => join(app.getPath("userData"), "export-queue.json");
const exportFoldersFile = (): string => join(app.getPath("userData"), "export-folders.json");
const exportWorkDir = (): string => join(app.getPath("userData"), "work");
/** When this run of the app began: what exports leave behind from before it is a leftover. */
const APP_STARTED = Date.now();
const queueAccess: QueueAccess = {
  canRead: desktopFiles.canRead,
  canWrite: desktopFiles.canWrite,
  grantRead: desktopFiles.grantRead,
  grantWrite: desktopFiles.grantWrite,
};

/**
 * When the app opens: the oldest cached segments go past the size limit, and the staging folders
 * an interrupted export left beside its destination, and its private work folder, are removed.
 * Only what is older than this run of the app, one folder at a time: a folder that cannot be
 * removed is logged and the rest goes on. Exports wait for it (export:start).
 */
async function cleanExportLeftovers(): Promise<void> {
  const options = {
    before: APP_STARTED,
    onError: (path: string, error: unknown) =>
      console.warn(`[ediaula] não foi possível limpar ${path}: ${String(error)}`),
  };
  const steps: [string, () => Promise<unknown>][] = [
    ["do cache de exportação", () => segmentCache().prune()],
    ["das pastas de saída", () => removeOrphanOutputs(exportFoldersFile(), options)],
    ["das pastas de trabalho", () => removeOrphanWork(exportWorkDir(), options)],
  ];
  for (const [what, step] of steps)
    try {
      await step();
    } catch (error) {
      console.warn(`[ediaula] limpeza ${what} falhou: ${String(error)}`);
    }
}
let leftoversCleaned: Promise<void> = Promise.resolve();
/** Jobs waiting for a slot or for the take to end, so job:cancel reaches them too. */
const waitingJobs = new Map<string, AbortController>();

/**
 * Proxy, background removal and transcription: they wait for their slot and, while a take is
 * recording, for the take to end (main/scheduler.ts); the license job starts only then, so
 * waiting does not use up its preservation window.
 */
async function processingJob<T>(
  jobId: string,
  kind: WorkKind | readonly WorkKind[],
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const cancellation = new AbortController();
  waitingJobs.set(jobId, cancellation);
  try {
    if (scheduler.state().holding)
      sendProgress({ id: jobId, ratio: 0, message: "Em espera: gravação em andamento" });
    return await scheduler.run(
      kind,
      async () => {
        const job = desktopJobs.begin({ stop: () => cancellation.abort() });
        try {
          const result = await action(cancellation.signal);
          job.check();
          return result;
        } finally {
          job.finish();
        }
      },
      cancellation.signal,
    );
  } finally {
    waitingJobs.delete(jobId);
  }
}

const sendProgress = (p: JobProgress): void => {
  win?.webContents.send("job:progress", p);
};

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 760,
    show: false,
    backgroundColor: "#0D0E11",
    title: "EdiAula",
    icon: join(app.getAppPath(), "resources", "icon.ico"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#15171C", symbolColor: "#9BA1AE", height: 52 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  });
  win.once("ready-to-show", () => {
    win?.maximize();
    win?.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged && process.env.EDIAULA_SNAPSHOT)
    void runSnapshot(win, process.env.EDIAULA_SNAPSHOT);
}

/**
 * Development aid: EDIAULA_SNAPSHOT=out.png runs the optional EDIAULA_SNAPSHOT_JS file in the
 * renderer, waits EDIAULA_SNAPSHOT_DELAY ms, saves a screenshot of the window and quits.
 */
async function runSnapshot(w: BrowserWindow, out: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  await new Promise<void>((r) => w.webContents.once("did-finish-load", () => r()));
  await new Promise((r) => setTimeout(r, 1500));
  const scriptPath = process.env.EDIAULA_SNAPSHOT_JS;
  if (scriptPath) {
    try {
      const result = await w.webContents.executeJavaScript(await readFile(scriptPath, "utf8"));
      if (result !== undefined) console.log("[snapshot script]", JSON.stringify(result));
    } catch (err) {
      console.error("[snapshot script failed]", err);
    }
  }
  await new Promise((r) => setTimeout(r, Number(process.env.EDIAULA_SNAPSHOT_DELAY ?? 2000)));
  const image = await w.webContents.capturePage();
  await writeFile(out, image.toPNG());
  console.log("[snapshot saved]", out);
  app.quit();
}

const MEDIA_FILTERS = [
  { name: "Mídia", extensions: MEDIA_EXTENSIONS },
  { name: "Todos os arquivos", extensions: ["*"] },
];

/** Dialogs open over the editor window when it exists. */
const saveDialog = (options: SaveDialogOptions) =>
  win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
const openDialog = (options: OpenDialogOptions) =>
  win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);

function registerIpc(): void {
  ipcMain.handle("media:saveNarration", async (_e, bytes: Uint8Array) => {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 256 * 1024 * 1024)
      throw new Error("Gravação vazia ou maior que 256 MB.");
    const { mkdir } = await import("node:fs/promises");
    const dir = join(app.getPath("documents"), "EdiAula", "Narracoes");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const input = join(dir, `${id}.webm`);
    const output = join(dir, `${id}.wav`);
    try {
      await writeFile(input, bytes);
      await run(FFMPEG, [
        "-y",
        "-i",
        input,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        output,
      ]);
      return output;
    } catch (err) {
      await unlink(output).catch(() => {});
      throw err;
    } finally {
      await unlink(input).catch(() => {});
    }
  });
  ipcMain.handle("editing-template:save", async (_e, name: string, content: string) => {
    if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 2_000_000)
      throw new Error("Modelo inválido ou maior que 2 MB.");
    const safe =
      [...String(name)]
        .filter((character) => character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
        .join("")
        .trim()
        .replace(/\.md$/i, "") || "Modelo de edição";
    const result = await dialog.showSaveDialog(win!, {
      title: "Salvar modelo de edição",
      defaultPath: join(app.getPath("documents"), `${safe}.md`),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const path = result.filePath.toLowerCase().endsWith(".md")
      ? result.filePath
      : `${result.filePath}.md`;
    await writeFile(path, content, "utf8");
    return path;
  });
  ipcMain.handle("editing-template:read", async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: "Ler modelo de edição",
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    if (extname(path).toLowerCase() !== ".md" || statSync(path).size > 2_000_000)
      throw new Error("Selecione um arquivo Markdown de até 2 MB.");
    return { path, content: await readFile(path, "utf8") };
  });
  const palettesFile = (): string => join(app.getPath("userData"), "palettes.json");
  ipcMain.handle("palettes:list", async () =>
    JSON.parse(await readFile(palettesFile(), "utf8").catch(() => "[]")),
  );
  ipcMain.handle("palettes:save", (_e, list: unknown[]) =>
    writeFile(palettesFile(), JSON.stringify(list, null, 2)),
  );
  ipcMain.handle("app:info", async () => ({
    encoder: await detectEncoder(),
    version: app.getVersion(),
    projectsDir: projectsDir(),
    fontsDir: FONTS_DIR,
    fonts: await bundledFonts(),
  }));

  ipcMain.handle("dialog:media", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Importar mídia",
      properties: ["openFile", "multiSelections"],
      filters: MEDIA_FILTERS,
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("dialog:project", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Abrir projeto",
      defaultPath: projectsDir(),
      properties: ["openFile"],
      filters: [{ name: "Projeto EdiAula", extensions: [PROJECT_EXT] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  // The desktop SDK grants writing to the path this channel returns (packages/edi-desktop).
  ipcMain.handle("dialog:save", async (_e, defaultName: unknown) => {
    // Only a file name: the folder is the user's choice in the dialog.
    const name = [...(typeof defaultName === "string" ? defaultName : "")]
      .filter((character) => character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
      .join("")
      .trim()
      .slice(0, 120);
    const r = await saveDialog({
      title: "Salvar cópia do projeto",
      defaultPath: join(projectsDir(), `${name || "Aula"}.${PROJECT_EXT}`),
      filters: [{ name: "Projeto EdiAula", extensions: [PROJECT_EXT] }],
    });
    if (r.canceled || !r.filePath) return null;
    return extname(r.filePath).toLowerCase() === `.${PROJECT_EXT}`
      ? r.filePath
      : `${r.filePath}.${PROJECT_EXT}`;
  });
  // Reconnecting missing media: the user points at the file (or at a folder) and only what was
  // chosen there, checked to be the same media, becomes readable. Picking a file lets the next
  // search look in its folder once (a single-use token, replaced by every new pick).
  const relinkFolders = new Map<string, string>();
  const noSearch = { found: {}, refused: 0, truncated: false, canceled: true };
  ipcMain.handle("media:relinkPick", async (_e, raw: unknown) => {
    const request = relinkPickSchema.parse(raw);
    const r = await openDialog({
      title: `Onde está ${basename(request.oldPath)}?`,
      properties: ["openFile"],
      filters: MEDIA_FILTERS,
    });
    const path = r.canceled ? undefined : r.filePaths[0];
    if (!path) return null;
    await desktopFiles.grantRead(path);
    const companions = await findCompanions(request.oldPath, path, request.companions);
    for (const file of Object.values(companions)) await desktopFiles.grantRead(file);
    const token = randomUUID();
    relinkFolders.clear();
    relinkFolders.set(token, dirname(path));
    return { path, token, companions };
  });
  ipcMain.handle("media:relinkCursor", async (_e, oldPath: unknown) => {
    const r = await openDialog({
      title: `Onde está ${typeof oldPath === "string" ? basename(oldPath) : "cursor.json"}?`,
      properties: ["openFile"],
      filters: [{ name: "Dados do cursor", extensions: ["json"] }],
    });
    const path = r.canceled ? undefined : r.filePaths[0];
    if (!path) return null;
    if (extname(path).toLowerCase() !== ".json")
      throw new Error("Escolha o arquivo de dados do cursor da gravação (.json).");
    await desktopFiles.grantRead(path);
    return path;
  });
  ipcMain.handle("media:relinkFolder", async (_e, raw: unknown, token: unknown) => {
    const wanted = relinkRequestSchema.parse(raw);
    let folder: string | undefined;
    if (typeof token === "string") {
      folder = relinkFolders.get(token);
      relinkFolders.delete(token);
    } else {
      const r = await openDialog({
        title: "Procurar as mídias ausentes nesta pasta",
        properties: ["openDirectory"],
      });
      folder = r.canceled ? undefined : r.filePaths[0];
    }
    if (!folder) return noSearch;
    const result = await findRelinked(folder, wanted, probe);
    for (const item of Object.values(result.found)) {
      await desktopFiles.grantRead(item.path);
      for (const file of Object.values(item.companions)) await desktopFiles.grantRead(file);
    }
    return { ...result, canceled: false };
  });
  ipcMain.handle("dialog:export", async (_e, defaultName: string) => {
    const audio = /\.mp3$/i.test(defaultName);
    const r = await dialog.showSaveDialog(win!, {
      title: audio ? "Exportar áudio" : "Exportar vídeo",
      defaultPath: join(app.getPath(audio ? "music" : "videos"), defaultName),
      filters: [
        audio
          ? { name: "Áudio MP3", extensions: ["mp3"] }
          : { name: "Vídeo MP4", extensions: ["mp4"] },
      ],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle("media:probe", (_e, path: string) => probe(path));
  ipcMain.handle("media:thumb", (_e, path: string, kind: AssetKind, duration: number) =>
    thumbnail(path, kind, duration),
  );
  ipcMain.handle("media:waveform", (_e, path: string) => waveform(path));
  ipcMain.handle("media:motion", (_e, ...raw: unknown[]) => {
    const [jobId, path, input, duration] = z
      .tuple([
        z.string().min(1).max(200),
        z.string().min(1).max(32768),
        z.string().min(1).max(32768),
        z
          .number()
          .positive()
          .max(7 * 86400),
      ])
      .parse(raw);
    return processingJob(jobId, "motion", async (signal) => {
      const motion = await screenMotion(
        jobId,
        path,
        input,
        duration,
        (ratio) => sendProgress({ id: jobId, ratio }),
        signal,
      );
      // The cleanup and the check before exporting read it through media://.
      await desktopFiles.grantRead(motion);
      return motion;
    });
  });
  ipcMain.handle(
    "media:proxy",
    async (_e, jobId: string, path: string, duration: number, cfrFps?: number, alpha?: unknown) =>
      // A proxy on the graphics card takes one of its encoder sessions, as export segments do.
      processingJob(
        jobId,
        alpha !== true && (await detectEncoder()) !== "x264" ? ["proxy", "encoder"] : "proxy",
        (signal) =>
          proxy(
            jobId,
            path,
            duration,
            (ratio) => sendProgress({ id: jobId, ratio }),
            cfrFps,
            signal,
            alpha === true,
          ),
      ),
  );
  ipcMain.handle("media:saveGenerated", async (_e, bytes: Uint8Array, ext: string) => {
    const { createHash } = await import("node:crypto");
    const { mkdirSync } = await import("node:fs");
    const dir = join(app.getPath("userData"), "cache", "generated");
    mkdirSync(dir, { recursive: true });
    const path = join(
      dir,
      `${createHash("sha1").update(bytes).digest("hex").slice(0, 20)}.${ext.replace(/[^a-z0-9]/gi, "") || "png"}`,
    );
    if (!existsSync(path)) await writeFile(path, bytes);
    return path;
  });
  ipcMain.handle("media:still", (_e, path: string, t: number, alpha?: boolean) =>
    stillFrame(path, t, alpha),
  );
  ipcMain.handle(
    "key:detect",
    (_e, path: string, duration: number, width: number, height: number) =>
      detectScreenColor(path, duration, width, height),
  );
  ipcMain.handle(
    "key:frame",
    (_e, path: string, t: number, width: number, height: number, maxSide?: number) =>
      grabFrame(path, t, width, height, maxSide),
  );
  ipcMain.handle(
    "key:render",
    (
      _e,
      jobId: string,
      path: string,
      width: number,
      height: number,
      fps: number,
      duration: number,
      key: ChromaKey,
    ) =>
      processingJob(jobId, "keying", (signal) =>
        renderKeyed(
          jobId,
          path,
          width,
          height,
          fps,
          duration,
          key,
          (ratio) => sendProgress({ id: jobId, ratio }),
          signal,
        ),
      ),
  );
  ipcMain.handle("glossary:get", (_e, course: unknown) =>
    getGlossary(z.string().max(1024).parse(course)),
  );
  ipcMain.handle("glossary:set", (_e, course: unknown, terms: unknown) =>
    setGlossary(
      z.string().max(1024).parse(course),
      z
        .array(
          z.union([
            z.string().max(200),
            z.object({
              term: z.string().max(200),
              aliases: z.array(z.string().max(200)).max(20).optional(),
            }),
          ]),
        )
        .max(1000)
        .parse(terms),
    ),
  );
  ipcMain.handle("course-template:get", (_e, course: unknown) =>
    getCourseTemplate(z.string().max(1024).parse(course)),
  );
  ipcMain.handle("course-template:save", (_e, course: unknown, template: unknown) =>
    saveCourseTemplate(z.string().max(1024).parse(course), template),
  );
  ipcMain.handle(
    "media:loudness",
    async (_e, rawJob: unknown, text: unknown, rawSpeech: unknown) => {
      const jobId = jobIdSchema.parse(rawJob);
      const project = projectJson(text);
      const speech = z
        .array(
          z.tuple([
            z
              .number()
              .min(0)
              .max(7 * 86400),
            z
              .number()
              .min(0)
              .max(7 * 86400),
          ]),
        )
        .max(20000)
        .optional()
        .parse(rawSpeech ?? undefined);
      const option = await filterScriptOption(FFMPEG);
      return processingJob(jobId, "segment", (signal) =>
        measureLoudness(project, speech, {
          assertRead: desktopFiles.assertRead,
          writeFilterScript: (filter) => writeFilterScript(filter),
          filterScriptOption: option,
          run: (args, duration, onStderr) =>
            run(FFMPEG, args, {
              jobId,
              signal,
              duration,
              onStderr,
              onProgress: (ratio) => sendProgress({ id: jobId, ratio }),
            }),
        }),
      );
    },
  );
  ipcMain.handle("fs:exists", (_e, paths: string[]) => paths.map((p) => existsSync(p)));

  ipcMain.handle(
    "project:create",
    (_e, name: string, course: string | undefined, settings: ProjectSettings) =>
      createProject(name, course, settings),
  );
  ipcMain.handle("project:save", (_e, path: string, text: unknown) =>
    saveProject(path, projectJson(text)),
  );
  ipcMain.handle("project:open", async (_e, path: string) => {
    const project = await openProject(path);
    if (!Array.isArray(project.assets) || project.assets.length > 5000)
      throw new Error("O projeto contém um catálogo de mídia inválido ou excessivamente grande.");
    const references: string[] = [];
    for (const asset of project.assets) {
      if (!asset || typeof asset !== "object") throw new Error("Referência de mídia inválida.");
      const fields: [object, string][] = [
        "path",
        "thumb",
        "proxy",
        "waveform",
        "transcript",
        "cursor",
        "keyed",
        "motion",
        "guidedRun",
      ].map((field) => [asset, field]);
      // The treated voice (shared/voiceChain.ts) is played and exported in place of the path.
      const treated: unknown = Reflect.get(asset, "treated");
      if (treated && typeof treated === "object") fields.push([treated, "path"]);
      for (const [owner, field] of fields) {
        const value: unknown = Reflect.get(owner, field);
        if (value === undefined || value === "") continue;
        if (typeof value !== "string" || value.length > 32768)
          throw new Error("Caminho de mídia inválido.");
        references.push(value);
      }
    }
    // The voice files exported for HeyGen are read again to place the MP4s that come back.
    const masters: unknown = Reflect.get(project, "voiceMasters");
    for (const master of Array.isArray(masters) ? masters.slice(0, 50) : []) {
      const pieces: unknown =
        master && typeof master === "object" ? Reflect.get(master, "pieces") : [];
      if (!Array.isArray(pieces)) continue;
      for (const piece of pieces.slice(0, 500)) {
        const file: unknown = piece && typeof piece === "object" ? Reflect.get(piece, "file") : "";
        if (typeof file === "string" && file && file.length <= 32768) references.push(file);
      }
    }
    // The narration of each guided plan, heard and checked in the recorder.
    for (const plan of project.guided?.plans ?? [])
      if (plan.audio) references.push(plan.audio.path);
    const linked = [...new Set(references)];
    if (linked.length) {
      const answer = await dialog.showMessageBox(win!, {
        type: "question",
        title: "Arquivos vinculados ao projeto",
        message: `Permitir acesso aos ${linked.length} arquivos usados por este projeto?`,
        detail: `${linked.slice(0, 20).join("\n")}\n\nAutorize somente projetos confiáveis. Arquivos de rede podem exigir autenticação do Windows no servidor indicado.`,
        buttons: ["Permitir arquivos vinculados", "Cancelar"],
        defaultId: 1,
        cancelId: 1,
      });
      if (answer.response !== 0)
        throw new Error("Abertura do projeto cancelada; nenhum arquivo foi alterado.");
      for (const linkedPath of linked) {
        try {
          await desktopFiles.grantRead(linkedPath);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
    }
    return project;
  });
  ipcMain.handle("project:recent", () => recentProjects());
  ipcMain.handle("project:removeRecent", (_e, path: string) => removeRecent(path));

  ipcMain.handle("export:start", async (_e, jobId: unknown, project: unknown, spec: unknown) => {
    if (typeof jobId !== "string" || !jobId.length || jobId.length > 200 || exportJobs.has(jobId))
      throw new Error("Identificador de exportação inválido ou já em uso.");
    const cancellation = new AbortController();
    const state = { cancelled: false, cancellation };
    const job = desktopJobs.begin({ stop: () => cancellation.abort() });
    exportJobs.set(jobId, state);
    const check = (): void => {
      if (state.cancelled) throw new Error("Cancelado");
      job.check();
    };
    try {
      // The startup cleanup never runs under an export.
      await leftoversCleaned;
      await exportLesson(projectJson(project), spec, {
        rememberFolder: (folder) => rememberExportFolder(exportFoldersFile(), folder),
        assertRead: desktopFiles.assertRead,
        assertWrite: desktopFiles.assertWrite,
        assertRelatedExport: desktopFiles.assertRelatedExport,
        fontsDirectory: FONTS_DIR,
        fontFiles: captionFonts,
        filterScriptOption: await filterScriptOption(FFMPEG),
        ffmpegVersion: await ffmpegVersion(FFMPEG),
        cacheDirectory: join(app.getPath("userData"), "cache"),
        workDirectory: exportWorkDir(),
        cache: segmentCache(),
        probe: mediaFacts,
        slot: (work, signal, hardware) =>
          scheduler.run(hardware ? ["segment", "encoder"] : "segment", work, signal),
        cores: availableParallelism(),
        nextEncoder: nextExportEncoder,
        check,
        signal: cancellation.signal,
        progress: (p) => sendProgress({ id: jobId, ...p }),
        run: (args, options = {}) =>
          run(FFMPEG, args, {
            jobId: options.key ? `${jobId}:${options.key}` : jobId,
            signal: options.signal ?? cancellation.signal,
            duration: options.duration,
            onProgress: options.onProgress,
            capture: options.capture,
          }),
      });
      sendProgress({ id: jobId, ratio: 1 });
    } finally {
      job.finish();
      exportJobs.delete(jobId);
    }
  });
  ipcMain.handle("job:cancel", (_e, jobId: string) => {
    const exporting = exportJobs.get(jobId);
    if (exporting) {
      exporting.cancelled = true;
      exporting.cancellation.abort(new Error("Cancelado"));
    }
    waitingJobs.get(jobId)?.abort(new Error("Cancelado"));
    if (!cancelDownload(jobId) && !cancelWhisper(jobId) && !cancelKey(jobId)) cancel(jobId);
  });
  ipcMain.handle("exportCache:clear", async () => {
    if (exportJobs.size)
      throw new Error("Espere as exportações em andamento terminarem para limpar o cache.");
    return segmentCache().clear();
  });
  ipcMain.handle("exportQueue:load", () => loadQueue(exportQueueFile(), queueAccess));
  ipcMain.handle("exportQueue:save", (_e, text: unknown) => {
    if (typeof text !== "string") throw new Error("Fila de exportação inválida.");
    return saveQueue(exportQueueFile(), text, queueAccess);
  });

  ipcMain.handle("whisper:status", () => engineStatus());
  ipcMain.handle("whisper:installEngine", (_e, rawId: unknown, rawVariant: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    const variant = variantSchema.parse(rawVariant);
    if (!isEngineVariant(variant)) throw new Error("Variante de motor desconhecida.");
    return installEngine(jobId, variant, (ratio) => sendProgress({ id: jobId, ratio }));
  });
  ipcMain.handle("whisper:installModel", (_e, rawId: unknown, rawName: unknown) => {
    const jobId = jobIdSchema.parse(rawId);
    return installModel(jobId, modelNameSchema.parse(rawName), (ratio) =>
      sendProgress({ id: jobId, ratio }),
    );
  });
  ipcMain.handle("whisper:selectModel", (_e, path: unknown) =>
    selectModel(z.string().min(1).max(32768).parse(path)),
  );
  ipcMain.handle("whisper:externalModels", (_e, on: unknown) =>
    setExternalModels(z.boolean().parse(on)),
  );
  ipcMain.handle("whisper:transcribe", (_e, ...raw: unknown[]) => {
    const [jobId, path, duration, language, glossary] = transcribeSchema.parse(raw);
    return processingJob(jobId, "transcription", (signal) =>
      transcribe(
        jobId,
        path,
        duration,
        language,
        glossary,
        (ratio) => sendProgress({ id: jobId, ratio }),
        signal,
      ),
    );
  });
  ipcMain.handle("shell:showItem", (_e, path: string) => shell.showItemInFolder(path));
  registerVoiceIpc();
}

const secondsSchema = z
  .number()
  .min(0)
  .max(7 * 86400);

/**
 * The voice: its treatment (shared/voiceChain.ts), the trip to HeyGen (main/heygen.ts) and the
 * voice rendered as one file (main/voiceFiles.ts). Each runs as background work: it waits for a
 * take that is recording, like proxies and transcriptions.
 */
function registerVoiceIpc(): void {
  const model = (): string | null => {
    const path = nativeResourcePath("rnnoise/sh.rnnn");
    return existsSync(path) ? path : null;
  };
  ipcMain.handle(
    "audio:treat",
    async (_e, rawJob: unknown, rawPath: unknown, rawPreset: unknown) => {
      const jobId = jobIdSchema.parse(rawJob);
      const source = await desktopFiles.assertRead(z.string().min(1).max(32768).parse(rawPath));
      const preset = z.enum(VOICE_PRESETS).exclude(["off"]).parse(rawPreset);
      const result = await processingJob(jobId, "voice", (signal) =>
        treatVoice({
          ffmpeg: FFMPEG,
          source,
          preset,
          cacheRoot: join(app.getPath("userData"), "cache"),
          model: model(),
          signal,
          track: (child) => scheduler.track(child),
          onProgress: (ratio) => sendProgress({ id: jobId, ratio }),
        }),
      );
      await desktopFiles.grantRead(result.path);
      return result;
    },
  );
  ipcMain.handle(
    "voice:render",
    (_e, rawJob: unknown, segments: unknown, start: unknown, end: unknown) =>
      processingJob(jobIdSchema.parse(rawJob), "voice", (signal) =>
        renderVoiceCached(segments, secondsSchema.parse(start), secondsSchema.parse(end), signal),
      ),
  );
  ipcMain.handle(
    "heygen:export",
    async (
      _e,
      rawJob: unknown,
      rawProjectPath: unknown,
      text: unknown,
      rawScope: unknown,
      rawPieces: unknown,
    ) => {
      const jobId = jobIdSchema.parse(rawJob);
      // The open project's own file: writing beside it is writing where the lesson lives.
      const projectPath = await desktopFiles.assertWrite(
        z.string().min(1).max(32768).parse(rawProjectPath),
      );
      const project = projectSchema.parse(projectJson(text));
      const scope = z.enum(["lesson", "section", "insert"]).parse(rawScope);
      const pieces = z
        .array(
          z.strictObject({
            label: z.string().min(1).max(200),
            start: secondsSchema,
            end: secondsSchema,
          }),
        )
        .min(1)
        .max(500)
        .parse(rawPieces)
        .filter((p) => p.end > p.start);
      const master = await processingJob(jobId, "voice", (signal) =>
        exportVoice({
          ffmpeg: FFMPEG,
          project,
          pieces,
          scope,
          dir: join(dirname(projectPath), HEYGEN_FOLDER),
          assertRead: desktopFiles.assertRead,
          signal,
          onProgress: (ratio) => sendProgress({ id: jobId, ratio }),
        }),
      );
      for (const piece of master.pieces) await desktopFiles.grantRead(piece.file);
      return master;
    },
  );
  ipcMain.handle("heygen:pick", async () => {
    const r = await openDialog({
      title: "Importar vídeos do HeyGen",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Vídeo do HeyGen", extensions: ["mp4", "mov", "m4v", "webm"] }],
    });
    if (r.canceled) return [];
    for (const path of r.filePaths) await desktopFiles.grantRead(path);
    return r.filePaths;
  });
  ipcMain.handle(
    "heygen:locate",
    async (_e, rawJob: unknown, rawVideo: unknown, rawMasters: unknown) => {
      const jobId = jobIdSchema.parse(rawJob);
      const video = await desktopFiles.assertRead(z.string().min(1).max(32768).parse(rawVideo));
      const masters: string[] = [];
      for (const m of z.array(z.string().min(1).max(32768)).min(1).max(500).parse(rawMasters))
        masters.push(await desktopFiles.assertRead(m));
      return processingJob(jobId, "voice", (signal) =>
        locateVideo(FFMPEG, video, masters, signal, rankInWorker),
      );
    },
  );
}

/* ----- AI: MCP server for Claude Code / Codex, settings and the in-app assistant ----- */

let mcp: { server: Server | null; port: number; error?: string } = {
  server: null,
  port: DEFAULT_MCP_PORT,
};

async function applyMcp(): Promise<void> {
  const stored = await readStored();
  const enabled = stored.mcpEnabled ?? true;
  const port = stored.mcpPort ?? DEFAULT_MCP_PORT;
  if (mcp.server && (!enabled || mcp.port !== port)) {
    await new Promise<void>((r) => mcp.server!.close(() => r()));
    mcp = { server: null, port };
  }
  if (enabled && !mcp.server) {
    try {
      const server = await startMcpServer(port, {
        call: (name, input, meta) => callTool(win, name, input, meta),
        approve: (request) => requestApproval(win, request),
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
  const key = decryptKey(stored.apiKeyEnc);
  const model = resolveModel(stored.model);
  return {
    engine: stored.engine ?? (key ? "api" : "claude-code"),
    claudeModel: stored.claudeModel ?? "default",
    hasApiKey: !!key,
    apiKeyHint: key ? `…${key.slice(-4)}` : undefined,
    model: model.model,
    ...(model.notice ? { modelNotice: model.notice } : {}),
    effort: storedEffort(stored),
    mcpEnabled: stored.mcpEnabled ?? true,
    mcpPort: mcp.port,
    mcpUrl: mcpUrl(mcp.port),
    mcpRunning: !!mcp.server,
    mcpError: mcp.error,
    ...(stored.codexRestricted ? { codexRestricted: stored.codexRestricted } : {}),
    codexConfirmed:
      !!stored.codexConfirmed && stored.codexConfirmed === stored.codexRestricted?.version,
  };
}

/** Runs the Codex self-check and records a conclusive result for the installed version. */
async function checkCodex(): Promise<{ ok: boolean; conclusive: boolean; detail: string }> {
  const result = await codexSelfTest(mcp.port);
  if (result.conclusive) {
    const stored = await readStored();
    stored.codexRestricted = { version: result.version, ok: result.ok };
    await writeStored(stored);
  }
  return result;
}

/**
 * Before a Codex turn: the installed version must have passed the self-check (run once per
 * version) or the person must have chosen to use it without the guarantee.
 */
async function codexAllowed(emit: (ev: AssistantEvent) => void): Promise<boolean> {
  const bin = await locateClient("codex");
  if (!bin) return true;
  const version = await clientVersion(bin);
  let stored = await readStored();
  if (stored.codexRestricted?.version !== version) {
    emit({
      type: "tool",
      id: "codex-check",
      name: "",
      title: "Conferindo se o Codex fica só nas ferramentas do editor",
      status: "running",
    });
    const result = await checkCodex();
    emit({
      type: "tool",
      id: "codex-check",
      name: "",
      title: "Conferindo se o Codex fica só nas ferramentas do editor",
      status: result.ok ? "done" : "error",
      summary: result.detail,
    });
    if (!result.conclusive) {
      emit({
        type: "error",
        message: `Não deu para conferir o Codex agora (${result.detail}). Confira se ele está instalado e logado e tente de novo.`,
      });
      return false;
    }
    stored = await readStored();
  }
  if (stored.codexRestricted?.version === version && stored.codexRestricted.ok) return true;
  if (stored.codexConfirmed === version && stored.codexRestricted?.version === version) return true;
  emit({
    type: "error",
    message:
      "Nesta versão do Codex não dá para garantir que ele fique só nas ferramentas do editor. Se quiser usar assim mesmo, confirme em Configurações › Inteligência artificial.",
  });
  return false;
}

const conversationIdSchema = z.string().min(1).max(200);

function registerAiIpc(): void {
  ipcMain.handle("ai:settings", () => aiView());
  ipcMain.handle(
    "ai:saveSettings",
    async (
      _e,
      changes: {
        apiKey?: string | null;
        model?: string;
        mcpEnabled?: boolean;
        engine?: AssistantEngine;
        claudeModel?: string;
        effort?: Effort;
        codexConfirmed?: boolean;
      },
    ) => {
      const stored = await readStored();
      if (changes.apiKey === null) delete stored.apiKeyEnc;
      else if (changes.apiKey) stored.apiKeyEnc = encryptKey(changes.apiKey.trim());
      if (changes.model) stored.model = changes.model;
      if (changes.mcpEnabled !== undefined) stored.mcpEnabled = changes.mcpEnabled;
      if (changes.engine) stored.engine = changes.engine;
      if (changes.claudeModel) stored.claudeModel = changes.claudeModel;
      if (changes.effort && EFFORTS.some((e) => e.id === changes.effort))
        stored.effort = changes.effort;
      if (changes.codexConfirmed !== undefined) {
        if (changes.codexConfirmed && stored.codexRestricted)
          stored.codexConfirmed = stored.codexRestricted.version;
        else delete stored.codexConfirmed;
      }
      await writeStored(stored);
      await applyMcp();
      return aiView();
    },
  );
  ipcMain.handle("ai:codexSelfTest", async () => {
    await checkCodex();
    return aiView();
  });
  ipcMain.handle("ai:grants", (): AiGrantView[] =>
    listGrants().filter((grant) => grant.client !== CHECK_CLIENT),
  );
  ipcMain.handle("ai:revokeGrant", async (_e, rawId: unknown) => {
    await revokeGrant(z.string().min(1).max(100).parse(rawId));
  });
  ipcMain.handle("ai:manualToken", async () => {
    const { token } = await createClientGrant({ client: "manual", scopes: ["read", "propose"] });
    return { token, url: mcpUrl(mcp.port) };
  });
  ipcMain.handle("ai:context", (_e, raw: unknown) => {
    const context = z
      .object({
        projectPath: z.string().max(32768).nullable(),
        mediaFolders: z.array(z.string().max(32768)).max(5000),
      })
      .parse(raw);
    setAiPathContext(context);
  });
  ipcMain.handle("ai:testKey", () => testKey());
  ipcMain.handle("ai:clients", () => clientStatus(mcp.port));
  ipcMain.handle("ai:connect", (_e, rawId: unknown, rawRotate: unknown) => {
    const id = z.enum(["claude-code", "codex"]).parse(rawId) satisfies AiClientId;
    return connectClient(id, mcp.port, z.boolean().optional().parse(rawRotate) ?? false);
  });
  ipcMain.handle("ai:openRestrictedClaude", () => openRestrictedClaude(mcp.port));
  ipcMain.handle("assistant:send", async (_e, rawConversation: unknown, rawText: unknown) => {
    const conversationId = conversationIdSchema.parse(rawConversation);
    const text = z.string().min(1).max(4_000_000).parse(rawText);
    const view = await aiView();
    const emit = (ev: AssistantEvent): void => {
      if (win && !win.isDestroyed()) win.webContents.send("assistant:event", conversationId, ev);
    };
    if (view.engine === "api") return sendMessage(win, conversationId, text, view.effort);
    if (!view.mcpRunning) {
      emit({
        type: "error",
        message:
          "A conexão do EdiAula com a IA está desligada. Ligue em Configurações › Inteligência artificial.",
      });
      emit({ type: "done" });
      return;
    }
    if (view.engine === "claude-code")
      return runClaudeCode(conversationId, text, mcp.port, view.claudeModel, view.effort, emit);
    if (!(await codexAllowed(emit))) {
      emit({ type: "done" });
      return;
    }
    return runCodex(conversationId, text, mcp.port, emit);
  });
  ipcMain.handle("assistant:stop", (_e, raw: unknown) => {
    const conversationId = conversationIdSchema.parse(raw);
    if (!stopEngineRun(conversationId)) stopConversation(conversationId);
  });
  ipcMain.handle("assistant:reset", (_e, raw: unknown) => {
    const conversationId = conversationIdSchema.parse(raw);
    resetEngineSession(conversationId);
    resetConversation(conversationId);
  });
}

/** Same id as the desktop shortcut, so the open window groups with the pinned icon. */
export const APP_USER_MODEL_ID = "br.com.informach.ediaula";
if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);

// One EdiAula at a time (two would fight over the AI connection port): a second launch
// brings the open window to the front instead.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app
  .whenReady()
  .then(async () => {
    await desktop.start();
    protocol.handle("media", serveMedia);
    registerIpc();
    registerAiIpc();
    registerRecorder(() => win);
    registerCursorSprites();
    createWindow();
    void applyMcp();
    // A file of an earlier version may still hold the old permanent token.
    migrateRestrictedConfig(mcp.port);
    void detectEncoder();
    removeStaleDownloads().catch((err: unknown) =>
      console.warn("[whisper] could not clean old unfinished downloads:", err),
    );
    leftoversCleaned = cleanExportLeftovers();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error: unknown) => {
    dialog.showErrorBox(
      "EdiAula",
      error instanceof Error ? error.message : "Falha ao validar o acesso",
    );
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
