import "server-only";

import { billing } from "@/features/billing/service";
import { rangeForView } from "./date";
import { listActivitiesInDateRange } from "./repository";
import type { CalendarSnapshot, CalendarView } from "./types";

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Snapshot do calendário pra uma vista. Calcula o range visível, checa Pro
// (mesma regra do dashboard — Pro vê shared aceitas; Free só vê próprias) e
// busca todas as atividades no range em uma única query.
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
  const items = await listActivitiesInDateRange(userId, {
    fromIso,
    toIso,
    profileFilter: options.profileFilter,
    isPro,
  });
  return { items, fromIso, toIso };
}
