import "server-only";

import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { listTasksInDateRange } from "@/features/unified-activities/task-repository";
import { rangeForView } from "./date";
import type { CalendarSnapshot, CalendarView } from "./types";

/**
 * O que a aba Semana mostra para uma vista.
 *
 * Uma consulta para os dias na tela: o range sai de `rangeForView`, e o acesso
 * por criança já vem embutido na busca. Na semana vêm também as atividades em
 * aberto sem data, que nenhum dia pode mostrar; elas saem da rotina de Hoje
 * (`getRoutineSnapshot`), como na semana para imprimir, para a Semana nunca
 * discordar de Hoje sobre o que está sem data.
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
  const [tasks, routine] = await Promise.all([
    listTasksInDateRange(userId, { fromIso, toIso, profileFilter: options.profileFilter }),
    options.view === "week"
      ? getRoutineSnapshot(userId, { profileFilter: options.profileFilter })
      : null,
  ]);

  const items = [...tasks].sort((a, b) => {
    const dueA = a.dueAt ?? "";
    const dueB = b.dueAt ?? "";
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const undated = routine
    ? routine.buckets.attention.flatMap((entry) => (entry.item.dueAt ? [] : [entry.item]))
    : [];

  return { items, undated, fromIso, toIso };
}
