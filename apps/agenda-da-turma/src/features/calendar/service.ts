import "server-only";

import { billing } from "@/features/billing/service";
import { noticeCalendarItems } from "@/features/notices/calendar";
import { listNoticeActions } from "@/features/notices/repository";
import { listProfileActivitiesInDateRange } from "@/features/profile-subject-activities/repository";
import { type UnifiedActivityListItem, withTurmaSource } from "@/features/unified-activities/types";
import { rangeForView } from "./date";
import { listActivitiesInDateRange } from "./repository";
import type { CalendarSnapshot, CalendarView } from "./types";

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Snapshot do calendário pra uma vista. Calcula o range visível, checa Pro
// (Pro vê shared aceitas; Free só vê próprias) e busca atividades das duas
// origens em paralelo (async-parallel — Vercel best practices §1):
//   - `listActivitiesInDateRange` → turma (JOIN com escola/turma/subjects)
//   - `listProfileActivitiesInDateRange` → extras `active` (filtra paused)
// O merge ordena por (dueAt asc, createdAt asc) — comparação lexicográfica
// estável entre tipos porque dueAt é "YYYY-MM-DD".
export async function getCalendarSnapshot(
  userId: string,
  options: {
    view: CalendarView;
    anchorIso: string;
    profileFilter: string | null;
  },
): Promise<CalendarSnapshot> {
  const isPro = await billing.hasProSubscription(userSubject(userId));
  const { fromIso, toIso } = rangeForView(options.anchorIso, options.view);

  const [turmaItems, extraItems, noticeItems] = await Promise.all([
    listActivitiesInDateRange(userId, {
      fromIso,
      toIso,
      profileFilter: options.profileFilter,
      isPro,
    }),
    listProfileActivitiesInDateRange(userId, {
      fromIso,
      toIso,
      profileFilter: options.profileFilter,
      // Calendário esconde matérias `paused` — usuário pausou jazz, não
      // quer ver atividade antiga no grid. Histórico fica em /atividades.
      includePausedSubjects: false,
    }),
    listNoticeActions(userId, {
      from: fromIso,
      to: toIso,
      profileId: options.profileFilter ?? undefined,
      includeFinished: true,
    }),
  ]);

  const items: UnifiedActivityListItem[] = [
    ...turmaItems.map(withTurmaSource),
    ...extraItems,
    ...noticeCalendarItems(noticeItems),
  ];
  items.sort((a, b) => {
    if (a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    return a.activityCreatedAt.getTime() - b.activityCreatedAt.getTime();
  });

  return { items, fromIso, toIso };
}
