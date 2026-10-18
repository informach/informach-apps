import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { CAPTURE_QUALITIES, type CaptureCodec } from "../shared/encoderChoice.ts";
import {
  type GuidedPlanV2,
  type GuidedRunRecord,
  guidedPlanV2Schema,
  guidedStoreSchema,
  MARK_PURPOSES,
  newestGuided,
  planTiming,
  schedulePlan,
} from "../shared/guidedPlan.ts";
import type { GuidedTarget } from "../shared/guidedRecording.ts";
import { runGuided, STOPPED, screenClock } from "../shared/guidedRunner.ts";
import {
  HOTKEY_LABELS,
  type HotkeyAction,
  type HotkeyReport,
  hotkeyConflicts,
  hotkeyLabel,
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
import { RECORD_MODES, type RecorderContext } from "../shared/recording.ts";
import { detectCaptureEncoder } from "./encoders.ts";
import { FFMPEG, prepareGuidedNarration, probe } from "./ffmpeg.ts";
import {
  captureBrowserTarget,
  guidedBrowserWindowIds,
  type MarkSession,
  markInLesson,
  openGuidedBrowser,
  resolveBrowserTarget,
} from "./guidedBrowser.ts";
import { GuidedTake, verifyGuidedPlan } from "./guidedCapture.ts";
import { NO_PROJECT, readGuidedDraft, writeGuidedDraft } from "./guidedDrafts.ts";
import { GuidedInput, HelperDriver } from "./guidedRecording.ts";
import { qpc } from "./nativeHelper.ts";
import * as rec from "./recorder.ts";
import { readRecorderSettings, writeRecorderSettings } from "./recorderSettings.ts";
import { scheduler } from "./scheduler.ts";
import { renderVoiceCached, voiceSegmentsSchema } from "./voiceFiles.ts";
import { type FollowState, liveModel, VoiceFollower } from "./voiceFollow.ts";
import { checkedEngine, engineStatus } from "./whisper.ts";

/**
 * The recorder is a transparent window over the monitor being recorded: region frame,
 * teleprompter and controls. Content protection keeps it out of the capture, and during the
 * recording it lets clicks through to the apps underneath, except over its own controls.
 */

let overlay: BrowserWindow | null = null;
let context: RecorderContext = { teleprompter: [] };
let monitors: CaptureMonitor[] = [];
let settings: RecorderSettings = DEFAULT_RECORDER_SETTINGS;
/** Narrations picked for the guided mode that are the voice of a video (a presenter's render). */
const narrationsFromVideo = new Set<string>();

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
  mode: z.enum(RECORD_MODES).optional(),
  follow: z.boolean().optional(),
  over: z
    .object({
      from: z
        .number()
        .min(0)
        .max(7 * 86400),
      to: z
        .number()
        .min(0)
        .max(7 * 86400)
        .optional(),
      replace: z.boolean().optional(),
    })
    .optional(),
});

const seconds = z
  .number()
  .min(0)
  .max(7 * 86400);
const line = z.string().max(20000);
/** What the editor hands the recorder (shared/recording.ts RecorderContext). */
const contextSchema = z.object({
  teleprompter: z
    .array(
      z.object({
        speaker: z.string().max(200),
        text: line,
        avatar: z.boolean(),
        insertId: z.string().max(40).optional(),
      }),
    )
    .max(5000),
  title: z.string().max(2000).optional(),
  screenNotes: z
    .array(z.object({ before: z.int().nonnegative(), text: line }))
    .max(5000)
    .optional(),
  mode: z.enum(RECORD_MODES).optional(),
  over: z
    .object({
      from: seconds,
      to: seconds.optional(),
      replace: z.boolean().optional(),
      end: seconds,
      segments: voiceSegmentsSchema,
      words: z.array(z.object({ t: seconds, end: seconds, text: z.string().max(200) })).max(200000),
      cues: z.array(z.object({ t: seconds, text: line })).max(5000),
    })
    .optional(),
  projectId: z.string().min(1).max(200).optional(),
  guided: guidedStoreSchema.optional(),
  guidedReplace: z
    .object({
      assetId: z.string().min(1).max(200),
      assetName: z.string().max(1000),
      planId: z.string().min(1).max(200),
      timing: z.string().max(64),
      from: z.int().nonnegative().max(300),
      duration: z.number().nonnegative(),
    })
    .optional(),
});

