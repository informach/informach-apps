"use client";
import { Camera, Mic, MicOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MP_BONES } from "@/features/treino/body/landmarks";
import { exerciseById } from "@/features/treino/catalog/catalog";
import { HoldTracker, RepCounter } from "@/features/treino/engine/counter";
import {
  contagemPelaVoz,
  type Dito,
  type FalhaVoz,
  JuntaContagem,
  OuvinteDeVoz,
  pedirMicrofone,
  vozDisponivel,
} from "@/features/treino/engine/voz";
import { ajudaDaVoz, navegadorDe } from "@/features/treino/permissoes";
import { type PoseFrame, PoseTracker } from "@/features/treino/vision/pose-tracker";
import { presenca } from "@/features/treino/vision/presenca";
import { type EstadoTv, type EventoCelular, estadoTvSchema } from "./protocolo";

type Fase = "entrando" | "conectado" | "erro";

function enviar(evento: EventoCelular) {
  void fetch("/api/pareamento/eventos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(evento),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * O celular vira a câmera da TV: detecta a pose e conta aqui mesmo, e manda
 * para a TV só o que aconteceu (repetição, parcial, segurando). A imagem
 * nunca sai do aparelho.
 */
export function CameraCelular({ codigo }: { codigo: string }) {
  const [fase, setFase] = useState<Fase>("entrando");
  const [erro, setErro] = useState("");
  const [estado, setEstado] = useState<EstadoTv | null>(null);
  const [frente, setFrente] = useState(true);
  const [camera, setCamera] = useState<"ligando" | "ok" | string>("ligando");
  const [reps, setReps] = useState(0);
  const [confianca, setConfianca] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const estadoRef = useRef<EstadoTv | null>(null);
  const contadores = useRef<{ chave: string; rep?: RepCounter; hold?: HoldTracker } | null>(null);
  const ultimoSinal = useRef(0);
  const ultimaIsometria = useRef("");
  const confAtual = useRef(0);
  const progressoAtual = useRef(0);
  /** quantas repetições este celular contou no passo atual (câmera e voz juntas) */
  const contadas = useRef(0);
  const junta = useRef(new JuntaContagem());
  const [vozOk, setVozOk] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const ouvindoRef = useRef(false);
  ouvindoRef.current = ouvindo;
  const [falhaVoz, setFalhaVoz] = useState<FalhaVoz | null>(null);
  const ouvinte = useRef<OuvinteDeVoz | null>(null);
  useEffect(() => setVozOk(vozDisponivel()), []);

  // 1. entra com o código e passa a ouvir a TV
  useEffect(() => {
    let fonte: EventSource | null = null;
    let vivo = true;
    (async () => {
      const resposta = await fetch("/api/pareamento/entrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo }),
      }).catch(() => null);
      const corpo = (await resposta?.json().catch(() => ({}))) as { erro?: string } | undefined;
      if (!vivo) return;
      if (!resposta?.ok) {
        setErro(corpo?.erro ?? "Não foi possível conectar. Confira a internet.");
        setFase("erro");
        return;
      }
      setFase("conectado");
      fonte = new EventSource("/api/pareamento/stream?lado=celular");
      fonte.onmessage = (m) => {
        try {
          const parsed = estadoTvSchema.safeParse(JSON.parse(m.data));
          if (!parsed.success) return;
          if (parsed.data.passo !== estadoRef.current?.passo) {
            setReps(0);
            contadas.current = 0;
            junta.current.zerar();
          }
          estadoRef.current = parsed.data;
          setEstado(parsed.data);
        } catch {
          // mensagem malformada: ignora
        }
      };
    })();
    return () => {
      vivo = false;
      fonte?.close();
    };
  }, [codigo]);

  const aoQuadro = useCallback((f: PoseFrame | null, video: HTMLVideoElement) => {
    const cv = overlay.current;
    if (cv) {
      cv.width = video.videoWidth || 640;
      cv.height = video.videoHeight || 480;
      const g = cv.getContext("2d");
      if (g) {
        g.clearRect(0, 0, cv.width, cv.height);
        g.lineWidth = 6;
        g.lineCap = "round";
        g.strokeStyle = "#C8FF2E";
        for (const [a, b] of MP_BONES) {
          const p = f?.image[a];
          const q = f?.image[b];
          if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
          g.beginPath();
          g.moveTo(p.x * cv.width, p.y * cv.height);
          g.lineTo(q.x * cv.width, q.y * cv.height);
          g.stroke();
        }
      }
    }
    const atual = estadoRef.current;
    if (!f || !atual?.exerciseId || atual.pausado || atual.fim) {
      // no descanso e na pausa o enquadramento continua valendo (e chega à TV pelo batimento)
      const c = f ? presenca(f.image) : 0;
      confAtual.current = c;
      progressoAtual.current = 0;
      setConfianca(Math.round(c * 10) / 10);
      return;
    }
    const chave = `${atual.passo}:${atual.exerciseId}`;
    if (contadores.current?.chave !== chave) {
      const regra = exerciseById(atual.exerciseId).rule;
      contadores.current = {
        chave,
        ...(regra.kind === "reps"
          ? { rep: new RepCounter(regra) }
          : { hold: new HoldTracker(regra) }),
      };
    }
    const c = contadores.current;
    let conf = 0;
    let progresso = 0;
    if (c.rep) {
      const u = c.rep.update(f.world, f.t);
      conf = u.conf;
      progresso = u.progress;
      for (const ev of u.events) {
        if (ev.type === "rep") {
          // a voz já contou esta repetição? então a câmera não manda de novo
          if (!junta.current.camera(performance.now())) continue;
          contadas.current += 1;
          setReps(contadas.current);
        }
        enviar({
          tipo: ev.type === "rep" ? "rep" : "parcial",
          passo: atual.passo,
          issues: ev.issues.slice(0, 5),
        });
      }
    } else if (c.hold) {
      const u = c.hold.update(f.world, f.t);
      conf = u.conf;
      const marca = `${chave}:${u.holding}`;
      if (ultimaIsometria.current !== marca) {
        ultimaIsometria.current = marca;
        enviar({ tipo: "isometria", passo: atual.passo, segurando: u.holding, dica: u.cue });
      }
    }
    setConfianca(Math.round(conf * 10) / 10);
    confAtual.current = conf;
    progressoAtual.current = progresso;
    // sinal de enquadramento e profundidade para a TV, até 4 vezes por segundo
    if (f.t - ultimoSinal.current > 250) {
      ultimoSinal.current = f.t;
      enviar({ tipo: "sinal", confianca: conf, progresso, ouvindo: ouvindoRef.current });
    }
  }, []);

  // Batimento: um sinal a cada 2 s, com ou sem pessoa na imagem, também no descanso. É por ele que
  // a TV sabe que o celular continua aqui (sem nada por 6 s, ela mostra "Celular desconectado").
  useEffect(() => {
    if (fase !== "conectado") return;
    const t = window.setInterval(() => {
      ultimoSinal.current = performance.now();
      enviar({
        tipo: "sinal",
        confianca: confAtual.current,
        progresso: progressoAtual.current,
        ouvindo: ouvindoRef.current,
      });
    }, 2000);
    return () => window.clearInterval(t);
  }, [fase]);

  /** A voz no celular, que está perto da pessoa: os números ditos completam a câmera. */
  const aoOuvir = useCallback((novos: Dito[]) => {
    const atual = estadoRef.current;
    if (!novos.length || !atual?.exerciseId || atual.pausado || atual.fim) return;
    if (exerciseById(atual.exerciseId).rule.kind !== "reps") return;
    const antes = contadas.current;
    const alvo = contagemPelaVoz(antes, novos);
    if (alvo <= antes) return;
    junta.current.voz(antes, alvo, performance.now());
    for (let i = antes; i < alvo; i++) enviar({ tipo: "rep", passo: atual.passo, issues: [] });
    contadas.current = alvo;
    setReps(alvo);
  }, []);
  const pararVoz = useCallback(() => {
    ouvinte.current?.parar();
    ouvinte.current = null;
    setOuvindo(false);
  }, []);
  const ligarVoz = useCallback(async () => {
    const pedido = await pedirMicrofone();
    if (pedido !== "ok") return setFalhaVoz(pedido);
    setFalhaVoz(null);
    const o = new OuvinteDeVoz(aoOuvir, (falha) => {
      pararVoz();
      setFalhaVoz(falha);
    });
    ouvinte.current = o;
    setOuvindo(true);
    o.ligar();
  }, [aoOuvir, pararVoz]);
  useEffect(() => () => ouvinte.current?.parar(), []);

  // 2. câmera e detector, quando já conectado
  useEffect(() => {
    if (fase !== "conectado") return;
    const tracker = new PoseTracker();
    let vivo = true;
    const off = tracker.on((f) => aoQuadro(f, tracker.video));
    setCamera("ligando");
    tracker
      .start(frente ? "user" : "environment")
      .then(() => {
        if (!vivo) return tracker.stop();
        host.current?.prepend(tracker.video);
        setCamera("ok");
      })
      .catch((e: Error) => {
        if (vivo)
          setCamera(e.name === "NotAllowedError" ? "Permissão da câmera negada" : e.message);
      });
    // tela acesa; o navegador solta a trava quando a tela some, então pede de novo na volta
    let trava: WakeLockSentinel | null = null;
    const pedirTrava = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((t) => {
          void trava?.release().catch(() => undefined);
          trava = t;
        })
        .catch(() => undefined);
    void pedirTrava();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pedirTrava();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      off();
      tracker.stop();
      tracker.video.remove();
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release();
    };
  }, [fase, frente, aoQuadro]);

  if (fase === "erro")
    return (
      <main className="phone-cam centered" id="conteudo">
        <div className="brand">
          <i />
          Bora Treinar
        </div>
        <h1>Não deu para conectar</h1>
        <p className="muted">{erro}</p>
        <a className="btn primary" href="/camera">
          Digitar outro código
        </a>
      </main>
    );

  const ex = estado?.exerciseId ? exerciseById(estado.exerciseId) : null;
  return (
    <main className="phone-cam" id="conteudo">
      <div className="phone-video" ref={host}>
        <canvas ref={overlay} />
      </div>
      <div className="phone-hud">
        <div>
          <span className="eyebrow">{estado?.titulo ?? "Conectando à TV…"}</span>
          <h1>{ex ? ex.name : estado?.fim ? "Treino concluído" : "Descanso"}</h1>
          <p className="muted">
            {camera === "ok"
              ? confianca >= 0.75
                ? "Você está bem enquadrado."
                : "Afaste-se até o corpo inteiro aparecer."
              : camera === "ligando"
                ? "Ligando a câmera…"
                : camera}
          </p>
        </div>
        {ex && ex.rule.kind === "reps" && <span className="num phone-reps">{reps}</span>}
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setFrente(!frente)}>
            <RefreshCw size={18} /> {frente ? "Câmera de trás" : "Câmera da frente"}
          </button>
          {vozOk && (
            <button
              type="button"
              className="btn ghost"
              aria-pressed={ouvindo}
              onClick={() => (ouvindo ? pararVoz() : void ligarVoz())}
            >
              {ouvindo ? <MicOff size={18} /> : <Mic size={18} />}{" "}
              {ouvindo ? "Parar a voz" : "Contar também pela voz"}
            </button>
          )}
          <span className="chip">
            <Camera size={14} /> A imagem fica só neste celular
          </span>
        </div>
        {ouvindo && (
          <p className="muted small" role="status">
            Ouvindo: diga os números. O reconhecimento é do navegador (Google no Chrome, Apple no
            Safari), só enquanto o microfone está ligado; nada é gravado.
          </p>
        )}
        {falhaVoz && (
          <div className="card notice" role="alert">
            <strong>{ajudaDaVoz(falhaVoz, navegadorDe(navigator.userAgent)).titulo}</strong>
            <span className="muted">
              {ajudaDaVoz(falhaVoz, navegadorDe(navigator.userAgent)).texto}
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
