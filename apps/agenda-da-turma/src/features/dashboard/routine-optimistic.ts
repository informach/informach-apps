import type { ActivityStatusValue } from "@/features/activities/types";
import { addDaysIso } from "./date";
import type { DashboardCounters } from "./types";

function addClamped(value: number, delta: number): number {
  return Math.max(0, value + delta);
}

function pendingBucket(
  dueAt: string,
  todayIso: string,
): keyof Pick<DashboardCounters, "overdue" | "today" | "week"> | null {
  if (dueAt < todayIso) return "overdue";
  if (dueAt === todayIso) return "today";
  if (dueAt <= addDaysIso(todayIso, 7)) return "week";
  return null;
}

/**
 * Ajuste otimista dos KPIs quando alguém conclui ou reabre uma atividade.
 *
 * Só os contadores: o card cuida de sumir da lista (animação + desmonte) e
 * dispara `router.refresh()`, que traz os números reais do servidor logo em
 * seguida. Itens sem prazo (`dueAt === null`) não entram em nenhum contador
 * de janela — aparecem na lista "para cuidar hoje", mas não são atrasados
 * nem de hoje.
 */
export function applyRoutineStatusChange(
  counters: DashboardCounters,
  todayIso: string,
  dueAt: string | null,
  previousStatus: ActivityStatusValue,
  nextStatus: ActivityStatusValue,
): DashboardCounters {
  if (previousStatus === nextStatus || dueAt === null) return counters;

  const direction = previousStatus === "pending" && nextStatus === "done" ? 1 : -1;
  const bucket = pendingBucket(dueAt, todayIso);
  const countsAsDoneRecent = dueAt >= addDaysIso(todayIso, -7) && dueAt <= todayIso;

  const next = { ...counters };
  if (bucket) next[bucket] = addClamped(next[bucket], -direction);
  if (countsAsDoneRecent) next.doneRecent = addClamped(next.doneRecent, direction);
  return next;
}
