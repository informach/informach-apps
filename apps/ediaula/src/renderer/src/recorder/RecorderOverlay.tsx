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
import type { RecorderSettings } from "@shared/recorderSettings";
import type {
  CaptureMonitor,
  CaptureSources,
  OverContext,
  RecorderEvent,
  RecorderStatus,
} from "@shared/recording";
import type { MicLevel, RecorderHealth } from "@shared/recordingHealth";
import { type PrompterLine, readLines, stepLine, voiceSpeakers } from "@shared/voiceTakes";
import {
  AlertTriangle,
  Bookmark,
  Eye,
  EyeOff,
  Keyboard,
  Loader,
  Mic,
  MonitorUp,
  MousePointer2,
  Pause,
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
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { mediaUrl } from "@/lib/media";
import { GuidedSetup, guidedProblem } from "./GuidedSetup";
import { GuidedWebPanel } from "./GuidedWebPanel";
import { HealthStrip, LevelBars } from "./HealthStrip";
import { OverPlayer } from "./overPlayer";
import { CameraModeSelect, RecorderOptions } from "./RecorderOptions";
import { SystemAudio } from "./systemAudio";
import { resendUiRects, useUiRect } from "./uiRects";
import { KaraokePrompter, MicTest, SpeakerChips, VoicePrompter } from "./VoiceTools";

type Phase = "setup" | "countdown" | "recording" | "paused" | "saving";
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
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

/** 16:9 in the middle of the window. */
function centered169(): Rect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const h = Math.min(H, (W * 9) / 16);
  const w = (h * 16) / 9;
  return {
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}
const fullWindow = (): Rect => ({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

/** The region the settings ask for, if it still fits this screen. */
function regionFrom(settings: RecorderSettings): Rect {
  const r = settings.region;
  if (r.preset === "16:9") return centered169();
  if (r.preset === "custom" && r.rect) {
    const { x, y, width, height } = r.rect;
    if (x + width <= window.innerWidth && y + height <= window.innerHeight)
      return { x, y, width, height };
  }
  return fullWindow();
}

/**
 * Lets clicks reach the recorder's own controls while everything else goes to the apps
 * underneath, and tells the cursor helper where they are (the pointer over them is not part of
 * the video).
 */
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
      aria-label="Controles da gravação"
      onMouseEnter={() => active && void window.api.recorder.interactive(true)}
      onMouseLeave={() => active && void window.api.recorder.interactive(false)}
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
  const [monitor, setMonitor] = useState<CaptureMonitor | null>(null);
  const [region, setRegion] = useState<Rect>(fullWindow);
  const [mic, setMic] = useState<string>("");
  const [cam, setCam] = useState<string>("");
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
  /** "Tela sobre a narração": the lesson's voice as the editor handed it over. */
  const [over, setOver] = useState<OverContext | null>(null);
  const [notes, setNotes] = useState<{ before: number; text: string }[]>([]);
  /** Speakers whose lines the voice take reads. */
  const [speakerOn, setSpeakerOn] = useState<Set<string>>(new Set());
  /** "Regravar falas": only these lines, in "Só voz" (RecorderContext.retakeLines). */
  const [retake, setRetake] = useState<number[] | null>(null);
  /** Over the narration the microphone is off unless chosen here. */
  const [overMic, setOverMic] = useState("");
  /** Over the narration the computer's sound is off unless turned on here, for this take. */
  const [overSystem, setOverSystem] = useState(false);
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
    const load = (): Promise<void> =>
      window.api.recorder.context().then((c) => {
        loadedProject.current = c.projectId ?? null;
        setLines(c.teleprompter);
        setNotes(c.screenNotes ?? []);
        setOver(c.over ?? null);
        setSpeakerOn(
          new Set(
            voiceSpeakers(c.teleprompter)
              .filter((v) => v.on)
              .map((v) => v.name),
          ),
        );
        if (c.mode === "over" && c.over) setMode("over");
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
    void Promise.all([window.api.recorder.sources(), window.api.recorder.settings()]).then(
      ([s, saved]) => {
        setSources(s);
        setSettings(saved);
        const remembered = saved.recordMode;
        if (remembered !== "screen") setMode((m) => (m === "screen" ? remembered : m));
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
        setMonitor(m ?? null);
        if (m && m.index !== s.current) void window.api.recorder.moveTo(m.index);
        // "" was "Sem áudio" on purpose; a microphone that is gone gives way to the first one.
        setMic(
          saved.microphone === ""
            ? ""
            : saved.microphone && s.microphones.includes(saved.microphone)
              ? saved.microphone
              : (s.microphones[0] ?? ""),
        );
        setCam(saved.camera && s.cameras.includes(saved.camera) ? saved.camera : "");
        setRegion(regionFrom(saved));
      },
    );
    void window.api.recorder.hotkeys().then(setHotkeys);
    return offContext;
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
    window.api.recorder.cameraModes(cam).then(
      (modes) => current && setCamModes(modes),
      () => current && setCamModes({ modes: [], choice: null }),
    );
    return () => {
      current = false;
    };
  }, [cam]);

  // The window resizes when moved to another monitor: the region the options ask for, if it
  // fits there, else the whole screen.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    const onResize = (): void => {
      const s = settingsRef.current;
      setRegion(s ? regionFrom(s) : fullWindow());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A new take only knows where the controls are once it is told.
  useEffect(() => {
    if (phase === "recording") resendUiRects();
  }, [phase]);

  const showFlash = useCallback((text: string): void => {
    setFlash(text);
    setTimeout(() => setFlash(null), 1400);
  }, []);

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
    if (!window.confirm("Descartar este take? Ele vai para a Lixeira e o plano fica como está."))
      return;
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
    if (voiceMode && !mic) {
      setError("Escolha o microfone para gravar a voz.");
      return;
    }
    if (voiceCam && !cam) {
      setError("Escolha a câmera para gravar voz e câmera.");
      return;
    }
    if (mode === "over" && !over) {
      setError("Abra o gravador pelo editor, numa aula com a faixa Voz.");
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
        const narration = await window.api.recorder.narration();
        const p = new OverPlayer(narration.path, narration.start);
        p.onHeard = (at) => {
          setHeard(at);
          // A redo ends by itself a moment after its stretch.
          if (over.to !== undefined && at >= over.to + 0.3) void stopRef.current();
        };
        p.onError = (message) => setError(`A voz da aula: ${message}`);
        await p.load();
        player.current = p;
        setFlash(null);
      }
      const narrated = guidedMode && !!guidedPlan?.audio;
      // The computer's sound leaves EdiAula's own sound out (shared/systemAudio.ts), so the voice
      // played over the screen, or a guided narration, never comes back in it twice.
      const systemOn = (mode === "over" ? overSystem : settings.systemAudio) && !voiceMode;
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
                    camera: cam,
                    cameraMode: settings.cameraMode ?? camModes?.choice ?? undefined,
                    cameraLatency: settings.cameraLatency,
                  }
                : {}),
            }
          : {
              monitor: monitor?.index,
              regionDip: region,
              microphone: narrated ? undefined : (mode === "over" ? overMic : mic) || undefined,
              camera: cam || undefined,
              cameraMode: cam ? (settings.cameraMode ?? camModes?.choice ?? undefined) : undefined,
              cameraLatency: settings.cameraLatency,
              keys: settings.keys,
              fps: settings.fps,
              quality: settings.quality,
              systemAudio: systemOn,
              ...(mode === "over" && over
                ? {
                    mode: "over" as const,
                    over: {
                      from: over.from,
                      ...(over.to !== undefined ? { to: over.to } : {}),
                      ...(over.replace ? { replace: true } : {}),
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
      await window.api.recorder.start();
      setMarkers(0);
      if (!preservationRequested.current && systemOn) {
        system.current = await SystemAudio.start(setError).catch((e) => {
          setError(`Áudio do PC indisponível: ${(e as Error).message}`);
          return null;
        });
        if (system.current && !system.current.excludesApp) {
          setFlash(
            "Neste Windows o áudio do PC pode incluir o som do próprio EdiAula: a separação pede o Windows 10 versão 2004 ou mais novo.",
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
      // A redo starts the voice two seconds early, to come into the stretch already in rhythm.
      if (mode === "over" && over)
        await player.current?.play(over.replace ? Math.max(0, over.from - 2) : over.from);
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
    overSystem,
    cam,
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
        await player.current?.play();
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
      await window.api.recorder.stop();
    } catch (err) {
      setError(cleanError(err));
      phaseRef.current = "paused";
      setPhase("paused");
    }
  }, [finishSystemAudio]);
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

  /** Throws this take away (Recycle Bin) and goes back to setting up. */
  const discard = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    if (
      !window.confirm("Descartar este take? Ele vai para a Lixeira e o gravador volta ao começo.")
    )
      return;
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
        else if (name === "retake") void mark("retake");
        else if (name === "line-next") stepTo(1);
        else if (name === "line-prev") stepTo(-1);
      }),
    [begin, togglePause, stop, mark, stepTo, toggleWeb, stopWeb],
  );

  // The disk filled up: the main process already stopped the capture; save what there is.
  useEffect(() => {
    if (alert?.request === "stop") void stop();
  }, [alert, stop]);

  const recording = phase === "recording" || phase === "paused";
  const scale = monitor ? monitor.width / window.innerWidth : 1;
  const physical = { w: Math.round(region.width * scale), h: Math.round(region.height * scale) };
  const keyOf = (action: keyof RecorderSettings["hotkeys"]): string =>
    hotkeyLabel(settings?.hotkeys[action] ?? "");
  const badKeys = hotkeys.filter((r) => !r.ok);
  const prompterOn = !!settings?.teleprompter.on && lines.length > 0;
  const bigSize = Math.max(30, Math.round((settings?.teleprompter.size ?? 22) * 1.6));
  const followNote =
    voiceMode && settings?.follow
      ? (follow?.message ??
        (recording ? "" : "Com o motor de transcrição instalado, a fala avança sozinha."))
      : "";

  const webPlan = guidedMode && guidedPlan?.mode === "web";
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
        <div className="rec-flash">
          {error} · {keyOf("stop")} para salvar e encerrar.
        </div>
      )}
      {alert && recording && (
        <Interactive className="rec-alert" active={recording} id="alert">
          <AlertTriangle size={16} className="warn-icon" />
          <span>{alert.message}</span>
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
      {!voiceMode && !webPlan && (
        <RegionFrame
          region={region}
          onChange={(r) => {
            setRegion(r);
            change({ region: { preset: "custom", rect: r } });
          }}
          editable={phase === "setup"}
          recording={recording}
          label={`${physical.w} × ${physical.h}`}
        />
      )}

      {cam && phase === "setup" && !voiceMode && !webPlan && (
        <CameraPreview device={cam} region={region} />
      )}
      {cam && phase === "setup" && voiceCam && <CameraPreview device={cam} presenter />}
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
      {flash && <div className="rec-flash">{flash}</div>}

      {phase === "setup" || phase === "countdown" ? (
        <div className="rec-dock">
          {optionsOpen && settings && (
            <RecorderOptions
              settings={settings}
              change={change}
              reports={hotkeys}
              onClose={() => setOptionsOpen(false)}
            />
          )}
          {error && <div className="rec-error">{error}</div>}
          {badKeys.length > 0 && (
            <div className="rec-error">
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
                {over ? "Tela sobre a narração" : "Tela sobre a narração (abra pelo editor)"}
              </option>
              <option value="guided">Guiado por plano (roteiro ou áudio)</option>
            </select>
            {mode === "over" && over && (
              <span className="rec-mode-note">
                A voz da aula toca nos fones a partir de {clockOf(over.from)}
                {over.to !== undefined ? ` e a tela é regravada até ${clockOf(over.to)}` : ""}. Use
                fones.
              </span>
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
                        setMonitor(m);
                        change({ monitor: { x: m.x, y: m.y, width: m.width, height: m.height } });
                        void window.api.recorder.moveTo(m.index);
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
                    value=""
                    onChange={(e) => {
                      const full = e.target.value === "full";
                      setRegion(full ? fullWindow() : centered169());
                      change({ region: { preset: full ? "full" : "16:9" } });
                    }}
                  >
                    <option value="" disabled>
                      {physical.w} × {physical.h}
                    </option>
                    <option value="full">Tela inteira</option>
                    <option value="169">16:9 no centro</option>
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
                      value={settings.cameraMode}
                      fps={30}
                      onChange={(cameraMode) => change({ cameraMode })}
                    />
                  ) : null
                }
              >
                <select
                  value={cam}
                  title={cam || (voiceCam ? "Escolha a câmera" : "Desligada")}
                  onChange={(e) => {
                    setCam(e.target.value);
                    change({ camera: e.target.value || null, cameraMode: null });
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
                    value={(mode === "over" ? overSystem : settings?.systemAudio) ? "on" : "off"}
                    title="O som do computador (música, efeitos de um jogo, o navegador), sem o som do próprio EdiAula."
                    onChange={(e) =>
                      mode === "over"
                        ? setOverSystem(e.target.value === "on")
                        : change({ systemAudio: e.target.value === "on" })
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
                    title="Mostra atalhos (Ctrl+…) e setas na tela. A digitação comum nunca é gravada."
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
              onClick={() => setOptionsOpen((o) => !o)}
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              className="rec-icon"
              title="Fechar sem gravar"
              onClick={() => void window.api.recorder.cancel()}
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
                disabled={resuming}
                onClick={() => void togglePause()}
              >
                {phase === "paused" ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                type="button"
                title={`Marcador (${keyOf("marker")})`}
                onClick={() => void mark("marker")}
              >
                <Bookmark size={15} />
                {markers > 0 && <small>{markers}</small>}
              </button>
              <button
                type="button"
                title={`Refazer o último trecho (${keyOf("retake")})`}
                onClick={() => void mark("retake")}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                title="Descartar este take e recomeçar"
                onClick={() => void discard()}
              >
                <Trash2 size={15} />
              </button>
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

/** Region of the screen to record: drag inside to move, handles to resize. */
function RegionFrame({
  region,
  onChange,
  editable,
  recording,
  label,
}: {
  region: Rect;
  onChange: (r: Rect) => void;
  editable: boolean;
  recording: boolean;
  label: string;
}): ReactNode {
  const drag = (e: ReactPointerEvent, mode: string): void => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const r0 = region;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { x, y, width, height } = r0;
      if (mode === "move") {
        x = Math.min(Math.max(0, x + dx), W - width);
        y = Math.min(Math.max(0, y + dy), H - height);
      } else {
        if (mode.includes("w")) {
          x = Math.min(Math.max(0, r0.x + dx), r0.x + r0.width - 80);
          width = r0.x + r0.width - x;
        }
        if (mode.includes("e")) width = Math.min(Math.max(80, r0.width + dx), W - r0.x);
        if (mode.includes("n")) {
          y = Math.min(Math.max(0, r0.y + dy), r0.y + r0.height - 80);
          height = r0.y + r0.height - y;
        }
        if (mode.includes("s")) height = Math.min(Math.max(80, r0.height + dy), H - r0.y);
      }
      onChange({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const style = { left: region.x, top: region.y, width: region.width, height: region.height };
  return (
    <div
      className={`rec-region ${recording ? "is-recording" : ""} ${editable ? "is-editable" : ""}`}
      style={style}
      onPointerDown={(e) => drag(e, "move")}
    >
      {editable && (
        <>
          <span className="rec-region-tag">
            <ScanLine size={13} /> Região · {label}
          </span>
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
            <span key={h} className={`rec-handle h-${h}`} onPointerDown={(e) => drag(e, h)} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Webcam preview (setup only: the recorder needs the camera free): in the corner of the region,
 * or, for "Voz e câmera", large on the left as the presenter will be seen.
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
  useEffect(() => {
    let stream: MediaStream | null = null;
    void (async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(
        (d) =>
          d.kind === "videoinput" &&
          (d.label === device || d.label.includes(device) || device.includes(d.label)),
      );
      stream = await navigator.mediaDevices.getUserMedia({
        video: match ? { deviceId: { exact: match.deviceId } } : true,
      });
      if (ref.current) ref.current.srcObject = stream;
    })().catch(() => undefined);
    return () =>
      stream?.getTracks().forEach((t) => {
        t.stop();
      });
  }, [device]);
  if (presenter || !region)
    return (
      <div className="rec-cam is-presenter">
        <video ref={ref} autoPlay muted playsInline />
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
        <button type="button" className="rec-icon" title="Esconder" onClick={onHide}>
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
