import { CHAINS, exerciseById } from "../catalog/catalog";
import type { SetLog } from "./runner";

export interface ChainState {
  level: number;
  bonus: number;
  /** sessões seguidas batendo a meta em todas as séries do nível atual */
  streak: number;
  /**
   * Quanto o nível atual está pesando: +1 por treino sem a meta batida, +2 por treino marcado como
   * "difícil", zera com a meta batida "na medida" ou "fácil". A partir de `PESO_PARA_DESCER`, o
   * app sugere descer. Antes o nível só subia.
   */
  struggle?: number;
}

/** "Como foi?" no fim do treino. */
export type Feeling = "facil" | "na_medida" | "dificil";
export const PESO_PARA_DESCER = 3;
export type ProgressMap = Record<string, ChainState>;

export type Suggestion =
  | { chainId: string; type: "bonus"; exerciseId: string; from: number; to: number }
  | { chainId: string; type: "level"; from: string; to: string }
  /** descer: primeiro tira o bônus da meta; sem bônus, volta um nível */
  | {
      chainId: string;
      type: "down";
      from: string;
      to: string;
      bonusFrom: number;
      bonusTo: number;
    };

export const SESSIONS_TO_ADVANCE = 2;

export const initialProgress = (): ProgressMap =>
  Object.fromEntries(CHAINS.map((c) => [c.id, { level: 0, bonus: 0, streak: 0, struggle: 0 }]));

const hit = (l: SetLog) =>
  l.target === undefined
    ? false
    : l.kind === "hold"
      ? l.holdSeconds >= l.target
      : l.reps >= l.target;

export interface Avaliacao {
  /**
   * Quantas séries com meta o treino planejava para cada exercício (montado no servidor pelos
   * passos do treino). Série planejada e não feita é meta não batida: antes ela sumia (o player e
   * o servidor descartam série sem repetição) e fazer 1 de 3 séries contava como meta batida.
   */
  planejadas?: ReadonlyMap<string, number>;
  feeling?: Feeling | null;
  /**
   * O exercício que o perfil fez no lugar do nível da trilha ("leve" troca o que tem salto por
   * uma versão sem impacto: polichinelo vira escalador). Sem isso as séries do perfil leve nunca
   * eram achadas e a trilha não subia nem descia.
   */
  troca?: (exerciseId: string) => string;
}

/**
 * Atualiza as sequências de cada trilha depois de uma sessão e devolve as sugestões.
 * Só contam séries com meta (séries tradicionais e EMOM) do exercício do nível atual.
 * - meta batida em todas as séries planejadas: a sequência sobe (2 de uma vez se foi "fácil");
 * - meta não batida (ou série que faltou num exercício começado): a sequência zera e o peso
 *   sobe 1; exercício que não foi feito não conta;
 * - "difícil": o peso sobe 2, mesmo com a meta batida.
 */
export function evaluateSession(progress: ProgressMap, logs: SetLog[], av: Avaliacao = {}) {
  const next: ProgressMap = structuredClone(progress);
  const suggestions: Suggestion[] = [];
  for (const chain of CHAINS) {
    const st = next[chain.id] ?? { level: 0, bonus: 0, streak: 0, struggle: 0 };
    next[chain.id] = st;
    st.level = Math.min(st.level, chain.levels.length - 1);
    const current = chain.levels[st.level];
    if (!current) continue;
    const feito = av.troca?.(current) ?? current;
    const sets = logs.filter((l) => l.exerciseId === feito && l.target !== undefined);
    // exercício pulado inteiro não pesa a trilha (pode ter sido o tempo, o espaço, a vez de outro);
    // série que faltou num exercício começado é meta não batida
    if (!sets.length) continue;
    const planejadas = av.planejadas?.get(feito) ?? sets.length;
    const bateu = sets.length >= planejadas && sets.every(hit);
    const dificil = av.feeling === "dificil";
    if (bateu && !dificil) {
      st.streak += av.feeling === "facil" ? 2 : 1;
      st.struggle = 0;
    } else {
      st.streak = bateu ? st.streak : 0;
      st.struggle = (st.struggle ?? 0) + (dificil ? 2 : 1);
    }
    const suggestion = suggestionFor(chain.id, st);
    if (suggestion) suggestions.push(suggestion);
  }
  return { progress: next, suggestions };
}

/** Avanço disponível numa trilha, se a sequência de metas batidas já permite. */
export function suggestionFor(chainId: string, st: ChainState): Suggestion | null {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  const level = Math.min(st.level, chain.levels.length - 1);
  const current = chain.levels[level];
  if (!current) return null;
  // pesando demais: sugere descer (primeiro tira o bônus, depois volta um nível)
  if ((st.struggle ?? 0) >= PESO_PARA_DESCER) {
    if (st.bonus > 0)
      return {
        chainId,
        type: "down",
        from: current,
        to: current,
        bonusFrom: st.bonus,
        bonusTo: Math.max(0, st.bonus - chain.step),
      };
    const anterior = chain.levels[level - 1];
    return anterior
      ? { chainId, type: "down", from: current, to: anterior, bonusFrom: 0, bonusTo: 0 }
      : null;
  }
  if (st.streak < SESSIONS_TO_ADVANCE) return null;
  if (st.bonus + chain.step <= chain.maxBonus)
    return {
      chainId,
      type: "bonus",
      exerciseId: current,
      from: st.bonus,
      to: st.bonus + chain.step,
    };
  const next = chain.levels[level + 1];
  return next ? { chainId, type: "level", from: current, to: next } : null;
}

/** Avanços que esperam a pessoa aceitar, guardados no progresso entre os treinos. */
export function pendingSuggestions(progress: ProgressMap): Suggestion[] {
  return CHAINS.flatMap((chain) => {
    const st = progress[chain.id];
    const suggestion = st ? suggestionFor(chain.id, st) : null;
    return suggestion ? [suggestion] : [];
  });
}

export function applySuggestion(progress: ProgressMap, s: Suggestion): ProgressMap {
  const next = structuredClone(progress);
  const st = next[s.chainId] ?? { level: 0, bonus: 0, streak: 0, struggle: 0 };
  next[s.chainId] = st;
  if (s.type === "bonus") st.bonus = s.to;
  else if (s.type === "down") {
    if (s.to !== s.from) st.level = Math.max(0, st.level - 1);
    st.bonus = s.bonusTo;
  } else {
    st.level++;
    st.bonus = 0;
  }
  st.streak = 0;
  st.struggle = 0;
  return next;
}

export function describeSuggestion(s: Suggestion) {
  if (s.type === "down")
    return s.to !== s.from
      ? `Voltar de ${exerciseById(s.from).name} para ${exerciseById(s.to).name} por um tempo`
      : `${exerciseById(s.from).name}: meta um pouco menor por um tempo`;
  if (s.type === "level")
    return `Subir de ${exerciseById(s.from).name} para ${exerciseById(s.to).name}`;
  const ex = exerciseById(s.exerciseId);
  const unit = ex.rule.kind === "hold" ? "s" : " repetições";
  return `${ex.name}: +${s.to - s.from}${unit} na meta`;
}
