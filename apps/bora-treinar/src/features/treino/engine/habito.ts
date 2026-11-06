import { FUSO_PADRAO, inicioDaSemana, inicioDoDiaLocal, numeroDoDia, somarDias } from "@/lib/datas";
import type { SetLog } from "./runner";

/**
 * O hábito é a meta semanal de dias de treino de cada perfil (`profiles.weekly_goal`, 1 a 7), não
 * mais a sequência de dias seguidos. Semana começa na segunda, no fuso da família.
 */

/** Um treino conta para o hábito, as conquistas, os desafios e a meta da semana a partir daqui. */
export const TREINO_MIN_REPETICOES = 5;
/** ...ou a partir deste tempo (segundos), o que vier primeiro. */
export const TREINO_MIN_SEGUNDOS = 60;
export const META_SEMANAL_PADRAO = 3;

type LogDeVolume = Pick<SetLog, "reps" | "holdSeconds">;

/**
 * O mínimo que este módulo precisa de uma sessão. `SessionLike` (stats.ts) e `SessionRecord` servem
 * como estão.
 */
export interface SessaoDeHabito {
  startedAt: number;
  /** segundos */
  duration: number;
  logs: readonly LogDeVolume[];
}

/** Repetições mais segundos de isometria (um segundo vale uma repetição aqui). */
export const volumeDoTreino = (logs: readonly LogDeVolume[]) =>
  logs.reduce((t, l) => t + l.reps + l.holdSeconds, 0);

/** A regra de `contaComoTreino` para quem já tem os totais somados (agregados do banco). */
export const contaPeloVolume = (volume: number, duracaoSegundos: number) =>
  volume >= TREINO_MIN_REPETICOES || duracaoSegundos >= TREINO_MIN_SEGUNDOS;

/**
 * Um toque sem querer em "salvar" não vira dia de treino: só conta a sessão com pelo menos 5
 * repetições (isometria em segundos, 1 por 1) ou com 1 minuto de duração.
 */
export function contaComoTreino(s: { duration: number; logs: readonly LogDeVolume[] }) {
  return contaPeloVolume(volumeDoTreino(s.logs), s.duration);
}

export const metaValida = (meta: number) =>
  Math.min(7, Math.max(1, Math.round(Number.isFinite(meta) ? meta : META_SEMANAL_PADRAO)));

const DIA = 86_400_000;
const numeroDaData = (data: string) => Math.round(Date.parse(`${data}T00:00:00Z`) / DIA);

/** Dias locais distintos com treino, agrupados pela segunda-feira (AAAA-MM-DD) da semana. */
function diasPorSemana(instantes: readonly number[], fuso: string) {
  const semanas = new Map<string, Set<number>>();
  for (const t of instantes) {
    const segunda = inicioDaSemana(t, fuso);
    const dias = semanas.get(segunda) ?? new Set<number>();
    dias.add(numeroDoDia(t, fuso));
    semanas.set(segunda, dias);
  }
  return semanas;
}

const instantesQueContam = (sessions: readonly SessaoDeHabito[]) =>
  sessions.filter(contaComoTreino).map((s) => s.startedAt);

export interface SemanaAtual {
  dias: number;
  meta: number;
  cumprida: boolean;
  /** 7 posições, de segunda a domingo */
  diasDaSemana: boolean[];
}

/** A semana atual a partir dos inícios de sessões que já contam como treino. */
export function semanaDosInstantes(
  instantes: readonly number[],
  agora: number,
  fuso = FUSO_PADRAO,
  meta = META_SEMANAL_PADRAO,
): SemanaAtual {
  const alvo = metaValida(meta);
  const segunda = inicioDaSemana(agora, fuso);
  const primeiro = numeroDaData(segunda);
  const diasDaSemana = Array.from({ length: 7 }, () => false);
  for (const dia of diasPorSemana(instantes, fuso).get(segunda) ?? []) {
    const i = dia - primeiro;
    if (i >= 0 && i < 7) diasDaSemana[i] = true;
  }
  const dias = diasDaSemana.filter(Boolean).length;
  return { dias, meta: alvo, cumprida: dias >= alvo, diasDaSemana };
}

