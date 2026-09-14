import "server-only";
import { listSchoolActivitiesByStatusIds } from "@/features/activities/repository";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import type { DashboardCounters } from "@/features/dashboard/types";
import { listNoticeActions } from "@/features/notices/repository";
import { listProfileActivitiesByIds } from "@/features/profile-subject-activities/repository";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  OVERVIEW_PAGE_SIZE,
} from "./overview-types";
import { getRoutineCounters, listActivityOverviewIndex, listRoutineIndex } from "./repository";
import type { RoutineBuckets } from "./routine-types";

type IndexRow = { id: string; source: "turma" | "notice" | "extra" };

// Segundo passo comum: o índice devolve (id, fonte); aqui as três tabelas são
// lidas em paralelo e reordenadas conforme o índice. A lista de /atividades e
// os buckets da rotina compartilham esta hidratação, então o card e os campos
// são exatamente os mesmos nas duas telas.
async function hydrateIndexRows(
  userId: string,
  rows: IndexRow[],
): Promise<Map<string, ActivityOverviewItem>> {
  const ids = (source: IndexRow["source"]) =>
    rows.filter((row) => row.source === source).map((row) => row.id);
  const [school, notices, extras] = await Promise.all([
    listSchoolActivitiesByStatusIds(userId, ids("turma")),
    listNoticeActions(userId, { ids: ids("notice"), includeFinished: true }),
    listProfileActivitiesByIds(userId, ids("extra")),
  ]);
  const items = new Map<string, ActivityOverviewItem>();
  for (const item of school) {
    const key = `turma:${item.statusId}`;
    items.set(key, { key, source: "turma", item });
  }
  for (const item of notices) {
    const key = `notice:${item.action.id}`;
    items.set(key, { key, source: "notice", item });
  }
  for (const item of extras) {
    const key = `extra:${item.activityId}`;
    items.set(key, { key, source: "extra", item });
  }
  return items;
}

export async function getActivityOverview(userId: string, options: ActivityOverviewOptions) {
  const index = await listActivityOverviewIndex(userId, options);
  const visible = index.slice(0, OVERVIEW_PAGE_SIZE);
  const items = await hydrateIndexRows(userId, visible);
  return {
    items: visible.flatMap((row) => {
      const item = items.get(`${row.source}:${row.id}`);
      return item ? [item] : [];
    }),
    hasNextPage: index.length > OVERVIEW_PAGE_SIZE,
  };
}

export type RoutineSnapshot = {
  todayIso: string;
  buckets: RoutineBuckets;
  counters: DashboardCounters;
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
    const item = items.get(`${row.source}:${row.id}`);
    if (item) buckets[row.bucket].push(item);
  }
  return { todayIso, buckets, counters };
}
