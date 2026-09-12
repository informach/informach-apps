import "server-only";

import { billing } from "@/features/billing/service";
import { listProfileActivitiesByBucket } from "@/features/profile-subject-activities/repository";
import { type UnifiedActivityListItem, withTurmaSource } from "@/features/unified-activities/types";
import { todayLocalIso } from "./date";
import { getDashboardCounters, listActivitiesByBucket, listProfileSummaries } from "./repository";
import type { DashboardBucket, DashboardSnapshot } from "./types";

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Map dashboard bucket → bucket name esperado pelo repo de extras. O `week`
// da turma usa intervalo (tomorrow, today+7] enquanto o `next7days` do
// extras usa o mesmo critério — só o nome difere.
function toExtraBucket(bucket: DashboardBucket) {
  if (bucket === "week") return "next7days" as const;
  return bucket;
}

// Mescla turma + extras numa bucket. Ambas queries rodam em paralelo
// (async-parallel — Vercel best practices §1). Ordena por (dueAt asc,
// createdAt asc) — chave estável entre tipos porque dueAt é "YYYY-MM-DD"
// string lexicograficamente ordenável. Trunca no limit final pra não
// inflar a UI quando há muito histórico em ambas as fontes.
async function listUnifiedBucket(
  userId: string,
  bucket: DashboardBucket,
  options: { profileFilter: string | null; isPro: boolean; limit: number },
  todayIso: string,
): Promise<UnifiedActivityListItem[]> {
  const [turmaItems, extraItems] = await Promise.all([
    listActivitiesByBucket(userId, bucket, options),
    listProfileActivitiesByBucket(userId, toExtraBucket(bucket), {
      todayIso,
      profileFilter: options.profileFilter,
      limit: options.limit,
    }),
  ]);

  const merged: UnifiedActivityListItem[] = [...turmaItems.map(withTurmaSource), ...extraItems];
  merged.sort((a, b) => {
    if (a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    return a.activityCreatedAt.getTime() - b.activityCreatedAt.getTime();
  });
  return merged.slice(0, options.limit);
}

// Snapshot completo do dashboard. Counters obedecem ao filtro por perfil
// (combinam turma + extras `active` no repository). perProfile sempre traz
// todos os perfis (alimenta tabs + progress cards). isPro controla a
// visibilidade de atividades compartilhadas por outras famílias.
export async function getDashboardSnapshot(
  userId: string,
  options: { profileFilter: string | null; now?: Date; limit?: number },
): Promise<DashboardSnapshot> {
  const isPro = await billing.hasProSubscription(userSubject(userId));
  const todayIso = todayLocalIso(options.now);
  const ctx = { profileFilter: options.profileFilter, isPro };

  const [counters, overdue, today, upcoming, perProfile] = await Promise.all([
    getDashboardCounters(userId, ctx),
    listUnifiedBucket(userId, "overdue", { ...ctx, limit: options.limit ?? 5 }, todayIso),
    listUnifiedBucket(userId, "today", { ...ctx, limit: options.limit ?? 5 }, todayIso),
    listUnifiedBucket(userId, "week", { ...ctx, limit: options.limit ?? 10 }, todayIso),
    listProfileSummaries(userId, { isPro }),
  ]);

  return { todayIso, counters, overdue, today, upcoming, perProfile };
}
