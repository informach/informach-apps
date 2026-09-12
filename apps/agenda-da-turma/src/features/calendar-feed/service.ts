import "server-only";
import { randomBytes } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { listActivitiesInDateRange } from "@/features/calendar/repository";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { recordProductEvent } from "@/features/metrics/events";
import { listNoticeActions } from "@/features/notices/repository";
import { listProfileActivitiesInDateRange } from "@/features/profile-subject-activities/repository";
import { env } from "@/lib/env";
import { buildCalendarFeed, type FeedEvent } from "./ics";
import {
  deleteCalendarFeeds,
  findActiveCalendarFeed,
  findCalendarFeedByToken,
  replaceCalendarFeed,
} from "./repository";

export async function createCalendarFeed(userId: string) {
  if (!(await getFamilyEntitlements(userId)).enabled) return err({ code: "PRO_REQUIRED" } as const);
  const token = randomBytes(32).toString("hex");
  await replaceCalendarFeed(userId, token);
  await recordProductEvent(userId, { event: "calendar_connected" });
  return ok({ url: `${env.NEXT_PUBLIC_APP_URL}/api/calendario/${token}` });
}
export async function revokeCalendarFeeds(userId: string) {
  await deleteCalendarFeeds(userId);
  return ok({ revoked: true });
}
export async function hasCalendarFeed(userId: string) {
  return findActiveCalendarFeed(userId);
}
export async function readCalendarFeed(token: string) {
  const feed = await findCalendarFeedByToken(token);
  if (!feed) return null;
  const fromIso = addDaysIso(todayLocalIso(), -30);
  const toIso = addDaysIso(todayLocalIso(), 365);
  const [notices, school, extras] = await Promise.all([
    listNoticeActions(feed.userId, { from: fromIso, to: toIso, includeFinished: true }),
    listActivitiesInDateRange(feed.userId, { fromIso, toIso, profileFilter: null, isPro: false }),
    listProfileActivitiesInDateRange(feed.userId, {
      fromIso,
      toIso,
      profileFilter: null,
      includePausedSubjects: false,
    }),
  ]);
  const events: FeedEvent[] = notices.flatMap(({ action: a, profileName }) =>
    a.dueAt
      ? [
          {
            id: `notice-${a.id}`,
            title: `${profileName}: ${a.title}`,
            description: a.description,
            date: a.dueAt,
            time: a.time,
            location: a.location,
            updatedAt: a.updatedAt,
            version: a.version,
            canceled: a.status === "canceled",
          },
        ]
      : [],
  );
  for (const item of [...school, ...extras])
    events.push({
      id: `${"statusId" in item ? "school" : "extra"}-${item.activityId}-${item.studentProfileId}`,
      title: `${item.studentProfileName}: ${item.title}`,
      description: item.description,
      date: item.dueAt,
      updatedAt:
        "activityUpdatedAt" in item
          ? (item.activityUpdatedAt ?? item.activityCreatedAt)
          : item.activityCreatedAt,
      version: "version" in item ? item.version : undefined,
      canceled: "canceledAt" in item ? Boolean(item.canceledAt) : false,
    });
  return buildCalendarFeed(events);
}
