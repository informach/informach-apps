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
  recentes: "Concluídas nos últimos 7 dias",
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
  /**
   * Só o que ficou sob a responsabilidade de quem está olhando.
   *
   * O Pro vende "divida os cuidados", e o dado já existia — `assignedToUserId`
   * grava quem ficou de cuidar, e o card mostra "Acompanhamento: fulano". O que
   * faltava era a pergunta inversa: "o que é meu?". Aparece só quando há um
   * segundo adulto; com um adulto só, tudo é dele e o filtro seria ruído.
   */
  assignedToMe: boolean;
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
  if (options.assignedToMe) params.set("responsavel", "eu");
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

/**
 * Limites de data da janela, no mesmo formato "YYYY-MM-DD" do resto do app.
 * `null` dos dois lados significa "sem recorte" — e nesse caso as atividades
 * sem prazo continuam na lista, porque prazo a confirmar é estado legítimo.
 */
export function dueWindowRange(
  window: DueWindow,
  todayIso: string,
  addDays: (iso: string, days: number) => string,
): { from: string | null; to: string | null; column: "due" | "completed" } {
  switch (window) {
    case "atrasadas":
      return { from: null, to: addDays(todayIso, -1), column: "due" };
    case "hoje":
      return { from: todayIso, to: todayIso, column: "due" };
    case "semana":
      return { from: addDays(todayIso, 1), to: addDays(todayIso, 7), column: "due" };
    case "recentes":
      // A ÚNICA janela que olha a conclusão, e não o prazo.
      //
      // "Concluídas (7d)" contava atividades cujo PRAZO caiu nos últimos sete
      // dias: concluir hoje uma tarefa vencida há três semanas não mexia no
      // número, e a lista que o card abre também não a mostrava. O rótulo
      // prometia uma coisa e o filtro media outra. O contador equivalente em
      // `getRoutineCounters` mudou junto — os dois precisam continuar iguais.
      return { from: addDays(todayIso, -7), to: todayIso, column: "completed" };
    default:
      return { from: null, to: null, column: "due" };
  }
}
