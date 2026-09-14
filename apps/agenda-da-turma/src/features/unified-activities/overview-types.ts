import { z } from "zod";
import type { ActivityListItem } from "@/features/activities/types";
import type { NoticeActionRow } from "@/features/notices/repository";
import type { ProfileSubjectActivityListItem } from "@/features/profile-subject-activities/types";
import type { ActivityType } from "./activity-types";
import type { UnifiedActivityListItem } from "./types";

export type OverviewActivityType = ActivityType;
export const overviewStatusSchema = z.enum(["all", "pending", "done", "canceled"]);
export type OverviewStatus = z.infer<typeof overviewStatusSchema>;
export const OVERVIEW_STATUS_LABELS: Record<OverviewStatus, string> = {
  all: "Todas as situações",
  pending: "Pendentes",
  done: "Concluídas",
  canceled: "Canceladas",
};
export type ActivityOverviewItem =
  | { source: "turma"; key: string; item: ActivityListItem }
  | { source: "notice"; key: string; item: NoticeActionRow }
  | { source: "extra"; key: string; item: ProfileSubjectActivityListItem };
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

// O calendário monta sua lista com `UnifiedActivityListItem` (precisa de
// `dueAt` para ordenar os blips). O card despacha pela projeção, então a
// conversão acontece aqui, num ponto só.
export function toOverviewEntry(item: UnifiedActivityListItem): ActivityOverviewItem {
  if (item.source === "notice") {
    return { key: `notice:${item.activityId}`, source: "notice", item: item.routineItem };
  }
  if (item.source === "turma") {
    return { key: `turma:${item.statusId}`, source: "turma", item };
  }
  return { key: `extra:${item.activityId}`, source: "extra", item };
}

// Acessores por fonte — cada tabela guarda o prazo e a criança num lugar
// diferente, e as vistas que misturam as três precisam dos dois sem se
// importar com a origem.
export function overviewDueAt(entry: ActivityOverviewItem): string | null {
  if (entry.source === "notice") return entry.item.action.dueAt;
  return entry.item.dueAt;
}

export function overviewProfileId(entry: ActivityOverviewItem): string {
  if (entry.source === "notice") return entry.item.action.profileId;
  return entry.item.studentProfileId;
}
