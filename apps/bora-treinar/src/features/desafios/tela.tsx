"use client";
import { CircleCheck, CircleDashed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopNav } from "@/components/top-nav";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { useServerAction } from "@/lib/use-server-action";
import { challengeAction } from "./actions";
import { CartaoDoDesafio } from "./cartao";
import { type Desafio, descreverDesafio, type Metrica, SUGESTOES } from "./placar";
import { conferirMeta } from "./regras";
import type { DadosDoDesafio, SemanaPassada } from "./service";

const METRICA_NOME: Record<Metrica, string> = {
  treinos: "Treinos na semana",
  repeticoes: "Repetições somadas",
  minutos: "Minutos de treino",
  exercicio: "Repetições de um exercício",
};

const diaMes = (data: string) => {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
};

export function DesafiosScreen({
  profile,
  dados,
}: {
  profile: { name: string; color: string };
  dados: DadosDoDesafio;
}) {
  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <div className="section-title first">
          <h2>Desafio da semana</h2>
          {dados.liberado && <span className="muted">semana de {diaMes(dados.semana)}</span>}
        </div>
        <CartaoDoDesafio dados={dados} comLink={false} />
        {dados.liberado && (
          <>
            <DesafioDaFamilia dados={dados} />
            <Historico titulo="Seus desafios" semanas={dados.historico.pessoal} pessoal />
            <Historico titulo="Desafios da família" semanas={dados.historico.familia} />
          </>
        )}
      </main>
    </div>
  );
}

/** Criar, trocar ou encerrar o desafio cooperativo da família desta semana. */
function DesafioDaFamilia({ dados }: { dados: Extract<DadosDoDesafio, { liberado: true }> }) {
  const router = useRouter();
  const atual = dados.familia?.desafio ?? null;
  const inicial = atual ??
    dados.ultimoDaFamilia ?? { metric: "treinos", exerciseId: null, target: 6 };
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Omit<Desafio, "target">>(inicial);
  // o campo guarda o texto como foi digitado; a conferência é só ao salvar
  const [metaTexto, setMetaTexto] = useState(String(inicial.target));
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
  const enviar = () => {
    const meta = conferirMeta(metaTexto);
    if (!meta.ok) return setMessage(meta.erro);
    salvar({ ...rascunho, target: meta.valor });
  };

  if (dados.perfisLiberados < 2 && !atual) return null;

  return (
    <>
      <div className="section-title">
        <h2>Desafio da família</h2>
        <span className="muted">opcional</span>
      </div>
      {!editando ? (
        <div className="card block">
          <p className="muted">
            {atual
              ? "Todo mundo soma junto. Cada perfil tem a sua parte, do tamanho da sua intensidade, e ninguém compete com ninguém."
              : "Se quiserem, escolham uma meta para somar juntos nesta semana. É um extra: o desafio de cada um continua valendo."}
          </p>
          <div className="row spaced">
            <button
              type="button"
              className={atual ? "btn ghost" : "btn primary"}
              onClick={() => setEditando(true)}
            >
              {atual ? "Trocar a meta" : "Criar desafio da família"}
            </button>
            {atual && (
              <button
                type="button"
                className="btn ghost"
                disabled={pending}
                onClick={() => salvar(null)}
              >
                Encerrar desafio
              </button>
            )}
          </div>
        </div>
      ) : (
        <form
          className="card form-grid"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
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
                  String(s.target) === metaTexto.trim()
                }
                onClick={() => {
                  setRascunho({ metric: s.metric, exerciseId: s.exerciseId });
                  setMetaTexto(String(s.target));
                  setMessage("");
                }}
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
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={metaTexto}
              aria-invalid={message ? true : undefined}
              onChange={(e) => {
                setMetaTexto(e.target.value);
                if (message) setMessage("");
              }}
            />
          </label>
          <div className="row full">
            <button type="submit" className="btn primary" disabled={pending} data-autofocus>
              Valendo!
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setEditando(false);
                setMessage("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <p role="status" className="form-message">
        {message}
      </p>
    </>
  );
}

function Historico({
  titulo,
  semanas,
  pessoal = false,
}: {
  titulo: string;
  semanas: SemanaPassada[];
  pessoal?: boolean;
}) {
  if (!semanas.length) return null;
  return (
    <>
      <div className="section-title">
        <h2>{titulo}</h2>
        <span className="muted">últimas semanas</span>
      </div>
      <div className="card list-card">
        {semanas.map((s) => (
          <div className="history-row" key={s.weekStart}>
            {s.cumprido ? (
              <CircleCheck size={22} className="desafio-ok" aria-label="Cumprido" />
            ) : (
              <CircleDashed size={22} className="muted" aria-label="Não cumprido" />
            )}
            <div className="grow block">
              <span>{descreverDesafio(s.desafio, { pessoal })}</span>
              <span className="muted small">semana de {diaMes(s.weekStart)}</span>
            </div>
            <span className="num">
              {s.feito}
              <small className="muted"> / {s.desafio.target}</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