/** Files of a finished take the editor reads: media, cursor data, guided-run.json and the cursor images. */
function takeFiles(result: RecordingResult): string[] {
  const files = [
    result.screen,
    result.cursor,
    result.microphone,
    result.systemAudio,
    result.narration,
    result.guidedRun,
    ...(result.screenParts ?? []).flatMap((p) => [p.path, p.cursor]),
    ...(result.cameraParts ?? []).map((p) => p.path),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
  const images = join(result.dir, "cursors");
  if (existsSync(images))
    for (const name of readdirSync(images))
      if (name.endsWith(".png")) files.push(join(images, name));
  return [...new Set(files)];
}

/**
 * A finished take, readable by the editor. A file that cannot be granted (it went missing)
 * becomes a warning of the take: the rest still goes to the editor.
 */
export async function grantTake(result: RecordingResult): Promise<RecordingResult> {
  const problems: string[] = [];
  for (const path of takeFiles(result))
    try {
      await desktopFiles.grantRead(path);
    } catch (error) {
      problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  return problems.length
    ? {
        ...result,
        warnings: [
          ...(result.warnings ?? []),
          `O editor não pôde abrir alguns arquivos da gravação: ${problems.join("; ")}.`,
        ],
      }
    : result;
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
  /** A guided take in the lesson window (main/guidedCapture.ts). */
  let web: {
    take: GuidedTake;
    job: DesktopJob;
    plan: GuidedPlanV2;
    from: number;
    replace?: string;
  } | null = null;
  let verifying: AbortController | null = null;
  let marking: MarkSession | null = null;
  let picking = false;
  let browsing = false;
  let captureBounds: { x: number; y: number; width: number; height: number } | null = null;
  const endGuided = (): void => {
    guided?.controller.abort();
    guided?.input.close();
    guided = null;
  };
  const main = (): BrowserWindow | null => getMain();
  /** Something the teacher has to know in the editor (a take that did not finish, a crash). */
  const alertMain = (alert: { message: string; dir?: string; orphans?: boolean }): void => {
    const w = main();
    if (!w || w.isDestroyed()) return;
    w.show();
    w.webContents.send("recorder:alert", alert);
  };
  // The shortcuts shown anywhere (editor included) are the saved ones from the start.
  const loadSettings = readRecorderSettings().then(
    (loaded) => {
      settings = loaded;
    },
    // Opening the recorder reads the file again and shows what went wrong.
    (error: unknown) => console.error("[recorder] opções do gravador ilegíveis:", error),
  );
  /**
   * Stops and hands the take to the editor, once per take whoever asks (the stop button, the
   * window closing): one finalization and one recorder:done. When finalizing fails, the editor
   * says so and offers the folder again.
   */
  let finishing: Promise<RecordingResult> | null = null;
  const finishTake = (): Promise<RecordingResult> => {
    if (finishing) return finishing;
    const dir = rec.activeDir();
    finishing = rec.stop().then(
      async (result) => {
        const granted = await grantTake(result);
        main()?.webContents.send("recorder:done", granted);
        return granted;
      },
      (error: unknown) => {
        alertMain({
          message: `A gravação não pôde ser finalizada: ${error instanceof Error ? error.message : String(error)}`,
          ...(dir ? { dir } : {}),
          orphans: true,
        });
        throw error;
      },
    );
    return finishing;
  };

  // ---- global shortcuts (shared/hotkeys.ts) ----
  /** Accelerators this module registered, by action. */
  const registered = new Map<HotkeyAction, string>();
  const reports = new Map<HotkeyAction, HotkeyReport>();
  const sendReports = (): void =>
    overlay?.webContents.send("recorder:hotkeys", [...reports.values()]);
  const press = (action: HotkeyAction): void => {
    if (action === "guidedTarget" && marking) {
      marking.toggle();
      return;
    }
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

  // ---- the teleprompter following the voice ("Só voz") ----
  let follower: VoiceFollower | null = null;
  const followState = (state: FollowState, message: string): void => {
    overlay?.webContents.send("recorder:followState", { state, message });
  };
  /** Each start or end of the following moves this on: a start that finds it moved gives up. */
  let followTurn = 0;
  /** Starts and ends run one after another, so two servers never run at once. */
  let followQueue: Promise<void> = Promise.resolve();
  const endFollow = (): void => {
    followTurn++;
    follower?.stop();
    follower = null;
  };
  /** Starts the recognizer for a voice take; without the engine, only the shortcuts move lines. */
  const startFollow = (): Promise<void> => {
    endFollow();
    const turn = followTurn;
    followQueue = followQueue.then(async () => {
      if (turn !== followTurn) return;
      try {
        const status = await engineStatus();
        const model = liveModel(status.models, status.model);
        if (!status.bin || !model) {
          followState(
            "unavailable",
            "Para o teleprompter acompanhar a voz, instale o motor e um modelo na aba Transcrição. Por enquanto, use o atalho.",
          );
          return;
        }
        // Checked like a transcription: the engine folder against its manifest, the model
        // against its published hash (main/whisper.ts).
        const engine = await checkedEngine(model);
        if (turn !== followTurn) return;
        const f = new VoiceFollower({
          engine: {
            server: join(dirname(engine.cli), "whisper-server.exe"),
            model: model.path,
            cpu: engine.variant === "cpu",
          },
          lines: context.teleprompter.map((l) => l.text),
          language: "pt",
          pidFile: join(app.getPath("userData"), "whisper", "follow-server.pid"),
          onLineDone: (line, at) => overlay?.webContents.send("recorder:follow", { line, at }),
          onState: followState,
        });
        follower = f;
        await f.start();
      } catch (error) {
        if (turn === followTurn) endFollow();
        followState(
          "unavailable",
          `O teleprompter não vai acompanhar a voz (${error instanceof Error ? error.message : String(error)}). Use o atalho.`,
        );
      }
    });
    return followQueue;
  };

  // ---- the take's status, events and health ----
  const onStatus = (status: RecorderStatus): void => {
    overlay?.webContents.send("recorder:status", status);
    follower?.setPaused(status.phase !== "recording");
    if (status.phase === null || status.phase === "stopping" || status.phase === "finalized")
      endFollow();
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
  /** The editor's view of a take in the lesson window (background work waits for it too). */
  const webState = (active: boolean): void => {
    scheduler.setRecording(active, { hold: settings.pauseBackground });
    const w = main();
    if (w && !w.isDestroyed())
      w.webContents.send("recorder:state", {
        phase: active ? "recording" : null,
        failed: [],
        closed: false,
        reopening: false,
        holdBackground: scheduler.state().holding,
      } satisfies RecorderStatus);
  };
  /** Ends the take in the lesson window and hands it to the editor, with where the plan stopped. */
  const stopWeb = async (): Promise<{ result: RecordingResult; run: GuidedRunRecord }> => {
    const current = web;
    if (!current) throw new Error("Nenhuma gravação guiada em andamento.");
    try {
      const result = await current.take.stop();
      const granted = await grantTake({
        ...result,
        ...(current.replace ? { replaceAsset: current.replace } : {}),
      });
      main()?.webContents.send("recorder:done", granted);
      const end = current.take.outcome;
      const run: GuidedRunRecord = {
        planId: current.plan.id,
        step: end?.status === "done" ? current.plan.steps.length : (end?.step ?? current.from),
        status:
          end?.status === "done"
            ? "done"
            : end?.message && end.message !== STOPPED
              ? "failed"
              : "stopped",
        dir: result.dir,
        at: Date.now(),
      };
      return { result: granted, run };
    } catch (error) {
      // Nothing was recorded (the page never opened): the empty folder goes.
      if (error instanceof Error && error.message === "Nada foi gravado.")
        await rm(current.take.dir, { recursive: true, force: true });
      throw error;
    } finally {
      current.job.finish();
      if (web === current) web = null;
      webState(false);
    }
  };
  const endWeb = async (): Promise<void> => {
    const current = web;
    if (!current) return;
    web = null;
    await current.take.cancel();
    current.job.finish();
    webState(false);
    await shell
      .trashItem(current.take.dir)
      .catch(() => rm(current.take.dir, { recursive: true, force: true }));
  };

  rec.subscribe((message) => {
    if (message.type === "status") onStatus(message.status);
    else if (message.type === "event") overlay?.webContents.send("recorder:event", message.event);
    else if (message.type === "health")
      overlay?.webContents.send("recorder:health", message.health);
    else if (message.type === "follow") follower?.feed(message.chunk, message.at);
    else follower?.setLine(message.index, message.at);
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
    endFollow();
    verifying?.abort();
    marking?.cancel();
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

  ipcMain.handle("recorder:open", async (_e, raw: unknown) => {
    const ctx: RecorderContext = contextSchema.parse(raw);
    // A take under way belongs to the lesson it started in.
    if (overlay && (rec.isRecording() || web) && ctx.projectId !== context.projectId)
      throw new Error("O gravador está gravando outra aula. Termine o take antes de trocar.");
    // Plans edited before a crash come back from their draft.
    const draft = await readGuidedDraft(ctx.projectId ?? NO_PROJECT);
    const guidedPlans = newestGuided(ctx.guided, draft);
    context = { ...ctx, ...(guidedPlans ? { guided: guidedPlans } : {}) };
    if (guidedPlans && guidedPlans !== ctx.guided && ctx.projectId)
      main()?.webContents.send("recorder:guided", { projectId: ctx.projectId, store: guidedPlans });
    if (overlay) {
      // Already open: it takes the new lesson's plans (or the media to record again).
      overlay.webContents.send("recorder:contextChanged");
      return overlay.focus();
    }
    await loadSettings;
    settings = await readRecorderSettings();
    finishing = null;
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
      // A take in the lesson window under way is saved, like any take.
      if (web)
        stopWeb().catch((error: unknown) =>
          alertMain({
            message: `A gravação guiada não pôde ser finalizada: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      // A take under way is saved (what the computer's sound already sent is on disk); one
      // still being prepared, or in its countdown, has nothing worth keeping.
      if (rec.isPreparing() || rec.status().phase === "prepared") void rec.cancel();
      else if (rec.isRecording())
        // A failure has already reached the editor through finishTake.
        finishTake().catch(() => undefined);
      close();
    });
    // The recorder's page died (not the app): what was recorded is kept, and the editor says so.
    overlay.webContents.on("render-process-gone", (_e, details) => {
      if (rec.isRecording() && rec.status().phase !== "prepared") void rec.preserve();
      alertMain({
        message: `A janela do gravador fechou de repente (${details.reason}). O que foi gravado está sendo salvo e entra no projeto.`,
      });
      const o = overlay;
      if (o && !o.isDestroyed()) o.close();
    });
    registerHotkeys(OPEN_HOTKEYS);
    w?.hide();
  });
  ipcMain.handle("recorder:hotkeys", () => [...reports.values()]);
  ipcMain.handle("recorder:settings", async () => {
    await loadSettings;
    return settings;
  });
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
  /**
   * The teleprompter moved to a line: by a shortcut (now), or because the voice finished the line
   * before (`at`: the QPC moment its last word ended, sent with recorder:follow).
   */
  ipcMain.handle("recorder:teleprompterLine", (_e, index: unknown, at: unknown) =>
    rec.teleprompterLine(
      z.int().nonnegative().max(100000).parse(index),
      z.number().finite().positive().optional().parse(at),
    ),
  );
  /** The main process's clock (QPC ms), for the recorder window to convert its own. */
  ipcMain.handle("recorder:clock", () => qpc());
  /** "Tela sobre a narração": the voice heard at timeline second `at` at QPC `when`. */
  ipcMain.handle("recorder:overAnchor", (_e, at: unknown, when: unknown) =>
    rec.overAnchor(
      z.number().finite().nonnegative().parse(at),
      z.number().finite().positive().parse(when),
    ),
  );
  /** The lesson's voice as one file, from a little before the point it plays from. */
  ipcMain.handle("recorder:narration", async () => {
    const over = context.over;
    if (!over) throw new Error("Abra o gravador pelo editor, com a faixa Voz na aula.");
    const start = Math.max(0, over.from - 2);
    const end = Math.max(
      start + 0.1,
      over.to !== undefined ? Math.min(over.end, over.to + 1) : over.end,
    );
    return { path: await renderVoiceCached(over.segments, start, end), start };
  });
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
    return grantTake(result);
  });
  /** The editor placed the take in a project: the journal says so and it is not offered again. */
  ipcMain.handle("recorder:imported", (_e, dir: unknown) =>
    rec.markImported(z.string().min(1).max(32768).parse(dir)),
  );
  /** F10 or "Parar": the take ends here; the computer's sound is then finished and sent. */
  ipcMain.handle("recorder:halt", () => rec.preserve());
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
        title: "Escolher a narração (áudio ou vídeo)",
        properties: ["openFile"],
        filters: [
          {
            name: "Narração · áudio ou vídeo",
            extensions: ["mp4", "mov", "m4v", "wav", "mp3", "m4a", "aac", "ogg", "flac", "webm"],
          },
        ],
      });
      const path = result.canceled ? undefined : result.filePaths[0];
      if (!path) return null;
      const prepared = await prepareGuidedNarration(path);
      // The voice of a video (the presenter's render): the take records where it came from.
      if (prepared !== path) narrationsFromVideo.add(prepared);
      return prepared;
    } finally {
      overlay?.setAlwaysOnTop(true, "screen-saver");
    }
  });
  ipcMain.handle("recorder:guidedBrowser", async (_e, url: string) => {
    if (rec.isRecording()) throw new Error("Abra a aula antes de gravar.");
    browsing = true;
    overlay?.hide();
    try {
      await openGuidedBrowser(url, hotkeyLabel(settings.hotkeys.guidedTarget), () => {
        // Closing the lesson window goes back to the recorder, as the shortcut does.
        if (!browsing) return;
        browsing = false;
        overlay?.show();
        overlay?.setIgnoreMouseEvents(false);
      });
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
  /** Runs a screen plan (the Windows pointer) over the take being recorded. */
  ipcMain.handle("recorder:guidedStart", async (_e, raw: unknown) => {
    if (!rec.isRecording() || guided) throw new Error("Gravação guiada indisponível.");
    const plan: GuidedPlanV2 = guidedPlanV2Schema.parse(raw);
    if (plan.mode !== "screen") throw new Error("Este plano é da janela da aula.");
    const schedule = schedulePlan(plan);
    const bounds = captureBounds;
    const inside = (p: { x: number; y: number }): boolean =>
      !!bounds &&
      p.x >= bounds.x &&
      p.y >= bounds.y &&
      p.x < bounds.x + bounds.width &&
      p.y < bounds.y + bounds.height;
    const targets = plan.steps.flatMap((s) => [
      s.target?.screen,
      s.to?.target?.screen,
      s.to?.point?.space === "screen" ? s.to.point : undefined,
    ]);
    if (!bounds || targets.some((t) => t && !inside(t)))
      throw new Error(
        "Há um alvo fora da região gravada. Ajuste a região ou marque o alvo novamente.",
      );
    // Only a narration the teacher picked (or the project opened) is read.
    if (plan.audio) await desktopFiles.assertRead(plan.audio.path);
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
        ? (await rec.setGuidedNarration(
            plan.audio.path,
            1 + schedule.lead,
            narrationsFromVideo.has(plan.audio.path),
          )) - schedule.lead
        : rec.elapsed() + 1;
      if (state.controller.signal.aborted || !rec.isRecording())
        throw new Error("Gravação interrompida.");
      overlay?.hide();
      const resolveTarget = async (target: GuidedTarget): Promise<GuidedTarget> => {
        const found = await resolveBrowserTarget(target);
        if (!inside(found)) throw new Error("O elemento saiu da região gravada.");
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
      const signal = state.controller.signal;
      const paused = (): boolean => state.paused;
      const clock = screenClock(() => rec.elapsed() - origin, paused, signal);
      const driver = new HelperDriver({ input: state.input, clock, paused, signal, resolveTarget });
      void runGuided(plan, driver, clock, signal)
        .then(() => {
          if (!signal.aborted) overlay?.webContents.send("recorder:hotkey", "guided-done");
        })
        .catch(async (err: unknown) => {
          if (signal.aborted) return;
          state.paused = true;
          await rec.pause().catch(() => {});
          if (signal.aborted) return;
          overlay?.show();
          overlay?.setIgnoreMouseEvents(false);
          overlay?.webContents.send(
            "recorder:hotkey",
            `guided-error:${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => state.input.close());
      return { origin, lead: schedule.lead };
    } catch (err) {
      endGuided();
      throw err;
    }
  });

  // ---- the lesson window: plans, marking, verification and its own takes ----
  /** The plans as edited in the recorder: kept for the next open, drafted, sent to the editor. */
  ipcMain.handle("recorder:guidedSave", async (_e, raw: unknown, rawProject: unknown) => {
    const store = guidedStoreSchema.parse(raw);
    // The plans belong to the lesson the recorder loaded them from, never to one opened since.
    const projectId = z.string().min(1).max(200).nullable().parse(rawProject);
    if (projectId !== (context.projectId ?? null))
      throw new Error(
        "Estes planos são de outra aula. Feche o gravador e abra-o de novo pela aula certa.",
      );
    context = { ...context, guided: store };
    await writeGuidedDraft(context.projectId ?? NO_PROJECT, store);
    if (context.projectId)
      main()?.webContents.send("recorder:guided", { projectId: context.projectId, store });
  });
  /**
   * A take of a recorder opened without a lesson went into one the editor made for it: the plans
   * go with it, and the recorder saves to that lesson from now on.
   */
  ipcMain.handle("recorder:guidedAdopt", async (_e, raw: unknown) => {
    const projectId = z.string().min(1).max(200).parse(raw);
    if (context.projectId) return context.projectId === projectId ? context.guided : null;
    const store = context.guided;
    context = { ...context, projectId };
    if (store) await writeGuidedDraft(projectId, store);
    overlay?.webContents.send("recorder:contextChanged");
    return store ?? null;
  });
  ipcMain.handle("recorder:guidedMark", async (_e, raw: unknown, rawViewport: unknown) => {
    const purpose = z.enum(MARK_PURPOSES).parse(raw);
    const viewport = z
      .object({ width: z.int().min(320).max(3840), height: z.int().min(240).max(2160) })
      .parse(rawViewport);
    if (marking || picking) throw new Error("Já há um alvo sendo marcado.");
    if (rec.isRecording() || web) throw new Error("Marque os alvos antes de gravar.");
    const session = await markInLesson(
      purpose,
      hotkeyLabel(settings.hotkeys.guidedTarget),
      viewport,
    );
    marking = session;
    overlay?.hide();
    try {
      return await session.result;
    } finally {
      marking = null;
      overlay?.show();
      overlay?.setIgnoreMouseEvents(false);
      overlay?.focus();
    }
  });
  ipcMain.handle("recorder:guidedVerify", async (_e, raw: unknown) => {
    const plan: GuidedPlanV2 = guidedPlanV2Schema.parse(raw);
    if (plan.mode !== "web")
      throw new Error("Só os planos da janela da aula podem ser verificados.");
    if (verifying || web || rec.isRecording())
      throw new Error("Uma gravação ou verificação já está em andamento.");
    const controller = new AbortController();
    verifying = controller;
    try {
      return await verifyGuidedPlan(plan, controller.signal, (step) =>
        overlay?.webContents.send("recorder:guidedStatus", {
          phase: "preparing",
          step,
          steps: plan.steps.length,
          time: 0,
          duration: 0,
        }),
      );
    } finally {
      if (verifying === controller) verifying = null;
    }
  });
  ipcMain.handle("recorder:guidedVerifyCancel", () => verifying?.abort());
  /** The encoder detected for the recorder's screen, taking frames from memory (x264 otherwise). */
  const webCodec = async (fps: number): Promise<CaptureCodec> => {
    const b = overlay?.getBounds();
    const monitor =
      (b && monitors.find((m) => m.dip?.x === b.x && m.dip?.y === b.y)) ??
      monitors.find((m) => m.primary);
    if (!monitor || monitor.output < 0) return "libx264";
    return detectCaptureEncoder(rec.captureProfile(monitor, fps)).then(
      (encoder) => encoder.codec,
      () => "libx264" as const,
    );
  };
  ipcMain.handle("recorder:guidedWebStart", async (_e, raw: unknown, rawFrom: unknown) => {
    const plan: GuidedPlanV2 = guidedPlanV2Schema.parse(raw);
    const from = z.int().nonnegative().max(300).parse(rawFrom);
    if (plan.mode !== "web") throw new Error("Este plano é de tela.");
    schedulePlan(plan, from);
    // Only a narration the teacher picked (or the project opened) is copied into the take.
    if (plan.audio) await desktopFiles.assertRead(plan.audio.path);
    if (web || verifying || rec.isRecording() || rec.isPreparing())
      throw new Error("Uma gravação já está em andamento.");
    const missing = REQUIRED_HOTKEYS.filter((action) => !registered.has(action));
    if (missing.length)
      throw new Error(
        `Os atalhos de ${missing.map((a) => HOTKEY_LABELS[a].toLowerCase()).join(" e ")} não puderam ser registrados. Troque-os nas opções do gravador antes de gravar.`,
      );
    // "Regravar e substituir": the same plan, from the same step, with the same times.
    const again = context.guidedReplace;
    if (
      again &&
      again.planId === plan.id &&
      (planTiming(plan) !== again.timing || from !== again.from)
    )
      throw new Error(
        `Os tempos do plano mudaram desde a gravação de “${again.assetName}”: grave um take novo em vez de substituir.`,
      );
    const replace =
      context.guidedReplace && context.guidedReplace.planId === plan.id
        ? context.guidedReplace.assetId
        : undefined;
    const codec = await webCodec(plan.fps ?? 30);
    const take = new GuidedTake({
      plan,
      from,
      dir: rec.createTakeDir(),
      ffmpeg: FFMPEG,
      encoder: { codec, quality: settings.quality },
      onStatus: (status) => overlay?.webContents.send("recorder:guidedStatus", status),
    });
    const job = desktopJobs.begin({
      preserveForMs: 0,
      stop: async () => {
        overlay?.webContents.send("recorder:hotkey", "preserve");
        await stopWeb().catch(() => undefined);
      },
    });
    web = { take, job, plan, from, ...(replace ? { replace } : {}) };
    webState(true);
  });
  ipcMain.handle("recorder:guidedWebPause", () => web?.take.pause());
  ipcMain.handle("recorder:guidedWebResume", () => web?.take.resume());
  ipcMain.handle("recorder:guidedWebStop", () => stopWeb());
  ipcMain.handle("recorder:guidedWebDiscard", () => endWeb());

  ipcMain.handle("recorder:sources", async () => {
    const s = await rec.captureSources();
    monitors = s.monitors.map((m) => ({ ...m, dip: dipRect(m) }));
    const b = overlay?.getBounds();
    const current = b ? monitors.find((m) => m.dip!.x === b.x && m.dip!.y === b.y) : undefined;
    return { ...s, monitors, current: current?.index ?? null };
  });
  /** Tried in the background while the recorder is set up, not during the countdown. */
  ipcMain.handle("recorder:encoder", async (_e, index: unknown, fps: unknown) => {
    const monitor = monitors.find((m) => m.index === z.int().nonnegative().parse(index));
    if (!monitor) throw new Error("Tela não encontrada.");
    // The rate on screen now, not the one saved half a second from now.
    return rec.encoderFor(monitor, z.union([z.literal(30), z.literal(60)]).parse(fps));
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
    if (opts.mode === "voice") {
      // Voice only: no screen, camera or computer sound.
      opts.monitor = undefined;
      opts.camera = undefined;
      opts.cameraMode = undefined;
      opts.systemAudio = false;
      opts.keys = false;
    }
    if (opts.mode !== "voice") opts.follow = undefined;
    if (opts.mode !== "over") opts.over = undefined;
    await rec.prepare({ ...opts, region }, monitors, {
      // Keys typed in the lesson window still show on screen; it belongs to this process too.
      keyWindows: guidedBrowserWindowIds(),
      keyFilter: toKeyFilter(settings.hotkeys, settings.clicker),
    });
    if (opts.mode === "voice" && opts.follow) void startFollow();
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
      return await finishTake();
    } finally {
      close();
    }
  });
}
