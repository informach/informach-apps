import { levenshtein, normalize } from "@/features/subjects/utils";

/**
 * Resolve um `subjectHint` (texto livre devolvido pela IA) ao ID de uma
 * matéria existente na turma escolhida pelo usuário. Estratégia:
 *
 *   1. Match exato pós-normalize (sem acento, lowercase, sem pontuação).
 *      Cobre 100% dos casos quando IA devolve forma canônica e a matéria
 *      cadastrada também está canônica.
 *   2. Distância de edição (Levenshtein) ≤ 3 pós-normalize. Mesma régua de
 *      `isMinorNameEdit` em `features/subjects/utils.ts` — cobre erro de
 *      digitação ("matemtica" → "matematica") e variações pequenas
 *      ("ed fisica" vs "educacao fisica" NÃO casa, distância 8).
 *
 * Quando há mais de um candidato com distância igual, retorna o primeiro
 * (lista de matérias da turma é pequena e estável; comportamento
 * determinístico vence o "melhor empate teórico").
 *
 * Pensado para rodar no client (cabe na lista já carregada de
 * `turmasForForm[turmaId].subjects`), mas é puro e roda no server também
 * — útil em testes e em SSR pré-render se virar caso de uso.
 */
const MAX_MATCH_DISTANCE = 3;

export type SubjectChoice = { readonly id: string; readonly name: string };

export function findClosestSubject<T extends SubjectChoice>(
  subjects: readonly T[],
  hint: string | null | undefined,
): T | null {
  if (!hint) return null;
  const normalizedHint = normalize(hint);
  if (!normalizedHint) return null;

  // Pass 1: igualdade pós-normalize.
  for (const subject of subjects) {
    if (normalize(subject.name) === normalizedHint) {
      return subject;
    }
  }

  // Pass 2: distância ≤ MAX_MATCH_DISTANCE. Curto-circuito por diferença
  // de tamanho — útil pra listas curtas mas escala bem.
  let best: { subject: T; distance: number } | null = null;
  for (const subject of subjects) {
    const normalizedSubject = normalize(subject.name);
    if (Math.abs(normalizedSubject.length - normalizedHint.length) > MAX_MATCH_DISTANCE) {
      continue;
    }
    const distance = levenshtein(normalizedSubject, normalizedHint);
    if (distance > MAX_MATCH_DISTANCE) continue;
    if (!best || distance < best.distance) {
      best = { subject, distance };
    }
  }

  return best?.subject ?? null;
}
