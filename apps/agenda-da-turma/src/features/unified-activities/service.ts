import "server-only";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  dueWindowRange,
  OVERVIEW_PAGE_SIZE,
} from "./overview-types";
import { countDoneToday, listActivityOverviewIndex, listRoutineIndex } from "./repository";
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
  const { from, to, column } = dueWindowRange(options.dueWindow, todayLocalIso(), addDaysIso);
  const index = await listActivityOverviewIndex(userId, {
    ...options,
    dueFrom: from,
    dueTo: to,
    windowColumn: column,
  });
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
  /**
   * Quantas a família concluiu hoje. Não é placar: é o que distingue "o dia
   * fechou" de "nunca houve nada".
   */
  doneToday: number;
};

/**
 * A rotina de Hoje: os três buckets e o que foi concluído hoje, sobre a mesma
 * projeção das atividades. Antes o dashboard misturava `listNoticeActions` com
 * um snapshot próprio no componente e ainda chamava o snapshot uma segunda vez
 * dentro de um bloco recolhido: a mesma atividade aparecia duas vezes, em dois
 * formatos, e os contadores ignoravam os recados. A vez da criança lê esta
 * mesma função.
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
  const [index, doneToday] = await Promise.all([
    listRoutineIndex(userId, range),
    countDoneToday(userId, { profileFilter: options.profileFilter, todayIso }),
  ]);
  const items = await hydrateIndexRows(userId, index);
  const buckets: RoutineBuckets = { attention: [], tomorrow: [], week: [] };
  for (const row of index) {
    const item = items.get(row.id);
    if (item) buckets[row.bucket].push(item);
  }
  return { todayIso, buckets, doneToday };
}