/** Dias desta semana com treino que conta, contra a meta do perfil. */
export function semanaAtual(
  sessions: readonly SessaoDeHabito[],
  agora: number,
  fuso = FUSO_PADRAO,
  meta = META_SEMANAL_PADRAO,
): SemanaAtual {
  return semanaDosInstantes(instantesQueContam(sessions), agora, fuso, meta);
}

export interface HistoricoDeSemanas {
  /** semanas cumpridas em sequência até a última semana completa, mais a atual se já cumprida */
  seguidas: number;
  /** a maior sequência de semanas cumpridas no histórico recebido (inclui a atual se cumprida) */
  melhor: number;
  /** semanas cumpridas no histórico recebido */
  total: number;
  /** as últimas `quantas` semanas, da mais antiga para a atual */
  semanas: { inicio: number; dias: number; cumprida: boolean }[];
}

/** O histórico semanal a partir dos inícios de sessões que já contam como treino. */
export function historicoDosInstantes(
  instantes: readonly number[],
  agora: number,
  fuso = FUSO_PADRAO,
  meta = META_SEMANAL_PADRAO,
  quantas = 8,
): HistoricoDeSemanas {
  const alvo = metaValida(meta);
  const atual = inicioDaSemana(agora, fuso);
  const porSemana = diasPorSemana(
    instantes.filter((t) => t < inicioDoDiaLocal(somarDias(atual, 7), fuso).getTime()),
    fuso,
  );
  const cumprida = (segunda: string) => (porSemana.get(segunda)?.size ?? 0) >= alvo;

  let seguidas = cumprida(atual) ? 1 : 0;
  for (let s = somarDias(atual, -7); cumprida(s); s = somarDias(s, -7)) seguidas += 1;

  const cumpridas = [...porSemana.keys()].filter(cumprida).map(numeroDaData);
  cumpridas.sort((a, b) => a - b);
  let total = 0;
  let melhor = 0;
  let corrida = 0;
  for (let i = 0; i < cumpridas.length; i++) {
    total += 1;
    corrida = i > 0 && (cumpridas[i] ?? 0) - (cumpridas[i - 1] ?? 0) === 7 ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
  }

  const semanas = Array.from({ length: Math.max(0, quantas) }, (_, i) => {
    const segunda = somarDias(atual, -(quantas - 1 - i) * 7);
    return {
      inicio: inicioDoDiaLocal(segunda, fuso).getTime(),
      dias: porSemana.get(segunda)?.size ?? 0,
      cumprida: cumprida(segunda),
    };
  });
  return { seguidas, melhor, total, semanas };
}

/** Semanas com a meta cumprida: em sequência, no total e as últimas `quantas`. */
export function historicoDeSemanas(
  sessions: readonly SessaoDeHabito[],
  agora: number,
  fuso = FUSO_PADRAO,
  meta = META_SEMANAL_PADRAO,
  quantas = 8,
): HistoricoDeSemanas {
  return historicoDosInstantes(instantesQueContam(sessions), agora, fuso, meta, quantas);
}

export interface MelhorMarca {
  bestSet: number;
  bestHold: number;
}

export interface RecordeBatido {
  exerciseId: string;
  kind: SetLog["kind"];
  value: number;
  anterior: number;
}

/**
 * Recordes pessoais batidos por estas séries contra as melhores marcas de antes. Exercício que o
 * perfil nunca tinha feito não é recorde (seria "recorde" em todo exercício novo).
 */
export function recordesBatidos(
  logs: readonly Pick<SetLog, "exerciseId" | "kind" | "reps" | "holdSeconds">[],
  anteriores: ReadonlyMap<string, MelhorMarca>,
): RecordeBatido[] {
  const melhores = new Map<string, { kind: SetLog["kind"]; value: number }>();
  for (const l of logs) {
    const value = l.kind === "hold" ? l.holdSeconds : l.reps;
    const atual = melhores.get(l.exerciseId);
    if (!atual || value > atual.value) melhores.set(l.exerciseId, { kind: l.kind, value });
  }
  return [...melhores].flatMap(([exerciseId, { kind, value }]) => {
    const antes = anteriores.get(exerciseId);
    const anterior = antes ? (kind === "hold" ? antes.bestHold : antes.bestSet) : 0;
    return anterior > 0 && value > anterior ? [{ exerciseId, kind, value, anterior }] : [];
  });
}
