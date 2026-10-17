import { join } from "node:path";
import { desktopFiles, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  screen,
  session,
} from "electron";
import { type GuidedPlan, type GuidedTarget, scheduleGuided } from "../shared/guidedRecording.ts";
import type { CaptureMonitor, MarkerKind, RecordOptions } from "../shared/recording.ts";
import { prepareGuidedNarration, probe } from "./ffmpeg.ts";
import { captureBrowserTarget, openGuidedBrowser, resolveBrowserTarget } from "./guidedBrowser.ts";
import { executeGuided, GuidedInput } from "./guidedRecording.ts";
import * as rec from "./recorder.ts";

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
const HOTKEYS: [string, string][] = [
  ["F8", "guided-target"],
  ["F9", "toggle"],
  ["F10", "stop"],
  ["CommandOrControl+M", "marker"],
  ["CommandOrControl+R", "retake"],
];

const dipRect = (m: CaptureMonitor): Electron.Rectangle =>
  screen.screenToDipRect(null, { x: m.x, y: m.y, width: m.width, height: m.height });

function place(m: CaptureMonitor): void {
  if (!overlay) return;
  overlay.setBounds(dipRect(m));
}

export function registerRecorder(getMain: () => BrowserWindow | null): void {
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

  // getDisplayMedia in the recorder window asks for the computer's sound: Windows loopback.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }));
  });

  const close = (): void => {
    endGuided();
    for (const [key] of HOTKEYS) globalShortcut.unregister(key);
    const o = overlay;
    overlay = null;
    if (o && !o.isDestroyed()) o.close();
    const w = main();
    if (w && !w.isDestroyed()) {
      w.show();
      w.focus();
    }
  };

  ipcMain.handle("recorder:open", (_e, ctx: RecorderContext) => {
    context = ctx;
    if (overlay) return overlay.focus();
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
      if (rec.isRecording()) void rec.cancel();
      close();
    });
    for (const [key, name] of HOTKEYS)
      globalShortcut.register(key, () => {
        if (name === "guided-target" && browsing) {
          browsing = false;
          overlay?.show();
          overlay?.setIgnoreMouseEvents(false);
          return;
        }
        overlay?.webContents.send("recorder:hotkey", name);
      });
    w?.hide();
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
  ipcMain.handle("recorder:moveTo", (_e, index: number) => {
    const m = monitors.find((x) => x.index === index);
    if (m) place(m);
  });
  /** Region comes in window pixels (DIP); the capture needs physical pixels of the monitor. */
  ipcMain.handle(
    "recorder:prepare",
    async (
      _e,
      opts: RecordOptions & { regionDip?: { x: number; y: number; width: number; height: number } },
    ) => {
      const m = monitors.find((x) => x.index === opts.monitor);
      if (!m) throw new Error("Tela não encontrada.");
      let region = opts.region;
      if (opts.regionDip) {
        const k = m.width / dipRect(m).width;
        const even = (v: number): number => Math.max(2, Math.floor((v * k) / 2) * 2);
        const x = Math.max(0, Math.round(opts.regionDip.x * k));
        const y = Math.max(0, Math.round(opts.regionDip.y * k));
        region = {
          x,
          y,
          width: Math.min(even(opts.regionDip.width), m.width - x - ((m.width - x) % 2)),
          height: Math.min(even(opts.regionDip.height), m.height - y - ((m.height - y) % 2)),
        };
        if (
          region.x === 0 &&
          region.y === 0 &&
          region.width >= m.width - 1 &&
          region.height >= m.height - 1
        )
          region = undefined;
      }
      await rec.prepare({ ...opts, region }, monitors);
      captureBounds = {
        x: m.x + (region?.x ?? 0),
        y: m.y + (region?.y ?? 0),
        width: region?.width ?? m.width,
        height: region?.height ?? m.height,
      };
    },
  );
  ipcMain.handle("recorder:start", () => rec.start());
  ipcMain.handle("recorder:systemAudio", (_e, bytes: Uint8Array, startedAt: number) =>
    rec.saveSystemAudio(bytes, startedAt),
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
  ipcMain.handle("recorder:mark", (_e, kind: MarkerKind) => rec.mark(kind));
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
      await desktopFiles.grantReadAll(
        [result.screen, result.camera, result.narration, result.systemAudio, result.cursor].filter(
          (path): path is string => typeof path === "string",
        ),
      );
      close();
      main()?.webContents.send("recorder:done", result);
      return result;
    } catch (err) {
      close();
      throw err;
    }
  });
}
