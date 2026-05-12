import "server-only";

import { billing } from "@/features/billing/service";
import { getDashboardCounters, listActivitiesByBucket, listProfileSummaries } from "./repository";
import type { DashboardSnapshot } from "./types";

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Snapshot completo do dashboard em 5 queries paralelas. Counters obedecem
// ao filtro por perfil; perProfile sempre traz todos os perfis (alimenta
// tabs e os progress cards do agregado). isPro controla a visibilidade
// de atividades compartilhadas por outras famílias.
export async function getDashboardSnapshot(
  userId: string,
  options: { profileFilter: string | null },
): Promise<DashboardSnapshot> {
  const isPro = await billing.hasProSubscription(userSubject(userId));
  const ctx = { profileFilter: options.profileFilter, isPro };

  const [counters, overdue, today, upcoming, perProfile] = await Promise.all([
    getDashboardCounters(userId, ctx),
    listActivitiesByBucket(userId, "overdue", { ...ctx, limit: 5 }),
    listActivitiesByBucket(userId, "today", { ...ctx, limit: 5 }),
    listActivitiesByBucket(userId, "week", { ...ctx, limit: 10 }),
    listProfileSummaries(userId, { isPro }),
  ]);

  return { counters, overdue, today, upcoming, perProfile };
}
