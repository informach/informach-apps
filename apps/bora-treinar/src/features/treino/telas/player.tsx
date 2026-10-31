"use client";
import {
  ChevronLeft,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { encode } from "uqr";
import { Avatar, fmtTime } from "@/components/avatar";
import type { EventoCelular } from "@/features/pareamento/protocolo";
import { usePareamentoTv } from "@/features/pareamento/use-pareamento-tv";
import { saveSessionAction } from "@/features/sessoes/actions";
import { guardarPendente } from "@/features/sessoes/fila";
import type { SessionInput } from "@/features/sessoes/schema";
import { useAjustes } from "../ajustes";
import { cadenceLabel } from "../body/cadence";
import { MP_BONES } from "../body/landmarks";
import { exerciseById, type View } from "../catalog/catalog";
import { buildSteps, type LevelMap, type Step, type Workout } from "../catalog/workouts";
import { HoldTracker, RepCounter } from "../engine/counter";
import { WorkoutRunner } from "../engine/runner";
import { beep, numberWord, say, setAudioEnabled } from "../engine/voice";
import { Instructor3D } from "../instructor/instructor-3d";
import type { InstructorMode } from "../instructor/instructor-scene";
import { type PoseFrame, PoseTracker } from "../vision/pose-tracker";
import type { CountMode } from "./treino";

type CamStatus = { state: "off" | "loading" | "on" } | { state: "error"; message: string };

const VIEWS: [View, string][] = [
  ["front", "Frente"],
  ["side", "Lado"],
  ["three4", "3/4"],
];

const practiceSteps = (exerciseId: string): Step[] => [
  { kind: "rest", seconds: 6, label: "Prepare-se", next: exerciseId },
  { kind: "exercise", exerciseId, set: 1, sets: 1, label: "Prática livre" },
];

const stepAnnouncement = (s: Step) => {
  if (s.kind === "rest")
    return s.next ? `${s.label}. Próximo: ${exerciseById(s.next).name}` : s.label;
  if (s.kind === "amrap") {
    const first = s.circuit[0];
    return `${s.label} de ${Math.round(s.seconds / 60)} minutos.${first ? ` Comece com ${exerciseById(first.exerciseId).name}` : ""}`;
  }
  const ex = exerciseById(s.exerciseId);
  if (!s.target) return ex.name;
  return ex.rule.kind === "hold"
    ? `${ex.name}. Segure ${s.target} segundos`
    : `${ex.name}. ${s.target} repetições`;
};

function stepTitle(s: Step) {
  if (s.kind === "amrap") return `${s.label} · ${Math.round(s.seconds / 60)} min`;
  if (s.kind === "rest") return s.label;
  const ex = exerciseById(s.exerciseId);
  if (!s.target) return ex.name;
  return `${ex.name} · ${s.target}${ex.rule.kind === "hold" ? " s" : " rep."}`;
}

export interface PlayerProps {
  profile: { id: string; name: string; color: string };
  workout: Workout | null;
  practiceExerciseId: string | null;
  workoutRef: string;
  workoutName: string;
  mode: CountMode;
  levels: LevelMap;
}

export function PlayerScreen({
  profile,
  workout,
  practiceExerciseId,
  workoutRef,
  workoutName,
  mode,
  levels,
}: PlayerProps) {
  const router = useRouter();
  const [settings, setSettings] = useAjustes();
  // o treino é montado uma vez por entrada no player
  const runner = useMemo(
    () =>
      new WorkoutRunner(
        workout ? buildSteps(workout, levels) : practiceSteps(practiceExerciseId ?? "agachamento"),
      ),
    [workout, levels, practiceExerciseId],
  );
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [toast, setToast] = useState<{ text: string; good?: boolean } | null>(null);
  const [pop, setPop] = useState(0);
  const [view, setView] = useState<View | undefined>();
  const [quitting, setQuitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cam, setCam] = useState<CamStatus>({ state: mode === "camera" ? "loading" : "off" });
  const [conf, setConf] = useState(0);
  const [follow, setFollow] = useState(0);
  const camHost = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const counters = useRef<{ key: string; rep?: RepCounter; hold?: HoldTracker } | null>(null);
  const saving = useRef(false);
  /** sem câmera funcionando, isometrias contam o tempo direto */
  const camOn = useRef(false);
  const toastTimer = useRef(0);
  const followRef = useRef(settings.follow);
  followRef.current = settings.follow;
  const countAloud = useRef(settings.countAloud);
  countAloud.current = settings.countAloud;

  const flash = useCallback((text: string, good = false) => {
    setToast({ text, good });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  useEffect(() => setAudioEnabled(settings.audio), [settings.audio]);

  /** Eventos que vêm do celular pareado: mesma lógica da câmera local. */
  const aoEventoCelular = useCallback(
    (e: EventoCelular) => {
      if (e.tipo === "ola") {
        camOn.current = true;
        if (runner.isHold) runner.setHolding(false);
        flash("Celular conectado. Pode treinar!", true);
        return;
      }
      if (e.tipo === "sinal") {
        setConf(Math.round(e.confianca * 10) / 10);
        if (followRef.current) setFollow(Math.round(e.progresso * 50) / 50);
        return;
      }
      if (e.passo !== runner.index || runner.paused || runner.done) return;
      if (e.tipo === "rep") {
        runner.addRep(1, e.issues);
        if (e.issues[0]) flash(e.issues[0]);
      } else if (e.tipo === "parcial") {
        runner.addPartial(e.issues);
        flash(e.issues[0] ?? "Quase! Vá até o fim do movimento");
      } else if (e.segurando !== runner.holding) {
        runner.setHolding(e.segurando);
        if (!e.segurando && e.dica) flash(e.dica);
      }
    },
    [runner, flash],
  );
  const par = usePareamentoTv(mode === "pareado", aoEventoCelular);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    const logs = runner.logs.filter((l) => l.reps > 0 || l.holdSeconds > 0);
    if (!logs.length) {
      router.back();
      return;
    }
    const duration = Math.max(1, Math.round(runner.totalElapsed));
    const input: SessionInput = {
      id: crypto.randomUUID(),
      profileId: profile.id,
      workoutRef,
      startedAt: Date.now() - duration * 1000,
      durationSeconds: duration,
      mode: camOn.current ? (mode === "pareado" ? "pareado" : "camera") : "manual",
      logs: logs.map((l) => ({ ...l, holdSeconds: Math.round(l.holdSeconds) })),
    };
    say("Treino concluído! Mandou bem.", { interrupt: true });
    beep("done");
    try {
      const result = await saveSessionAction(input);
      if (result.ok) {
        router.replace(`/resumo/${result.data.sessionId}`);
        return;
      }
      setSaveError(result.error);
      if (result.code === "UNEXPECTED") await guardarPendente(input);
    } catch {
      // sem rede: guarda no aparelho e salva quando a conexão voltar
      await guardarPendente(input);
      setSaveError(
        "Sem conexão agora. O treino ficou guardado neste aparelho e será salvo quando a internet voltar.",
      );
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  // eventos do treino: voz, bipes e fim
  useEffect(() => {
    const off = runner.on((e) => {
      if (e.type === "step") {
        const s = runner.step;
        if (s) {
          say(stepAnnouncement(s), { interrupt: true });
          if (s.kind !== "rest") beep("go");
        }
        counters.current = null;
        setView(undefined);
        if (!camOn.current) runner.setHolding(true);
      } else if (e.type === "rep") {
        setPop((p) => p + 1);
        beep("rep");
        if (countAloud.current && e.count > 0)
          say(numberWord(e.count), { interrupt: true, rate: 1.25 });
        if (
          e.target &&
          e.count === e.target &&
          runner.step?.kind === "exercise" &&
          runner.step.window
        )
          flash("Meta batida! Descanse até o fim do minuto", true);
      } else if (e.type === "countdown") beep("tick");
      else if (e.type === "round") say(`Volta ${e.rounds} completa`, { interrupt: true });
      else if (e.type === "finish") void saveRef.current();
      render();
    });
    runner.start();
    return () => {
      off();
    };
  }, [runner, flash]);

  // relógio da interface: tick do executor a cada quadro, redesenho ~8x por segundo
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      runner.tick();
      if (t - last > 120) {
        last = t;
        render();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runner]);

  // a TV conta ao celular pareado qual exercício está valendo
  const exerciseNow = runner.step?.kind === "rest" ? null : (runner.exerciseId ?? null);
  const { publicar } = par;
  useEffect(() => {
    publicar({
      tipo: "estado",
      exerciseId: exerciseNow,
      passo: runner.index,
      pausado: runner.paused,
      fim: runner.done,
      titulo: workoutName,
    });
  }, [publicar, exerciseNow, runner.index, runner.paused, runner.done, workoutName]);

  // tela sempre acesa durante o treino
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const get = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    void get();
    const onVis = () => {
      if (document.visibilityState === "visible") void get();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  // câmera + detecção de pose + contador, tudo no aparelho
  useEffect(() => {
    if (mode !== "camera") return;
    const tracker = new PoseTracker();
    let alive = true;
    const drawOverlay = (f: PoseFrame | null) => {
      const cv = overlay.current;
      if (!cv) return;
      const w = tracker.video.videoWidth || 640;
      const h = tracker.video.videoHeight || 480;
      cv.width = w;
      cv.height = h;
      const g = cv.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      if (!f) return;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.strokeStyle = "#C8FF2E";
      for (const [a, b] of MP_BONES) {
        const p = f.image[a];
        const q = f.image[b];
        if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
        g.beginPath();
        g.moveTo(p.x * w, p.y * h);
        g.lineTo(q.x * w, q.y * h);
        g.stroke();
      }
    };
    const onFrame = (f: PoseFrame | null) => {
      drawOverlay(f);
      if (!f) {
        setConf(0);
        if (runner.isHold) runner.setHolding(false);
        return;
      }
      const exId = runner.exerciseId;
      const s = runner.step;
      if (!exId || !s || s.kind === "rest" || runner.paused || runner.done) return;
      const key = `${runner.index}:${exId}`;
      if (counters.current?.key !== key) {
        const rule = exerciseById(exId).rule;
        counters.current = {
          key,
          ...(rule.kind === "reps"
            ? { rep: new RepCounter(rule) }
            : { hold: new HoldTracker(rule) }),
        };
      }
      const c = counters.current;
      if (c.rep) {
        const u = c.rep.update(f.world, f.t);
        setConf(Math.round(u.conf * 10) / 10);
        if (followRef.current) setFollow(Math.round(u.progress * 50) / 50);
        for (const ev of u.events) {
          if (ev.type === "rep") {
            runner.addRep(1, ev.issues);
            if (ev.issues[0]) flash(ev.issues[0]);
          } else {
            runner.addPartial(ev.issues);
            flash(ev.issues[0] ?? "Quase! Vá até o fim do movimento");
          }
        }
      } else if (c.hold) {
        const u = c.hold.update(f.world, f.t);
        setConf(Math.round(u.conf * 10) / 10);
        if (u.holding !== runner.holding) {
          runner.setHolding(u.holding);
          if (!u.holding && u.cue) flash(u.cue);
        }
      }
    };
    const off = tracker.on(onFrame);
    tracker
      .start()
      .then(() => {
        if (!alive) return tracker.stop();
        camHost.current?.prepend(tracker.video);
        camOn.current = true;
        if (runner.isHold) runner.setHolding(false);
        setCam({ state: "on" });
      })
      .catch((err: Error) => {
        if (!alive) return;
        const denied = err.name === "NotAllowedError";
        setCam({
          state: "error",
          message: denied ? "Permissão da câmera negada" : err.message || "Câmera indisponível",
        });
        runner.setHolding(true);
      });
    return () => {
      alive = false;
      off();
      tracker.stop();
      tracker.video.remove();
      camOn.current = false;
    };
  }, [mode, runner, flash]);

  // atalhos: espaço = +1, P = pausa; Voltar/Esc pergunta antes de sair
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const back = e.key === "Escape" || e.key === "Backspace" || [461, 10009].includes(e.keyCode);
      if (back) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!quitting) {
          runner.pause();
          setQuitting(true);
        }
        return;
      }
      if (quitting) return;
      if (e.code === "Space") {
        e.preventDefault();
        runner.addRep(1);
      } else if (e.key === "p" || e.key === "P" || e.key === "MediaPlayPause") {
        if (runner.paused) runner.resume();
        else runner.pause();
        render();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [runner, quitting]);

  const s = runner.step;
  if (saveError)
    return (
      <div className="player">
        <div className="overlay-msg static">
          <div>
            <h2>Treino concluído!</h2>
            <p className="muted">{saveError}</p>
            <button
              type="button"
              className="btn primary big"
              onClick={() => router.replace("/inicio")}
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  if (!s) return <div className="player" />;

  const exId = s.kind === "rest" ? s.next : runner.exerciseId;
  const ex = exId ? exerciseById(exId) : undefined;
  const isRest = s.kind === "rest";
  const isHold = runner.isHold;
  const remaining = runner.remaining;
  const sensing = cam.state === "on" || par.fase === "conectado";
  const following = settings.follow && sensing;
  let instructorMode: InstructorMode = "cadence";
  if (runner.done) instructorMode = "celebrate";
  else if (!ex) instructorMode = "idle";
  else if (isHold) instructorMode = "hold";
  else if (following && !isRest) instructorMode = "follow";

  const fullscreen = typeof document !== "undefined" && !!document.fullscreenElement;
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        // no celular espelhado na TV, a tela deitada aproveita o formato da TV
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })
          .lock?.("landscape")
          .catch(() => undefined);
      }
    } catch {
      /* navegador sem tela cheia */
    }
    render();
  };

  const askQuit = () => {
    runner.pause();
    setQuitting(true);
  };

  // conteúdo do contador
  let label = "";
  let big: string | number = "";
  let of: string | undefined;
  let dots: { n: number; on: number } | undefined;
  let counterClass = "";
  if (isRest) {
    label = s.label;
    big = Math.ceil(remaining ?? 0);
    counterClass = "rest";
  } else if (s.kind === "amrap") {
    label = `AMRAP · ${fmtTime(remaining ?? 0)}`;
    big = runner.amrapItemReps;
    of = `/ ${runner.target}`;
    dots = { n: s.circuit.length, on: runner.amrapPos + 1 };
  } else if (isHold) {
    label = runner.holding ? "Segurando" : "Entre na posição";
    big = Math.floor(runner.holdSeconds);
    of = s.target ? `/ ${s.target}s` : "s";
    dots = { n: s.sets, on: s.set };
    if (!runner.holding) counterClass = "waiting";
  } else {
    label = s.window ? `${s.label} · ${Math.ceil(remaining ?? 0)}s` : "Repetições";
    big = runner.reps;
    of = s.target ? `/ ${s.target}` : undefined;
    dots = { n: s.sets, on: s.set };
  }

  const upcoming = isRest
    ? runner.steps.slice(runner.index + 1).find((x) => x.kind !== "rest")
    : undefined;
  const setInfo =
    s.kind === "exercise"
      ? !workout
        ? "Prática livre"
        : s.window
          ? `Rodada ${s.set} de ${s.sets}`
          : `Série ${s.set} de ${s.sets}`
      : s.kind === "amrap"
        ? `Voltas completas: ${runner.amrapRounds}`
        : "";
  const badge =
    mode === "pareado"
      ? par.fase === "conectado"
        ? conf >= 0.75
          ? { dot: "", text: "Celular ok" }
          : { dot: "warn", text: "Ajuste o celular" }
        : par.fase === "erro"
          ? { dot: "off", text: par.erro ?? "Pareamento indisponível" }
          : { dot: "warn", text: "Esperando o celular…" }
      : cam.state === "loading"
        ? { dot: "warn", text: "Ligando a câmera…" }
        : cam.state === "error"
          ? { dot: "off", text: cam.message }
          : conf >= 0.75
            ? { dot: "", text: "Câmera ok" }
            : conf > 0
              ? { dot: "warn", text: "Ajuste o enquadramento" }
              : { dot: "warn", text: "Procurando você…" };

  return (
    <div className="player">
      <header className="player-top">
        <button type="button" className="icon-btn" onClick={askQuit} aria-label="Sair do treino">
          <X size={20} />
        </button>
        <span className="title">
          {workoutName}{" "}
          <small className="muted">
            · passo {Math.min(runner.index + 1, runner.steps.length)} de {runner.steps.length}
          </small>
        </span>
        <div className="progress">
          <div style={{ width: `${(runner.index / runner.steps.length) * 100}%` }} />
        </div>
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettings({ audio: !settings.audio })}
          aria-label={settings.audio ? "Silenciar" : "Ativar som"}
        >
          {settings.audio ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <span className="num elapsed">{fmtTime(runner.totalElapsed)}</span>
        <Avatar profile={profile} />
      </header>

      <div className="player-stage">
        <section className="inst-area">
          <Instructor3D
            className="canvas"
            exerciseId={exId}
            mode={instructorMode}
            view={view}
            followDepth={follow}
            paused={runner.paused}
          />
          <div className="inst-overlay">
            <div className="inst-head">
              <div>
                <span className="muted strong">{isRest ? "A seguir" : setInfo}</span>
                <h1>{ex?.name ?? "Prepare-se"}</h1>
                {ex && <p>{ex.cue}</p>}
              </div>
              <div className="view-toggle">
                {VIEWS.map(([v, l]) => (
                  <button
                    type="button"
                    key={v}
                    aria-pressed={(view ?? ex?.view) === v}
                    onClick={() => setView(v)}
                    tabIndex={-1}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="inst-foot">
              {ex && !isHold ? (
                <button
                  type="button"
                  className="pill"
                  disabled={!sensing}
                  onClick={() => setSettings({ follow: !settings.follow })}
                  title={sensing ? "Alternar entre o ritmo do instrutor e seguir você" : undefined}
                  tabIndex={-1}
                >
                  <Timer size={16} />
                  {following ? "Instrutor seguindo você" : `Cadência ${cadenceLabel(ex.cadence)} s`}
                </button>
              ) : (
                <span />
              )}
              {mode === "camera" && (
                <div className="cam-pip" ref={camHost}>
                  <canvas ref={overlay} />
                  <span className="cam-badge">
                    <span className={`dot ${badge.dot}`} />
                    {badge.text}
                  </span>
                </div>
              )}
              {mode === "pareado" && (
                <div className="cam-pip pair-pip">
                  {par.fase === "aguardando" && par.codigo && par.url ? (
                    <div className="pair-code">
                      <QrCode text={par.url} />
                      <div>
                        <strong>Aponte a câmera do celular</strong>
                        <span className="muted">
                          ou abra {par.url.replace(/^https?:\/\//, "").split("/")[0]}/camera e
                          digite
                        </span>
                        <span className="num code">{par.codigo}</span>
                      </div>
                    </div>
                  ) : null}
                  <span className="cam-badge">
                    <span className={`dot ${badge.dot}`} />
                    {badge.text}
                  </span>
                </div>
              )}
            </div>
          </div>
          {toast && <div className={`toast ${toast.good ? "good" : ""}`}>{toast.text}</div>}
          {runner.paused && !quitting && (
            <div className="overlay-msg">
              <div>
                <h2>Pausado</h2>
                <button
                  type="button"
                  className="btn primary big"
                  data-autofocus
                  // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para Continuar
                  autoFocus
                  onClick={() => {
                    runner.resume();
                    render();
                  }}
                >
                  <Play size={20} fill="currentColor" /> Continuar
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="side">
          <div
            className={`counter ${counterClass} ${pop ? "pop" : ""}`}
            key={isRest ? "rest" : `c${pop}`}
          >
            <div className="label">
              <span>{label}</span>
              {mode !== "manual" && !isRest && runner.partials > 0 && (
                <span>
                  {runner.partials} parcia{runner.partials > 1 ? "is" : "l"}
                </span>
              )}
            </div>
            <div className="big num">
              <span className="value">{big}</span>
              {of && <span className="of">{of}</span>}
            </div>
            {isRest ? (
              <div className="next-up">
                <span className="muted">Próximo</span>
                <strong>{upcoming ? stepTitle(upcoming) : "Fim do treino"}</strong>
              </div>
            ) : (
              <div className="sets">
                <strong>{setInfo}</strong>
                {dots && (
                  <div className="set-dots">
                    {Array.from({ length: dots.n }, (_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: bolinhas fixas por posição
                      <span key={i} className={i < dots.on ? "on" : ""} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="stats-row">
            <div className="stat">
              <span className="label">
                {isRest ? "Séries feitas" : remaining !== null ? "Restante" : "Tempo da série"}
              </span>
              <span className="value num">
                {isRest ? runner.logs.length : fmtTime(remaining ?? runner.elapsed)}
              </span>
            </div>
            <div className="stat">
              <span className="label">Repetições no treino</span>
              <span className="value num accent">
                {runner.totalReps + (isRest ? 0 : runner.reps)}
              </span>
            </div>
          </div>

          <div className="controls">
            {isRest ? (
              <button
                type="button"
                className="ctrl"
                onClick={() => {
                  runner.prev();
                  render();
                }}
              >
                <ChevronLeft size={20} />
                Voltar
              </button>
            ) : (
              <button
                type="button"
                className="ctrl"
                onClick={() => runner.addRep(-1)}
                disabled={isHold}
              >
                <Minus size={20} />
                −1
              </button>
            )}
            <button
              type="button"
              className="ctrl"
              onClick={() => {
                if (runner.paused) runner.resume();
                else runner.pause();
                render();
              }}
            >
              {runner.paused ? <Play size={20} /> : <Pause size={20} />}
              {runner.paused ? "Continuar" : "Pausar"}
            </button>
            {isRest ? (
              <button
                type="button"
                className="ctrl main"
                data-autofocus
                onClick={() => {
                  runner.extendRest(15);
                  render();
                }}
              >
                <Plus size={20} />
                +15 s
              </button>
            ) : (
              <button
                type="button"
                className="ctrl main"
                data-autofocus
                onClick={() => runner.addRep(1)}
                disabled={isHold}
              >
                <Plus size={20} />
                +1
              </button>
            )}
            <button
              type="button"
              className="ctrl"
              onClick={() => {
                runner.next();
                render();
              }}
            >
              <SkipForward size={20} />
              {isRest ? "Pular" : "Concluir"}
            </button>
          </div>
        </aside>
      </div>

      {quitting && (
        <div className="overlay-msg fixed" data-modal>
          <div>
            <h2>Sair do treino?</h2>
            <p className="muted">As séries já concluídas podem ser salvas no seu histórico.</p>
            <button
              type="button"
              className="btn primary big"
              // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa cair na opção segura
              autoFocus
              onClick={() => {
                setQuitting(false);
                runner.resume();
              }}
            >
              Continuar treinando
            </button>
            {runner.logs.length > 0 && (
              <button type="button" className="btn" onClick={() => runner.finish()}>
                Encerrar e salvar
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => router.back()}>
              Sair sem salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** QR code em SVG, desenhado aqui: nada de serviço externo para gerar a imagem. */
function QrCode({ text }: { text: string }) {
  const { data, size } = useMemo(() => encode(text, { border: 1 }), [text]);
  const path = useMemo(() => {
    let d = "";
    data.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return d;
  }, [data]);
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Código QR do pareamento"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#0B0D10" />
    </svg>
  );
}
