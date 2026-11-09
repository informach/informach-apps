"use client";
import { Lock, Target, Users } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Cadeado } from "@/features/billing/planos";
import { type Desafio, descreverDesafio, type Metrica } from "./placar";
import type { DadosDoDesafio } from "./service";

const UNIDADE: Record<Metrica, [string, string]> = {
  repeticoes: ["repetição", "repetições"],
  exercicio: ["repetição", "repetições"],
  minutos: ["minuto", "minutos"],
  treinos: ["treino", "treinos"],
};
export const quantos = (n: number, metric: Metrica) => `${n} ${UNIDADE[metric][n === 1 ? 0 : 1]}`;

const falta = (n: number, metric: Metrica) =>
  `${n === 1 ? "Falta" : "Faltam"} ${quantos(n, metric)}`;

const prazo = (dias: number) => (dias === 1 ? "hoje é o último dia" : `faltam ${dias} dias`);

function Barra({ progresso, rotulo }: { progresso: number; rotulo: string }) {
  return (
    <div
      className="bar-track"
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progresso * 100)}
    >
      <div style={{ width: `${progresso * 100}%` }} />
    </div>
  );
}

function Numero({ feito, desafio }: { feito: number; desafio: Desafio }) {
  return (
    <span className="num challenge-total">
      {feito}
      <small>/ {desafio.target}</small>
    </span>
  );
}

export interface CartaoDoDesafioProps {
  /** O que `dadosDoDesafio` devolveu no servidor. */
  dados: DadosDoDesafio;
  /** Mostra o link para `/desafios` (desafio da família e histórico). Padrão: sim. */
  comLink?: boolean;
}

/**
 * O desafio da semana do perfil: o pessoal, que renova sozinho, e o da família, se a casa escolheu
 * um. O da família é cooperativo: mostra a parte de cada um, nunca quem fez mais.
 */
export function CartaoDoDesafio({ dados, comLink = true }: CartaoDoDesafioProps) {
  if (!dados.liberado)
    return (
      <Cadeado motivo="desafio" className="card upsell">
        <strong>
          <Lock size={16} /> O desafio da semana faz parte da assinatura.
        </strong>
        <span className="muted">
          Uma meta só sua, que renova toda segunda e cresce com você. Em família, dá para somar
          juntos.
        </span>
      </Cadeado>
    );
  const { pessoal, familia, diasRestantes } = dados;
  const faltam = Math.max(0, pessoal.desafio.target - pessoal.feito);
  return (
    <div className="desafio-cartoes">
      <div className={`card challenge ${pessoal.cumprido ? "done" : ""}`}>
        <div className="challenge-head">
          <Target size={32} aria-hidden="true" />
          <div className="grow">
            <span className="muted">Seu desafio da semana</span>
            <h3>{descreverDesafio(pessoal.desafio, { pessoal: true })}</h3>
          </div>
          <Numero feito={pessoal.feito} desafio={pessoal.desafio} />
        </div>
        <Barra progresso={pessoal.progresso} rotulo="Seu desafio da semana" />
        <p className="muted">
          {pessoal.cumprido
            ? "Desafio cumprido! Na segunda chega um novo, um pouco maior."
            : `${falta(faltam, pessoal.desafio.metric)} e ${prazo(diasRestantes)}. Renova sozinho na segunda.`}
        </p>
      </div>

      {familia && (
        <div className={`card challenge ${familia.concluido ? "done" : ""}`}>
          <div className="challenge-head">
            <Users size={32} aria-hidden="true" />
            <div className="grow">
              <span className="muted">Desafio da família, todo mundo junto</span>
              <h3>{descreverDesafio(familia.desafio)}</h3>
            </div>
            <Numero feito={familia.total} desafio={familia.desafio} />
          </div>
          <Barra progresso={familia.progresso} rotulo="Desafio da família" />
          <p className="muted">
            {familia.concluido
              ? "Meta da família batida! Cada parte ajudou."
              : `${falta(Math.max(0, familia.desafio.target - familia.total), familia.desafio.metric)} somando todos, e ${prazo(diasRestantes)}.`}
          </p>
          <div className="desafio-partes">
            <span className="muted small">
              Parte de cada um, do tamanho da intensidade de cada perfil
            </span>
            {familia.partes.map((p) => (
              <div className="desafio-parte" key={p.id}>
                <Avatar profile={p} size="2.2rem" />
                <div className="grow">
                  <div className="desafio-parte-nome">
                    <span>{p.name}</span>
                    <span className="muted small">
                      {p.valor} de {p.parte}
                    </span>
                  </div>
                  <Barra progresso={p.progresso} rotulo={`Parte de ${p.name}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comLink && (familia || dados.perfisLiberados > 1 || dados.historico.pessoal.length > 0) && (
        <Link className="chip desafio-link" href="/desafios">
          {familia
            ? "Desafio da família e semanas anteriores"
            : dados.perfisLiberados > 1
              ? "Criar um desafio da família"
              : "Ver as semanas anteriores"}
        </Link>
      )}
    </div>
  );
}
