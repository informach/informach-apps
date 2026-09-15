import "server-only";

import { addDaysIso } from "@/features/dashboard/date";
import { listTasksByBucket } from "@/features/unified-activities/task-repository";
import { todayLocalIso } from "./date";
import { getDashboardCounters, listProfileSummaries } from "./repository";
import type { DashboardSnapshot } from "./types";

/**
 * Snapshot por bucket. Não alimenta mais o dashboard — a rotina usa
 * `getRoutineSnapshot`, sobre a mesma projeção da lista. Sobrou para a
 * exportação em PDF e para o job de lembretes.
 *
 * Eram duas consultas por bucket, uma por tabela, mescladas e truncadas em
 * memória. Com a tabela única é uma consulta por bucket, ordenada e truncada
 * pelo banco.
 */
export async function getDashboardSnapshot(
  userId: string,
  options: { profileFilter: string | null; now?: Date; limit?: number },
): Promise<DashboardSnapshot> {
  const todayIso = todayLocalIso(options.now);
  const ctx = {
    profileFilter: options.profileFilter,
    todayIso,
    weekEndIso: addDaysIso(todayIso, 7),
  };

  const [counters, overdue, today, upcoming, perProfile] = await Promise.all([
    getDashboardCounters(userId, { profileFilter: options.profileFilter }),
    listTasksByBucket(userId, "overdue", { ...ctx, limit: options.limit ?? 5 }),
    listTasksByBucket(userId, "today", { ...ctx, limit: options.limit ?? 5 }),
    listTasksByBucket(userId, "week", { ...ctx, limit: options.limit ?? 10 }),
    listProfileSummaries(userId),
  ]);

  return { todayIso, counters, overdue, today, upcoming, perProfile };
}
