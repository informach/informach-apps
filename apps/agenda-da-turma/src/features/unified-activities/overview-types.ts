import { z } from "zod";
import type { ActivityListItem } from "@/features/activities/types";
import type { NoticeActionRow } from "@/features/notices/repository";
import type { ProfileSubjectActivityListItem } from "@/features/profile-subject-activities/types";
import type { ActivityType } from "./activity-types";

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
