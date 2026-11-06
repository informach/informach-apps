import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { createEdiDesktop, desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import { resolveNativeMedia } from "@informach/edi-desktop/native-media";
import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  dialog,
  type IpcMainInvokeEvent,
  nativeImage,
  protocol,
  shell,
} from "electron";
import { z } from "zod";
import { editJobSchema } from "../shared/edit.ts";
import { PLAYABLE_AUDIO, playbackPlan } from "../shared/media/compat.ts";
import { SUBTITLE_LIMIT } from "../shared/subtitles.ts";
import type { PlaybackCaps, PlaybackSource } from "../shared/types.ts";
import { jobLabel, jobOutputs, runJob } from "./edit-runner.ts";
import { MediaEngine } from "./engine.ts";
import { EditQueue } from "./queue.ts";
import { PlayerState, prefsSchema, rememberSchema } from "./state.ts";
import { MEDIA_SCHEME, MediaStreams } from "./streams.ts";

app.setPath("userData", join(app.getPath("appData"), "ediplayer"));
const desktop = createEdiDesktop({
  appId: "ediplayer",
  preloadPath: join(__dirname, "../preload/edi-gate.cjs"),
  rendererRoot: join(__dirname, "../renderer"),
  getRecoveryWindow: () => win,
  // A player has nothing to recover: without access it only plays what it already opened.
  recoveryChannels: ["app:info", "player:prefs", "player:recents"],
});
if (!app.isPackaged && process.env.EDIPLAYER_USER_DATA)
  app.setPath("userData", process.env.EDIPLAYER_USER_DATA);

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

/** Video and audio the player opens (and offers in "Abrir com"). */
export const MEDIA_EXT = [
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "flv",
  "ts",
  "mts",
  "m2ts",
  "mpg",
  "mpeg",
  "3gp",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "oga",
  "opus",
  "wma",
];
const SUBTITLE_EXT = ["srt", "vtt"];

const requireDev = createRequire(import.meta.url);
const engine = new MediaEngine(
  resolveNativeMedia({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    developmentRoot: app.getAppPath(),
    developmentBinary: (name) =>
      requireDev(name === "ffmpeg" ? "ffmpeg-static" : "@derhuerst/ffprobe-static"),
  }),
  join(app.getPath("userData"), "cache"),
);
const streams = new MediaStreams();
const state = new PlayerState(join(app.getPath("userData"), "ediplayer-state.json"));
let caps: PlaybackCaps = { hevc: false, av1: false, mkvH264: false };
let win: BrowserWindow | null = null;
let normalBounds: Electron.Rectangle | null = null;

const pathValue = z.string().min(1).max(32768);
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

const queue = new EditQueue(
  (job, item, signal, progress) => {
    const permit = desktop.jobs.begin({ preserveForMs: 0, stop: () => queue.cancel(item.id) });
    return runJob(engine, job, {
      jobId: item.id,
      signal,
      onProgress: progress,
      encoder: () => engine.media.detectEncoder(),
    }).finally(() => permit.finish());
  },
  (items) => {
    send("queue:changed", items);
    for (const item of items)
      if (item.status === "done" && item.openFolder && !opened.has(item.id)) {
        opened.add(item.id);
        const first = item.outputs.at(0);
        if (first) shell.showItemInFolder(first);
      }
  },
);
const opened = new Set<string>();

const mediaFiles = (argv: string[]): string[] =>
  argv
    .slice(1)
    .filter(
      (a) =>
        !a.startsWith("-") &&
        MEDIA_EXT.includes(extname(a).slice(1).toLowerCase()) &&
        existsSync(a),
    );

