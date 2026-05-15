import type { ActivityStatusValue } from "@/features/activities/types";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { addDaysIso } from "./date";
import type { DashboardCounters, DashboardSnapshot } from "./types";

function activityBucket(
  dueAt: string,
  todayIso: string,
): keyof Pick<DashboardCounters, "overdue" | "today" | "week"> | null {
  if (dueAt < todayIso) return "overdue";
  if (dueAt === todayIso) return "today";
  if (dueAt <= addDaysIso(todayIso, 7)) return "week";
  return null;
}

function countsAsDoneRecent(dueAt: string, todayIso: string): boolean {
  return dueAt >= addDaysIso(todayIso, -7) && dueAt <= todayIso;
}

function addClamped(value: number, delta: number): number {
  return Math.max(0, value + delta);
}

function progressPercent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function itemKey(item: UnifiedActivityListItem): string {
  return item.source === "turma" ? item.statusId : item.activityId;
}

function removeItem(
  items: UnifiedActivityListItem[],
  item: UnifiedActivityListItem,
): UnifiedActivityListItem[] {
  const key = itemKey(item);
  return items.filter((candidate) => itemKey(candidate) !== key);
}

export function applyDashboardStatusSuccess(
  snapshot: DashboardSnapshot,
  item: UnifiedActivityListItem,
  previousStatus: ActivityStatusValue,
  nextStatus: ActivityStatusValue,
): DashboardSnapshot {
  if (previousStatus === nextStatus) return snapshot;

  const direction = previousStatus === "pending" && nextStatus === "done" ? 1 : -1;
  const bucket = activityBucket(item.dueAt, snapshot.todayIso);
  const doneRecentDelta = countsAsDoneRecent(item.dueAt, snapshot.todayIso) ? direction : 0;
  const pendingDelta = -direction;
  const doneDelta = direction;
  const overdueDelta = item.dueAt < snapshot.todayIso ? -direction : 0;
  const shouldRemoveFromBuckets = previousStatus === "pending" && nextStatus === "done";

  const counters = { ...snapshot.counters };
  if (bucket) {
    counters[bucket] = addClamped(counters[bucket], -direction);
  }
  counters.doneRecent = addClamped(counters.doneRecent, doneRecentDelta);

  return {
    ...snapshot,
    counters,
    overdue: shouldRemoveFromBuckets ? removeItem(snapshot.overdue, item) : snapshot.overdue,
    today: shouldRemoveFromBuckets ? removeItem(snapshot.today, item) : snapshot.today,
    upcoming: shouldRemoveFromBuckets ? removeItem(snapshot.upcoming, item) : snapshot.upcoming,
    perProfile: snapshot.perProfile.map((profile) => {
      if (profile.profileId !== item.studentProfileId) return profile;

      const pending = addClamped(profile.pending, pendingDelta);
      const overdue = addClamped(profile.overdue, overdueDelta);
      const doneTotal = addClamped(profile.doneTotal, doneDelta);
      const totalAll = pending + doneTotal;

      return {
        ...profile,
        pending,
        overdue,
        doneTotal,
        totalAll,
        progressPercent: progressPercent(doneTotal, totalAll),
      };
    }),
  };
}
