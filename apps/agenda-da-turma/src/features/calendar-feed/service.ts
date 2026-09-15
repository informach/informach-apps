import "server-only";
import { randomBytes } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { recordProductEvent } from "@/features/metrics/events";
import { listNoticeActions } from "@/features/notices/repository";
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
  // Uma consulta só. O feed somava três listas — recados, escola e extras —
  // cada uma com o seu formato de id, de data e de "cancelada", e o mesmo
  // evento aparecia diferente conforme a tabela de origem.
  const tasks = await listNoticeActions(feed.userId, {
    from: fromIso,
    to: toIso,
    includeFinished: true,
  });
  const events: FeedEvent[] = tasks.flatMap(({ action: a, profileName }) =>
    a.dueAt
      ? [
          {
            id: `atividade-${a.id}`,
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
  return buildCalendarFeed(events);
}
