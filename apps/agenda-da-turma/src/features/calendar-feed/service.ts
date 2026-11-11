import "server-only";
import { randomBytes } from "node:crypto";
import { ok } from "@informach/auth/server-actions";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { env } from "@/lib/env";
import { buildCalendarFeed, type FeedEvent } from "./ics";
import {
  deleteCalendarFeeds,
  findActiveCalendarFeed,
  readCalendarTasks,
  replaceCalendarFeed,
} from "./repository";

export async function createCalendarFeed(actor: AgendaAuthority) {
  const token = randomBytes(32).toString("hex");
  const result = await replaceCalendarFeed(actor, token);
  if (!result.ok) return result;
  await recordProductEvent(actor.userId, { event: "calendar_connected" });
  return ok({
    url: `${env.NEXT_PUBLIC_APP_URL}/api/calendario/${token}`,
    expiresAt: result.value.expiresAt?.toISOString() ?? null,
  });
}
export async function revokeCalendarFeeds(actor: AgendaAuthority) {
  await deleteCalendarFeeds(actor);
  return ok({ revoked: true });
}
export async function getCalendarFeedState(actor: AgendaAuthority) {
  return findActiveCalendarFeed(actor);
}
export async function readCalendarFeed(token: string) {
  const fromIso = addDaysIso(todayLocalIso(), -30);
  const toIso = addDaysIso(todayLocalIso(), 365);
  // Uma consulta só. O feed somava três listas — recados, escola e extras —
  // cada uma com o seu formato de id, de data e de "cancelada", e o mesmo
  // evento aparecia diferente conforme a tabela de origem.
  const tasks = await readCalendarTasks(token, fromIso, toIso);
  if (!tasks) return null;
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
