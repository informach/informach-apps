"use client";
import { ArrowLeft, Copy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MP_BONES } from "@/features/treino/body/landmarks";
import { contavel, EXERCISES, exerciseById } from "@/features/treino/catalog/catalog";
import {
  type Check,
  type CountRule,
  evalMetric,
  HoldTracker,
  minRepMsFor,
  RepCounter,
  type RepRule,
} from "@/features/treino/engine/counter";
import { Instructor3D } from "@/features/treino/instructor/instructor-3d";
import { type PoseFrame, PoseTracker } from "@/features/treino/vision/pose-tracker";

const FULL = 0.85;
const PARTIAL = 0.45;

interface Leitura {
  conf: number;
  fps: number;
  /** ângulo medido no quadro, sem filtro */
  bruto: number | null;
  /** ângulo filtrado, o que o contador usa para começar e terminar a repetição */
  filtrado: number | null;
  /** fração do caminho até o limiar, pelo valor bruto (pode passar de 1) */
  caminho: number;
  /** maior fração alcançada na repetição em andamento */
  alcance: number;
  estado: string;
  segurando: boolean;
  dica: string | null;
}

interface Registro {
  n: number;
  tipo: "rep" | "parcial";
  profundidade: number;
  duracao: number;
  avisos: string[];
}

const LEITURA_VAZIA: Leitura = {
  conf: 0,
  fps: 0,
  bruto: null,
  filtrado: null,
  caminho: 0,
  alcance: 0,
  estado: "sem pessoa no quadro",
  segurando: false,
  dica: null,
};

const ESTADOS = {
  waiting: "volte à posição inicial",
  top: "pronto, no topo",
  moving: "em movimento",
} as const;

const clone = (rule: CountRule): CountRule => structuredClone(rule);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const graus = (x: number | null) => (x === null ? "–" : `${x.toFixed(0)}°`);

/** O mesmo tempo mínimo de repetição do player, pela cadência do exercício. */
function novoContador(rule: CountRule, exerciseId: string) {
  const minRepMs = minRepMsFor(exerciseById(exerciseId).cadence);
  if (rule.kind === "reps") return new RepCounter(rule, { minRepMs });
  // alongamento não chega aqui (a lista só tem exercícios que contam): um contador sem condição
  return new HoldTracker(rule.kind === "hold" ? rule : { kind: "hold", conditions: [] });
}

/**
 * Laboratório de calibração: mostra, quadro a quadro, o que a câmera mede no
 * exercício e como o contador interpreta, e deixa mudar os limiares ao vivo.
 * Nada sai do aparelho e nada é salvo; "Copiar regra" leva os números para o
 * catálogo (`catalog/catalog.ts`).
 */
