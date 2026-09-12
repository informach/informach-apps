import "server-only";
import { listSchoolActivitiesByStatusIds } from "@/features/activities/repository";
import { listNoticeActions } from "@/features/notices/repository";
import { listProfileActivitiesByIds } from "@/features/profile-subject-activities/repository";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  OVERVIEW_PAGE_SIZE,
} from "./overview-types";
import { listActivityOverviewIndex } from "./repository";

export async function getActivityOverview(userId: string, options: ActivityOverviewOptions) {
  const index = await listActivityOverviewIndex(userId, options);
  const visible = index.slice(0, OVERVIEW_PAGE_SIZE);
  const ids = (source: "turma" | "notice" | "extra") =>
    visible.filter((row) => row.source === source).map((row) => row.id);
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
  return {
    items: visible.flatMap((row) => {
      const item = items.get(`${row.source}:${row.id}`);
      return item ? [item] : [];
    }),
    hasNextPage: index.length > OVERVIEW_PAGE_SIZE,
  };
}
