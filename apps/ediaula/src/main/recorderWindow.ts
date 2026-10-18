import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type DesktopJob, desktopJobs } from "@informach/edi-desktop/jobs";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  screen,
  session,
  shell,
} from "electron";
import { z } from "zod";
import { CAPTURE_QUALITIES } from "../shared/encoderChoice.ts";
import { type GuidedPlan, type GuidedTarget, scheduleGuided } from "../shared/guidedRecording.ts";
import {
  HOTKEY_LABELS,
  type HotkeyAction,
  type HotkeyReport,
  hotkeyConflicts,
  OPEN_HOTKEYS,
  parseAccelerator,
  REQUIRED_HOTKEYS,
  sessionHotkeys,
  toKeyFilter,
} from "../shared/hotkeys.ts";
import { DEFAULT_RECORDER_SETTINGS, type RecorderSettings } from "../shared/recorderSettings.ts";
import type {
  CaptureMonitor,
  MarkerKind,
  RecorderStatus,
  RecordingResult,
  RecordOptions,
} from "../shared/recording.ts";
import { prepareGuidedNarration, probe } from "./ffmpeg.ts";
import {
  captureBrowserTarget,
  guidedBrowserWindowIds,
  openGuidedBrowser,
  resolveBrowserTarget,
} from "./guidedBrowser.ts";
import { executeGuided, GuidedInput } from "./guidedRecording.ts";
import * as rec from "./recorder.ts";
import { readRecorderSettings, writeRecorderSettings } from "./recorderSettings.ts";
import { scheduler } from "./scheduler.ts";

/**
 * The recorder is a transparent window over the monitor being recorded: region frame,
 * teleprompter and controls. Content protection keeps it out of the capture, and during the
 * recording it lets clicks through to the apps underneath, except over its own controls.
 */

export interface RecorderContext {
  /** Teleprompter paragraphs (narration lines of the project's script). */
  teleprompter: { speaker: string; text: string; avatar: boolean }[];
  title?: string;
}

let overlay: BrowserWindow | null = null;
let context: RecorderContext = { teleprompter: [] };
let monitors: CaptureMonitor[] = [];
let settings: RecorderSettings = DEFAULT_RECORDER_SETTINGS;

/** What each shortcut tells the recorder window. */
const HOTKEY_NAMES: Record<HotkeyAction, string> = {
  toggle: "toggle",
  stop: "stop",
  guidedTarget: "guided-target",
  marker: "marker",
  retake: "retake",
  lineNext: "line-next",
  linePrev: "line-prev",
  clickerNext: "line-next",
  clickerPrev: "line-prev",
};

const rectDip = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

/** What the recorder window may ask for; the region comes in window pixels (DIP). */
const prepareSchema = z.object({
  monitor: z.int().nonnegative().optional(),
  regionDip: rectDip.optional(),
  microphone: z.string().min(1).max(512).optional(),
  camera: z.string().min(1).max(512).optional(),
  cameraMode: z
    .object({
      codec: z.string().max(32).optional(),
      pixelFormat: z.string().max(32).optional(),
      width: z.int().positive().max(8192),
      height: z.int().positive().max(8192),
      fps: z.number().positive().max(240),
    })
    .optional(),
  cameraLatency: z.int().min(0).max(1000).optional(),
  keys: z.boolean().optional(),
  fps: z.union([z.literal(30), z.literal(60)]),
  quality: z.enum(CAPTURE_QUALITIES).optional(),
  systemAudio: z.boolean().optional(),
});

