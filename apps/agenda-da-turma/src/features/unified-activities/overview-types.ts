import { z } from "zod";
import type { ActivityType } from "./activity-types";
import type { TaskRow } from "./task-repository";

export type OverviewActivityType = ActivityType;
export const overviewStatusSchema = z.enum(["all", "pending", "done", "canceled"]);
export type OverviewStatus = z.infer<typeof overviewStatusSchema>;
export const OVERVIEW_STATUS_LABELS: Record<OverviewStatus, string> = {
  all: "Todas as situações",
  pending: "Pendentes",
  done: "Concluídas",
  canceled: "Canceladas",
};
/**
 * Janela de prazo da lista.
 *
 * Existe para que os contadores da rotina possam LEVAR à lista. Eles somavam
 * "atrasadas", "hoje" e "próximos 7 dias" sobre a mesma projeção que a lista
 * usa, mas a lista não sabia recortar por prazo — então o número mais acionável
 * da tela não ia a lugar nenhum.
 *
 * Os limites abaixo replicam exatamente os `COUNT(*) FILTER` de
 * `getRoutineCounters`. Se um dos dois mudar, os dois mudam juntos: um
 * contador que discorda da lista que ele abre é pior do que um contador que
 * não abre nada.
 */
export const dueWindowSchema = z.enum(["all", "atrasadas", "hoje", "semana", "recentes"]);
export type DueWindow = z.infer<typeof dueWindowSchema>;
export const DUE_WINDOW_LABELS: Record<DueWindow, string> = {
  all: "Qualquer prazo",
  atrasadas: "Prazo vencido",
  hoje: "Para hoje",
  semana: "Próximos 7 dias",
  recentes: "Últimos 7 dias",
};

/**
 * Uma atividade na lista. Era uma união discriminada de três formatos, um por
 * tabela; com a convergência virou um só, e quem consome deixou de precisar
 * saber de onde a linha veio.
 */
export type ActivityOverviewItem = { key: string; item: TaskRow };
export type ActivityOverviewOptions = {
  profileFilter: string | null;
  typeFilter: OverviewActivityType | null;
  statusFilter: OverviewStatus;
  dueWindow: DueWindow;
  noticeId: string | null;
  page: number;
};
export const OVERVIEW_PAGE_SIZE = 30;

export function activityOverviewHref(options: ActivityOverviewOptions) {
  const params = new URLSearchParams();
  if (options.profileFilter) params.set("perfil", options.profileFilter);
  if (options.typeFilter) params.set("tipo", options.typeFilter);
  if (options.statusFilter !== "pending") params.set("situacao", options.statusFilter);
  if (options.dueWindow !== "all") params.set("prazo", options.dueWindow);
  if (options.noticeId) params.set("recado", options.noticeId);
  if (options.page > 1) params.set("pagina", String(options.page));
  return params.size ? `/atividades?${params}` : "/atividades";
}

// Prazo e criança sem intermediários: com uma tabela só, o acesso é direto.
// Os acessores existiam porque cada tabela guardava esses dois campos num lugar
// diferente.
export function overviewDueAt(entry: ActivityOverviewItem): string | null {
  return entry.item.dueAt;
}

export function overviewProfileId(entry: ActivityOverviewItem): string {
  return entry.item.profileId;
}

/**
 * Limites de data da janela, no mesmo formato "YYYY-MM-DD" do resto do app.
 * `null` dos dois lados significa "sem recorte" — e nesse caso as atividades
 * sem prazo continuam na lista, porque prazo a confirmar é estado legítimo.
 */
export function dueWindowRange(
  window: DueWindow,
  todayIso: string,
  addDays: (iso: string, days: number) => string,
): { from: string | null; to: string | null } {
  switch (window) {
    case "atrasadas":
      return { from: null, to: addDays(todayIso, -1) };
    case "hoje":
      return { from: todayIso, to: todayIso };
    case "semana":
      return { from: addDays(todayIso, 1), to: addDays(todayIso, 7) };
    case "recentes":
      return { from: addDays(todayIso, -7), to: todayIso };
    default:
      return { from: null, to: null };
  }
}
