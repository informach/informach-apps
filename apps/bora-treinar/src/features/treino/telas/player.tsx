"use client";
import {
  ChevronLeft,
  Maximize,
  Mic,
  Minimize,
  Minus,
  Music,
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
import { GUARDAR_NA_FILA, guardarPendente } from "@/features/sessoes/fila";
import type { SessionInput } from "@/features/sessoes/schema";
import { useAjustes } from "../ajustes";
import { cadenceLabel } from "../body/cadence";
import { MP_BONES } from "../body/landmarks";
import { exerciseById, type View } from "../catalog/catalog";
import { buildSteps, type LevelMap, type Step, type Workout } from "../catalog/workouts";
import { HoldTracker, RepCounter } from "../engine/counter";
import { definirMusica } from "../engine/musica";
import { WorkoutRunner } from "../engine/runner";
import {
  beep,
  numberWord,
  say,
  setAudioEnabled,
  setSpeechMuted,
  unlockAudio,
} from "../engine/voice";
import {
  contagemPelaVoz,
  type Dito,
  type FalhaVoz,
  JuntaContagem,
  OuvinteDeVoz,
  pedirMicrofone,
  vozDisponivel,
} from "../engine/voz";
import { Instructor3D } from "../instructor/instructor-3d";
import type { InstructorMode } from "../instructor/instructor-scene";
import { ajudaDaCamera, ajudaDaVoz, navegadorDe } from "../permissoes";
import { type PoseFrame, PoseTracker } from "../vision/pose-tracker";
import { presenca } from "../vision/presenca";
import type { CountMode } from "./treino";

type CamStatus =
  | { state: "off" | "loading" | "on" }
  | { state: "error"; message: string; negada?: boolean };

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

/** O navegador já negou o microfone a este site? (sem a API de permissões, presume que não) */
async function microfoneNegado() {
  try {
    const estado = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return estado?.state === "denied";
  } catch {
    return false;
  }
}

export interface PlayerProps {
  profile: { id: string; name: string; color: string };
  workout: Workout | null;
  practiceExerciseId: string | null;
  workoutRef: string;
  workoutName: string;
  mode: CountMode;
  levels: LevelMap;
  /** Para onde "Sair sem salvar" leva. Padrão: a tela do treino (ou do exercício praticado). */
  saidaHref?: string;
  /**
   * Entrega o treino concluído a quem chamou em vez de salvar no servidor.
   * Só o playground de desenvolvimento usa: lá não há conta nem banco.
   */
  onFinish?: (session: SessionInput) => void;
}

export function PlayerScreen({
  profile,
  workout,
  practiceExerciseId,
  workoutRef,
  workoutName,
  mode: modoInicial,
  levels,
  saidaHref,
  onFinish,
}: PlayerProps) {
  const router = useRouter();
  const [settings, setSettings, ajustesCarregados] = useAjustes();
  // O treino é montado uma vez por entrada no player. Não depende da identidade das props: um
  // refresh do servidor (a fila offline salvando outro treino) mandava objetos novos e recriava o
  // executor, zerando o treino no meio. Outro treino é outra montagem (a página usa `key`).
  const [runner] = useState(
    () =>
      new WorkoutRunner(
        workout ? buildSteps(workout, levels) : practiceSteps(practiceExerciseId ?? "agachamento"),
      ),
  );
  const [mode, setMode] = useState<CountMode>(modoInicial);
  const saida =
    saidaHref ??
    (workout
      ? `/treino?ref=${encodeURIComponent(workoutRef)}`
      : `/exercicios/${practiceExerciseId ?? ""}`);
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [toast, setToast] = useState<{ text: string; good?: boolean } | null>(null);
  const [pop, setPop] = useState(0);
  const [view, setView] = useState<View | undefined>();
  const [quitting, setQuitting] = useState(false);
  // contagem pela voz (modo manual): o navegador reconhece os números ditos
  const [vozSuportada, setVozSuportada] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [ouvido, setOuvido] = useState("");
  const [pedindoVoz, setPedindoVoz] = useState(false);
  /** por que a voz não ligou, para o aviso dizer o caminho certo neste navegador */
  const [falhaVoz, setFalhaVoz] = useState<FalhaVoz | null>(null);
  /** câmera e voz juntas não contam duas vezes a mesma repetição */
  const junta = useRef(new JuntaContagem());
  const [nadaParaSalvar, setNadaParaSalvar] = useState(false);
  /** 3-2-1 antes de retomar uma pausa */
  const [retomando, setRetomando] = useState(0);
  const [camTentativa, setCamTentativa] = useState(0);
  /** o celular pareado está ouvindo a voz: a TV não fala os números */
  const [celularOuvindo, setCelularOuvindo] = useState(false);
  const decidiuVoz = useRef(false);
  const pausouParaVoz = useRef(false);
  const ouvinte = useRef<OuvinteDeVoz | null>(null);
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
        setCelularOuvindo(!!e.ouvindo);
        return;
      }
      if (e.passo !== runner.index || runner.paused || runner.done) return;
      if (e.tipo === "rep") {
        if (junta.current.camera(performance.now())) runner.addRep(1, e.issues);
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
      // nada feito: diz isso e deixa escolher, em vez de voltar calado
      setNadaParaSalvar(true);
      return;
    }
    const duration = Math.max(1, Math.round(runner.totalElapsed));
    const input: SessionInput = {
      id: crypto.randomUUID(),
      profileId: profile.id,
      workoutRef,
      // o início de verdade, marcado no start (descontar a duração errava quando havia pausa)
      startedAt: runner.startedWallAt || Date.now() - duration * 1000,
      durationSeconds: duration,
      mode: camOn.current ? (mode === "pareado" ? "pareado" : "camera") : "manual",
      logs: logs.map((l) => ({ ...l, holdSeconds: Math.round(l.holdSeconds) })),
    };
    say("Treino concluído! Mandou bem.", { interrupt: true });
    beep("done");
    if (onFinish) {
      onFinish(input);
      return;
    }
    try {
      const result = await saveSessionAction(input);
      if (result.ok) {
        router.replace(`/resumo/${result.data.sessionId}`);
        return;
      }
      // Recusas que podem mudar (plano, perfil, login) ficam guardadas no aparelho, com o motivo:
      // antes só o erro inesperado ficava, e um treino feito com o plano vencendo se perdia.
      if (GUARDAR_NA_FILA.has(result.code)) {
        await guardarPendente(input, result.code === "UNEXPECTED" ? undefined : result.code);
        setSaveError(`${result.error} O treino ficou guardado neste aparelho.`);
      } else setSaveError(result.error);
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
        junta.current.zerar();
        setView(undefined);
        if (!camOn.current) runner.setHolding(true);
      } else if (e.type === "rep") {
        // a correção (−1) atualiza a tela, sem bipe, sem número falado e sem comemorar
        if (e.delta > 0) {
          setPop((p) => p + 1);
          beep("rep");
          if (countAloud.current && e.count > 0)
            say(numberWord(e.count), { interrupt: true, rate: 1.25 });
        }
        if (
          e.target &&
          e.count === e.target &&
          runner.step?.kind === "exercise" &&
          runner.step.window
        )
          flash("Meta batida! Descanse até o fim do minuto", true);
      } else if (e.type === "hold-second") {
        // isometria: conta os segundos em voz alta, como as repetições
        if (countAloud.current) say(numberWord(e.seconds), { interrupt: true, rate: 1.25 });
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

  // Aba escondida (outro app, tela bloqueada) pausa o treino: o cronômetro seguia correndo e o
  // descanso acabava sem ninguém ver. A volta é com 3-2-1.
  useEffect(() => {
    const aoMudar = () => {
      if (document.hidden && !runner.done && !runner.paused) {
        runner.pause();
        setRetomando(0);
        render();
      }
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [runner]);

  /** Retoma a pausa com 3-2-1, para dar tempo de voltar à posição. */
  const retomar = useCallback(() => {
    if (!runner.paused || runner.done) return;
    setRetomando(3);
  }, [runner]);
  useEffect(() => {
    if (!retomando) return;
    beep("tick");
    say(numberWord(retomando), { interrupt: true });
    const t = window.setTimeout(() => {
      if (retomando === 1) {
        runner.resume();
        beep("go");
        setRetomando(0);
        render();
      } else setRetomando(retomando - 1);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [retomando, runner]);

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
          void lock?.release().catch(() => undefined);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `camTentativa` religa a câmera de propósito ("Tentar de novo")
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
      if (!exId || !s || s.kind === "rest" || runner.paused || runner.done) {
        // no preparo, no descanso e na pausa o selo segue a pessoa (antes ficava parado)
        setConf(Math.round(presenca(f.image) * 10) / 10);
        return;
      }
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
            if (junta.current.camera(performance.now())) runner.addRep(1, ev.issues);
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
    tracker.aoParar(() => {
      if (!alive) return;
      setCam({ state: "error", message: "A câmera parou." });
      runner.setHolding(true);
    });
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
          message: denied ? "A câmera foi bloqueada" : err.message || "Câmera indisponível",
          negada: denied,
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
  }, [mode, runner, flash, camTentativa]);

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
        if (runner.paused) retomar();
        else runner.pause();
        render();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [runner, quitting, retomar]);

  // Contagem pela voz. O ouvinte entrega só números novos; a contagem só avança (contagemPelaVoz)
  // e segue as regras das repetições: nada em descanso, isometria, pausa ou depois do fim.
  // a voz vale em qualquer modo: sozinha no manual, e completando a câmera quando ela perde
  useEffect(() => setVozSuportada(vozDisponivel()), []);
  const aoOuvirVoz = useCallback(
    (novos: Dito[], texto: string) => {
      setOuvido(texto.trim().split(/\s+/).slice(-3).join(" "));
      const st = runner.step;
      if (
        !novos.length ||
        !st ||
        st.kind === "rest" ||
        runner.isHold ||
        runner.paused ||
        runner.done
      )
        return;
      const atual = st.kind === "amrap" ? runner.amrapItemReps : runner.reps;
      const alvo = contagemPelaVoz(atual, novos);
      if (alvo > atual) junta.current.voz(atual, alvo, performance.now());
      for (let i = atual; i < alvo; i++) runner.addRep(1);
    },
    [runner],
  );
  const pararVoz = useCallback(() => {
    ouvinte.current?.parar();
    ouvinte.current = null;
    setOuvindo(false);
    setOuvido("");
    setSpeechMuted(false);
  }, []);
  // pergunta pelo microfone com o treino pausado, para o "Prepare-se" não correr por baixo
  const perguntarVoz = useCallback(() => {
    if (!runner.paused && !runner.done) {
      runner.pause();
      pausouParaVoz.current = true;
    }
    setPedindoVoz(true);
  }, [runner]);
  const fecharPerguntaVoz = useCallback(() => {
    setPedindoVoz(false);
    if (pausouParaVoz.current) {
      pausouParaVoz.current = false;
      retomar();
    }
  }, [retomar]);
  /** A voz não ligou: o aviso diz por quê e o caminho certo neste navegador. */
  const mostrarFalhaVoz = useCallback(
    (falha: FalhaVoz) => {
      pararVoz();
      setFalhaVoz(falha);
      perguntarVoz();
    },
    [pararVoz, perguntarVoz],
  );
  /**
   * Liga a voz. Primeiro pede o microfone com getUserMedia, ainda dentro do toque (o pedido que
   * todo navegador mostra); só depois abre o reconhecimento. Antes, ligar direto o reconhecimento
   * falhava calado em vários navegadores e o aviso mandava "liberar" sem dizer onde.
   */
  const ligarVoz = useCallback(async () => {
    const pedido = await pedirMicrofone();
    if (pedido !== "ok") return mostrarFalhaVoz(pedido);
    setFalhaVoz(null);
    const o = new OuvinteDeVoz(aoOuvirVoz, mostrarFalhaVoz);
    ouvinte.current = o;
    // a voz do app e a música calam: o microfone as ouviria e contaria errado
    setSpeechMuted(true);
    setOuvindo(true);
    o.ligar();
  }, [aoOuvirVoz, mostrarFalhaVoz]);
  // ligar ou desligar pelo botão vira a escolha para os próximos treinos
  const alternarVoz = () => {
    if (ouvindo) {
      pararVoz();
      setSettings({ vozAoIniciar: false });
    } else if (!settings.vozAceita || falhaVoz) perguntarVoz();
    else {
      setSettings({ vozAoIniciar: true });
      void ligarVoz();
    }
  };
  // Ao abrir o treino no modo manual: pergunta uma vez; depois liga sozinho ou não pergunta mais.
  // Com a câmera, a voz é escolha do botão do microfone (e fica lembrada do mesmo jeito).
  useEffect(() => {
    if (!ajustesCarregados || !vozSuportada || decidiuVoz.current) return;
    decidiuVoz.current = true;
    void microfoneNegado().then((negado) => {
      if (negado) setFalhaVoz("negado");
      const perguntar =
        mode === "manual" && (settings.vozAoIniciar === null || (settings.vozAoIniciar && negado));
      if (perguntar) perguntarVoz();
      else if (settings.vozAoIniciar && settings.vozAceita && !negado) void ligarVoz();
    });
  }, [
    ajustesCarregados,
    vozSuportada,
    settings.vozAoIniciar,
    settings.vozAceita,
    ligarVoz,
    perguntarVoz,
    mode,
  ]);
  // o celular pareado ouvindo a voz: a TV não fala os números (o microfone dele os contaria)
  useEffect(() => {
    if (ouvindo) return;
    setSpeechMuted(celularOuvindo);
  }, [celularOuvindo, ouvindo]);
  useEffect(() => {
    if (runner.done) pararVoz();
  }, [runner.done, pararVoz]);
  useEffect(
    () => () => {
      ouvinte.current?.parar();
      setSpeechMuted(false);
    },
    [],
  );

  // música de fundo: banda inteira na série, fundo calmo no descanso, parada na pausa e no fim
  const music =
    !settings.audio ||
    !settings.music ||
    ouvindo ||
    runner.paused ||
    runner.done ||
    quitting ||
    saveError
      ? "parado"
      : runner.step?.kind === "rest"
        ? "descanso"
        : runner.step
          ? "treino"
          : "parado";
  useEffect(() => definirMusica(music), [music]);
  useEffect(() => () => definirMusica("parado"), []);

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
  if (nadaParaSalvar)
    return (
      <div className="player">
        <div className="overlay-msg static">
          <div>
            <h2>Nada para salvar</h2>
            <p className="muted">
              Nenhuma série teve repetição ou tempo contado. Se a contagem não pegou, dá para contar
              à mão ou pela voz.
            </p>
            <button
              type="button"
              className="btn primary big"
              // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para a escolha
              autoFocus
              onClick={() => window.location.reload()}
            >
              Fazer de novo
            </button>
            <button type="button" className="btn ghost" onClick={() => router.replace(saida)}>
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  if (!s)
    return (
      <div className="player">
        <div className="overlay-msg static" role="status">
          <div>
            <h2>Salvando o treino…</h2>
            <p className="muted">Só um instante.</p>
          </div>
        </div>
      </div>
    );

  const exId = s.kind === "rest" ? s.next : runner.exerciseId;
  const ex = exId ? exerciseById(exId) : undefined;
  const isRest = s.kind === "rest";
  const isHold = runner.isHold;
  const remaining = runner.remaining;
  const sensing = cam.state === "on" || par.fase === "conectado";
  const following = settings.follow && sensing;
  let instructorMode: InstructorMode = "cadence";
  if (runner.done) instructorMode = "celebrate";
  // pausado, o boneco volta à pose de repouso em vez de congelar no meio da repetição
  else if (!ex || runner.paused) instructorMode = "idle";
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
        : par.fase === "desconectado"
          ? { dot: "off", text: "Celular desconectado" }
          : par.fase === "erro"
            ? { dot: "off", text: par.erro ?? "Pareamento indisponível" }
            : { dot: "warn", text: "Esperando o celular…" }
      : cam.state === "loading"
        ? null
        : cam.state === "error"
          ? { dot: "off", text: cam.message }
          : conf >= 0.75
            ? { dot: "", text: "Câmera ok" }
            : conf > 0
              ? { dot: "warn", text: "Ajuste o enquadramento" }
              : { dot: "warn", text: "Procurando você…" };

  return (
    // qualquer toque libera o áudio no celular, se o navegador o suspendeu
    <div className="player" onPointerDownCapture={unlockAudio}>
      <header className="player-top">
        <button type="button" className="icon-btn" onClick={askQuit} aria-label="Sair do treino">
          <X size={20} />
        </button>
        <span className="title">
          {workoutName}{" "}
          <small className="muted">
            <span className="sep">· </span>passo {Math.min(runner.index + 1, runner.steps.length)}{" "}
            de {runner.steps.length}
          </small>
        </span>
        <div className="progress">
          <div style={{ width: `${(runner.index / runner.steps.length) * 100}%` }} />
        </div>
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <button
            type="button"
            className="icon-btn fullscreen-btn"
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
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettings({ music: !settings.music })}
          aria-label="Música de fundo"
          aria-pressed={settings.audio && settings.music}
          disabled={!settings.audio}
          title={settings.audio ? undefined : "Ligue o som para ouvir a música"}
        >
          <Music size={20} />
        </button>
        {vozSuportada && (
          <button
            type="button"
            className="icon-btn"
            onClick={alternarVoz}
            aria-label="Contar pela voz"
            aria-pressed={ouvindo}
            title={ouvindo ? "Desligar o microfone" : "Contar as repetições dizendo os números"}
          >
            <Mic size={20} />
          </button>
        )}
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
                <span className={`muted strong ${isRest ? "" : "set-info"}`}>
                  {isRest ? "A seguir" : setInfo}
                </span>
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
              {ouvindo && (
                <span className="pill voz-pill" role="status">
                  <span className="dot" />
                  {ouvido ? `Ouvi: “${ouvido}”` : "Ouvindo… diga o número"}
                </span>
              )}
              {mode === "camera" && (
                <div className="cam-pip" ref={camHost}>
                  <canvas ref={overlay} />
                  {/* enquanto a câmera liga, a miniatura fica sem selo */}
                  {badge && (
                    <span className="cam-badge">
                      <span className={`dot ${badge.dot}`} />
                      {badge.text}
                    </span>
                  )}
                </div>
              )}
              {mode === "pareado" && (
                <div className="cam-pip pair-pip">
                  {(par.fase === "aguardando" || par.fase === "desconectado") &&
                  par.codigo &&
                  par.url ? (
                    <div className="pair-code">
                      <QrCode text={par.url} />
                      <div>
                        <strong>Aponte a câmera do celular</strong>
                        <span className="muted">
                          ou abra {par.url.replace(/^https?:\/\//, "").split("/")[0]}/camera e
                          digite
                        </span>
                        <span className="num code">{par.codigo}</span>
                        <button type="button" className="link" onClick={par.novoCodigo}>
                          Gerar outro código
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {par.fase === "erro" && (
                    <button type="button" className="btn ghost" onClick={par.novoCodigo}>
                      Gerar outro código
                    </button>
                  )}
                  {badge && (
                    <span className="cam-badge">
                      <span className={`dot ${badge.dot}`} />
                      {badge.text}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {toast && <div className={`toast ${toast.good ? "good" : ""}`}>{toast.text}</div>}
          {mode === "camera" && cam.state === "error" && (
            <div className="overlay-msg cam-falhou" role="alert">
              <div>
                <h2>{cam.message}</h2>
                <p className="muted">
                  {cam.negada
                    ? ajudaDaCamera(navegadorDe(navigator.userAgent))
                    : "Outro app pode estar usando a câmera, ou o aparelho a desligou. Dá para tentar de novo ou seguir contando à mão."}
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setCam({ state: "off" });
                      setMode("manual");
                      runner.setHolding(true);
                    }}
                  >
                    Contar à mão
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setCam({ state: "loading" });
                      setCamTentativa((n) => n + 1);
                    }}
                  >
                    Tentar de novo
                  </button>
                </div>
              </div>
            </div>
          )}
          {runner.paused && !quitting && !pedindoVoz && (
            <div className="overlay-msg">
              {retomando ? (
                <div role="status" aria-live="assertive">
                  <span className="muted">Voltando em</span>
                  <h2 className="num retomando">{retomando}</h2>
                </div>
              ) : (
                <div>
                  <h2>Pausado</h2>
                  <button
                    type="button"
                    className="btn primary big"
                    data-autofocus
                    // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para Continuar
                    autoFocus
                    onClick={retomar}
                  >
                    <Play size={20} fill="currentColor" /> Continuar
                  </button>
                </div>
              )}
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
                <span className="partials">
                  {runner.partials} parcia{runner.partials > 1 ? "is" : "l"}
                </span>
              )}
            </div>
            <div className="big num">
              <span className="value" aria-live="polite">
                {big}
              </span>
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

          {/* No celular em pé, as parciais da série tomam o lugar do total do treino. */}
          <div className="stats-row" data-partials={mode !== "manual" && !isRest ? "" : undefined}>
            <div className="stat">
              <span className="label">
                {isRest ? "Séries feitas" : remaining !== null ? "Restante" : "Tempo da série"}
              </span>
              <span className="value num">
                {isRest ? runner.logs.length : fmtTime(remaining ?? runner.elapsed)}
              </span>
            </div>
            <div className="stat total-stat">
              <span className="label">Repetições no treino</span>
              <span className="value num accent">
                {runner.totalReps + (isRest ? 0 : runner.reps)}
              </span>
            </div>
            <div className="stat partials-stat">
              <span className="label">Parciais</span>
              <span className="value num warn">{runner.partials}</span>
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
                if (runner.paused) retomar();
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

      {pedindoVoz && (
        <div className="overlay-msg fixed" data-modal>
          <div>
            <h2>
              {falhaVoz
                ? ajudaDaVoz(falhaVoz, navegadorDe(navigator.userAgent)).titulo
                : "Contar pela voz"}
            </h2>
            {falhaVoz ? (
              <p className="muted">
                {ajudaDaVoz(falhaVoz, navegadorDe(navigator.userAgent)).texto}
              </p>
            ) : (
              <p className="muted">
                Diga os números em voz alta (“um, dois, três…”) e o app conta por você. O
                reconhecimento é feito pelo navegador: no Chrome o áudio vai para o Google e no
                Safari para a Apple, só enquanto o microfone estiver ligado. O Bora Treinar não
                grava nem guarda o áudio. Com o microfone ligado, a voz do app e a música ficam
                caladas.{mode !== "manual" ? " Com a câmera, a voz completa o que ela perder." : ""}
              </p>
            )}
            {falhaVoz !== "indisponivel" && (
              <button
                type="button"
                className="btn primary big"
                // biome-ignore lint/a11y/noAutofocus: no controle da TV o foco precisa ir para a escolha
                autoFocus
                onClick={() => {
                  // o toque é o gesto que o navegador exige para mostrar o pedido de permissão
                  setSettings({ vozAceita: true, vozAoIniciar: true });
                  fecharPerguntaVoz();
                  void ligarVoz();
                }}
              >
                <Mic size={20} /> {falhaVoz ? "Tentar de novo" : "Ligar o microfone"}
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSettings({ vozAoIniciar: false });
                fecharPerguntaVoz();
              }}
            >
              Agora não
            </button>
          </div>
        </div>
      )}

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
                retomar();
              }}
            >
              Continuar treinando
            </button>
            {/* a série em andamento também conta: antes o botão só aparecia com uma série fechada */}
            {(runner.logs.length > 0 || runner.reps > 0 || runner.holdSeconds >= 1) && (
              <button type="button" className="btn" onClick={() => runner.finish()}>
                Encerrar e salvar
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => router.replace(saida)}>
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
