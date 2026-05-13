import { findClosestStudent } from "@/features/activities/match-student";
import type { ParsedActivityInput } from "@/features/activities/types";
import { todayLocalIso } from "@/features/dashboard/date";
import type { ActivitiesParserOutput } from "./schema";

/**
 * Helpers puros do fluxo de IA de atividades — extraídos do service
 * (`parse-activities-{voice,image}-service.ts`) pra ficarem livres do
 * `"server-only"` import e poderem ser testados via Vitest sem mockar Mastra.
 *
 *   - `buildUserMessage` monta o cabeçalho fixo "Hoje é ... + Estudantes
 *     disponíveis ..." que as instruções do agente esperam.
 *   - `enrichWithResolvedTurma` resolve `studentNameHint` → `activeTurmaId`
 *     via `findClosestStudent` (Levenshtein ≤ 3 + normalização) após a IA
 *     devolver a lista estruturada.
 */

export function buildUserMessage(opts: {
  transcript: string;
  studentNames: string[];
  now?: Date;
}): string {
  const today = todayLocalIso(opts.now);
  const dayOfWeek = formatDayOfWeekPtBr(today);
  const studentsLine = opts.studentNames.length > 0 ? opts.studentNames.join(", ") : "(nenhum)";
  return (
    `Hoje é ${today} (${dayOfWeek}, fuso America/Sao_Paulo).\n` +
    `Estudantes disponíveis: ${studentsLine}\n\n` +
    `Conteúdo:\n${opts.transcript}`
  );
}

const WEEKDAY_PT_BR = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

function formatDayOfWeekPtBr(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return "";
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return WEEKDAY_PT_BR[date.getDay()] ?? "";
}

export type ProfileLite = { id: string; name: string; activeTurmaId: string | null };

export type EnrichedParseResult =
  | { isValidInput: true; activities: ParsedActivityInput[] }
  | { isValidInput: false; reason: string | null };

export function enrichWithResolvedTurma(
  output: ActivitiesParserOutput,
  profiles: readonly ProfileLite[],
): EnrichedParseResult {
  if (!output.isValidInput) {
    return { isValidInput: false, reason: output.reason ?? null };
  }
  const activities: ParsedActivityInput[] = output.activities.map((activity) => {
    const matched = findClosestStudent(profiles, activity.studentNameHint);
    const resolvedTurmaId = matched?.activeTurmaId ?? null;
    return {
      title: activity.title,
      description: activity.description,
      type: activity.type,
      dueAt: activity.dueAt,
      subjectHint: activity.subjectHint,
      studentNameHint: activity.studentNameHint,
      resolvedTurmaId,
    };
  });
  return { isValidInput: true, activities };
}
