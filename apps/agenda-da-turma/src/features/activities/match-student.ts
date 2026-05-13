import { levenshtein, normalize } from "@/features/subjects/utils";

/**
 * Resolve um `studentNameHint` (texto livre devolvido pela IA) ao perfil
 * de estudante do responsável. Quando o perfil tem `activeTurmaId`, o
 * caller usa essa turma para pré-selecionar no batch confirm dialog (caso
 * de uso: "Pedro tem prova quarta" → IA devolve hint "Pedro" → resolve
 * pro perfil do Pedro → atribui à turma ativa do Pedro).
 *
 * Mesma estratégia de `findClosestSubject`: igualdade pós-normalize ou
 * Levenshtein ≤ 3. Compara só o primeiro nome quando o hint tem só um
 * token (IA tende a devolver "Pedro", o cadastro tem "Pedro Silva") —
 * isso evita falsos negativos sem afrouxar demais o match.
 */
const MAX_MATCH_DISTANCE = 3;

export type StudentChoice = {
  readonly id: string;
  readonly name: string;
  readonly activeTurmaId: string | null;
};

function firstToken(normalized: string): string {
  const space = normalized.indexOf(" ");
  return space === -1 ? normalized : normalized.slice(0, space);
}

export function findClosestStudent<T extends StudentChoice>(
  students: readonly T[],
  hint: string | null | undefined,
): T | null {
  if (!hint) return null;
  const normalizedHint = normalize(hint);
  if (!normalizedHint) return null;
  const hintIsSingleToken = !normalizedHint.includes(" ");

  // Pass 1: igualdade exata pós-normalize sobre o nome completo OU sobre
  // o primeiro nome (quando o hint vem como token único).
  for (const student of students) {
    const normalizedFull = normalize(student.name);
    if (normalizedFull === normalizedHint) return student;
    if (hintIsSingleToken && firstToken(normalizedFull) === normalizedHint) {
      return student;
    }
  }

  // Pass 2: distância ≤ MAX_MATCH_DISTANCE sobre o primeiro nome
  // (preferido) ou sobre o nome completo (fallback). Curto-circuito por
  // diferença de tamanho.
  let best: { student: T; distance: number } | null = null;
  for (const student of students) {
    const normalizedFull = normalize(student.name);
    const candidates = hintIsSingleToken
      ? [firstToken(normalizedFull), normalizedFull]
      : [normalizedFull];
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - normalizedHint.length) > MAX_MATCH_DISTANCE) {
        continue;
      }
      const distance = levenshtein(candidate, normalizedHint);
      if (distance > MAX_MATCH_DISTANCE) continue;
      if (!best || distance < best.distance) {
        best = { student, distance };
      }
    }
  }

  return best?.student ?? null;
}