/** Files of a finished take the editor reads: media, cursor data and the cursor images. */
function takeFiles(result: RecordingResult): string[] {
  const files = [
    result.screen,
    result.cursor,
    result.microphone,
    result.systemAudio,
    result.narration,
    ...(result.screenParts ?? []).flatMap((p) => [p.path, p.cursor]),
    ...(result.cameraParts ?? []).map((p) => p.path),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
  const images = join(result.dir, "cursors");
  if (existsSync(images))
    for (const name of readdirSync(images))
      if (name.endsWith(".png")) files.push(join(images, name));
  return [...new Set(files)];
}

/** A finished take, readable by the editor. */
export async function grantTake(result: RecordingResult): Promise<void> {
  await desktopFiles.grantReadAll(takeFiles(result));
}

const dipRect = (m: CaptureMonitor): Electron.Rectangle =>
  screen.screenToDipRect(null, { x: m.x, y: m.y, width: m.width, height: m.height });

function place(m: CaptureMonitor): void {
  if (!overlay) return;
  overlay.setBounds(dipRect(m));
}

export function registerRecorder(getMain: () => BrowserWindow | null): void {
  let recordingJob: DesktopJob | undefined;
  let guided: { input: GuidedInput; controller: AbortController; paused: boolean } | null = null;
  let picking = false;
  let browsing = false;
  let captureBounds: { x: number; y: number; width: number; height: number } | null = null;
  const endGuided = (): void => {
    guided?.controller.abort();
    guided?.input.close();
    guided = null;
  };
  const main = (): BrowserWindow | null => getMain();

  // ---- global shortcuts (shared/hotkeys.ts) ----
  /** Accelerators this module registered, by action. */
  const registered = new Map<HotkeyAction, string>();
  const reports = new Map<HotkeyAction, HotkeyReport>();
  const sendReports = (): void =>
    overlay?.webContents.send("recorder:hotkeys", [...reports.values()]);
  const press = (action: HotkeyAction): void => {
    if (action === "guidedTarget" && browsing) {
      browsing = false;
      overlay?.show();
      overlay?.setIgnoreMouseEvents(false);
      return;
    }
    overlay?.webContents.send("recorder:hotkey", HOTKEY_NAMES[action]);
  };
  /** Registers each shortcut and says which ones another program (or a repeat) took. */
  const registerHotkeys = (actions: readonly HotkeyAction[]): void => {
    const problems = hotkeyConflicts(settings.hotkeys, settings.clicker);
    for (const action of actions) {
      if (registered.has(action)) continue;
      const accelerator = settings.hotkeys[action];
      const problem = problems.find((p) => p.action === action);
      if (!parseAccelerator(accelerator) || problem) {
        reports.set(action, {
          action,
          accelerator,
          ok: false,
          reason:
            problem?.problem === "duplicate" && problem.other
              ? `Repete o atalho de ${HOTKEY_LABELS[problem.other]}.`
              : "Atalho inválido.",
        });
        continue;
      }
      let ok: boolean;
      try {
        ok =
          globalShortcut.register(accelerator, () => press(action)) &&
          globalShortcut.isRegistered(accelerator);
      } catch (error) {
        reports.set(action, {
          action,
          accelerator,
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (ok) registered.set(action, accelerator);
      reports.set(action, {
        action,
        accelerator,
        ok,
        ...(ok ? {} : { reason: "Outro programa já usa este atalho." }),
      });
    }
    sendReports();
  };
  const unregisterHotkeys = (actions: readonly HotkeyAction[]): void => {
    for (const action of actions) {
      const accelerator = registered.get(action);
      if (accelerator) globalShortcut.unregister(accelerator);
      registered.delete(action);
      reports.delete(action);
    }
    sendReports();
  };
  const allHotkeys = (): HotkeyAction[] => [...new Set([...registered.keys(), ...reports.keys()])];
  let sessionKeys: HotkeyAction[] = [];

  // ---- the take's status, events and health ----
  const onStatus = (status: RecorderStatus): void => {
    overlay?.webContents.send("recorder:status", status);
    const active = status.phase !== null && status.phase !== "finalized";
    scheduler.setRecording(active, { hold: settings.pauseBackground });
    const w = main();
    if (w && !w.isDestroyed())
      w.webContents.send("recorder:state", {
        ...status,
        holdBackground: scheduler.state().holding,
      });
    // Marker, redo and the teleprompter keys belong to the take (G14).
    if ((status.phase === "recording" || status.phase === "paused") && !sessionKeys.length) {
      sessionKeys = sessionHotkeys(settings.clicker);
      registerHotkeys(sessionKeys);
    } else if (!active || status.phase === "stopping") {
      unregisterHotkeys(sessionKeys);
      sessionKeys = [];
    }
  };
  rec.subscribe((message) => {
    if (message.type === "status") onStatus(message.status);
    else if (message.type === "event") overlay?.webContents.send("recorder:event", message.event);
    else overlay?.webContents.send("recorder:health", message.health);
  });

  // getDisplayMedia in the recorder window asks for the computer's sound: Windows loopback.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }));
  });

  const close = (): void => {
    recordingJob?.finish();
    recordingJob = undefined;
    endGuided();
    rec.stopMicMonitor();
    unregisterHotkeys(allHotkeys());
    sessionKeys = [];
    const o = overlay;
    overlay = null;
    if (o && !o.isDestroyed()) o.close();
    const w = main();
    if (w && !w.isDestroyed()) {
      w.show();
      w.focus();
    }
  };

  ipcMain.handle("recorder:open", async (_e, ctx: RecorderContext) => {
    context = ctx;
    if (overlay) return overlay.focus();
    settings = await readRecorderSettings();
    const w = main();
    const display = w ? screen.getDisplayMatching(w.getBounds()) : screen.getPrimaryDisplay();
    overlay = new BrowserWindow({
      ...display.bounds,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      skipTaskbar: false,
      title: "EdiAula · Gravação",
      icon: join(app.getAppPath(), "resources", "icon.ico"),
      backgroundColor: "#00000000",
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: !app.isPackaged,
        backgroundThrottling: false,
      },
    });
    overlay.setAlwaysOnTop(true, "screen-saver");
    // Windows shrinks new windows to the work area; the recorder must cover the taskbar too.
    const bounds = display.bounds;
    overlay.once("ready-to-show", () => overlay?.setBounds(bounds));
    overlay.setBounds(bounds);
    // Never appears in screen captures (ours or anyone's).
    overlay.setContentProtection(true);
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
      void overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}#recorder`);
    else void overlay.loadFile(join(__dirname, "../renderer/index.html"), { hash: "recorder" });
    overlay.on("closed", () => {
      overlay = null;
      endGuided();
      // A take under way is saved (what the computer's sound already sent is on disk); one
      // still in its countdown has nothing worth keeping.
      if (rec.isRecording() && rec.status().phase !== "prepared")
        void rec.stop().then(
          async (result) => {
            await grantTake(result);
            main()?.webContents.send("recorder:done", result);
          },
          // The folder stays and is offered as an interrupted take next time.
          (error: unknown) => console.error("[recorder] gravação não finalizada:", error),
        );
      else if (rec.isRecording()) void rec.cancel();
      close();
    });
    registerHotkeys(OPEN_HOTKEYS);
    w?.hide();
  });
  ipcMain.handle("recorder:hotkeys", () => [...reports.values()]);
  ipcMain.handle("recorder:settings", () => settings);
  ipcMain.handle("recorder:saveSettings", async (_e, value: unknown) => {
    const before = JSON.stringify([settings.hotkeys, settings.clicker]);
    settings = await writeRecorderSettings(value);
    // New shortcuts take effect at once outside a take; during one, at the next take.
    if (JSON.stringify([settings.hotkeys, settings.clicker]) !== before && !rec.isRecording()) {
      unregisterHotkeys(allHotkeys());
      if (overlay) registerHotkeys(OPEN_HOTKEYS);
    }
    return settings;
  });
  ipcMain.handle("recorder:monitorMic", (_e, device: unknown) => {
    const name = z.string().min(1).max(512).nullable().parse(device);
    rec.monitorMic(name, (level) => overlay?.webContents.send("recorder:level", level));
  });
  ipcMain.handle("recorder:cameraModes", (_e, device: unknown) =>
    rec.cameraModes(z.string().min(1).max(512).parse(device), settings.fps),
  );
  ipcMain.handle("recorder:status", () => ({
    ...rec.status(),
    holdBackground: scheduler.state().holding,
  }));
  /** The recorder's own controls, in window pixels: the helper marks the pointer over them. */
  ipcMain.handle("recorder:uiRects", (_e, raw: unknown) => {
    const rects = z.array(rectDip).max(32).parse(raw);
    const o = overlay;
    if (!o) return;
    const origin = o.getBounds();
    rec.uiRects(
      rects
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => {
          const p = screen.dipToScreenRect(o, {
            x: Math.floor(origin.x + r.x),
            y: Math.floor(origin.y + r.y),
            width: Math.ceil(r.width),
            height: Math.ceil(r.height),
          });
          return { x: p.x, y: p.y, w: p.width, h: p.height };
        }),
    );
  });
  ipcMain.handle("recorder:teleprompterLine", (_e, index: unknown) =>
    rec.teleprompterLine(z.int().nonnegative().max(100000).parse(index)),
  );
  ipcMain.handle("recorder:discard", async () => {
    endGuided();
    await rec.discard((dir) => shell.trashItem(dir));
    recordingJob?.finish();
    recordingJob = undefined;
    captureBounds = null;
    overlay?.show();
    overlay?.setIgnoreMouseEvents(false);
  });
  // Takes the app did not finish (main window, after the license gate).
  ipcMain.handle("recorder:orphans", () => rec.orphans());
  ipcMain.handle("recorder:recoverOrphan", async (_e, dir: unknown) => {
    const result = await rec.recoverOrphan(z.string().min(1).max(32768).parse(dir));
    await grantTake(result);
    return result;
  });
  ipcMain.handle("recorder:discardOrphan", async (_e, dir: unknown) => {
    const path = z.string().min(1).max(32768).parse(dir);
    if (!(await rec.isOrphan(path))) throw new Error("Essa pasta não é uma gravação interrompida.");
    await shell.trashItem(path);
  });

  // Automated UI checks (EDIAULA_SNAPSHOT) also need a picture of this window.
  if (process.env.EDIAULA_SNAPSHOT)
    ipcMain.handle("recorder:debugCapture", async (_e, path: string) => {
      const { writeFile } = await import("node:fs/promises");
      if (overlay) await writeFile(path, (await overlay.webContents.capturePage()).toPNG());
    });
  ipcMain.handle("recorder:context", () => context);
  ipcMain.handle("recorder:guidedPick", async () => {
    if (rec.isRecording() || picking) throw new Error("Marque os alvos antes de gravar.");
    picking = true;
    const point = screen.dipToScreenPoint(screen.getCursorScreenPoint());
    const input = new GuidedInput();
    overlay?.hide();
    try {
      return await captureBrowserTarget(
        await input.command<GuidedTarget>({ op: "sample", ...point }),
      );
    } finally {
      input.close();
      picking = false;
      overlay?.show();
      overlay?.setIgnoreMouseEvents(false);
    }
  });
  ipcMain.handle("recorder:guidedCancel", () => endGuided());
  ipcMain.handle("recorder:pickNarration", async () => {
    const parent = overlay ?? main();
    if (!parent || rec.isRecording()) return null;
    overlay?.setAlwaysOnTop(false);
    try {
      const result = await dialog.showOpenDialog(parent, {
        title: "Escolher narração ou MP4 do HeyGen",
        properties: ["openFile"],
        filters: [
          {
            name: "Narração · áudio ou vídeo",
            extensions: ["mp4", "mov", "m4v", "wav", "mp3", "m4a", "aac", "ogg", "flac", "webm"],
          },
        ],
      });
      const path = result.canceled ? undefined : result.filePaths[0];
      return path ? await prepareGuidedNarration(path) : null;
    } finally {
      overlay?.setAlwaysOnTop(true, "screen-saver");
    }
  });
  ipcMain.handle("recorder:guidedBrowser", async (_e, url: string) => {
    if (rec.isRecording()) throw new Error("Abra a aula antes de gravar.");
    browsing = true;
    overlay?.hide();
    try {
      await openGuidedBrowser(url);
    } catch (err) {
      browsing = false;
      overlay?.show();
      throw err;
    }
  });
  ipcMain.handle("recorder:reset", async () => {
    endGuided();
    await rec.cancel();
    recordingJob?.finish();
    recordingJob = undefined;
    captureBounds = null;
    overlay?.show();
    overlay?.setIgnoreMouseEvents(false);
  });
  ipcMain.handle("recorder:guidedStart", async (_e, plan: GuidedPlan) => {
    if (!rec.isRecording() || guided) throw new Error("Gravação guiada indisponível.");
    const schedule = scheduleGuided(plan);
    const bounds = captureBounds;
    if (
      !bounds ||
      plan.steps.some(
        (s) =>
          !s.target ||
          s.target.x < bounds.x ||
          s.target.y < bounds.y ||
          s.target.x >= bounds.x + bounds.width ||
          s.target.y >= bounds.y + bounds.height,
      )
    )
      throw new Error(
        "Há um alvo fora da região gravada. Ajuste a região ou marque o alvo novamente.",
      );
    const state = { input: new GuidedInput(), controller: new AbortController(), paused: false };
    guided = state;
    try {
      await state.input.command({ op: "sample" });
      if (plan.audio) {
        const info = await probe(plan.audio.path);
        if (!info.hasAudio || Math.abs(info.duration - plan.audio.duration) > 0.25)
          throw new Error("O arquivo de narração mudou. Importe-o novamente.");
      }
      const origin = plan.audio
        ? (await rec.setGuidedNarration(plan.audio.path, 1 + schedule.lead)) - schedule.lead
        : rec.elapsed() + 1;
      if (state.controller.signal.aborted || !rec.isRecording())
        throw new Error("Gravação interrompida.");
      overlay?.hide();
      const resolveTarget = async (target: GuidedTarget): Promise<GuidedTarget> => {
        const found = await resolveBrowserTarget(target);
        if (
          found.x < bounds.x ||
          found.y < bounds.y ||
          found.x >= bounds.x + bounds.width ||
          found.y >= bounds.y + bounds.height
        )
          throw new Error("O elemento saiu da região gravada.");
        if (!target.browser) return found;
        const current = await state.input.command<GuidedTarget>({
          op: "sample",
          x: found.x,
          y: found.y,
        });
        if (current.window !== found.window)
          throw new Error("A aula foi coberta por outra janela.");
        return {
          ...found,
          left: current.left,
          top: current.top,
          width: current.width,
          height: current.height,
        };
      };
      void executeGuided(
        plan,
        state.input,
        () => rec.elapsed() - origin,
        () => state.paused,
        state.controller.signal,
        undefined,
        resolveTarget,
      )
        .then(() => {
          if (!state.controller.signal.aborted)
            overlay?.webContents.send("recorder:hotkey", "guided-done");
        })
        .catch(async (err) => {
          if (state.controller.signal.aborted) return;
          state.paused = true;
          await rec.pause().catch(() => {});
          if (state.controller.signal.aborted) return;
          overlay?.show();
          overlay?.setIgnoreMouseEvents(false);
          overlay?.webContents.send("recorder:hotkey", `guided-error:${(err as Error).message}`);
        })
        .finally(() => state.input.close());
      return { origin, lead: schedule.lead };
    } catch (err) {
      endGuided();
      throw err;
    }
  });
  ipcMain.handle("recorder:sources", async () => {
    const s = await rec.captureSources();
    monitors = s.monitors.map((m) => ({ ...m, dip: dipRect(m) }));
    const b = overlay?.getBounds();
    const current = b ? monitors.find((m) => m.dip!.x === b.x && m.dip!.y === b.y) : undefined;
    return { ...s, monitors, current: current?.index ?? null };
  });
  /** Tried in the background while the recorder is set up, not during the countdown. */
  ipcMain.handle("recorder:encoder", async (_e, index: unknown) => {
    const monitor = monitors.find((m) => m.index === z.int().nonnegative().parse(index));
    if (!monitor) throw new Error("Tela não encontrada.");
    return rec.encoderFor(monitor, settings.fps);
  });
  ipcMain.handle("recorder:moveTo", (_e, index: number) => {
    const m = monitors.find((x) => x.index === index);
    if (m) place(m);
  });
  /** Region comes in window pixels (DIP); the capture needs physical pixels of the monitor. */
  ipcMain.handle("recorder:prepare", async (_e, raw: unknown) => {
    const { regionDip, ...rest } = prepareSchema.parse(raw);
    const opts: RecordOptions = rest;
    // The window could not list the camera's modes (its preview held it): choose here, now
    // that the preview let go.
    if (opts.camera && !opts.cameraMode)
      opts.cameraMode = (await rec.cameraModes(opts.camera, 30)).choice ?? undefined;
    const missing = REQUIRED_HOTKEYS.filter((action) => !registered.has(action));
    if (missing.length)
      throw new Error(
        `Os atalhos de ${missing.map((a) => HOTKEY_LABELS[a].toLowerCase()).join(" e ")} não puderam ser registrados. Troque-os nas opções do gravador antes de gravar.`,
      );
    const m =
      opts.monitor === undefined ? undefined : monitors.find((x) => x.index === opts.monitor);
    if (opts.monitor !== undefined && !m) throw new Error("Tela não encontrada.");
    let region: RecordOptions["region"];
    if (m && regionDip) {
      const k = m.width / dipRect(m).width;
      const even = (v: number): number => Math.max(2, Math.floor((v * k) / 2) * 2);
      const x = Math.max(0, Math.round(regionDip.x * k));
      const y = Math.max(0, Math.round(regionDip.y * k));
      region = {
        x,
        y,
        width: Math.min(even(regionDip.width), m.width - x - ((m.width - x) % 2)),
        height: Math.min(even(regionDip.height), m.height - y - ((m.height - y) % 2)),
      };
      if (
        region.x === 0 &&
        region.y === 0 &&
        region.width >= m.width - 1 &&
        region.height >= m.height - 1
      )
        region = undefined;
    }
    await rec.prepare({ ...opts, region }, monitors, {
      // Keys typed in the lesson window still show on screen; it belongs to this process too.
      keyWindows: guidedBrowserWindowIds(),
      keyFilter: toKeyFilter(settings.hotkeys, settings.clicker),
    });
    captureBounds = m
      ? {
          x: m.x + (region?.x ?? 0),
          y: m.y + (region?.y ?? 0),
          width: region?.width ?? m.width,
          height: region?.height ?? m.height,
        }
      : null;
  });
  ipcMain.handle("recorder:start", async () => {
    if (recordingJob) throw new Error("Gravação já iniciada.");
    recordingJob = desktopJobs.begin({
      preserveForMs: 0,
      stop: async () => {
        endGuided();
        overlay?.webContents.send("recorder:hotkey", "preserve");
        await rec.preserve();
      },
    });
    try {
      await rec.start();
    } catch (error) {
      recordingJob.finish();
      recordingJob = undefined;
      throw error;
    }
  });
  /** The computer's sound, a chunk at a time; the first says when it started, the last when it ended. */
  ipcMain.handle(
    "recorder:systemChunk",
    (_e, bytes: unknown, startedAt: unknown, endedAt: unknown) => {
      if (!(bytes instanceof Uint8Array)) throw new Error("Pedaço de áudio inválido.");
      const time = z.number().finite().positive().optional();
      rec.systemChunk(bytes, time.parse(startedAt), time.parse(endedAt));
    },
  );
  ipcMain.handle("recorder:pause", async () => {
    if (guided) guided.paused = true;
    await rec.pause();
    if (guided) {
      overlay?.show();
      overlay?.setIgnoreMouseEvents(false);
    }
  });
  ipcMain.handle("recorder:resume", async () => {
    if (guided) overlay?.hide();
    await rec.resume();
    if (guided) guided.paused = false;
  });
  ipcMain.handle("recorder:mark", (_e, kind: unknown) =>
    rec.mark(z.enum(["marker", "retake"]).parse(kind) satisfies MarkerKind),
  );
  ipcMain.handle("recorder:elapsed", () => rec.elapsed());
  ipcMain.handle("recorder:interactive", (_e, on: boolean) =>
    overlay?.setIgnoreMouseEvents(!on, { forward: true }),
  );
  ipcMain.handle("recorder:cancel", async () => {
    endGuided();
    await rec.cancel();
    close();
  });
  ipcMain.handle("recorder:stop", async () => {
    endGuided();
    try {
      const result = await rec.stop();
      await grantTake(result);
      close();
      main()?.webContents.send("recorder:done", result);
      return result;
    } catch (err) {
      close();
      throw err;
    }
  });
}
