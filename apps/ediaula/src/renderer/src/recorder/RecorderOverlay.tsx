import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { CameraChoice, CameraMode } from "@shared/camera";
import { GUIDED_DEFAULTS, type GuidedPlan, scheduleGuided } from "@shared/guidedRecording";
import { HOTKEY_LABELS, type HotkeyReport, hotkeyLabel } from "@shared/hotkeys";
import type { RecorderSettings } from "@shared/recorderSettings";
import type {
  CaptureMonitor,
  CaptureSources,
  RecorderEvent,
  RecorderStatus,
} from "@shared/recording";
import type { MicLevel, RecorderHealth } from "@shared/recordingHealth";
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
import { GuidedSetup } from "./GuidedSetup";
import { HealthStrip, LevelBars } from "./HealthStrip";
import { CameraModeSelect, RecorderOptions } from "./RecorderOptions";
import { SystemAudio } from "./systemAudio";
import { resendUiRects, useUiRect } from "./uiRects";

type Phase = "setup" | "countdown" | "recording" | "paused" | "saving";
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Line = { speaker: string; text: string; avatar: boolean };

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
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedPlan, setGuidedPlan] = useState<GuidedPlan>({ ...GUIDED_DEFAULTS, steps: [] });
  const [guidedBusy, setGuidedBusy] = useState(false);
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
    void window.api.recorder.context().then((c) => setLines(c.teleprompter));
    void Promise.all([window.api.recorder.sources(), window.api.recorder.settings()]).then(
      ([s, saved]) => {
        setSources(s);
        setSettings(saved);
        const wanted = saved.monitor;
        const remembered = wanted
          ? s.monitors.find(
              (m) =>
                m.x === wanted.x &&
                m.y === wanted.y &&
                m.width === wanted.width &&
                m.height === wanted.height,
            )
          : undefined;
        const m =
          remembered ??
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
  }, []);

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
      phaseRef.current = "paused";
      setPhase("paused");
    }
  }, [status]);

  // Encoders are tried on the real screen in the background, not during the countdown.
  const monitorIndex = monitor?.index;
  const fps = settings?.fps;
  useEffect(() => {
    if (monitorIndex === undefined || fps === undefined) return;
    let current = true;
    setEncoder(null);
    window.api.recorder.encoder(monitorIndex).then(
      (label) => current && setEncoder({ label }),
      (err: unknown) => current && setEncoder({ error: cleanError(err) }),
    );
    return () => {
      current = false;
    };
  }, [monitorIndex, fps]);

  // The level meter listens to the very device the take will record.
  useEffect(() => {
    if (phase !== "setup") return;
    setLevel(null);
    void window.api.recorder.monitorMic(mic || null);
    return () => {
      void window.api.recorder.monitorMic(null);
    };
  }, [mic, phase]);

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
    (index: number) => {
      const next = Math.max(0, Math.min(lines.length - 1, index));
      setLine(next);
      if (phaseRef.current === "recording" || phaseRef.current === "paused")
        void window.api.recorder.teleprompterLine(next);
    },
    [lines.length],
  );

  const finishSystemAudio = useCallback(async (): Promise<void> => {
    const s = system.current;
    system.current = null;
    await s?.finish();
  }, []);

  const begin = useCallback(async () => {
    if (!monitor || !settings || phaseRef.current !== "setup" || guidedBusy) return;
    preservationRequested.current = false;
    setError(null);
    setAlert(null);
    if (guidedMode) {
      try {
        scheduleGuided(guidedPlan);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    setPhase("countdown");
    phaseRef.current = "countdown";
    try {
      guidedFailed.current = false;
      if (guidedMode && guidedPlan.audio) {
        const audio = new Audio(mediaUrl(guidedPlan.audio.path));
        guidedAudio.current = audio;
        await new Promise<void>((resolve, reject) => {
          audio.oncanplay = () => resolve();
          audio.onerror = () => reject(new Error("Não foi possível abrir a narração."));
          audio.load();
        });
      }
      const narrated = guidedMode && !!guidedPlan.audio;
      const systemOn = settings.systemAudio && !narrated;
      // The mouse helper loads during the countdown.
      const prep = window.api.recorder.prepare({
        monitor: monitor.index,
        regionDip: region,
        microphone: narrated ? undefined : mic || undefined,
        camera: cam || undefined,
        cameraMode: cam ? (settings.cameraMode ?? camModes?.choice ?? undefined) : undefined,
        cameraLatency: settings.cameraLatency,
        keys: settings.keys,
        fps: settings.fps,
        quality: settings.quality,
        systemAudio: systemOn,
      });
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
      if (!preservationRequested.current && systemOn)
        system.current = await SystemAudio.start(setError).catch((e) => {
          setError(`Áudio do PC indisponível: ${(e as Error).message}`);
          return null;
        });
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
      if (guidedMode) {
        const timing = await window.api.recorder.guidedStart(guidedPlan);
        guidedOffset.current = timing.origin + timing.lead;
      }
    } catch (err) {
      setError(cleanError(err));
      guidedAudio.current?.pause();
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
    cam,
    camModes,
    guidedMode,
    guidedPlan,
    guidedBusy,
    line,
    finishSystemAudio,
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
      phaseRef.current = "paused";
      setPhase("paused");
      await window.api.recorder.pause();
    } else if (phaseRef.current === "paused") {
      // Instant, unless a source has to open again (after a failure or a long pause).
      setResuming(true);
      try {
        await window.api.recorder.resume();
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
    await window.api.recorder.guidedCancel();
    void window.api.recorder.interactive(true);
    try {
      await finishSystemAudio();
      await window.api.recorder.stop();
    } catch (err) {
      setError(cleanError(err));
      phaseRef.current = "paused";
      setPhase("paused");
    }
  }, [finishSystemAudio]);

  /** Throws this take away (Recycle Bin) and goes back to setting up. */
  const discard = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    if (
      !window.confirm("Descartar este take? Ele vai para a Lixeira e o gravador volta ao começo.")
    )
      return;
    guidedAudio.current?.pause();
    guidedOffset.current = null;
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
        kind === "retake" ? "Refazer: o trecho anterior será proposto para corte" : "Marcador",
      );
    },
    [showFlash],
  );

  useEffect(
    () =>
      window.api.recorder.onHotkey((name) => {
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
        else if (name === "line-next") moveLine(line + 1);
        else if (name === "line-prev") moveLine(line - 1);
      }),
    [begin, togglePause, stop, mark, moveLine, line],
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

  return (
    <div className={`rec-root is-${phase}`}>
      {guidedMode && phase === "setup" && (
        <GuidedSetup
          plan={guidedPlan}
          change={setGuidedPlan}
          script={lines.map((l) => l.text).join("\n")}
          busy={phase !== "setup"}
          onBusy={setGuidedBusy}
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

      {cam && phase === "setup" && <CameraPreview device={cam} region={region} />}

      {!guidedMode && prompterOn && settings && (
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
          <div className="rec-encoder" aria-live="polite">
            {!encoder
              ? "Testando o codificador nesta tela…"
              : encoder.label
                ? `Gravação: ${encoder.label}`
                : `Codificador indisponível: ${encoder.error}`}
          </div>
          <div className="rec-mode">
            <label htmlFor="recording-mode">Modo de gravação </label>
            <select
              id="recording-mode"
              value={guidedMode ? "guided" : "manual"}
              disabled={phase !== "setup" || guidedBusy}
              onChange={(e) => setGuidedMode(e.target.value === "guided")}
            >
              <option value="manual">Manual</option>
              <option value="guided">Guiado por roteiro/áudio</option>
            </select>
          </div>
          <div className="rec-bar">
            <button
              type="button"
              className="rec-go"
              onClick={() => void begin()}
              disabled={!monitor || !settings || phase !== "setup" || guidedBusy}
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
            <Source icon={MonitorUp} label="Tela">
              <select
                value={monitor?.index ?? ""}
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
                onChange={(e) => {
                  setCam(e.target.value);
                  change({ camera: e.target.value || null, cameraMode: null });
                }}
              >
                <option value="">Desligada</option>
                {sources?.cameras.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Source>
            <Source
              icon={Mic}
              label="Microfone"
              extra={
                mic && phase === "setup" ? (
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
                value={mic}
                onChange={(e) => {
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
            <Source icon={Volume2} label="Áudio do PC">
              <select
                value={settings?.systemAudio ? "on" : "off"}
                onChange={(e) => change({ systemAudio: e.target.value === "on" })}
              >
                <option value="off">Desligado</option>
                <option value="on">Ligado (faixa separada)</option>
              </select>
            </Source>
            <Source icon={MousePointer2} label="Cursor">
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
            {lines.length > 0 && settings && (
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
              <kbd>{keyOf("retake")}</kbd> refazer último trecho
            </span>
            {lines.length > 0 && (
              <span>
                <kbd>{keyOf("lineNext")}</kbd> próxima fala
              </span>
            )}
            <span className="rec-note">
              Esta tela, o teleprompter e os controles não aparecem na gravação.
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
}: {
  icon: typeof Mic;
  label: string;
  children: ReactNode;
  extra?: ReactNode;
}): ReactNode {
  return (
    <fieldset className="rec-src" aria-label={label} style={{ margin: 0, padding: 0, border: 0 }}>
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

/** Webcam preview in the corner of the region (setup only: the recorder needs the camera free). */
function CameraPreview({ device, region }: { device: string; region: Rect }): ReactNode {
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
