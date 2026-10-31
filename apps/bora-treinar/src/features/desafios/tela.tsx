"use client";
import { Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { TopNav } from "@/components/top-nav";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { useServerAction } from "@/lib/use-server-action";
import { challengeAction } from "./actions";
import { type Desafio, descreverDesafio, type Metrica, SUGESTOES } from "./placar";

type Placar = {
  total: number;
  concluido: boolean;
  progresso: number;
  linhas: { id: string; name: string; color: string; valor: number }[];
};

const METRICA_NOME: Record<Metrica, string> = {
  treinos: "Treinos na semana",
  repeticoes: "Repetições somadas",
  minutos: "Minutos de treino",
  exercicio: "Repetições de um exercício",
};

export function DesafiosScreen({
  profile,
  allowed,
  desafio,
  placar,
  semana,
}: {
  profile: { name: string; color: string };
  allowed: boolean;
  desafio: Desafio | null;
  placar: Placar | null;
  semana: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(!desafio);
  const [rascunho, setRascunho] = useState<Desafio>(
    desafio ?? { metric: "treinos", exerciseId: null, target: 6 },
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const salvar = (d: Desafio | null) =>
    start(async () => {
      const result = await challengeAction(d);
      if (!result.ok) return setMessage(result.error);
      setMessage("");
      setEditando(false);
      router.refresh();
    });
  const [ano, mes, dia] = semana.split("-");

  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <div className="section-title first">
          <h2>Desafio da semana</h2>
          <span className="muted">
            semana de {dia}/{mes}/{ano}
          </span>
        </div>
        {!allowed ? (
          <Link href="/conta" className="card upsell">
            <strong>
              <Lock size={16} /> Desafios em família fazem parte da assinatura.
            </strong>
            <span className="muted">
              Escolham juntos uma meta para a semana e acompanhem quanto cada um somou, com
              conquistas pelo caminho.
            </span>
          </Link>
        ) : (
          <>
            {desafio && placar && !editando && (
              <div className={`card challenge ${placar.concluido ? "done" : ""}`}>
                <div className="challenge-head">
                  <Trophy size={32} />
                  <div className="grow">
                    <span className="muted">Meta da família</span>
                    <h3>{descreverDesafio(desafio)}</h3>
                  </div>
                  <span className="num challenge-total">
                    {placar.total}
                    <small>/ {desafio.target}</small>
                  </span>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <div style={{ width: `${placar.progresso * 100}%` }} />
                </div>
                <p className="muted spaced">
                  {placar.concluido
                    ? "Meta batida! A semana que vem começa com uma nova."
                    : "Cada treino de qualquer perfil da família soma para a meta."}
                </p>
                <div className="scoreboard">
                  {placar.linhas.map((l, i) => (
                    <div className="score-row" key={l.id}>
                      <span className="idx">{i + 1}</span>
                      <Avatar profile={l} size="2.4rem" />
                      <span className="grow">{l.name}</span>
                      <span className="num">{l.valor}</span>
                    </div>
                  ))}
                </div>
                <div className="row spaced">
                  <button type="button" className="btn ghost" onClick={() => setEditando(true)}>
                    Trocar a meta
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={pending}
                    onClick={() => salvar(null)}
                  >
                    Encerrar desafio
                  </button>
                </div>
              </div>
            )}
            {editando && (
              <div className="card form-grid">
                <p className="lead full">Escolham uma meta para esta semana:</p>
                <div className="row full">
                  {SUGESTOES.map((s) => (
                    <button
                      type="button"
                      key={`${s.metric}-${s.exerciseId}-${s.target}`}
                      className="chip"
                      aria-pressed={
                        s.metric === rascunho.metric &&
                        s.exerciseId === rascunho.exerciseId &&
                        s.target === rascunho.target
                      }
                      onClick={() => setRascunho(s)}
                    >
                      {descreverDesafio(s)}
                    </button>
                  ))}
                </div>
                <label>
                  <span className="muted">Tipo de meta</span>
                  <select
                    className="field"
                    value={rascunho.metric}
                    onChange={(e) => {
                      const metric = e.target.value as Metrica;
                      setRascunho({
                        ...rascunho,
                        metric,
                        exerciseId:
                          metric === "exercicio" ? (rascunho.exerciseId ?? "agachamento") : null,
                      });
                    }}
                  >
                    {Object.entries(METRICA_NOME).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {rascunho.metric === "exercicio" && (
                  <label>
                    <span className="muted">Exercício</span>
                    <select
                      className="field"
                      value={rascunho.exerciseId ?? ""}
                      onChange={(e) => setRascunho({ ...rascunho, exerciseId: e.target.value })}
                    >
                      {EXERCISES.filter((e) => e.rule.kind === "reps").map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span className="muted">Meta</span>
                  <input
                    className="field"
                    type="number"
                    min={1}
                    max={100000}
                    value={rascunho.target}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, target: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </label>
                <div className="row full">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={pending}
                    onClick={() => salvar(rascunho)}
                    data-autofocus
                  >
                    Valendo!
                  </button>
                  {desafio && (
                    <button type="button" className="btn ghost" onClick={() => setEditando(false)}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )}
            <p role="status" className="form-message">
              {message}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
