import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { CameraChoice, CameraMode } from "@shared/camera";
import {
  type GuidedReplace,
  type GuidedStore,
  type GuidedTakeStatus,
  MAX_RUNS,
  storeProblem,
} from "@shared/guidedPlan";
import { HOTKEY_LABELS, type HotkeyReport, hotkeyLabel } from "@shared/hotkeys";
import { NOTE_MAX } from "@shared/markers";
import { lapseEnd, overEnd } from "@shared/overNarration";
import { joinStretches } from "@shared/phrase";
import { plural } from "@shared/plural";
import type { RecorderSettings } from "@shared/recorderSettings";
import type {
  CaptureMonitor,
  CaptureSources,
  CaptureWindow,
  FrameEvent,
  OverContext,
  RecorderContext,
  RecorderEvent,
  RecorderStatus,
} from "@shared/recording";
import type { MicLevel, RecorderHealth } from "@shared/recordingHealth";
import {
  dipToPhysical,
  monitorOfWindow,
  physicalToDip,
  presetRegion,
  REGION_PRESETS,
  type RegionPreset,
  type RegionRect,
  type RegionSize,
  resizeRegion,
  snapToWindow,
} from "@shared/region";
import { type LineCoverage, type ScreenCoverage, screenCoverage } from "@shared/screenCues";
import { systemAudioPlan } from "@shared/systemAudio";
import { type PrompterLine, readLines, stepLine, voiceSpeakers } from "@shared/voiceTakes";
import {
  AlertTriangle,
  Bookmark,
  Eye,
  EyeOff,
  FastForward,
  Keyboard,
  Loader,
  MessageSquarePlus,
  Mic,
  MonitorUp,
  MousePointer2,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  ScanLine,
  ScrollText,
  Settings2,
  Square,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { DrawLayer, drawing } from "./DrawLayer";
import { GuidedSetup, guidedProblem } from "./GuidedSetup";
import { GuidedWebPanel } from "./GuidedWebPanel";
import { HealthStrip, LevelBars } from "./HealthStrip";
import { OverPlayer } from "./overPlayer";
import { CameraModeSelect, RecorderOptions } from "./RecorderOptions";
import { type Rect, RegionFrame } from "./RegionFrame";
import { SystemAudio } from "./systemAudio";
import { resendUiRects, useUiRect } from "./uiRects";
import { KaraokePrompter, MicTest, SpeakerChips, VoicePrompter } from "./VoiceTools";
import { WindowPicker } from "./WindowPicker";

type Phase = "setup" | "countdown" | "recording" | "paused" | "saving";
type Line = PrompterLine;
/** What is being recorded: the screen (by hand or guided), the voice alone, the voice with the
 *  camera filming the presenter, or the screen over the lesson's voice. */
type Mode = "screen" | "guided" | "voice" | "voicecam" | "over";
const MODES: readonly Mode[] = ["screen", "voice", "voicecam", "over", "guided"];

const clockOf = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const cleanError = (err: unknown): string =>
  String((err as Error)?.message ?? err).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

const fullWindow = (): Rect => ({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

/** This window's size, in its own pixels (DIP). */
const windowSize = (): RegionSize => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * The recorded monitor in window pixels (DIP): the region is drawn in these, by this window when
 * it covers that monitor or by the frame over it when the controls are on another one.
 */
const stageOf = (monitor: CaptureMonitor | null): RegionSize =>
  monitor?.dip ? { width: monitor.dip.width, height: monitor.dip.height } : windowSize();

/** The whole recorded monitor as a region. */
const fullStage = (monitor: CaptureMonitor | null): Rect => ({ x: 0, y: 0, ...stageOf(monitor) });

/** The monitor in physical pixels; the window's own size until it is known. */
const physicalOf = (monitor: CaptureMonitor | null): RegionSize =>
  monitor ? { width: monitor.width, height: monitor.height } : windowSize();

/** A rectangle of physical pixels of the monitor, in window pixels of that monitor. */
const toWindow = (rect: RegionRect, monitor: CaptureMonitor | null): Rect =>
  physicalToDip(rect, physicalOf(monitor), stageOf(monitor));

/**
 * The region the settings ask for on this screen (shared/region.ts presets in physical pixels):
 * a custom rectangle if it still fits, else the whole screen.
 */
function regionFrom(
  settings: RecorderSettings,
  monitor: CaptureMonitor | null,
  lesson: RegionSize | undefined,
): Rect {
  const r = settings.region;
  const stage = stageOf(monitor);
  if (r.preset === "custom" && r.rect) {
    const { x, y, width, height } = r.rect;
    if (x + width <= stage.width + 0.5 && y + height <= stage.height + 0.5)
      return { x, y, width, height };
  }
  const physical = physicalOf(monitor);
  const preset = presetRegion(r.preset, physical, lesson) ?? presetRegion("full", physical);
  return preset ? toWindow(preset, monitor) : fullStage(monitor);
}

/** The region in physical pixels of the monitor, as the capture will record it. */
function regionPhysical(region: Rect, monitor: CaptureMonitor | null): RegionRect {
  const physical = physicalOf(monitor);
  return (
    dipToPhysical(region, physical, stageOf(monitor)) ?? {
      x: 0,
      y: 0,
      width: Math.floor(physical.width / 2) * 2,
      height: Math.floor(physical.height / 2) * 2,
    }
  );
}

/** After the voice ends, the part waits this long before saving itself: the last click counts. */
const VOICE_END_GRACE_MS = 1500;

/** Where the lesson's voice starts on the timeline. */
const voiceStart = (over: OverContext): number => over.segments[0]?.start ?? 0;

/** A part from `over.from` records over a screen already there: it starts inside one. */
const overwrites = (over: OverContext, recorded: readonly [number, number][]): boolean =>
  over.to === undefined && recorded.some(([a, b]) => a <= over.from + 0.05 && b > over.from + 0.05);

/** The editor's answer about a part of "Tela sobre a narração" it was handed. */
interface PartResult {
  ok: boolean;
  message?: string;
}
/** Answers that came before they were waited for, by take folder. */
const partResults = new Map<string, PartResult>();
const partWaiters = new Map<string, (result: PartResult) => void>();
let listeningParts = false;
function listenParts(): void {
  if (listeningParts) return;
  listeningParts = true;
  window.api.recorder.onPartResult(({ dir, ...result }) => {
    const waiter = partWaiters.get(dir);
    if (!waiter) partResults.set(dir, result);
    else {
      partWaiters.delete(dir);
      waiter(result);
    }
  });
}
/** Waits for the editor to place the part in `dir` in the lesson (a failure after `ms`). */
function partPlaced(dir: string, ms = 180_000): Promise<PartResult> {
  listenParts();
  const ready = partResults.get(dir);
  if (ready) {
    partResults.delete(dir);
    return Promise.resolve(ready);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      partWaiters.delete(dir);
      resolve({ ok: false, message: "o editor não respondeu" });
    }, ms);
    partWaiters.set(dir, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

/** The region select: each preset, the window it was fitted to, or what was drawn by hand. */
type RegionChoice = RegionPreset | "window";

/**
 * Lets clicks reach the recorder's own controls while everything else goes to the apps
 * underneath, and tells the cursor helper where they are (the pointer over them is not part of
 * the video).
 */
/** What a screen reader calls each group of the recorder's controls. */
const GROUP_LABELS: Record<string, string> = {
  pill: "Controles da gravação",
  alert: "Aviso da gravação",
  "voice-prompter": "Falas da gravação de voz",
  karaoke: "Narração que está tocando",
  teleprompter: "Teleprompter",
};

function Interactive({
  children,
  className,
  active,
  id,
}: {
  children: ReactNode;
  className?: string;
  active: boolean;
  id: string;
}): ReactNode {
  const ref = useUiRect<HTMLFieldSetElement>(id);
  return (
    <fieldset
      ref={ref}
      className={className}
      aria-label={GROUP_LABELS[id] ?? "Controles do gravador"}
      onMouseEnter={() => active && void window.api.recorder.interactive(true)}
      // While drawing, the whole window keeps the mouse (the pen is on it).
      onMouseLeave={() => active && !drawing.on && void window.api.recorder.interactive(false)}
    >
      {children}
    </fieldset>
  );
}

export function RecorderOverlay(): ReactNode {
  const [sources, setSources] = useState<(CaptureSources & { current: number | null }) | null>(
    null,
  );
  const [settings, setSettings] = useState<RecorderSettings | null>(null);
  // Read by callbacks that outlive the render they were made in.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [monitor, setMonitor] = useState<CaptureMonitor | null>(null);
  const [region, setRegion] = useState<Rect>(fullWindow);
  /** The controls are on another monitor; the frame shows the region over the recorded one. */
  const [split, setSplit] = useState(false);
  const splitRef = useRef(split);
  splitRef.current = split;
  /** What the region select shows. */
  const [regionChoice, setRegionChoice] = useState<RegionChoice>("full");
  /** "Janela…": the window the region was fitted to, followed during the take. */
  const [followed, setFollowed] = useState<{ window: CaptureWindow; front: boolean } | null>(null);
  const [windowPicker, setWindowPicker] = useState(false);
  /** The lesson's frame and colors (RecorderContext). */
  const [lesson, setLesson] = useState<RecorderContext["lesson"]>();
  const [palette, setPalette] = useState<string[]>([]);
  /** Drawing on the screen during the take. */
  const [drawOn, setDrawOn] = useState(false);
  /** The pill asks before a discard (the take goes to the Recycle Bin). */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const drawAllowed = useRef(false);
  const [mic, setMic] = useState<string>("");
  /** The camera of the screen modes and the presenter's camera of "Voz e câmera", each kept. */
  const [screenCam, setScreenCam] = useState<string>("");
  const [presenterCam, setPresenterCam] = useState<string>("");
  const [camModes, setCamModes] = useState<{
    modes: CameraMode[];
    choice: CameraChoice | null;
  } | null>(null);
  const [level, setLevel] = useState<MicLevel | null>(null);
  const [mode, setMode] = useState<Mode>("screen");
  const guidedMode = mode === "guided";
  /** "Só voz" and "Voz e câmera": the voice read line by line, without the screen. */
  const voiceMode = mode === "voice" || mode === "voicecam";
  const voiceCam = mode === "voicecam";
  /** The camera of the mode on screen. */
  const cam = voiceCam ? presenterCam : screenCam;
  const camModeSetting = (voiceCam ? settings?.presenterCameraMode : settings?.cameraMode) ?? null;
  /** "Tela sobre a narração": the lesson's voice as the editor handed it over. */
  const [over, setOver] = useState<OverContext | null>(null);
  const [notes, setNotes] = useState<{ before: number; text: string }[]>([]);
  /** Speakers whose lines the voice take reads. */
  const [speakerOn, setSpeakerOn] = useState<Set<string>>(new Set());
  /** "Regravar falas": only these lines, in "Só voz" (RecorderContext.retakeLines). */
  const [retake, setRetake] = useState<number[] | null>(null);
  /** Over the narration the microphone is off unless chosen here. */
  const [overMic, setOverMic] = useState("");
  /** Parts of "Tela sobre a narração" saved since the recorder opened (it stays open between them). */
  const [overParts, setOverParts] = useState(0);
  /** Where the lesson has a recorded screen (from the editor, and each part saved since). */
  const [recorded, setRecorded] = useState<[number, number][]>([]);
  // Read by stop(), which outlives the render it was made in.
  const recordedRef = useRef(recorded);
  recordedRef.current = recorded;
  /** "Voltar ao começo da fala": the next part starts there instead of where this one ends. */
  const restartAt = useRef<number | null>(null);
  const overRef = useRef(over);
  overRef.current = over;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [follow, setFollow] = useState<{ state: string; message: string } | null>(null);
  /** Timeline second of the voice being heard, while it plays. */
  const [heard, setHeard] = useState<number | null>(null);
  const player = useRef<OverPlayer | null>(null);
  /** The lesson's plans (project.guided), saved a second after each change. */
  const [guidedStore, setGuidedStore] = useState<GuidedStore>({ plans: [] });
  const guidedStoreRef = useRef(guidedStore);
  guidedStoreRef.current = guidedStore;
  /** The plans as last sent to the main process. */
  const savedStore = useRef<GuidedStore | null>(null);
  /** The lesson the plans were loaded from: every save goes back to it. */
  const loadedProject = useRef<string | null>(null);
  const [planId, setPlanId] = useState("");
  const guidedPlan = guidedStore.plans.find((p) => p.id === planId);
  /** "Regravar e substituir": the media this take replaces. */
  const [replace, setReplace] = useState<GuidedReplace | undefined>();
  const [guidedBusy, setGuidedBusy] = useState(false);
  /** A take in the lesson window, captured offscreen. */
  const [web, setWeb] = useState<{ status: GuidedTakeStatus | null; stopping: boolean } | null>(
    null,
  );
  const webRef = useRef(web);
  webRef.current = web;
  const [optionsOpen, setOptionsOpen] = useState(false);
  /** "Tela sobre a narração": the map of the lines is open. */
  const [mapOpen, setMapOpen] = useState(false);
  /** "Tela sobre a narração": the voice played to its end; the closing step is shown. */
  const [overDone, setOverDone] = useState(false);
  /** "Trecho acelerado": where the voice is waiting while the screen goes on. */
  const lapse = useRef<{ at: number } | null>(null);
  const [lapsing, setLapsing] = useState(false);
  /** The part saving itself after the voice ended (stopping by hand first cancels it). */
  const voiceEnded = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The teacher picked a mode: the one remembered, arriving later, does not take its place. */
  const modePicked = useRef(false);
  const guidedFailed = useRef(false);
  const preservationRequested = useRef(false);
  const guidedAudio = useRef<HTMLAudioElement | null>(null);
  const guidedOffset = useRef<number | null>(null);
  const system = useRef<SystemAudio | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(3);
  const [markers, setMarkers] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A source stopped or the disk filled: what happened and what can be done. */
  const [alert, setAlert] = useState<RecorderEvent | null>(null);
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [health, setHealth] = useState<RecorderHealth | null>(null);
  const [hotkeys, setHotkeys] = useState<HotkeyReport[]>([]);
  /** The encoder tested for this monitor while the recording is set up. */
  const [encoder, setEncoder] = useState<{ label?: string; error?: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [line, setLine] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const change = useCallback((patch: Partial<RecorderSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
  }, []);

  // Settings and sources: what was chosen last time comes back when the device is still there.
  useEffect(() => {
    document.documentElement.classList.add("is-recorder");
    // Before any part is handed over: the editor's answer may come before it is waited for.
    listenParts();
    const load = (): Promise<void> =>
      window.api.recorder.context().then((c) => {
        loadedProject.current = c.projectId ?? null;
        setLesson(c.lesson);
        setPalette(c.palette ?? []);
        setLines(c.teleprompter);
        setNotes(c.screenNotes ?? []);
        setOver(c.over ?? null);
        setRecorded(c.over?.recorded ?? []);
        setSpeakerOn(
          new Set(
            voiceSpeakers(c.teleprompter)
              .filter((v) => v.on)
              .map((v) => v.name),
          ),
        );
        if (c.mode === "over" && c.over) setMode("over");
        // "Gravar a voz" in the lesson's steps opens straight in a voice mode.
        else if (c.mode === "voice" || c.mode === "voicecam") setMode(c.mode);
        const store = c.guided ?? { plans: [] };
        savedStore.current = store;
        setGuidedStore(store);
        setReplace(c.guidedReplace);
        setPlanId(c.guidedReplace?.planId ?? store.plans[0]?.id ?? "");
        if (c.guidedReplace) setMode("guided");
        const only = (c.retakeLines ?? []).filter((i) => i < c.teleprompter.length);
        setRetake(only.length ? only : null);
        if (only.length) {
          setMode("voice");
          setLine(only[0]);
        }
      });
    void load();
    // Opened again for another lesson (or a media to record again): its plans replace these.
    const offContext = window.api.recorder.onContextChanged(() => void load());
    // The voice's transcript got ready: the karaoke, the lines and the cues, nothing else.
    const offText = window.api.recorder.onOverText((text) =>
      setOver((o) => (o ? { ...o, ...text } : o)),
    );
    void Promise.all([window.api.recorder.sources(), window.api.recorder.settings()]).then(
      ([s, saved]) => {
        setSources(s);
        setSettings(saved);
        const remembered = saved.recordMode;
        if (remembered !== "screen" && !modePicked.current)
          setMode((m) => (m === "screen" ? remembered : m));
        const wanted = saved.monitor;
        const rememberedMonitor = wanted
          ? s.monitors.find(
              (m) =>
                m.x === wanted.x &&
                m.y === wanted.y &&
                m.width === wanted.width &&
                m.height === wanted.height,
            )
          : undefined;
        const m =
          rememberedMonitor ??
          s.monitors.find((x) => x.index === s.current) ??
          s.monitors.find((x) => x.primary) ??
          s.monitors[0];
        // The window goes to it (and the controls to another monitor) below, once the mode is known.
        setMonitor(m ?? null);
        // "" was "Sem áudio" on purpose; a microphone that is gone gives way to the first one.
        setMic(
          saved.microphone === ""
            ? ""
            : saved.microphone && s.microphones.includes(saved.microphone)
              ? saved.microphone
              : (s.microphones[0] ?? ""),
        );
        setScreenCam(saved.camera && s.cameras.includes(saved.camera) ? saved.camera : "");
        setPresenterCam(
          saved.presenterCamera && s.cameras.includes(saved.presenterCamera)
            ? saved.presenterCamera
            : "",
        );
        setRegionChoice(saved.region.preset);
        // The lesson's size comes with the context, which may still be on its way.
        void window.api.recorder
          .context()
          .then((c) => setRegion(regionFrom(saved, m ?? null, c.lesson)));
      },
    );
    void window.api.recorder.hotkeys().then(setHotkeys);
    return () => {
      offContext();
      offText();
    };
  }, []);

  // The plans go to the main process (draft, then the project) a second after the last change,
  // once every value in them is valid; until then the screen says what to fix.
  const [planProblem, setPlanProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!savedStore.current || guidedStore === savedStore.current) return;
    const problem = storeProblem(guidedStore);
    setPlanProblem(problem);
    if (problem) return;
    const id = setTimeout(() => {
      savedStore.current = guidedStore;
      void window.api.recorder
        .guidedSave(guidedStore, loadedProject.current)
        .catch((err: unknown) => setError(`Não consegui salvar o plano: ${cleanError(err)}`));
    }, 1000);
    return () => clearTimeout(id);
  }, [guidedStore]);

  // Saved half a second after the last change.
  useEffect(() => {
    if (!settings) return;
    const id = setTimeout(() => {
      void window.api.recorder
        .saveSettings(settings)
        .catch((err: unknown) => setError(`Não consegui salvar as opções: ${cleanError(err)}`));
    }, 500);
    return () => clearTimeout(id);
  }, [settings]);

  useEffect(() => {
    const offs = [
      window.api.recorder.onHotkeys(setHotkeys),
      window.api.recorder.onHealth(setHealth),
      window.api.recorder.onLevel(setLevel),
      window.api.recorder.onStatus(setStatus),
      window.api.recorder.onFollowState(setFollow),
      window.api.recorder.onEvent((event) => {
        if (event.request === "stop") preservationRequested.current = true;
        if (event.actions.length || event.level === "error") setAlert(event);
        else {
          setFlash(event.message);
          setTimeout(() => setFlash(null), 4000);
        }
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);

  // The take paused by itself (a source stopped, the disk is full): the window follows.
  useEffect(() => {
    if (!status) return;
    if (
      (status.phase === "paused" || status.phase === "failed") &&
      phaseRef.current === "recording"
    ) {
      guidedAudio.current?.pause();
      player.current?.pause();
      phaseRef.current = "paused";
      setPhase("paused");
    }
  }, [status]);

  // Encoders are tried on the real screen in the background, not during the countdown.
  const monitorIndex = monitor?.index;
  const fps = settings?.fps;
  useEffect(() => {
    // A voice take does not record the screen: nothing to test.
    if (monitorIndex === undefined || fps === undefined || voiceMode) return;
    let current = true;
    setEncoder(null);
    window.api.recorder.encoder(monitorIndex, fps).then(
      (label) => current && setEncoder({ label }),
      (err: unknown) => current && setEncoder({ error: cleanError(err) }),
    );
    return () => {
      current = false;
    };
  }, [monitorIndex, fps, voiceMode]);

  // The level meter listens to the very device the take will record.
  const meterMic = mode === "over" ? overMic : mic;
  useEffect(() => {
    if (phase !== "setup") return;
    setLevel(null);
    void window.api.recorder.monitorMic(meterMic || null);
    return () => {
      void window.api.recorder.monitorMic(null);
    };
  }, [meterMic, phase]);

  useEffect(() => {
    setCamModes(null);
    if (!cam) return;
    let current = true;
    window.api.recorder.cameraModes(cam, fps).then(
      (modes) => current && setCamModes(modes),
      () => current && setCamModes({ modes: [], choice: null }),
    );
    return () => {
      current = false;
    };
  }, [cam, fps]);

  // The recorder goes to the monitor chosen. With more than one, and the option on, the controls
  // go to another monitor and the one recorded keeps only the region's frame, free to use. A take
  // of the voice alone or in the lesson window records no screen: nothing to keep free.
  const wantSplit =
    !!settings?.controlsElsewhere &&
    (sources?.monitors.filter((m) => m.output >= 0).length ?? 0) > 1 &&
    !voiceMode &&
    !(guidedMode && guidedPlan?.mode === "web");
  const monitorIdx = monitor?.index;
  const settingsReady = !!settings;
  useEffect(() => {
    if (monitorIdx === undefined || !settingsReady) return;
    let current = true;
    window.api.recorder.moveTo(monitorIdx, wantSplit).then(
      // The region is in pixels of the recorded monitor (stageOf), set where the monitor is
      // chosen: moving the windows does not change it.
      ({ split: now }) => current && setSplit(now),
      (err: unknown) =>
        current && setError(`O gravador não passou para a outra tela: ${cleanError(err)}`),
    );
    return () => {
      current = false;
    };
  }, [monitorIdx, wantSplit, settingsReady]);

  // Drawing is for the take while it records: a pause, the stop or a discard turns it off. The
  // window takes the mouse while it is on, and the main process notes when (clicks are the pen).
  useEffect(() => {
    if (phase !== "recording" && drawOn) setDrawOn(false);
  }, [phase, drawOn]);
  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") setConfirmDiscard(false);
  }, [phase]);
  const drewBefore = useRef(false);
  useEffect(() => {
    if (drawOn === drewBefore.current) return;
    drewBefore.current = drawOn;
    // Turning it off always reaches the main process (a stop or a discard ends the drawing too);
    // back in setup or saving, the window already takes the mouse as it should.
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") {
      if (!drawOn) void window.api.recorder.drawMode(false);
      return;
    }
    void window.api.recorder.drawMode(drawOn);
    // Split, the pen is on the frame over the recorded screen (the main process gives it the
    // mouse): this window keeps letting clicks through outside its controls.
    if (splitRef.current) return;
    // Leaving the drawing with the pointer on a control (the pill's pause) keeps it clickable.
    const overControls = [...document.querySelectorAll(".rec-root fieldset")].some((el) =>
      el.matches(":hover"),
    );
    if (drawOn || !overControls) void window.api.recorder.interactive(drawOn);
  }, [drawOn]);

  // A new take only knows where the controls are once it is told.
  useEffect(() => {
    if (phase === "recording") resendUiRects();
  }, [phase]);

  /** A preset from the region select (shared/region.ts), in physical pixels of this monitor. */
  const pickRegion = (choice: RegionPreset): void => {
    const rect = presetRegion(choice, physicalOf(monitor), lesson);
    if (!rect) return;
    setRegionChoice(choice);
    setRegion(toWindow(rect, monitor));
    change({ region: { preset: choice } });
    if (followed) {
      setFollowed(null);
      void window.api.recorder.followWindow(null, false);
    }
  };
  /** The region drawn or typed by hand. */
  const customRegion = (r: Rect): void => {
    setRegion(r);
    setRegionChoice("custom");
    change({ region: { preset: "custom", rect: r } });
    if (followed) {
      setFollowed(null);
      void window.api.recorder.followWindow(null, false);
    }
  };
  /** Width or height typed in physical pixels, around the same center. */
  const typeSize = (size: Partial<RegionSize>): void => {
    if (!settings) return;
    const next = resizeRegion(
      regionPhysical(region, monitor),
      size,
      settings.regionLock,
      physicalOf(monitor),
    );
    customRegion(toWindow(next, monitor));
  };
  /** "Janela…": the region fitted to a window, which the take then follows. */
  const fitWindow = (w: CaptureWindow, front: boolean): void => {
    setWindowPicker(false);
    const rect = { x: w.x, y: w.y, width: w.width, height: w.height };
    const all = sources?.monitors ?? [];
    const index = monitorOfWindow(
      rect,
      all.map((m) => ({ x: m.x, y: m.y, width: m.width, height: m.height })),
    );
    const target = all[index] ?? monitor;
    const snapped = target
      ? snapToWindow(rect, { x: target.x, y: target.y, width: target.width, height: target.height })
      : null;
    if (!target || !snapped) {
      setError("Essa janela está fora das telas ou é pequena demais para gravar.");
      return;
    }
    setError(null);
    setFollowed({ window: w, front });
    setRegionChoice("window");
    void window.api.recorder.followWindow(w.hwnd, front);
    // On another monitor, the recorder follows it (the move effect above); the region is in that
    // monitor's pixels either way.
    const r = toWindow(snapped, target);
    setRegion(r);
    if (monitor && target.index !== monitor.index) {
      setMonitor(target);
      change({
        monitor: { x: target.x, y: target.y, width: target.width, height: target.height },
        region: { preset: "custom", rect: r },
      });
    } else change({ region: { preset: "custom", rect: r } });
  };

  const showFlash = useCallback((text: string): void => {
    setFlash(text);
    setTimeout(() => setFlash(null), 1400);
  }, []);

  /**
   * "Recado": a short note for whoever edits the lesson, at the moment it was opened. The pill
   * takes the keyboard while it is typed (keys typed here never show on screen) and gives it back
   * with Enter or Esc.
   */
  const [note, setNote] = useState<{ at: number; text: string } | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const noteRef = useRef(note);
  noteRef.current = note;
  const noteInput = useRef<HTMLInputElement>(null);
  const openNote = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    if (noteRef.current) {
      noteInput.current?.focus();
      return;
    }
    const at = await window.api.recorder.clock();
    setNote({ at, text: "" });
    await window.api.recorder.keyboard(true);
    requestAnimationFrame(() => noteInput.current?.focus());
  }, []);
  const closeNote = useCallback(
    async (save: boolean) => {
      const open = noteRef.current;
      if (!open) return;
      noteRef.current = null;
      setNote(null);
      const text = open.text.trim();
      if (save && text) {
        await window.api.recorder.note(open.at, text.slice(0, NOTE_MAX));
        setNoteCount((n) => n + 1);
        showFlash("Recado guardado para quem edita");
      }
      await window.api.recorder.keyboard(false);
    },
    [showFlash],
  );

  const moveLine = useCallback(
    (index: number, at?: number) => {
      const next = Math.max(0, Math.min(lines.length - 1, index));
      setLine(next);
      if (phaseRef.current === "recording" || phaseRef.current === "paused")
        void window.api.recorder.teleprompterLine(next, at);
    },
    [lines.length],
  );
  // The voice take reads only the chosen speakers' lines; the other modes, every line.
  const order = voiceMode ? (retake ?? readLines(lines, speakerOn)) : lines.map((_, i) => i);
  const orderRef = useRef(order);
  orderRef.current = order;
  const lineRef = useRef(line);
  lineRef.current = line;
  const stepTo = useCallback(
    (step: 1 | -1, at?: number) => moveLine(stepLine(orderRef.current, lineRef.current, step), at),
    [moveLine],
  );
  // A line left out by the speakers chosen gives way to the first one that is read.
  useEffect(() => {
    if (voiceMode && phase === "setup" && order.length && !order.includes(line)) setLine(order[0]);
  }, [voiceMode, phase, order, line]);
  // The voice finished the line on screen: the teleprompter moves on (main/voiceFollow.ts).
  useEffect(
    () =>
      window.api.recorder.onFollow(({ line: index, at }) => {
        // The new line starts where the voice ended the one before, not when this arrived.
        if (phaseRef.current === "recording" && lineRef.current === index) stepTo(1, at);
      }),
    [stepTo],
  );

  const finishSystemAudio = useCallback(async (): Promise<void> => {
    const s = system.current;
    system.current = null;
    await s?.finish();
  }, []);

  /** A take of the plan in the lesson window from step `from` (the page is captured offscreen). */
  const startWeb = useCallback(
    async (from: number) => {
      if (!guidedPlan || webRef.current || phaseRef.current !== "setup") return;
      const problem = guidedProblem(guidedPlan, from, replace);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      // The take runs the plan as it is now, handed to it below; the draft of the plans is
      // saved again with the next change should this save not go through.
      savedStore.current = guidedStoreRef.current;
      await window.api.recorder
        .guidedSave(guidedStoreRef.current, loadedProject.current)
        .catch(() => undefined);
      setWeb({ status: null, stopping: false });
      try {
        await window.api.recorder.guidedWebStart(guidedPlan, from);
      } catch (err) {
        setWeb(null);
        setError(cleanError(err));
      }
    },
    [guidedPlan, replace],
  );

  /** Saves the take in the lesson window and notes where the plan stopped. */
  const stopWeb = useCallback(async () => {
    const current = webRef.current;
    if (!current || current.stopping) return;
    setWeb({ ...current, stopping: true });
    try {
      const { run } = await window.api.recorder.guidedWebStop();
      const store: GuidedStore = {
        ...guidedStoreRef.current,
        runs: [...(guidedStoreRef.current.runs ?? []), run].slice(-MAX_RUNS),
        updatedAt: Date.now(),
      };
      savedStore.current = store;
      setGuidedStore(store);
      await window.api.recorder.guidedSave(store, loadedProject.current);
      setWeb(null);
      // A complete demonstration closes the recorder; the editor already has it.
      if (run.status === "done") await window.api.recorder.cancel();
      else
        setError(
          `O take foi salvo até a etapa ${run.step + 1}. Corrija o que for preciso e use Continuar da etapa ${run.step + 1}.`,
        );
    } catch (err) {
      // The main process let the take go either way: back to the plan, with what happened.
      setWeb(null);
      setError(cleanError(err));
    }
  }, []);

  const toggleWeb = useCallback(async () => {
    const phase = webRef.current?.status?.phase;
    if (phase === "paused") await window.api.recorder.guidedWebResume();
    else if (phase === "recording" || phase === "holding")
      await window.api.recorder.guidedWebPause();
  }, []);

  const discardWeb = useCallback(async () => {
    if (!webRef.current) return;
    await window.api.recorder.guidedWebDiscard().catch((err: unknown) => setError(cleanError(err)));
    setWeb(null);
  }, []);

  useEffect(
    () =>
      window.api.recorder.onGuidedStatus((status) => {
        if (webRef.current) setWeb((w) => (w ? { ...w, status } : w));
      }),
    [],
  );
  // Every step done: the take is saved at once.
  useEffect(() => {
    if (web?.status?.phase === "done" && !web.stopping) void stopWeb();
  }, [web, stopWeb]);

  const begin = useCallback(async () => {
    if (!settings || phaseRef.current !== "setup" || guidedBusy) return;
    if (!voiceMode && !monitor) return;
    setOverDone(false);
    if (voiceMode && !mic) {
      setError("Escolha o microfone para gravar a voz.");
      return;
    }
    if (voiceCam && !cam) {
      setError("Escolha a câmera para gravar voz e câmera.");
      return;
    }
    if (mode === "over" && !over) {
      setError("Abra o gravador pelo editor, numa aula que já tenha a voz na faixa Voz.");
      return;
    }
    if (guidedMode && guidedPlan?.mode === "web") {
      await startWeb(replace?.planId === guidedPlan.id ? replace.from : 0);
      return;
    }
    preservationRequested.current = false;
    setError(null);
    setAlert(null);
    if (guidedMode) {
      const problem = guidedProblem(guidedPlan, 0);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setPhase("countdown");
    phaseRef.current = "countdown";
    try {
      // The camera previews close with the countdown: the take opens the camera only once they
      // have let it go (a preview still opening stops its stream as soon as it arrives).
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      await previewsReleased();
      guidedFailed.current = false;
      if (guidedMode && guidedPlan?.audio) {
        const audio = new Audio(mediaUrl(guidedPlan.audio.path));
        guidedAudio.current = audio;
        await new Promise<void>((resolve, reject) => {
          audio.oncanplay = () => resolve();
          audio.onerror = () => reject(new Error("Não foi possível abrir a narração."));
          audio.load();
        });
      }
      if (mode === "over" && over) {
        // The lesson's voice, rendered as one file and ready to play when the take starts.
        setFlash("Preparando a voz da aula…");
        const narration = await window.api.recorder.narration(over.from);
        const p = new OverPlayer(narration.path, narration.start);
        p.onHeard = (at) => {
          setHeard(at);
          // A redo ends by itself a moment after its stretch.
          if (over.to !== undefined && at >= over.to + 0.3) void stopRef.current();
        };
        p.onError = (message) => setError(`A voz da aula: ${message}`);
        // The voice is over: the part saves itself a moment later (the last click still counts).
        if (over.to === undefined)
          p.onEnded = () => {
            setFlash("A voz acabou. Salvando a parte…");
            voiceEnded.current = setTimeout(() => void stopRef.current(), VOICE_END_GRACE_MS);
          };
        await p.load();
        player.current = p;
        setFlash(null);
      }
      const narrated = guidedMode && !!guidedPlan?.audio;
      // The computer's sound leaves the app's sound out (shared/systemAudio.ts): every sound of
      // it on the native route, this window's own on Chromium's fallback. The voice played over
      // the screen, or a guided narration, never comes back in it twice; where Windows cannot
      // leave it out, the computer's sound is off for such a take.
      const wanted =
        (mode === "over" ? settings.overSystemAudio : settings.systemAudio) && !voiceMode;
      const narrationPlays = mode === "over" || narrated;
      const native = wanted && (await window.api.recorder.systemAudioRoute()) === "native";
      const plan = systemAudioPlan({
        wanted,
        narrationPlays,
        excludesApp: native || !wanted || !narrationPlays ? true : await SystemAudio.excludesApp(),
      });
      const systemOn = plan.record;
      if (plan.warning) {
        setFlash(plan.warning);
        setTimeout(() => setFlash(null), 10000);
      }
      // The mouse helper loads during the countdown.
      const prep = window.api.recorder.prepare(
        voiceMode
          ? {
              fps: settings.fps,
              microphone: mic,
              mode: voiceCam ? ("voicecam" as const) : ("voice" as const),
              follow: settings.follow,
              // "Voz e câmera": the camera in a process of its own, with the same delay measured.
              ...(voiceCam
                ? {
                    camera: presenterCam,
                    cameraMode: settings.presenterCameraMode ?? camModes?.choice ?? undefined,
                    cameraLatency: settings.cameraLatency,
                  }
                : {}),
            }
          : {
              monitor: monitor?.index,
              regionDip: region,
              microphone: narrated ? undefined : (mode === "over" ? overMic : mic) || undefined,
              camera: screenCam || undefined,
              cameraMode: screenCam
                ? (settings.cameraMode ?? camModes?.choice ?? undefined)
                : undefined,
              cameraLatency: settings.cameraLatency,
              keys: settings.keys,
              fps: settings.fps,
              quality: settings.quality,
              systemAudio: systemOn,
              ...(systemOn && native ? { systemAudioRoute: "native" as const } : {}),
              ...(mode === "over" && over
                ? {
                    mode: "over" as const,
                    over: {
                      from: over.from,
                      ...(over.to !== undefined ? { to: over.to } : {}),
                      // A redo, or a part started where a screen is already recorded, records
                      // over it from there (shared/overNarration.ts layoutOverNarration).
                      ...(over.replace || overwrites(over, recorded) ? { replace: true } : {}),
                    },
                  }
                : {}),
            },
      );
      await Promise.all([
        prep,
        (async () => {
          for (let i = settings.countdown; i > 0; i--) {
            setCount(i);
            await new Promise((r) => setTimeout(r, 1000));
          }
        })(),
      ]);
      const started = await window.api.recorder.start();
      setMarkers(0);
      setNoteCount(0);
      // On the native route the main process records it; Chromium's capture is the fallback,
      // also when the native one did not open (if it can leave out a voice this window plays).
      const fallback =
        native &&
        started.systemFallback &&
        systemAudioPlan({
          wanted: true,
          narrationPlays,
          excludesApp: !narrationPlays || (await SystemAudio.excludesApp()),
        }).record;
      if (native && started.systemFallback && !fallback) {
        setFlash(
          "O áudio do PC ficou de fora: a captura sem o som do app não abriu, e a de reserva gravaria de novo a voz que o gravador toca.",
        );
        setTimeout(() => setFlash(null), 10000);
      }
      if (!preservationRequested.current && systemOn && (!native || fallback)) {
        system.current = await SystemAudio.start(setError).catch((e) => {
          setError(`Áudio do PC indisponível: ${(e as Error).message}`);
          return null;
        });
        if (system.current && !system.current.excludesApp && !plan.warning) {
          setFlash(
            "Neste Windows o áudio do PC pode incluir o som que o gravador toca: separar esse som pede o Windows 10 versão 2004 ou mais novo.",
          );
          setTimeout(() => setFlash(null), 8000);
        }
      }
      if (preservationRequested.current) {
        phaseRef.current = "saving";
        setPhase("saving");
        await finishSystemAudio();
        await window.api.recorder.stop();
        return;
      }
      setPhase("recording");
      phaseRef.current = "recording";
      void window.api.recorder.interactive(false);
      void window.api.recorder.teleprompterLine(line);
      // A redo, and each part after the first, starts the voice two seconds early, to come into
      // the stretch already in rhythm (the screen only counts from `over.from`).
      if (mode === "over" && over)
        await player.current?.play(
          over.replace || over.from > voiceStart(over) + 0.5
            ? Math.max(0, over.from - 2)
            : over.from,
        );
      if (guidedMode && guidedPlan) {
        const timing = await window.api.recorder.guidedStart(guidedPlan);
        guidedOffset.current = timing.origin + timing.lead;
      }
    } catch (err) {
      setError(cleanError(err));
      setFlash(null);
      guidedAudio.current?.pause();
      player.current?.stop();
      player.current = null;
      system.current?.cancel();
      system.current = null;
      await window.api.recorder.reset().catch(() => undefined);
      phaseRef.current = "setup";
      setPhase("setup");
    }
  }, [
    monitor,
    settings,
    region,
    mic,
    overMic,
    recorded,
    cam,
    screenCam,
    presenterCam,
    camModes,
    mode,
    voiceMode,
    voiceCam,
    over,
    guidedMode,
    guidedPlan,
    guidedBusy,
    line,
    finishSystemAudio,
    startWeb,
    replace,
  ]);

  useEffect(() => {
    if (!guidedMode || phase !== "recording") return;
    let pending = false;
    const timer = setInterval(() => {
      if (pending || guidedOffset.current === null || !guidedAudio.current) return;
      pending = true;
      void window.api.recorder
        .elapsed()
        .then((t) => {
          const audio = guidedAudio.current;
          if (!audio || phaseRef.current !== "recording" || guidedOffset.current === null) return;
          const at = t - guidedOffset.current;
          if (at >= 0 && at < audio.duration && audio.paused) {
            audio.currentTime = at;
            void audio.play().catch(() => {
              guidedFailed.current = true;
              setError("Não foi possível reproduzir a narração. Finalize e tente novamente.");
              setPhase("paused");
              phaseRef.current = "paused";
              void window.api.recorder.pause();
            });
          }
        })
        .finally(() => {
          pending = false;
        });
    }, 25);
    return () => {
      clearInterval(timer);
      guidedAudio.current?.pause();
    };
  }, [guidedMode, phase]);
  useEffect(
    () => () => {
      guidedAudio.current?.pause();
    },
    [],
  );

  const [resuming, setResuming] = useState(false);
  const togglePause = useCallback(async () => {
    if (guidedFailed.current) return;
    if (phaseRef.current === "recording") {
      guidedAudio.current?.pause();
      // The voice pauses with the take: the pause becomes a cut and the voice goes on from here.
      player.current?.pause();
      phaseRef.current = "paused";
      setPhase("paused");
      await window.api.recorder.pause();
    } else if (phaseRef.current === "paused") {
      // Instant, unless a source has to open again (after a failure or a long pause).
      setResuming(true);
      try {
        await window.api.recorder.resume();
        // During a time-lapse the voice keeps waiting: only the screen goes on.
        if (!lapse.current) await player.current?.play();
        setAlert(null);
        setPhase("recording");
        phaseRef.current = "recording";
      } catch (err) {
        setAlert({
          source: "screen",
          level: "error",
          message: cleanError(err),
          actions: ["resume", "stop"],
        });
      } finally {
        setResuming(false);
      }
    }
  }, []);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    // A note being typed is kept with the take, and a time-lapse ends where the voice would go on.
    await closeNote(true);
    const lapseOpen = lapse.current;
    if (lapseOpen && overRef.current) {
      lapse.current = null;
      setLapsing(false);
      await window.api.recorder.lapse("end", lapseEnd(lapseOpen.at, overRef.current));
    }
    // "Tela sobre a narração" is recorded in parts: the recorder stays open for the next one,
    // from where the voice of this one ends. A redo, or a take the app has to save now, closes.
    clearTimeout(voiceEnded.current);
    const overNow = modeRef.current === "over" ? overRef.current : null;
    const keepOpen = !!overNow && overNow.to === undefined && !preservationRequested.current;
    // Taken now: whatever happens to this stop, the next one never finds it left over.
    const again = keepOpen ? restartAt.current : null;
    restartAt.current = null;
    setPhase("saving");
    phaseRef.current = "saving";
    setAlert(null);
    guidedAudio.current?.pause();
    guidedOffset.current = null;
    player.current?.stop();
    player.current = null;
    setHeard(null);
    await window.api.recorder.guidedCancel();
    void window.api.recorder.interactive(true);
    try {
      // The take ends at the key press, not after the computer's sound is wrapped up.
      await window.api.recorder.halt();
      await finishSystemAudio();
      const result = await window.api.recorder.stop(keepOpen);
      if (!keepOpen || !overNow) return;
      // The next part only starts from here once this one is in the lesson: a part the editor
      // could not place stays among the interrupted takes it offers, and is recorded again.
      const placed = await partPlaced(result.dir);
      if (!placed.ok) {
        setHealth(null);
        setMarkers(0);
        setNoteCount(0);
        phaseRef.current = "setup";
        setPhase("setup");
        setError(
          `Esta parte não entrou na aula (${placed.message ?? "erro no editor"}). A gravação ficou guardada e o editor a oferece entre as gravações interrompidas. Grave de novo a partir de ${clockOf(overNow.from)}.`,
        );
        return;
      }
      // Where this part ends on the timeline, as the editor lays it out (shared/overNarration.ts).
      // Nothing of it kept (stopped in the lead-in): the next part starts where this one did.
      const end = Math.max(overNow.from, overEnd(result) ?? overNow.from);
      const nowRecorded =
        end > overNow.from + 0.05
          ? joinStretches([...recordedRef.current, [overNow.from, end]])
          : recordedRef.current;
      setRecorded(nowRecorded);
      // "Voltar ao começo da fala" picked the next start; otherwise it goes on from here.
      if (again === null && end >= overNow.end - 0.5) {
        // The voice is over: what is still without a screen, and back to the editor or on to
        // whoever edits the lesson.
        // F9 from here records what is still missing, never over the start of the lesson.
        const gap = screenCoverage([], nowRecorded, voiceStart(overNow), overNow.end).firstGap;
        setOver({ ...overNow, from: gap ?? voiceStart(overNow) });
        setOverParts((n) => n + 1);
        setHealth(null);
        setMarkers(0);
        setNoteCount(0);
        setFlash(null);
        setOverDone(true);
        phaseRef.current = "setup";
        setPhase("setup");
        return;
      }
      const from = Math.round((again ?? end) * 1000) / 1000;
      setOver({ ...overNow, from });
      setOverParts((n) => n + 1);
      setHealth(null);
      setMarkers(0);
      setNoteCount(0);
      phaseRef.current = "setup";
      setPhase("setup");
      setFlash(
        again === null
          ? `Parte salva na aula. A próxima começa em ${clockOf(from)}.`
          : `Pronto para gravar de novo desde o começo da fala, em ${clockOf(from)}, por cima do que foi gravado ali.`,
      );
      setTimeout(() => setFlash(null), 5000);
    } catch (err) {
      setError(cleanError(err));
      // Kept open after a part that failed to save: back to setting up, nothing is recording.
      const nothing = keepOpen && (await window.api.recorder.status()).phase === null;
      phaseRef.current = nothing ? "setup" : "paused";
      setPhase(nothing ? "setup" : "paused");
    }
  }, [finishSystemAudio, closeNote]);
  /**
   * "Trecho acelerado" (F7, over the narration): the voice waits where it is while the screen
   * goes on (a long construction, at the teacher's pace); F7 again lets the voice go on from the
   * next line. On import the construction is sped up to fit the voice in between.
   */
  const toggleLapse = useCallback(async () => {
    const o = overRef.current;
    const p = player.current;
    if (modeRef.current !== "over" || !o || o.to !== undefined || !p) return;
    if (phaseRef.current !== "recording") return;
    const open = lapse.current;
    if (!open) {
      const at = p.heard();
      p.pause();
      lapse.current = { at };
      setLapsing(true);
      await window.api.recorder.lapse("start", at);
      setFlash(
        `Trecho acelerado: a voz espera em ${clockOf(at)}. Faça no seu tempo e aperte ${hotkeyLabel(settingsRef.current?.hotkeys.timelapse ?? "")} para a voz continuar.`,
      );
      return;
    }
    const resume = lapseEnd(open.at, o);
    await window.api.recorder.lapse("end", resume);
    lapse.current = null;
    setLapsing(false);
    if (resume >= o.end - 0.5) {
      // The time-lapse goes to the end of the voice: the part is over.
      await stopRef.current();
      return;
    }
    await p.play(resume);
    showFlash(`A voz continua em ${clockOf(resume)}. O trecho entra acelerado até ali.`);
  }, [showFlash]);
  const toggleLapseRef = useRef(toggleLapse);
  toggleLapseRef.current = toggleLapse;

  const stopRef = useRef(stop);
  stopRef.current = stop;
  // The karaoke follows the voice ten times a second (the notes to the main process go at two).
  useEffect(() => {
    if (mode !== "over" || phase !== "recording") return;
    const id = setInterval(() => {
      const p = player.current;
      if (p) setHeard(p.heard());
    }, 100);
    return () => clearInterval(id);
  }, [mode, phase]);

  /**
   * Throws this take away (Recycle Bin) and goes back to setting up. Asked inside the pill, never
   * in a dialog of the system: one would show in the video and its click would count as the
   * lesson's.
   */
  const discard = useCallback(async () => {
    setConfirmDiscard(false);
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    guidedAudio.current?.pause();
    guidedOffset.current = null;
    player.current?.stop();
    player.current = null;
    setHeard(null);
    system.current?.cancel();
    system.current = null;
    await window.api.recorder.guidedCancel();
    try {
      await window.api.recorder.discard();
    } catch (err) {
      setError(cleanError(err));
    }
    setAlert(null);
    setHealth(null);
    setPhase("setup");
    phaseRef.current = "setup";
  }, []);

  /**
   * "Voltar ao começo da fala" (over the narration): the part so far goes into the lesson, and
   * the recorder waits at the start of the line being heard, ready to record it again over what
   * was just recorded there.
   */
  const rewind = useCallback(async () => {
    const o = overRef.current;
    // Only where the recorder stays open for the next part: not in a redo of an interval, nor
    // when the app has asked for the take to be saved and closed.
    if (modeRef.current !== "over" || !o || o.to !== undefined || preservationRequested.current)
      return;
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    const heard = player.current?.heard() ?? o.from;
    const line = [...(o.lines ?? [])].reverse().find((l) => l.t <= heard + 0.05);
    restartAt.current = Math.max(voiceStart(o), line?.t ?? o.from);
    await stopRef.current();
  }, []);

  const mark = useCallback(
    async (kind: "marker" | "retake") => {
      if (phaseRef.current !== "recording") return;
      await window.api.recorder.mark(kind);
      setMarkers((n) => n + 1);
      showFlash(
        kind === "retake"
          ? voiceMode
            ? "Refazer: esta tomada vai para o corte. Leia a fala de novo."
            : "Refazer: o trecho anterior será proposto para corte"
          : "Marcador",
      );
    },
    [showFlash, voiceMode],
  );

  useEffect(
    () =>
      window.api.recorder.onHotkey((name) => {
        // A take in the lesson window has its own pause and stop.
        if (webRef.current) {
          if (name === "toggle") void toggleWeb();
          else if (name === "stop" || name === "preserve") void stopWeb();
          return;
        }
        if (name === "preserve") {
          preservationRequested.current = true;
          void stop();
          return;
        }
        if (name === "guided-done") {
          void stop();
          return;
        }
        if (name.startsWith("guided-error:")) {
          guidedFailed.current = true;
          guidedAudio.current?.pause();
          setError(name.slice("guided-error:".length));
          setPhase("paused");
          phaseRef.current = "paused";
          return;
        }
        if (name === "toggle") void (phaseRef.current === "setup" ? begin() : togglePause());
        else if (name === "stop") void stop();
        else if (name === "marker") void mark("marker");
        else if (name === "note") void openNote();
        else if (name === "timelapse") void toggleLapseRef.current();
        // Over the narration, redoing is going back to the start of the line being heard.
        else if (name === "retake") void (modeRef.current === "over" ? rewind() : mark("retake"));
        else if (name === "line-next") stepTo(1);
        else if (name === "line-prev") stepTo(-1);
        else if (name === "draw" && phaseRef.current === "recording" && drawAllowed.current)
          setDrawOn((on) => !on);
        // The window stopped answering while drawing: the main process gave the mouse back to
        // the screen, and the drawing ends here too.
        else if (name === "draw-off") setDrawOn(false);
      }),
    [begin, togglePause, stop, mark, openNote, rewind, stepTo, toggleWeb, stopWeb],
  );

  // The disk filled up: the main process already stopped the capture; save what there is.
  useEffect(() => {
    if (alert?.request === "stop") void stop();
  }, [alert, stop]);

  const recording = phase === "recording" || phase === "paused";
  const exact = regionPhysical(region, monitor);
  const physical = { w: exact.width, h: exact.height };
  const keyOf = (action: keyof RecorderSettings["hotkeys"]): string =>
    hotkeyLabel(settings?.hotkeys[action] ?? "");
  const badKeys = hotkeys.filter((r) => !r.ok);
  const prompterOn = !!settings?.teleprompter.on && lines.length > 0;
  const pcSoundOn = mode === "over" ? !!settings?.overSystemAudio : !!settings?.systemAudio;
  const bigSize = Math.max(30, Math.round((settings?.teleprompter.size ?? 22) * 1.6));
  const followNote =
    voiceMode && settings?.follow
      ? (follow?.message ??
        (recording ? "" : "Com o motor de transcrição instalado, a fala avança sozinha."))
      : "";

  const webPlan = guidedMode && guidedPlan?.mode === "web";
  /** Drawing on the screen is for a take by hand (the guided mode moves the mouse itself). */
  const canDraw = mode === "screen" || mode === "over";
  drawAllowed.current = canDraw;

  // Split, the frame over the recorded screen shows the region, the countdown and the drawing.
  const drawKey = keyOf("draw");
  const regionLock = settings?.regionLock ?? true;
  const frameVisible = !voiceMode && !webPlan;
  useEffect(() => {
    if (!split) return;
    void window.api.recorder.frameState({
      region,
      size: { w: exact.width, h: exact.height },
      editable: phase === "setup",
      recording,
      lock: regionLock,
      countdown: phase === "countdown" ? count : null,
      visible: frameVisible,
      draw: { allowed: canDraw, on: drawOn && phase === "recording", palette, toggleKey: drawKey },
    });
  }, [
    split,
    region,
    exact.width,
    exact.height,
    phase,
    recording,
    regionLock,
    count,
    frameVisible,
    canDraw,
    drawOn,
    palette,
    drawKey,
  ]);
  // What is done on the frame comes back here, as if done on this window.
  const onFrame = useRef<(event: FrameEvent) => void>(() => undefined);
  onFrame.current = (event) => {
    if (event.type === "region") customRegion(event.rect);
    else if (event.type === "size") typeSize(event.size);
    else if (event.type === "lock") change({ regionLock: event.on });
    else setDrawOn(false);
  };
  useEffect(() => window.api.recorder.onFrameEvent((event) => onFrame.current(event)), []);
  if (web)
    return (
      <div className="rec-root is-guided-web">
        <GuidedWebPanel
          status={web.status}
          stopping={web.stopping}
          keys={{ toggle: keyOf("toggle"), stop: keyOf("stop") }}
          onToggle={() => void toggleWeb()}
          onStop={() => void stopWeb()}
          onDiscard={() => void discardWeb()}
        />
      </div>
    );

  return (
    <div className={`rec-root is-${phase}`}>
      {guidedMode && phase === "setup" && (
        <GuidedSetup
          store={guidedStore}
          planId={planId}
          onStore={setGuidedStore}
          onPlanId={setPlanId}
          script={lines.map((l) => l.text).join("\n")}
          busy={phase !== "setup"}
          onBusy={setGuidedBusy}
          keys={{ target: keyOf("guidedTarget"), toggle: keyOf("toggle"), stop: keyOf("stop") }}
          replace={replace}
          problem={planProblem}
          onStart={(from) => void startWeb(from)}
        />
      )}
      {error && recording && !alert && (
        <div className="rec-flash" role="alert">
          {error} · {keyOf("stop")} para salvar e encerrar.
        </div>
      )}
      {alert && recording && (
        <Interactive className="rec-alert" active={recording} id="alert">
          <AlertTriangle size={16} className="warn-icon" aria-hidden="true" />
          <span role="alert">{alert.message}</span>
          {alert.actions.includes("resume") && (
            <button type="button" disabled={resuming} onClick={() => void togglePause()}>
              {resuming ? <Loader size={14} className="spin" /> : <Play size={14} />} Retomar
            </button>
          )}
          {alert.actions.includes("stop") && (
            <button type="button" className="rec-stop" onClick={() => void stop()}>
              <Square size={12} fill="currentColor" /> Parar e salvar
            </button>
          )}
        </Interactive>
      )}
      {!voiceMode && !webPlan && !split && (
        <RegionFrame
          region={region}
          onChange={customRegion}
          editable={phase === "setup"}
          recording={recording}
          size={physical}
          lock={settings?.regionLock ?? true}
          onLock={(regionLock) => change({ regionLock })}
          onSize={typeSize}
        />
      )}

      {windowPicker && phase === "setup" && (
        <WindowPicker
          current={followed}
          onPick={fitWindow}
          onClose={() => setWindowPicker(false)}
        />
      )}
      {canDraw && !split && (
        <DrawLayer
          region={region}
          on={drawOn && phase === "recording"}
          live={recording}
          palette={palette}
          toggleKey={keyOf("draw")}
          onExit={() => setDrawOn(false)}
        />
      )}

      {cam && camModes && phase === "setup" && !voiceMode && !webPlan && (
        // Split, the preview sits in a corner of the controls' screen, not over the recorded one.
        <CameraPreview device={cam} region={split ? fullWindow() : region} />
      )}
      {cam && camModes && phase === "setup" && voiceCam && <CameraPreview device={cam} presenter />}
      {!cam && phase === "setup" && voiceCam && (
        <div className="rec-cam is-presenter is-empty">
          <Video size={22} />
          <p className="rec-cam-hint">
            Escolha a câmera na barra abaixo para ver como o apresentador vai aparecer.
          </p>
        </div>
      )}

      {voiceMode && settings && (
        <Interactive
          className={`vp-wrap ${voiceCam ? "is-side" : ""}`}
          active={recording}
          id="voice-prompter"
        >
          <VoicePrompter
            lines={lines}
            order={order}
            current={line}
            setCurrent={moveLine}
            size={bigSize}
            live={recording}
            status={followNote}
            nextKey={keyOf("lineNext")}
            retakeKey={keyOf("retake")}
          />
        </Interactive>
      )}

      {mode === "over" && over && settings && (
        <Interactive className="vp-wrap is-side" active={recording} id="karaoke">
          <KaraokePrompter
            over={over}
            heard={heard}
            lines={lines}
            notes={notes}
            size={Math.max(20, settings.teleprompter.size)}
          />
        </Interactive>
      )}

      {(mode === "screen" || mode === "guided") && !guidedMode && prompterOn && settings && (
        <Teleprompter
          lines={lines}
          live={recording}
          current={line}
          setCurrent={moveLine}
          size={settings.teleprompter.size}
          wordsPerMinute={settings.teleprompter.wordsPerMinute}
          onSize={(size) => change({ teleprompter: { ...settings.teleprompter, size } })}
          onHide={() => change({ teleprompter: { ...settings.teleprompter, on: false } })}
          nextKey={keyOf("lineNext")}
        />
      )}

      {phase === "countdown" && <div className="rec-countdown">{count}</div>}
      {flash && (
        <div className="rec-flash" role="status" aria-live="polite">
          {flash}
        </div>
      )}

      {phase === "setup" || phase === "countdown" ? (
        <div className="rec-dock">
          {overDone && mode === "over" && over && phase === "setup" && (
            <OverDone
              over={over}
              recorded={recorded}
              onFrom={(from) => {
                setOver({ ...over, from });
                setOverDone(false);
              }}
              onClose={(next) => void window.api.recorder.cancel(next)}
            />
          )}
          {mapOpen &&
            !overDone &&
            mode === "over" &&
            over &&
            over.to === undefined &&
            phase === "setup" && (
              <OverMap
                over={over}
                recorded={recorded}
                onFrom={(from) => {
                  const first = voiceStart(over);
                  const to = Math.min(Math.max(first, over.end - 1), Math.max(first, from));
                  setOver({ ...over, from: Math.round(to * 1000) / 1000 });
                }}
                onClose={() => setMapOpen(false)}
              />
            )}
          {optionsOpen && settings && (
            <RecorderOptions
              settings={settings}
              change={change}
              reports={hotkeys}
              onClose={() => setOptionsOpen(false)}
            />
          )}
          {error && (
            <div className="rec-error" role="alert">
              {error}
            </div>
          )}
          {badKeys.length > 0 && (
            <div className="rec-error" role="alert">
              {badKeys
                .map(
                  (r) =>
                    `${hotkeyLabel(r.accelerator)} (${HOTKEY_LABELS[r.action].toLowerCase()}): ${r.reason ?? "não registrado."}`,
                )
                .join(" · ")}
            </div>
          )}
          {!voiceMode && (
            <div className="rec-encoder" aria-live="polite">
              {!encoder
                ? "Testando o codificador nesta tela…"
                : encoder.label
                  ? `Gravação: ${encoder.label}`
                  : `Codificador indisponível: ${encoder.error}`}
            </div>
          )}
          <div className="rec-mode">
            <label htmlFor="recording-mode">Modo de gravação </label>
            <select
              id="recording-mode"
              value={mode}
              disabled={phase !== "setup" || guidedBusy}
              onChange={(e) => {
                const next = MODES.find((m) => m === e.target.value);
                modePicked.current = true;
                if (!next) return;
                setMode(next);
                if (next === "screen" || next === "voice" || next === "voicecam")
                  change({ recordMode: next });
              }}
            >
              <option value="screen">Tela</option>
              <option value="voice">Só voz</option>
              <option value="voicecam">Voz e câmera</option>
              <option value="over" disabled={!over}>
                {over
                  ? "Tela sobre a narração"
                  : "Tela sobre a narração (importe a voz da aula no editor)"}
              </option>
              <option value="guided">Guiado por plano (roteiro ou áudio)</option>
            </select>
            {mode === "over" && over && (
              <span className="rec-mode-note">
                {overParts > 0
                  ? `${plural(overParts, "parte salva", "partes salvas")} na aula. `
                  : ""}
                A voz da aula toca nos fones a partir de {clockOf(over.from)}
                {over.to !== undefined ? ` e a tela é regravada até ${clockOf(over.to)}` : ""}
                {over.from > voiceStart(over) + 0.5
                  ? ", com 2 s antes para você pegar o ritmo"
                  : ""}
                .{" "}
                {overwrites(over, recorded)
                  ? `Grava por cima da tela já gravada a partir de ${clockOf(over.from)}. `
                  : ""}
                Use fones.
              </span>
            )}
            {mode === "over" && over && over.to === undefined && phase === "setup" && (
              <OverStart
                over={over}
                recorded={recorded}
                mapOpen={mapOpen}
                onMap={setMapOpen}
                onFrom={(from) => setOver({ ...over, from })}
              />
            )}
          </div>
          <div className="rec-bar">
            <button
              type="button"
              className="rec-go"
              onClick={() => void begin()}
              disabled={(!monitor && !voiceMode) || !settings || phase !== "setup" || guidedBusy}
            >
              <span className="rec-dot" />
              <span>
                <strong>Gravar</strong>
                <small>
                  {keyOf("toggle")}
                  {settings?.countdown ? ` · contagem de ${settings.countdown} s` : ""}
                </small>
              </span>
            </button>
            {!voiceMode && (
              <>
                <Source icon={MonitorUp} label="Tela">
                  <select
                    value={monitor?.index ?? ""}
                    title={monitor?.label}
                    onChange={(e) => {
                      const m = sources?.monitors.find((x) => x.index === Number(e.target.value));
                      if (m) {
                        if (followed) {
                          setFollowed(null);
                          setRegionChoice(settings?.region.preset ?? "full");
                          void window.api.recorder.followWindow(null, false);
                        }
                        setMonitor(m);
                        change({ monitor: { x: m.x, y: m.y, width: m.width, height: m.height } });
                        // The region the options ask for, if it fits there, else the whole screen.
                        if (settings) setRegion(regionFrom(settings, m, lesson));
                      }
                    }}
                  >
                    {sources?.monitors.map((m) => (
                      <option key={m.index} value={m.index} disabled={m.output < 0}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Source>
                <Source icon={ScanLine} label="Região">
                  <select
                    value={regionChoice}
                    title={
                      followed
                        ? `Janela ${followed.window.title}, ${physical.w} × ${physical.h}`
                        : `Região de ${physical.w} × ${physical.h}`
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "pick") {
                        setWindowPicker(true);
                        return;
                      }
                      const preset = REGION_PRESETS.find((p) => p === value);
                      if (preset && preset !== "custom") pickRegion(preset);
                    }}
                  >
                    <option value="full">Tela inteira</option>
                    <option value="1080p">1920 × 1080</option>
                    <option value="720p">1280 × 720</option>
                    <option value="16:9">16:9 no centro</option>
                    <option value="lesson" disabled={!lesson}>
                      {lesson
                        ? `Resolução da aula (${lesson.width} × ${lesson.height})`
                        : "Resolução da aula (abra pelo editor)"}
                    </option>
                    {followed && (
                      <option value="window" disabled>
                        Janela: {followed.window.title}
                      </option>
                    )}
                    <option value="pick">{followed ? "Outra janela…" : "Janela…"}</option>
                    <option value="custom" disabled>
                      Personalizada · {physical.w} × {physical.h}
                    </option>
                  </select>
                </Source>
              </>
            )}
            {(!voiceMode || voiceCam) && (
              <Source
                icon={Video}
                label="Câmera"
                extra={
                  cam && settings ? (
                    <CameraModeSelect
                      modes={camModes}
                      value={camModeSetting}
                      fps={settings.fps}
                      onChange={(choice) =>
                        change(voiceCam ? { presenterCameraMode: choice } : { cameraMode: choice })
                      }
                    />
                  ) : null
                }
              >
                <select
                  value={cam}
                  title={cam || (voiceCam ? "Escolha a câmera" : "Desligada")}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (voiceCam) {
                      setPresenterCam(next);
                      change({ presenterCamera: next || null, presenterCameraMode: null });
                    } else {
                      setScreenCam(next);
                      change({ camera: next || null, cameraMode: null });
                    }
                  }}
                >
                  <option value="">{voiceCam ? "Escolha a câmera" : "Desligada"}</option>
                  {sources?.cameras.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Source>
            )}
            <Source
              icon={Mic}
              label="Microfone"
              extra={
                meterMic && phase === "setup" ? (
                  level?.error ? (
                    <small className="rec-opt-bad" title={level.error}>
                      Não abriu
                    </small>
                  ) : (
                    <LevelBars peak={level?.peak ?? 0} />
                  )
                ) : null
              }
            >
              <select
                value={meterMic}
                title={meterMic || "Sem áudio"}
                onChange={(e) => {
                  // Over the narration the choice is for this take only: the voice already exists.
                  if (mode === "over") {
                    setOverMic(e.target.value);
                    return;
                  }
                  setMic(e.target.value);
                  change({ microphone: e.target.value || "" });
                }}
              >
                <option value="">Sem áudio</option>
                {sources?.microphones.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Source>
            {voiceMode && settings && (
              <>
                <MicTest level={level} device={mic} />
                <label
                  className="rec-follow"
                  title="Precisa do motor de transcrição da aba Transcrição"
                >
                  <input
                    type="checkbox"
                    checked={settings.follow}
                    onChange={(e) => change({ follow: e.target.checked })}
                  />{" "}
                  Teleprompter acompanha a voz
                </label>
                <SpeakerChips
                  speakers={voiceSpeakers(lines)}
                  on={speakerOn}
                  toggle={(name) =>
                    setSpeakerOn((prev) => {
                      const next = new Set(prev);
                      if (next.has(name)) next.delete(name);
                      else next.add(name);
                      return next;
                    })
                  }
                />
              </>
            )}
            {!voiceMode && (
              <>
                <Source icon={Volume2} label="Áudio do PC">
                  <select
                    value={pcSoundOn ? "on" : "off"}
                    title={`${pcSoundOn ? "Ligado, numa faixa separada" : "Desligado"}. O som do computador (música, efeitos de um jogo, o navegador), sem a voz que o gravador toca.`}
                    onChange={(e) =>
                      change(
                        mode === "over"
                          ? { overSystemAudio: e.target.value === "on" }
                          : { systemAudio: e.target.value === "on" },
                      )
                    }
                  >
                    <option value="off">Desligado</option>
                    <option value="on">Ligado (faixa separada)</option>
                  </select>
                </Source>
                <Source icon={MousePointer2} label="Cursor" info>
                  <span className="rec-static">Gravado à parte</span>
                </Source>
                <Source icon={Keyboard} label="Teclas">
                  <select
                    value={settings?.keys ? "on" : "off"}
                    onChange={(e) => change({ keys: e.target.value === "on" })}
                    title={`${settings?.keys ? "Atalhos e setas" : "Desligado"}. Mostra atalhos (Ctrl+…) e setas na tela. A digitação comum nunca é gravada.`}
                  >
                    <option value="off">Desligado</option>
                    <option value="on">Atalhos e setas</option>
                  </select>
                </Source>
              </>
            )}
            {lines.length > 0 && settings && !voiceMode && mode !== "over" && (
              <button
                type="button"
                className="rec-icon"
                title={prompterOn ? "Esconder teleprompter" : "Mostrar teleprompter"}
                aria-label={prompterOn ? "Esconder teleprompter" : "Mostrar teleprompter"}
                onClick={() =>
                  change({
                    teleprompter: { ...settings.teleprompter, on: !settings.teleprompter.on },
                  })
                }
              >
                {prompterOn ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
            <button
              type="button"
              className="rec-icon"
              title="Opções do gravador"
              aria-label="Opções do gravador"
              onClick={() => setOptionsOpen((o) => !o)}
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              className="rec-icon"
              title={
                overParts > 0
                  ? "Voltar ao editor (as partes já estão na aula)"
                  : "Fechar sem gravar"
              }
              aria-label={overParts > 0 ? "Voltar ao editor" : "Fechar sem gravar"}
              onClick={() =>
                void window.api.recorder.cancel(
                  mode === "over" && overParts > 0 ? "flow" : undefined,
                )
              }
            >
              <X size={16} />
            </button>
          </div>
          <div className="rec-keys">
            <span>
              <kbd>{keyOf("toggle")}</kbd> iniciar / pausar
            </span>
            <span>
              <kbd>{keyOf("stop")}</kbd> parar
            </span>
            <span>
              <kbd>{keyOf("marker")}</kbd> marcador
            </span>
            <span>
              <kbd>{keyOf("retake")}</kbd>{" "}
              {voiceMode ? "refazer esta tomada" : "refazer último trecho"}
            </span>
            {lines.length > 0 && (
              <span>
                <kbd>{keyOf("lineNext")}</kbd> próxima fala
              </span>
            )}
            <span className="rec-note">
              {voiceCam
                ? "Voz em qualidade de estúdio (PCM 48 kHz) e câmera em faixa própria, já sincronizadas."
                : voiceMode
                  ? "Só o microfone é gravado, em qualidade de estúdio (PCM 48 kHz)."
                  : "Esta tela, o teleprompter e os controles não aparecem na gravação."}
            </span>
          </div>
        </div>
      ) : (
        <Interactive className="rec-pill" active={recording} id="pill">
          {phase === "saving" ? (
            <>
              <Loader size={15} className="spin" /> Salvando gravação…
            </>
          ) : (
            <>
              <span className={`rec-live ${phase === "paused" ? "is-paused" : ""}`} />
              <span className="rec-time">{clock(health?.elapsed ?? 0)}</span>
              {phase === "paused" && (
                <span className="rec-paused">
                  {resuming || status?.reopening
                    ? "retomando…"
                    : status?.phase === "failed"
                      ? "parou"
                      : status?.closed
                        ? "pausado · arquivos fechados"
                        : "pausado"}
                </span>
              )}
              <HealthStrip health={health} />
              <button
                type="button"
                title={`Pausar / continuar (${keyOf("toggle")})`}
                aria-label={phase === "paused" ? "Continuar a gravação" : "Pausar a gravação"}
                disabled={resuming}
                onClick={() => void togglePause()}
              >
                {phase === "paused" ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                type="button"
                title={`Marcador (${keyOf("marker")})`}
                aria-label={markers > 0 ? `Marcador, ${markers} até agora` : "Marcador"}
                onClick={() => void mark("marker")}
              >
                <Bookmark size={15} />
                {markers > 0 && <small>{markers}</small>}
              </button>
              <button
                type="button"
                title={`Recado para quem edita (${keyOf("note")})`}
                aria-label={
                  noteCount > 0 ? `Recado, ${noteCount} até agora` : "Recado para quem edita"
                }
                onClick={() => void openNote()}
              >
                <MessageSquarePlus size={15} />
                {noteCount > 0 && <small>{noteCount}</small>}
              </button>
              {note && (
                <input
                  ref={noteInput}
                  className="rec-note-field"
                  aria-label="Recado para quem edita"
                  placeholder="Recado para quem edita. Enter guarda, Esc desiste"
                  maxLength={NOTE_MAX}
                  value={note.text}
                  onChange={(e) => setNote({ ...note, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void closeNote(true);
                    if (e.key === "Escape") void closeNote(false);
                  }}
                  onBlur={() => void closeNote(true)}
                />
              )}
              {mode === "over" && over?.to === undefined && (
                <button
                  type="button"
                  className={lapsing ? "is-on" : ""}
                  title={
                    lapsing
                      ? `Fim do trecho acelerado (${keyOf("timelapse")}): a voz continua na próxima fala`
                      : `Trecho acelerado (${keyOf("timelapse")}): a voz espera enquanto você faz algo longo na tela, que entra acelerado no tempo da fala`
                  }
                  aria-label={lapsing ? "Fim do trecho acelerado" : "Trecho acelerado"}
                  aria-pressed={lapsing}
                  disabled={phase !== "recording"}
                  onClick={() => void toggleLapse()}
                >
                  <FastForward size={15} />
                </button>
              )}
              {mode === "over" ? (
                <button
                  type="button"
                  title={`Voltar ao começo da fala (${keyOf("retake")}): o que foi gravado fica na aula, e o gravador espera no começo da fala para gravar de novo por cima`}
                  aria-label="Voltar ao começo da fala"
                  disabled={!over?.lines?.length || over.to !== undefined || lapsing}
                  onClick={() => void rewind()}
                >
                  <RotateCcw size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  title={`${voiceMode ? "Refazer esta tomada" : "Refazer o último trecho"} (${keyOf("retake")})`}
                  aria-label={voiceMode ? "Refazer esta tomada" : "Refazer o último trecho"}
                  onClick={() => void mark("retake")}
                >
                  <RotateCcw size={15} />
                </button>
              )}
              {canDraw && (
                <button
                  type="button"
                  className={drawOn ? "is-active" : ""}
                  title={`Desenhar na tela (${keyOf("draw")}): o desenho entra na aula, não no vídeo`}
                  aria-label="Desenhar na tela"
                  aria-pressed={drawOn}
                  disabled={phase !== "recording"}
                  onClick={() => setDrawOn((on) => !on)}
                >
                  <PenLine size={15} />
                </button>
              )}
              {confirmDiscard ? (
                <>
                  <span className="rec-paused" role="alert">
                    Descartar este take? Ele vai para a Lixeira e o gravador volta ao começo.
                  </span>
                  <button type="button" className="rec-stop" onClick={() => void discard()}>
                    <Trash2 size={13} /> Descartar
                  </button>
                  <button type="button" onClick={() => setConfirmDiscard(false)}>
                    Continuar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title="Descartar este take e recomeçar"
                  aria-label="Descartar este take e recomeçar"
                  onClick={() => setConfirmDiscard(true)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                type="button"
                className="rec-stop"
                title={`Parar (${keyOf("stop")})`}
                onClick={() => void stop()}
              >
                <Square size={13} fill="currentColor" /> Parar
              </button>
            </>
          )}
        </Interactive>
      )}
    </div>
  );
}

/** The voice against the screen already recorded, line by line (shared/screenCues.ts). */
const coverageOf = (over: OverContext, recorded: readonly [number, number][]): ScreenCoverage =>
  screenCoverage(over.lines ?? [], recorded, voiceStart(over), over.end);

/**
 * "Tela sobre a narração": where the voice starts for this part, moved back or forward before
 * recording (the next part starts where the last one ended; this is to go back a little or skip),
 * with how much of the voice has a screen and the map of the lines to start at any of them.
 */
function OverStart({
  over,
  recorded,
  mapOpen,
  onMap,
  onFrom,
}: {
  over: OverContext;
  recorded: readonly [number, number][];
  mapOpen: boolean;
  onMap: (open: boolean) => void;
  onFrom: (from: number) => void;
}): ReactNode {
  const first = voiceStart(over);
  const last = Math.max(first, over.end - 1);
  const move = (to: number): void =>
    onFrom(Math.round(Math.min(last, Math.max(first, to)) * 1000) / 1000);
  const coverage = coverageOf(over, recorded);
  const lines = coverage.lines;
  const gap = coverage.firstGap;
  const ratio = coverage.total ? coverage.covered / coverage.total : 0;
  return (
    <fieldset className="rec-over-start" aria-label="Início da voz nesta parte">
      <button
        type="button"
        className={`rec-over-cover ${mapOpen ? "is-open" : ""}`}
        aria-expanded={mapOpen}
        title="As falas da aula, com e sem tela gravada: clique numa para começar nela"
        onClick={() => onMap(!mapOpen)}
      >
        <span className="rec-over-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
        {lines.length
          ? `Tela em ${coverage.done} de ${plural(lines.length, "fala", "falas")}`
          : `Tela em ${Math.round(ratio * 100)}% da voz`}
      </button>
      {gap !== null && Math.abs(gap - over.from) > 0.5 && recorded.length > 0 && (
        <button
          type="button"
          title={`Começar a voz em ${clockOf(gap)}, onde a tela gravada acaba`}
          onClick={() => move(gap)}
        >
          Continuar de onde parei
        </button>
      )}
      <button type="button" onClick={() => move(over.from - 5)} disabled={over.from <= first}>
        −5 s
      </button>
      <button type="button" onClick={() => move(over.from + 5)} disabled={over.from >= last}>
        +5 s
      </button>
      <button type="button" onClick={() => move(first)} disabled={over.from <= first}>
        Do começo da voz
      </button>
    </fieldset>
  );
}

/**
 * "Tela sobre a narração" when the voice has played to its end: how much of it has a screen, the
 * lines still without one (each can be recorded now) and the way out, to the editor or straight
 * on to sending the lesson to whoever edits it.
 */
function OverDone({
  over,
  recorded,
  onFrom,
  onClose,
}: {
  over: OverContext;
  recorded: readonly [number, number][];
  onFrom: (from: number) => void;
  onClose: (next: "flow" | "send") => void;
}): ReactNode {
  const coverage = coverageOf(over, recorded);
  const missing = coverage.lines.filter((l) => l.status !== "done");
  const complete = coverage.firstGap === null && !missing.length;
  return (
    <div className="rec-options rec-over-done" role="dialog" aria-label="A voz acabou">
      <div className="rec-opt-head">
        <strong>{complete ? "Tela completa" : "A voz acabou"}</strong>
        <small className="muted">
          {complete
            ? "Toda a voz da aula tem tela gravada. As partes já estão na aula."
            : missing.length
              ? `${plural(missing.length, "fala ainda está sem tela", "falas ainda estão sem tela")}. Grave agora ou volte depois: o gravador começa no primeiro trecho que falta.`
              : `Um trecho da voz em ${clockOf(coverage.firstGap ?? 0)} ainda está sem tela.`}
        </small>
      </div>
      {missing.length > 0 && (
        <ul className="rec-done-list">
          {missing.slice(0, 50).map((l) => (
            <li key={`${l.t}-${l.text}`}>
              <span className="rec-map-time">{clockOf(l.t)}</span>
              <span className="rec-map-text">{l.text}</span>
              <button type="button" onClick={() => onFrom(l.t)}>
                Gravar esta fala
              </button>
            </li>
          ))}
        </ul>
      )}
      {!missing.length && coverage.firstGap !== null && (
        <p>
          <button type="button" onClick={() => onFrom(coverage.firstGap ?? voiceStart(over))}>
            Gravar o trecho que falta
          </button>
        </p>
      )}
      <div className="rec-done-actions">
        <button type="button" onClick={() => onClose("flow")}>
          Voltar ao editor
        </button>
        <button type="button" className="is-primary" onClick={() => onClose("send")}>
          Enviar para a edição
        </button>
      </div>
    </div>
  );
}

const LINE_STATUS: Record<LineCoverage["status"], string> = {
  done: "com tela",
  partial: "com parte da tela",
  missing: "sem tela",
};

/**
 * The lines of the lesson by part of the script, each with whether it has a screen: one click
 * starts the voice of the next part at it.
 */
function OverMap({
  over,
  recorded,
  onFrom,
  onClose,
}: {
  over: OverContext;
  recorded: readonly [number, number][];
  onFrom: (from: number) => void;
  onClose: () => void;
}): ReactNode {
  const coverage = coverageOf(over, recorded);
  const lines = coverage.lines;
  const parts = [...new Set(lines.map((l) => l.part))];
  let current = -1;
  lines.forEach((l, i) => {
    if (l.t <= over.from + 0.05) current = i;
  });
  const missing = lines.filter((l) => l.status !== "done").length;
  return (
    <div className="rec-options rec-over-map" role="dialog" aria-label="Falas da aula">
      <div className="rec-opt-head">
        <strong>Falas da aula</strong>
        <small className="muted">
          {lines.length
            ? missing
              ? `${plural(missing, "fala ainda sem tela", "falas ainda sem tela")}. Clique numa fala para a próxima parte começar nela.`
              : "Todas as falas têm tela. Clique numa para gravar por cima dali."
            : over.transcribing
              ? "A voz ainda está sendo transcrita: as falas aparecem aqui quando terminar."
              : "Sem as falas do roteiro na voz: transcreva a voz e cole o roteiro no editor."}
        </small>
        <button type="button" className="rec-icon" aria-label="Fechar" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {parts.map((part) => (
        <section key={part} className="rec-map-part">
          <h4>{part}</h4>
          <ul>
            {lines.map((l, i) =>
              l.part === part ? (
                <li key={`${l.t}-${l.text}`}>
                  <button
                    type="button"
                    className={`rec-map-line is-${l.status} ${i === current ? "is-current" : ""}`}
                    aria-current={i === current ? "true" : undefined}
                    aria-label={`${clockOf(l.t)}, ${l.text}, ${LINE_STATUS[l.status]}`}
                    onClick={() => onFrom(l.t)}
                  >
                    <span className="rec-map-dot" aria-hidden="true" />
                    <span className="rec-map-time">{clockOf(l.t)}</span>
                    <span className="rec-map-text">{l.text}</span>
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Source({
  icon: Icon,
  label,
  children,
  extra,
  info = false,
}: {
  icon: typeof Mic;
  label: string;
  children: ReactNode;
  extra?: ReactNode;
  /** Only says how it works (nothing to choose): the first to go on a narrow screen. */
  info?: boolean;
}): ReactNode {
  return (
    <fieldset
      className={`rec-src ${info ? "is-info" : ""}`}
      aria-label={label}
      style={{ margin: 0, padding: 0, border: 0 }}
    >
      <span className="rec-src-icon">
        <Icon size={15} />
      </span>
      <span className="rec-src-body">
        <small>{label}</small>
        {children}
        {extra}
      </span>
    </fieldset>
  );
}

/** Camera previews still holding their device: a take opens the camera once they let go. */
const previewHolds = new Set<Promise<void>>();
const previewsReleased = (): Promise<void> => Promise.all([...previewHolds]).then(() => undefined);

/**
 * Webcam preview (setup only: the recorder needs the camera free): in the corner of the region,
 * or, for "Voz e câmera", large on the left as the presenter will be seen (not mirrored). A
 * camera that does not open says why and can be tried again.
 */
function CameraPreview({
  device,
  region,
  presenter = false,
}: {
  device: string;
  region?: Rect;
  presenter?: boolean;
}): ReactNode {
  const ref = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // `attempt` opens the camera again after a failure.
    void attempt;
    let cancelled = false;
    let pending = true;
    let stream: MediaStream | null = null;
    let release = (): void => undefined;
    const hold = new Promise<void>((done) => {
      release = done;
    });
    previewHolds.add(hold);
    const letGo = (): void => {
      for (const t of stream?.getTracks() ?? []) t.stop();
      stream = null;
      previewHolds.delete(hold);
      release();
    };
    setFailure(null);
    void (async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(
        (d) =>
          d.kind === "videoinput" &&
          (d.label === device || d.label.includes(device) || device.includes(d.label)),
      );
      const opened = await navigator.mediaDevices.getUserMedia({
        video: match ? { deviceId: { exact: match.deviceId } } : true,
      });
      pending = false;
      stream = opened;
      // Closed while it was opening: the stream that arrived late is stopped at once.
      if (cancelled) {
        letGo();
        return;
      }
      if (ref.current) ref.current.srcObject = opened;
    })().catch((error: unknown) => {
      pending = false;
      letGo();
      if (!cancelled)
        setFailure(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    });
    return () => {
      cancelled = true;
      if (!pending) letGo();
    };
  }, [device, attempt]);
  const problem = failure && (
    <div className="rec-cam-problem">
      <p>A prévia da câmera não abriu ({failure}).</p>
      <button type="button" onClick={() => setAttempt((n) => n + 1)}>
        Tentar de novo
      </button>
    </div>
  );
  if (presenter || !region)
    return (
      <div className="rec-cam is-presenter">
        <video ref={ref} autoPlay muted playsInline />
        {problem}
        <span>
          <Video size={11} /> Câmera · vídeo do apresentador
        </span>
      </div>
    );
  const size = Math.min(220, region.height * 0.32);
  return (
    <div
      className="rec-cam"
      style={{
        left: region.x + region.width - size - 24,
        top: region.y + region.height - size - 24,
        width: size,
        height: size,
      }}
    >
      <video ref={ref} autoPlay muted playsInline />
      {problem}
      <span>
        <Video size={11} /> Câmera · faixa separada
      </span>
    </div>
  );
}

/** Script lines to read while recording; never captured. */
function Teleprompter({
  lines,
  live,
  current,
  setCurrent,
  size,
  wordsPerMinute,
  onSize,
  onHide,
  nextKey,
}: {
  lines: Line[];
  live: boolean;
  current: number;
  setCurrent: (index: number) => void;
  size: number;
  wordsPerMinute: number;
  onSize: (size: number) => void;
  onHide: () => void;
  nextKey: string;
}): ReactNode {
  const [auto, setAuto] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current
      ?.querySelector(`[data-line="${current}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);
  // Auto-advance at the speaking rate set in the options.
  useEffect(() => {
    if (!auto || !live) return;
    const words = lines[current]?.text.split(/\s+/).length ?? 0;
    const id = setTimeout(() => setCurrent(current + 1), (words / wordsPerMinute) * 60_000 + 600);
    return () => clearTimeout(id);
  }, [auto, live, current, lines, wordsPerMinute, setCurrent]);
  return (
    <Interactive className="tp" active={live} id="teleprompter">
      <div className="tp-head">
        <ScrollText size={16} className="accent" />
        <div className="tp-title">
          <strong>Roteiro · Teleprompter</strong>
          <small>Só você vê: não entra na gravação · {nextKey} próxima fala</small>
        </div>
        <button
          type="button"
          className="rec-icon"
          title="Esconder"
          aria-label="Esconder o teleprompter"
          onClick={onHide}
        >
          <EyeOff size={15} />
        </button>
      </div>
      <div className="tp-body" ref={body} style={{ fontSize: size }}>
        {withRenderKeys(lines, (line) => JSON.stringify(line)).map(({ key, value: l }, i) => (
          <button
            type="button"
            key={key}
            data-line={i}
            className={`tp-line ${i === current ? "is-current" : ""} ${l.avatar ? "is-avatar" : ""} ${i < current ? "is-done" : ""}`}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: 0,
              background: "none",
              color: "inherit",
              font: "inherit",
            }}
            onClick={() => setCurrent(i)}
          >
            {l.avatar && <small>{l.speaker} · avatar (não gravar)</small>}
            {l.text}
          </button>
        ))}
      </div>
      <div className="tp-foot">
        <label className="tp-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{" "}
          Avançar sozinho ({wordsPerMinute} pal./min)
        </label>
        <span className="spacer" />
        <button type="button" onClick={() => setCurrent(current - 1)} title="Fala anterior">
          ↑
        </button>
        <button type="button" onClick={() => setCurrent(current + 1)} title="Próxima fala">
          ↓
        </button>
        <button type="button" onClick={() => onSize(Math.max(14, size - 2))}>
          A−
        </button>
        <button type="button" onClick={() => onSize(Math.min(40, size + 2))}>
          A+
        </button>
      </div>
    </Interactive>
  );
}
