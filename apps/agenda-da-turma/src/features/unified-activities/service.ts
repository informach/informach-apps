import "server-only";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import type { DashboardCounters } from "@/features/dashboard/types";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  dueWindowRange,
  OVERVIEW_PAGE_SIZE,
} from "./overview-types";
import { getRoutineCounters, listActivityOverviewIndex, listRoutineIndex } from "./repository";
import type { RoutineBuckets } from "./routine-types";
import { listTasksByIds } from "./task-repository";

// Segundo passo comum: o índice devolve os ids na ordem certa; aqui as linhas
// são lidas numa consulta só e reordenadas conforme o índice. A lista de
// /atividades e os buckets da rotina compartilham esta hidratação, então o card
// e os campos são exatamente os mesmos nas duas telas.
async function hydrateIndexRows(
  userId: string,
  rows: { id: string }[],
): Promise<Map<string, ActivityOverviewItem>> {
  const tasks = await listTasksByIds(
    userId,
    rows.map((row) => row.id),
  );
  return new Map(tasks.map((item) => [item.id, { key: item.id, item }]));
}

export async function getActivityOverview(userId: string, options: ActivityOverviewOptions) {
  // "Hoje" sai do mesmo helper com fuso de São Paulo que a rotina usa, para que
  // a janela do contador e a janela da lista não possam divergir.
  const { from, to } = dueWindowRange(options.dueWindow, todayLocalIso(), addDaysIso);
  const index = await listActivityOverviewIndex(userId, { ...options, dueFrom: from, dueTo: to });
  const visible = index.slice(0, OVERVIEW_PAGE_SIZE);
  const items = await hydrateIndexRows(userId, visible);
  return {
    items: visible.flatMap((row) => {
      const item = items.get(row.id);
      return item ? [item] : [];
    }),
    hasNextPage: index.length > OVERVIEW_PAGE_SIZE,
  };
}

export type RoutineSnapshot = {
  todayIso: string;
  buckets: RoutineBuckets;
  counters: DashboardCounters;
  /**
   * Quantas a família concluiu hoje. Fica FORA de `counters` de propósito: os
   * quatro KPIs são os quatro cards da tela, e `getDashboardCounters` (a
   * exportação em PDF) usa o mesmo tipo. Este número não é card — é o que
   * distingue "o dia fechou" de "nunca houve nada".
   */
  doneToday: number;
};

/**
 * A rotina do dashboard: os três buckets e os KPIs, ambos derivados da mesma
 * projeção das três fontes. Antes o dashboard misturava
 * `listNoticeActions` com `getDashboardSnapshot` no componente e ainda
 * chamava o snapshot uma segunda vez dentro de um bloco recolhido — a mesma
 * atividade aparecia duas vezes, em dois formatos, e os contadores ignoravam
 * os recados.
 */
export async function getRoutineSnapshot(
  userId: string,
  options: { profileFilter: string | null },
): Promise<RoutineSnapshot> {
  const todayIso = todayLocalIso();
  const range = {
    profileFilter: options.profileFilter,
    todayIso,
    tomorrowIso: addDaysIso(todayIso, 1),
    weekEndIso: addDaysIso(todayIso, 7),
  };
  const [index, counters] = await Promise.all([
    listRoutineIndex(userId, range),
    getRoutineCounters(userId, { ...range, weekAgoIso: addDaysIso(todayIso, -7) }),
  ]);
  const items = await hydrateIndexRows(userId, index);
  const buckets: RoutineBuckets = { attention: [], tomorrow: [], week: [] };
  for (const row of index) {
    const item = items.get(row.id);
    if (item) buckets[row.bucket].push(item);
  }
  const { doneToday, ...kpis } = counters;
  return { todayIso, buckets, counters: kpis, doneToday };
}