export function Laboratorio({ exerciseId }: { exerciseId: string }) {
  const [exId, setExId] = useState(exerciseId);
  const ex = exerciseById(exId);
  const [regra, setRegra] = useState<CountRule>(() => clone(ex.rule));
  const [leitura, setLeitura] = useState<Leitura>(LEITURA_VAZIA);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [segundos, setSegundos] = useState(0);
  const [camera, setCamera] = useState<"carregando" | "ligada" | string>("carregando");
  const [copiado, setCopiado] = useState(false);

  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const regraRef = useRef(regra);
  const exIdRef = useRef(exId);
  const contador = useRef(novoContador(regra, exId));
  const ultimoQuadro = useRef(0);

  function aplicar(nova: CountRule) {
    regraRef.current = nova;
    contador.current = novoContador(nova, exIdRef.current);
    setRegra(nova);
  }

  function zerar() {
    contador.current = novoContador(regraRef.current, exIdRef.current);
    setRegistros([]);
    setSegundos(0);
  }

  function trocarExercicio(id: string) {
    window.history.replaceState(null, "", `?ex=${id}`);
    setExId(id);
    exIdRef.current = id;
    aplicar(clone(exerciseById(id).rule));
    setRegistros([]);
    setSegundos(0);
  }

  useEffect(() => {
    const tracker = new PoseTracker();
    let vivo = true;
    const desenhar = (f: PoseFrame | null) => {
      const cv = overlay.current;
      if (!cv) return;
      cv.width = tracker.video.videoWidth || 640;
      cv.height = tracker.video.videoHeight || 480;
      const g = cv.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, cv.width, cv.height);
      if (!f) return;
      g.lineWidth = 5;
      g.lineCap = "round";
      for (const [a, b] of MP_BONES) {
        const p = f.image[a];
        const q = f.image[b];
        if (!p || !q) continue;
        // linhas apagadas: pontos que o contador descarta por pouca visibilidade
        const v = Math.min(p.visibility ?? 1, q.visibility ?? 1);
        g.strokeStyle = v >= 0.5 ? "#C8FF2E" : v >= 0.3 ? "#FFB020" : "#FF4D4D55";
        g.beginPath();
        g.moveTo(p.x * cv.width, p.y * cv.height);
        g.lineTo(q.x * cv.width, q.y * cv.height);
        g.stroke();
      }
    };
    const aoQuadro = (f: PoseFrame | null) => {
      desenhar(f);
      if (!f) {
        setLeitura({ ...LEITURA_VAZIA, fps: tracker.fps });
        return;
      }
      const rule = regraRef.current;
      const c = contador.current;
      const dt = ultimoQuadro.current ? (f.t - ultimoQuadro.current) / 1000 : 0;
      ultimoQuadro.current = f.t;
      if (rule.kind === "reps" && c instanceof RepCounter) {
        const u = c.update(f.world, f.t);
        const bruto = evalMetric(rule.metric, f.world, 0.3)?.value ?? null;
        const caminho = bruto === null ? 0 : (bruto - rule.rest) / (rule.peak - rule.rest);
        for (const ev of u.events)
          setRegistros((rs) =>
            [
              {
                n: (rs[0]?.n ?? 0) + 1,
                tipo: ev.type === "rep" ? ("rep" as const) : ("parcial" as const),
                profundidade: ev.depth,
                duracao: ev.duration / 1000,
                avisos: ev.issues,
              },
              ...rs,
            ].slice(0, 30),
          );
        setLeitura({
          conf: u.conf,
          fps: tracker.fps,
          bruto,
          filtrado: u.value,
          caminho,
          alcance: c.debug.reached,
          estado: u.value === null ? "pontos pouco visíveis" : ESTADOS[c.debug.state],
          segurando: false,
          dica: null,
        });
      } else if (rule.kind === "hold" && c instanceof HoldTracker) {
        const u = c.update(f.world, f.t);
        if (u.holding) setSegundos((s) => s + dt);
        setLeitura({
          ...LEITURA_VAZIA,
          conf: u.conf,
          fps: tracker.fps,
          estado: u.holding ? "segurando" : "fora da postura",
          segurando: u.holding,
          dica: u.cue,
        });
      }
    };
    const off = tracker.on(aoQuadro);
    tracker
      .start()
      .then(() => {
        if (!vivo) return tracker.stop();
        host.current?.prepend(tracker.video);
        setCamera("ligada");
      })
      .catch((err: Error) => {
        if (vivo)
          setCamera(
            err.name === "NotAllowedError"
              ? "Permissão da câmera negada"
              : err.message || "Câmera indisponível",
          );
      });
    return () => {
      vivo = false;
      off();
      tracker.stop();
    };
  }, []);

  const reps = registros.filter((r) => r.tipo === "rep").length;
  const parciais = registros.length - reps;

  return (
    <div className="screen">
      <main className="scroll playground" id="conteudo">
        <div className="row">
          <Link href="/dev/playground" className="icon-btn" aria-label="Voltar ao playground">
            <ArrowLeft size={20} />
          </Link>
          <h2 className="grow">Laboratório da câmera</h2>
          <select
            className="lab-select"
            value={exId}
            onChange={(e) => trocarExercicio(e.target.value)}
            aria-label="Exercício"
          >
            {EXERCISES.filter(contavel).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          {ex.cameraHint}. Linhas verdes: pontos bem vistos. Laranja: só valem durante o movimento.
          Vermelhas: descartadas.
        </p>

        <div className="lab-stage">
          <div className="lab-cam" ref={host}>
            <canvas ref={overlay} />
            {camera !== "ligada" && (
              <span className="pill lab-cam-msg">
                {camera === "carregando" ? "Ligando a câmera e o detector…" : camera}
              </span>
            )}
          </div>
          <div className="lab-inst">
            <Instructor3D
              className="canvas"
              exerciseId={exId}
              mode={regra.kind === "hold" ? "hold" : "follow"}
              followDepth={Math.max(0, Math.min(1, leitura.caminho))}
            />
          </div>
        </div>

        {regra.kind === "reps" ? (
          <PainelRepeticoes
            regra={regra}
            leitura={leitura}
            reps={reps}
            parciais={parciais}
            registros={registros}
          />
        ) : (
          <div className="stats-row spaced">
            <div className="stat">
              <span className="label">segurando</span>
              <span className="value num">{leitura.segurando ? "Sim" : "Não"}</span>
            </div>
            <div className="stat">
              <span className="label">tempo na postura</span>
              <span className="value num">{segundos.toFixed(1)} s</span>
            </div>
            <div className="stat">
              <span className="label">o que falta</span>
              <span className="value lab-cue">{leitura.dica ?? "–"}</span>
            </div>
            <div className="stat">
              <span className="label">confiança · fps</span>
              <span className="value num">
                {leitura.conf.toFixed(2)} · {leitura.fps}
              </span>
            </div>
          </div>
        )}

        <div className="section-title">
          <h2>Limiares</h2>
          <span className="muted">mudam na hora, só neste aparelho</span>
        </div>
        <div className="card">
          {regra.kind === "reps" ? (
            <AjusteRepeticoes regra={regra} aoMudar={aplicar} />
          ) : regra.kind === "hold" ? (
            <AjusteIsometria regra={regra} aoMudar={aplicar} />
          ) : null}
          <div className="row spaced">
            <button type="button" className="btn" onClick={zerar}>
              Zerar contagem
            </button>
            <button type="button" className="btn ghost" onClick={() => aplicar(clone(ex.rule))}>
              <RotateCcw size={18} /> Voltar ao catálogo
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(JSON.stringify({ id: ex.id, rule: regra }, null, 2))
                  .then(() => setCopiado(true));
                window.setTimeout(() => setCopiado(false), 1500);
              }}
            >
              <Copy size={18} /> {copiado ? "Copiado!" : "Copiar regra"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function PainelRepeticoes({
  regra,
  leitura,
  reps,
  parciais,
  registros,
}: {
  regra: RepRule;
  leitura: Leitura;
  reps: number;
  parciais: number;
  registros: Registro[];
}) {
  const full = regra.full ?? FULL;
  const partial = regra.partial ?? PARTIAL;
  // a régua vai até 120% do caminho, para mostrar quem passa do limiar
  const pos = (x: number) => `${(Math.max(0, Math.min(1.2, x)) / 1.2) * 100}%`;
  return (
    <>
      <div className="stats-row spaced">
        <div className="stat">
          <span className="label">repetições</span>
          <span className="value num">{reps}</span>
        </div>
        <div className="stat">
          <span className="label">parciais</span>
          <span className="value num">{parciais}</span>
        </div>
        <div className="stat">
          <span className="label">ângulo bruto · filtrado</span>
          <span className="value num">
            {graus(leitura.bruto)} · {graus(leitura.filtrado)}
          </span>
        </div>
        <div className="stat">
          <span className="label">confiança · fps</span>
          <span className="value num">
            {leitura.conf.toFixed(2)} · {leitura.fps}
          </span>
        </div>
      </div>

      <div className="card spaced">
        <div className="row">
          <strong className="grow">{leitura.estado}</strong>
          <span className="muted">
            agora {pct(leitura.caminho)}
            {leitura.alcance > 0 && ` · máximo nesta repetição ${pct(leitura.alcance)}`}
          </span>
        </div>
        <div className="lab-ruler" aria-hidden>
          <div className="lab-fill" style={{ width: pos(leitura.caminho) }} />
          {leitura.alcance > 0 && (
            <div className="lab-peak" style={{ left: pos(leitura.alcance) }} />
          )}
          <span className="lab-mark" style={{ left: pos(partial) }}>
            parcial {pct(partial)}
          </span>
          <span className="lab-mark ok" style={{ left: pos(full) }}>
            conta {pct(full)}
          </span>
          <span className="lab-mark" style={{ left: pos(1) }}>
            limiar {regra.peak}°
          </span>
        </div>
        <p className="muted small">
          Topo em {regra.rest}°, limiar em {regra.peak}°. A repetição começa ao passar de 12% e
          termina ao voltar abaixo de 4% do caminho.
        </p>
      </div>

      {registros.length > 0 && (
        <div className="card lab-table spaced">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Resultado</th>
                <th>Profundidade</th>
                <th>Duração</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.n} className={r.tipo === "rep" ? "" : "lab-partial"}>
                  <td>{r.n}</td>
                  <td>{r.tipo === "rep" ? "Repetição" : "Parcial"}</td>
                  <td>{pct(r.profundidade)}</td>
                  <td>{r.duracao.toFixed(1)} s</td>
                  <td>{r.avisos.join(", ") || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Numero({
  rotulo,
  valor,
  aoMudar,
  passo = 1,
}: {
  rotulo: string;
  valor: number | undefined;
  aoMudar: (v: number | undefined) => void;
  passo?: number;
}) {
  return (
    <label className="lab-field">
      <span className="muted small">{rotulo}</span>
      <input
        className="field"
        type="number"
        step={passo}
        value={valor ?? ""}
        onChange={(e) => aoMudar(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}

function AjusteRepeticoes({ regra, aoMudar }: { regra: RepRule; aoMudar: (r: CountRule) => void }) {
  return (
    <div className="lab-fields">
      <Numero
        rotulo="Topo (°)"
        valor={regra.rest}
        aoMudar={(v) => aoMudar({ ...regra, rest: v ?? regra.rest })}
      />
      <Numero
        rotulo="Limiar do fundo (°)"
        valor={regra.peak}
        aoMudar={(v) => aoMudar({ ...regra, peak: v ?? regra.peak })}
      />
      <Numero
        rotulo="Conta a partir de (%)"
        valor={Math.round((regra.full ?? FULL) * 100)}
        aoMudar={(v) => aoMudar({ ...regra, full: v === undefined ? undefined : v / 100 })}
      />
      <Numero
        rotulo="Parcial a partir de (%)"
        valor={Math.round((regra.partial ?? PARTIAL) * 100)}
        aoMudar={(v) => aoMudar({ ...regra, partial: v === undefined ? undefined : v / 100 })}
      />
    </div>
  );
}

function AjusteIsometria({
  regra,
  aoMudar,
}: {
  regra: Extract<CountRule, { kind: "hold" }>;
  aoMudar: (r: CountRule) => void;
}) {
  const mudar = (i: number, campo: "min" | "max", v: number | undefined) =>
    aoMudar({
      ...regra,
      conditions: regra.conditions.map((c, j): Check => (j === i ? { ...c, [campo]: v } : c)),
    });
  return (
    <div className="stack">
      {regra.conditions.map((c, i) => (
        <div key={c.cue} className="lab-fields">
          <span className="lab-cond">{c.cue}</span>
          <Numero rotulo="Mínimo (°)" valor={c.min} aoMudar={(v) => mudar(i, "min", v)} />
          <Numero rotulo="Máximo (°)" valor={c.max} aoMudar={(v) => mudar(i, "max", v)} />
        </div>
      ))}
    </div>
  );
}
