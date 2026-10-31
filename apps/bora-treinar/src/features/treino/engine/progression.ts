import { CHAINS, exerciseById } from "../catalog/catalog";
import type { SetLog } from "./runner";

export interface ChainState {
  level: number;
  bonus: number;
  /** sessões seguidas batendo a meta em todas as séries do nível atual */
  streak: number;
}
export type ProgressMap = Record<string, ChainState>;

export type Suggestion =
  | { chainId: string; type: "bonus"; exerciseId: string; from: number; to: number }
  | { chainId: string; type: "level"; from: string; to: string };

export const SESSIONS_TO_ADVANCE = 2;

export const initialProgress = (): ProgressMap =>
  Object.fromEntries(CHAINS.map((c) => [c.id, { level: 0, bonus: 0, streak: 0 }]));

const hit = (l: SetLog) =>
  l.target === undefined
    ? false
    : l.kind === "hold"
      ? l.holdSeconds >= l.target
      : l.reps >= l.target;

/**
 * Atualiza as sequências de cada trilha depois de uma sessão e devolve sugestões de avanço.
 * Só contam séries com meta (séries tradicionais e EMOM) do exercício do nível atual.
 */
export function evaluateSession(progress: ProgressMap, logs: SetLog[]) {
  const next: ProgressMap = structuredClone(progress);
  const suggestions: Suggestion[] = [];
  for (const chain of CHAINS) {
    const st = next[chain.id] ?? { level: 0, bonus: 0, streak: 0 };
    next[chain.id] = st;
    st.level = Math.min(st.level, chain.levels.length - 1);
    const current = chain.levels[st.level];
    const sets = logs.filter((l) => l.exerciseId === current && l.target !== undefined);
    if (!sets.length) continue;
    st.streak = sets.every(hit) ? st.streak + 1 : 0;
    const suggestion = suggestionFor(chain.id, st);
    if (suggestion) suggestions.push(suggestion);
  }
  return { progress: next, suggestions };
}

/** Avanço disponível numa trilha, se a sequência de metas batidas já permite. */
export function suggestionFor(chainId: string, st: ChainState): Suggestion | null {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain || st.streak < SESSIONS_TO_ADVANCE) return null;
  const level = Math.min(st.level, chain.levels.length - 1);
  const current = chain.levels[level];
  if (!current) return null;
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
  const st = next[s.chainId] ?? { level: 0, bonus: 0, streak: 0 };
  next[s.chainId] = st;
  if (s.type === "bonus") st.bonus = s.to;
  else {
    st.level++;
    st.bonus = 0;
  }
  st.streak = 0;
  return next;
}

export function describeSuggestion(s: Suggestion) {
  if (s.type === "level")
    return `Subir de ${exerciseById(s.from).name} para ${exerciseById(s.to).name}`;
  const ex = exerciseById(s.exerciseId);
  const unit = ex.rule.kind === "hold" ? "s" : " repetições";
  return `${ex.name}: +${s.to - s.from}${unit} na meta`;
}
