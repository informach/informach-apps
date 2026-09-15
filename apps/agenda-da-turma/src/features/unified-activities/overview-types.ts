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
 * Uma atividade na lista. Era uma união discriminada de três formatos, um por
 * tabela; com a convergência virou um só, e quem consome deixou de precisar
 * saber de onde a linha veio.
 */
export type ActivityOverviewItem = { key: string; item: TaskRow };
export type ActivityOverviewOptions = {
  profileFilter: string | null;
  typeFilter: OverviewActivityType | null;
  statusFilter: OverviewStatus;
  noticeId: string | null;
  page: number;
};
export const OVERVIEW_PAGE_SIZE = 30;

export function activityOverviewHref(options: ActivityOverviewOptions) {
  const params = new URLSearchParams();
  if (options.profileFilter) params.set("perfil", options.profileFilter);
  if (options.typeFilter) params.set("tipo", options.typeFilter);
  if (options.statusFilter !== "pending") params.set("situacao", options.statusFilter);
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
