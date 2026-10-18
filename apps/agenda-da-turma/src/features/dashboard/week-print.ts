import "server-only";

import { buildWeekDays } from "@/features/calendar/date";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { listTasksInDateRange, type TaskRow } from "@/features/unified-activities/task-repository";
import { todayLocalIso } from "./date";
import type { PrintRow, WeekPrintout } from "./week-print-types";

function toRow(task: TaskRow): PrintRow {
  return {
    title: task.title,
    details: task.description?.trim() || null,
    type: ACTIVITY_TYPE_LABELS[task.type],
    subject: task.subjectName,
    child: task.profileName,
    time: task.time,
    dueAt: task.dueAt,
    done: task.status === "done",
  };
}

/**
 * A semana que o calendário está mostrando, para imprimir.
 *
 * Saía do painel antigo de Hoje: os quatro números do topo, uma tabela de
 * progresso por criança em porcentagem (uma ao lado da outra, que é a
 * comparação entre irmãos que o app não faz) e três listas de "atrasadas",
 * "hoje" e "próximos 7 dias" contadas a partir de hoje, qualquer que fosse a
 * semana na tela. Agora é a semana do calendário, um dia por bloco, com o que
 * passou do prazo e o que está sem data no fim.
 *
 * As consultas são as mesmas das telas: o calendário (`listTasksInDateRange`) e
 * a rotina de Hoje (`getRoutineSnapshot`), então a folha nunca discorda delas.
 */
export async function getWeekPrintout(
  userId: string,
  options: { anchorIso: string; profileFilter: string | null },
): Promise<WeekPrintout> {
  const todayIso = todayLocalIso();
  const days = buildWeekDays(options.anchorIso);
  const [tasks, routine] = await Promise.all([
    listTasksInDateRange(userId, {
      fromIso: days[0] ?? options.anchorIso,
      toIso: days[days.length - 1] ?? options.anchorIso,
      profileFilter: options.profileFilter,
    }),
    getRoutineSnapshot(userId, { profileFilter: options.profileFilter }),
  ]);
  const byDay = new Map<string, PrintRow[]>(days.map((iso) => [iso, []]));
  const ordered = [...tasks].sort(
    (a, b) =>
      (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
      a.profileName.localeCompare(b.profileName, "pt-BR") ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  for (const task of ordered) if (task.dueAt) byDay.get(task.dueAt)?.push(toRow(task));
  const attention = routine.buckets.attention.map((entry) => entry.item);
  return {
    todayIso,
    days: days.map((iso) => ({ iso, rows: byDay.get(iso) ?? [] })),
    late: attention.filter((task) => task.dueAt && task.dueAt < todayIso).map(toRow),
    undated: attention.filter((task) => !task.dueAt).map(toRow),
  };
}
