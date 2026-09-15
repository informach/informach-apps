import "server-only";

import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { listTasksInDateRange } from "@/features/unified-activities/task-repository";
import { rangeForView } from "./date";
import type { CalendarSnapshot, CalendarView } from "./types";

/**
 * Snapshot do calendário para uma vista.
 *
 * Eram três consultas em paralelo, uma por tabela, mais um conversor para um
 * formato comum. Com a tabela única é uma consulta: o range visível sai de
 * `rangeForView`, e o acesso por criança já vem embutido na busca.
 */
export async function getCalendarSnapshot(
  userId: string,
  options: {
    view: CalendarView;
    anchorIso: string;
    profileFilter: string | null;
  },
): Promise<CalendarSnapshot> {
  const { fromIso, toIso } = rangeForView(options.anchorIso, options.view);
  const tasks = await listTasksInDateRange(userId, {
    fromIso,
    toIso,
    profileFilter: options.profileFilter,
  });

  const items: ActivityOverviewItem[] = tasks
    .map((item) => ({ key: item.id, item }))
    .sort((a, b) => {
      const dueA = a.item.dueAt ?? "";
      const dueB = b.item.dueAt ?? "";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return a.item.createdAt.getTime() - b.item.createdAt.getTime();
    });

  return { items, fromIso, toIso };
}
