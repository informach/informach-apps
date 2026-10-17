import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { GUIDED_DEFAULTS, type GuidedPlan, scheduleGuided } from "@shared/guidedRecording";
import type { CaptureMonitor, CaptureSources } from "@shared/recording";
import {
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
  Square,
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

/** Lets clicks reach the recorder's own controls while everything else goes to the apps underneath. */
function Interactive({
  children,
  className,
  active,
}: {
  children: ReactNode;
  className?: string;
  active: boolean;
}): ReactNode {
  return (
    <fieldset
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
  const [monitor, setMonitor] = useState<CaptureMonitor | null>(null);
  const [region, setRegion] = useState<Rect>({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [mic, setMic] = useState<string>("");
  const [cam, setCam] = useState<string>("");
  const [systemOn, setSystemOn] = useState(false);
  const [keysOn, setKeysOn] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedPlan, setGuidedPlan] = useState<GuidedPlan>({ ...GUIDED_DEFAULTS, steps: [] });
  const [guidedBusy, setGuidedBusy] = useState(false);
  const guidedFailed = useRef(false);
  const guidedAudio = useRef<HTMLAudioElement | null>(null);
  const guidedOffset = useRef<number | null>(null);
  const system = useRef<{
    rec: MediaRecorder;
    chunks: Blob[];
    startedAt: number;
    stream: MediaStream;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [markers, setMarkers] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [prompterOn, setPrompterOn] = useState(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    document.documentElement.classList.add("is-recorder");
    void window.api.recorder.context().then((c) => {
      setLines(c.teleprompter);
      setPrompterOn(c.teleprompter.length > 0);
    });
    void window.api.recorder.sources().then((s) => {
      setSources(s);
      const m =
        s.monitors.find((x) => x.index === s.current) ??
        s.monitors.find((x) => x.primary) ??
        s.monitors[0];
      setMonitor(m ?? null);
      setMic(s.microphones[0] ?? "");
    });
  }, []);

  // The window resizes when moved to another monitor: start with the whole screen again.
  useEffect(() => {
    const onResize = (): void => {
      setRegion({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const id = setInterval(() => void window.api.recorder.elapsed().then(setElapsed), 250);
    return () => clearInterval(id);
  }, [phase]);

  const showFlash = useCallback((text: string): void => {
    setFlash(text);
    setTimeout(() => setFlash(null), 1400);
  }, []);

  /** The computer's sound (Windows loopback), recorded here and handed to the recorder at the end. */
  const startSystemAudio = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((t) => {
      t.stop();
    });
    const audio = new MediaStream(stream.getAudioTracks());
    if (!audio.getAudioTracks().length) throw new Error("sem trilha de áudio");
    const rec = new MediaRecorder(audio, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 160_000,
    });
    const entry = { rec, chunks: [] as Blob[], startedAt: 0, stream };
    rec.ondataavailable = (e) => e.data.size && entry.chunks.push(e.data);
    await new Promise<void>((resolve) => {
      rec.onstart = () => {
        entry.startedAt = Date.now();
        resolve();
      };
      rec.start(1000);
    });
    system.current = entry;
  }, []);

  const finishSystemAudio = useCallback(async (): Promise<void> => {
    const s = system.current;
    system.current = null;
    if (!s) return;
    await new Promise<void>((resolve) => {
      s.rec.onstop = () => resolve();
      s.rec.stop();
    });
    s.stream.getTracks().forEach((t) => {
      t.stop();
    });
    const bytes = new Uint8Array(await new Blob(s.chunks, { type: "audio/webm" }).arrayBuffer());
    if (bytes.length) await window.api.recorder.systemAudio(bytes, s.startedAt);
  }, []);

  const begin = useCallback(async () => {
    if (!monitor || phaseRef.current !== "setup" || guidedBusy) return;
    setError(null);
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
      // The mouse helper loads during the countdown.
      const prep = window.api.recorder.prepare({
        monitor: monitor.index,
        regionDip: region,
        microphone: guidedMode && guidedPlan.audio ? undefined : mic || undefined,
        camera: cam || undefined,
        keys: keysOn,
        fps: 30,
      });
      await Promise.all([
        prep,
        (async () => {
          for (let i = 3; i > 0; i--) {
            setCount(i);
            await new Promise((r) => setTimeout(r, 1000));
          }
        })(),
      ]);
      await window.api.recorder.start();
      if (systemOn && !(guidedMode && guidedPlan.audio))
        await startSystemAudio().catch((e) =>
          setError(`Áudio do PC indisponível: ${(e as Error).message}`),
        );
      setPhase("recording");
      phaseRef.current = "recording";
      void window.api.recorder.interactive(false);
      if (guidedMode) {
        const timing = await window.api.recorder.guidedStart(guidedPlan);
        guidedOffset.current = timing.origin + timing.lead;
      }
    } catch (err) {
      setError(
        String((err as Error).message).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
      );
      guidedAudio.current?.pause();
      await window.api.recorder.reset().catch(() => undefined);
      phaseRef.current = "setup";
      setPhase("setup");
    }
  }, [
    monitor,
    region,
    mic,
    cam,
    systemOn,
    keysOn,
    guidedMode,
    guidedPlan,
    guidedBusy,
    startSystemAudio,
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

  const togglePause = useCallback(async () => {
    if (guidedFailed.current) return;
    if (phaseRef.current === "recording") {
      guidedAudio.current?.pause();
      phaseRef.current = "paused";
      setPhase("paused");
      system.current?.rec.pause();
      await window.api.recorder.pause();
    } else if (phaseRef.current === "paused") {
      await window.api.recorder.resume();
      system.current?.rec.resume();
      setPhase("recording");
      phaseRef.current = "recording";
    }
  }, []);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    setPhase("saving");
    phaseRef.current = "saving";
    guidedAudio.current?.pause();
    guidedOffset.current = null;
    await window.api.recorder.guidedCancel();
    void window.api.recorder.interactive(true);
    try {
      await finishSystemAudio();
      await window.api.recorder.stop();
    } catch (err) {
      setError(String((err as Error).message));
      setPhase("setup");
    }
  }, [finishSystemAudio]);

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
      }),
    [begin, togglePause, stop, mark],
  );

  const recording = phase === "recording" || phase === "paused";
  const scale = monitor ? monitor.width / window.innerWidth : 1;
  const physical = { w: Math.round(region.width * scale), h: Math.round(region.height * scale) };

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
      {error && recording && <div className="rec-flash">{error} · F10 para salvar e encerrar.</div>}
      <RegionFrame
        region={region}
        onChange={setRegion}
        editable={phase === "setup"}
        recording={recording}
        label={`${physical.w} × ${physical.h}`}
      />

      {cam && phase === "setup" && <CameraPreview device={cam} region={region} />}

      {!guidedMode && prompterOn && lines.length > 0 && (
        <Teleprompter lines={lines} live={recording} onHide={() => setPrompterOn(false)} />
      )}

      {phase === "countdown" && <div className="rec-countdown">{count}</div>}
      {flash && <div className="rec-flash">{flash}</div>}

      {phase === "setup" || phase === "countdown" ? (
        <div className="rec-dock">
          {error && <div className="rec-error">{error}</div>}
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
              disabled={!monitor || phase !== "setup" || guidedBusy}
            >
              <span className="rec-dot" />
              <span>
                <strong>Gravar</strong>
                <small>F9 · contagem de 3 s</small>
              </span>
            </button>
            <Source icon={MonitorUp} label="Tela">
              <select
                value={monitor?.index ?? ""}
                onChange={(e) => {
                  const m = sources?.monitors.find((x) => x.index === Number(e.target.value));
                  if (m) {
                    setMonitor(m);
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
                  const W = window.innerWidth;
                  const H = window.innerHeight;
                  if (e.target.value === "full") setRegion({ x: 0, y: 0, width: W, height: H });
                  else {
                    const h = Math.min(H, (W * 9) / 16);
                    const w = (h * 16) / 9;
                    setRegion({
                      x: Math.round((W - w) / 2),
                      y: Math.round((H - h) / 2),
                      width: Math.round(w),
                      height: Math.round(h),
                    });
                  }
                }}
              >
                <option value="" disabled>
                  {physical.w} × {physical.h}
                </option>
                <option value="full">Tela inteira</option>
                <option value="169">16:9 no centro</option>
              </select>
            </Source>
            <Source icon={Video} label="Câmera">
              <select value={cam} onChange={(e) => setCam(e.target.value)}>
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
              extra={mic && phase === "setup" ? <LevelMeter device={mic} /> : null}
            >
              <select value={mic} onChange={(e) => setMic(e.target.value)}>
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
                value={systemOn ? "on" : "off"}
                onChange={(e) => setSystemOn(e.target.value === "on")}
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
                value={keysOn ? "on" : "off"}
                onChange={(e) => setKeysOn(e.target.value === "on")}
                title="Mostra atalhos (Ctrl+…) e setas na tela. A digitação comum nunca é gravada."
              >
                <option value="off">Desligado</option>
                <option value="on">Atalhos e setas</option>
              </select>
            </Source>
            {lines.length > 0 && (
              <button
                type="button"
                className="rec-icon"
                title={prompterOn ? "Esconder teleprompter" : "Mostrar teleprompter"}
                onClick={() => setPrompterOn(!prompterOn)}
              >
                {prompterOn ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
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
              <kbd>F9</kbd> iniciar / pausar
            </span>
            <span>
              <kbd>F10</kbd> parar
            </span>
            <span>
              <kbd>Ctrl+M</kbd> marcador
            </span>
            <span>
              <kbd>Ctrl+R</kbd> refazer último trecho
            </span>
            <span className="rec-note">
              Esta tela, o teleprompter e os controles não aparecem na gravação.
            </span>
          </div>
        </div>
      ) : (
        <Interactive className="rec-pill" active={recording}>
          {phase === "saving" ? (
            <>
              <Loader size={15} className="spin" /> Salvando gravação…
            </>
          ) : (
            <>
              <span className={`rec-live ${phase === "paused" ? "is-paused" : ""}`} />
              <span className="rec-time">{clock(elapsed)}</span>
              {phase === "paused" && <span className="rec-paused">pausado</span>}
              <button
                type="button"
                title="Pausar / continuar (F9)"
                onClick={() => void togglePause()}
              >
                {phase === "paused" ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button type="button" title="Marcador (Ctrl+M)" onClick={() => void mark("marker")}>
                <Bookmark size={15} />
                {markers > 0 && <small>{markers}</small>}
              </button>
              <button
                type="button"
                title="Refazer o último trecho (Ctrl+R)"
                onClick={() => void mark("retake")}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="rec-stop"
                title="Parar (F10)"
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

/** Live microphone level, to check the right microphone before recording. */
function LevelMeter({ device }: { device: string }): ReactNode {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    void (async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(
        (d) =>
          d.kind === "audioinput" &&
          (d.label === device || device.includes(d.label) || d.label.includes(device)),
      );
      stream = await navigator.mediaDevices.getUserMedia({
        audio: match ? { deviceId: { exact: match.deviceId } } : true,
      });
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = (): void => {
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        setLevel((l) => Math.max(peak, l * 0.85));
        raf = requestAnimationFrame(tick);
      };
      tick();
    })().catch(() => undefined);
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => {
        t.stop();
      });
      void ctx?.close();
    };
  }, [device]);
  const bars = 14;
  const on = Math.round(Math.min(1, level * 1.6) * bars);
  return (
    <span className="rec-meter">
      {Array.from({ length: bars }, (_, index) => ({ threshold: (index + 1) / bars, index })).map(
        ({ threshold, index }) => (
          <i
            key={threshold}
            className={index < on ? (index > bars * 0.8 ? "is-hot" : "is-on") : ""}
          />
        ),
      )}
    </span>
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
  onHide,
}: {
  lines: Line[];
  live: boolean;
  onHide: () => void;
}): ReactNode {
  const [size, setSize] = useState(22);
  const [current, setCurrent] = useState(0);
  const [auto, setAuto] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current
      ?.querySelector(`[data-line="${current}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);
  // Auto-advance at the script's speaking rate (137 words per minute).
  useEffect(() => {
    if (!auto || !live) return;
    const words = lines[current]?.text.split(/\s+/).length ?? 0;
    const id = setTimeout(
      () => setCurrent((c) => Math.min(lines.length - 1, c + 1)),
      (words / 137) * 60_000 + 600,
    );
    return () => clearTimeout(id);
  }, [auto, live, current, lines]);
  return (
    <Interactive className="tp" active={live}>
      <div className="tp-head">
        <ScrollText size={16} className="accent" />
        <div className="tp-title">
          <strong>Roteiro · Teleprompter</strong>
          <small>Só você vê: não entra na gravação</small>
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
          Avançar sozinho (137 pal./min)
        </label>
        <span className="spacer" />
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          title="Fala anterior"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(lines.length - 1, c + 1))}
          title="Próxima fala"
        >
          ↓
        </button>
        <button type="button" onClick={() => setSize((s) => Math.max(14, s - 2))}>
          A−
        </button>
        <button type="button" onClick={() => setSize((s) => Math.min(40, s + 2))}>
          A+
        </button>
      </div>
    </Interactive>
  );
}