async function openReceived(files: string[]): Promise<void> {
  try {
    await desktopFiles.grantReadAll(files);
    if (files.length) send("app:openFiles", files);
  } catch {
    dialog.showErrorBox("EdiPlayer", "Não foi possível abrir os arquivos recebidos.");
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 240,
    show: false,
    backgroundColor: "#0e0f12",
    title: "EdiPlayer",
    icon: join(app.getAppPath(), "resources", "icon.ico"),
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#15171c", symbolColor: "#a3a9b6", height: 44 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.webContents.once("did-finish-load", () => void openReceived(mediaFiles(process.argv)));
  win.on("closed", () => {
    queue.cancelAll();
    streams.revokeAll();
    win = null;
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
}

const readable = (path: unknown) => desktopFiles.assertRead(pathValue.parse(path));
const jobsOf = new Map<string, AbortController>();

async function listMedia(folder: string): Promise<string[]> {
  const names = await readdir(folder);
  const files = names
    .filter((n) => MEDIA_EXT.includes(extname(n).slice(1).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .slice(0, 500)
    .map((n) => join(folder, n));
  const out: string[] = [];
  for (const f of files) if ((await stat(f)).isFile()) out.push(f);
  return out;
}

function registerIpc(): void {
  ipcMain.handle("app:info", () => ({ version: app.getVersion() }));
  ipcMain.handle("player:caps", (_e, raw: unknown) => {
    caps = z.strictObject({ hevc: z.boolean(), av1: z.boolean(), mkvH264: z.boolean() }).parse(raw);
  });
  // The channel name makes the suite grant read access to every path the dialog returns.
  ipcMain.handle("dialog:media", async (_e, rawKind: unknown) => {
    const kind = z.enum(["video", "folder", "subtitle", "audio", "join"]).parse(rawKind);
    if (!win) return [];
    if (kind === "folder") {
      const r = await dialog.showOpenDialog(win, {
        title: "Abrir pasta como lista",
        properties: ["openDirectory"],
      });
      const folder = r.filePaths.at(0);
      return r.canceled || !folder ? [] : listMedia(folder);
    }
    const filters =
      kind === "subtitle"
        ? [{ name: "Legendas", extensions: SUBTITLE_EXT }]
        : kind === "audio"
          ? [{ name: "Áudio", extensions: ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"] }]
          : [{ name: "Vídeo e áudio", extensions: MEDIA_EXT }];
    const r = await dialog.showOpenDialog(win, {
      title:
        kind === "subtitle"
          ? "Abrir legenda"
          : kind === "audio"
            ? "Escolher o novo som"
            : kind === "join"
              ? "Escolher os vídeos para juntar"
              : "Abrir vídeo",
      properties:
        kind === "video" || kind === "join" ? ["openFile", "multiSelections"] : ["openFile"],
      filters,
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("media:probe", async (_e, raw: unknown) => engine.probe(await readable(raw)));
  ipcMain.handle(
    "player:open",
    async (_e, raw: unknown, rawAudio: unknown, rawFallback: unknown) => {
      const path = await readable(raw);
      const audioIndex = z.int().min(0).max(63).parse(rawAudio);
      const fallback = z.boolean().parse(rawFallback);
      const facts = await engine.probe(path);
      let mode = playbackPlan(facts, caps, audioIndex);
      if (fallback && mode === "native") mode = "remux";
      else if (fallback && mode === "remux") mode = "preview";
      let file = path;
      if (mode !== "native") {
        jobsOf.get(path)?.abort();
        const controller = new AbortController();
        jobsOf.set(path, controller);
        const label = mode === "remux" ? "Preparando o vídeo" : "Convertendo para uma prévia";
        const playableSound = PLAYABLE_AUDIO.has(facts.audio.at(audioIndex)?.codec ?? "");
        try {
          file = await engine.prepare(
            path,
            mode,
            audioIndex,
            (ratio) => send("progress", { id: path, ratio, label }),
            controller.signal,
            playableSound,
          );
        } finally {
          if (jobsOf.get(path) === controller) jobsOf.delete(path);
          send("progress", { id: path, ratio: 1, label });
        }
      }
      const source: PlaybackSource = { url: await streams.grant(file), mode, facts, audioIndex };
      return source;
    },
  );
  ipcMain.handle("player:cancelPrepare", async (_e, raw: unknown) => {
    const path = pathValue.parse(raw);
    jobsOf.get(path)?.abort();
    engine.cancelPrepare(path);
  });
  ipcMain.handle("media:sheet", async (_e, raw: unknown) => {
    const { file, ...sheet } = await engine.frameSheet(await readable(raw));
    return { ...sheet, url: await streams.grant(file) };
  });
  ipcMain.handle("media:waveform", async (_e, raw: unknown) =>
    engine.waveform(await readable(raw)),
  );
  ipcMain.handle("media:keyframes", async (_e, raw: unknown) =>
    engine.keyframes(await readable(raw)),
  );
  ipcMain.handle("subtitle:read", async (_e, raw: unknown) => {
    const path = await readable(raw);
    if (!SUBTITLE_EXT.includes(extname(path).slice(1).toLowerCase()))
      throw new Error("Escolha um arquivo .srt ou .vtt.");
    if ((await stat(path)).size > SUBTITLE_LIMIT)
      throw new Error("Arquivo de legenda grande demais.");
    return readFile(path, "utf8");
  });
  ipcMain.handle("subtitle:extract", async (_e, raw: unknown, rawIndex: unknown) =>
    engine.subtitleTrack(await readable(raw), z.int().min(0).max(63).parse(rawIndex)),
  );
  ipcMain.handle(
    "player:frame",
    async (_e: IpcMainInvokeEvent, raw: unknown, rawAt: unknown, rawTarget: unknown) => {
      const path = await readable(raw);
      const at = z.number().min(0).max(200000).parse(rawAt);
      const target = z.enum(["file", "clipboard"]).parse(rawTarget);
      desktop.assertAccess();
      const temp = await mkdtemp(join(tmpdir(), "ediplayer-frame-"));
      try {
        const png = join(temp, "quadro.png");
        await engine.frame(path, at, png);
        if (target === "clipboard") {
          // Electron 44's clipboard is the W3C one: the PNG goes out as an image/png ClipboardItem.
          const bytes = await readFile(png);
          if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error("Quadro inválido.");
          await clipboard.write([
            new ClipboardItem({
              "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }),
            }),
          ]);
          return "clipboard";
        }
        if (!win) return null;
        const stem = basename(path).replace(/\.[^.]+$/, "");
        const r = await dialog.showSaveDialog(win, {
          title: "Salvar quadro",
          defaultPath: join(
            app.getPath("pictures"),
            `${stem} ${Math.floor(at / 60)}m${Math.floor(at % 60)}s.png`,
          ),
          filters: [{ name: "PNG", extensions: ["png"] }],
        });
        if (r.canceled || !r.filePath) return null;
        await desktopFiles.grantWrite(r.filePath);
        const out = await desktopFiles.assertWrite(r.filePath);
        await copyFile(png, out);
        return out;
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    },
  );
  ipcMain.handle("player:recents", async () =>
    Promise.all(
      (await state.recents()).map(async (r) => {
        await desktopFiles.grantRead(r.path);
        let thumbUrl: string | undefined;
        try {
          thumbUrl = await streams.grant(await engine.thumbnail(r.path));
        } catch {
          thumbUrl = undefined; // Sound-only files and unreadable ones show the plain card.
        }
        return { ...r, thumbUrl };
      }),
    ),
  );
  ipcMain.handle("player:remember", async (_e, raw: unknown) => {
    const item = rememberSchema.parse(raw);
    await readable(item.path);
    await state.remember(item);
  });
  ipcMain.handle("player:forget", () => state.forget());
  ipcMain.handle("player:prefs", () => state.prefs());
  ipcMain.handle("player:savePrefs", (_e, raw: unknown) => state.savePrefs(prefsSchema.parse(raw)));
  // "dialog:save" makes the suite grant write access to the chosen path.
  ipcMain.handle("dialog:save", async (_e, rawName: unknown, rawExt: unknown, rawNear: unknown) => {
    const name = z.string().min(1).max(255).parse(rawName);
    const near = pathValue.nullable().parse(rawNear);
    // Beside the source when it is a file the person opened; else the Videos folder.
    const folder =
      near && (await desktopFiles.canRead(near)) ? dirname(near) : app.getPath("videos");
    const ext = z
      .enum(["mp4", "mov", "mkv", "webm", "gif", "mp3", "m4a", "ogg", "wav"])
      .parse(rawExt);
    if (!win) return null;
    const r = await dialog.showSaveDialog(win, {
      title: "Salvar resultado",
      defaultPath: join(folder, name),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    return r.canceled || !r.filePath ? null : r.filePath;
  });
  // "dialog:folder" grants the folder: the parts of a split are written inside it.
  ipcMain.handle("dialog:folder", async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      title: "Pasta das partes",
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled ? null : (r.filePaths.at(0) ?? null);
  });
  ipcMain.handle("queue:add", async (_e, rawJob: unknown, rawLabel: unknown, rawOpen: unknown) => {
    desktop.assertAccess();
    const job = editJobSchema.parse(rawJob);
    z.string().max(300).parse(rawLabel);
    const openFolder = z.boolean().parse(rawOpen);
    const sources = job.kind === "join" ? job.sources : [job.source];
    for (const s of sources) await readable(s);
    if (job.kind === "export") {
      if (job.transform.replaceAudio) await readable(job.transform.replaceAudio);
      if (job.transform.burnSubtitles) await readable(job.transform.burnSubtitles);
    }
    const outputs = jobOutputs(job);
    for (const o of outputs) await desktopFiles.assertWrite(o);
    return queue.add(job, jobLabel(job), outputs, openFolder);
  });
  ipcMain.handle("queue:cancel", (_e, raw: unknown) => queue.cancel(z.string().uuid().parse(raw)));
  ipcMain.handle("queue:list", () => queue.list());
  ipcMain.handle("queue:clear", () => queue.clearFinished());
  ipcMain.handle("shell:showItem", async (_e, raw: unknown) => {
    const path = pathValue.parse(raw);
    if (!desktopFiles.canRead(path) && !desktopFiles.canWrite(path))
      throw new Error("Arquivo desconhecido.");
    shell.showItemInFolder(path);
  });
  ipcMain.handle("window:onTop", (_e, raw: unknown) => win?.setAlwaysOnTop(z.boolean().parse(raw)));
  ipcMain.handle("window:mini", (_e, raw: unknown) => {
    if (!win) return;
    if (z.boolean().parse(raw)) {
      if (win.isMaximized()) win.unmaximize();
      normalBounds = win.getBounds();
      win.setAlwaysOnTop(true, "floating");
      win.setBounds({ ...normalBounds, width: 480, height: 300 });
    } else {
      win.setAlwaysOnTop(false);
      if (normalBounds) win.setBounds(normalBounds);
      normalBounds = null;
    }
  });
  ipcMain.handle("tool:ediaula", async (_e, raw: unknown) => {
    const path = await readable(raw);
    const exe = join(
      app.getPath("home"),
      "AppData",
      "Local",
      "Programs",
      "Edi",
      "EdiAula",
      "EdiAula.exe",
    );
    if (!existsSync(exe)) return "missing";
    // EdiAula does not take a file on its command line yet: open it and leave the path copied.
    await clipboard.writeText(path);
    const failed = await shell.openPath(exe);
    if (failed) throw new Error(failed);
    return "opened";
  });
}

export const APP_USER_MODEL_ID = "br.com.informach.ediplayer";
if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  void openReceived(mediaFiles(argv));
});

app
  .whenReady()
  .then(async () => {
    await desktop.start();
    protocol.handle(MEDIA_SCHEME, (request) => streams.respond(request));
    registerIpc();
    createWindow();
    void engine.trimCache().catch(() => undefined);
  })
  .catch((error: unknown) => {
    dialog.showErrorBox(
      "EdiPlayer",
      error instanceof Error ? error.message : "Falha ao validar o acesso",
    );
    app.quit();
  });

app.on("window-all-closed", () => app.quit());
