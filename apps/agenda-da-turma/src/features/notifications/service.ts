import "server-only";
import { err } from "@informach/auth/server-actions";
import type { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { env } from "@/lib/env";
import {
  deletePushSubscription,
  insertPushSubscription,
  readNotificationPreferences,
  writeNotificationPreferences,
} from "./repository";
import type { notificationPreferencesSchema, pushSubscriptionSchema } from "./schemas";
export async function getNotificationPreferences(actor: AgendaAuthority) {
  return readNotificationPreferences(actor);
}
export async function saveNotificationPreferences(
  actor: AgendaAuthority,
  input: z.infer<typeof notificationPreferencesSchema>,
) {
  const current = await readNotificationPreferences(actor);
  const result = await writeNotificationPreferences(actor, input);
  if (
    result.ok &&
    ((!current.emailEnabled && input.emailEnabled) || (!current.pushEnabled && input.pushEnabled))
  )
    await recordProductEvent(actor.userId, { event: "reminders_enabled" });
  return result;
}
export async function subscribePush(
  actor: AgendaAuthority,
  input: z.infer<typeof pushSubscriptionSchema>,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
    return err({ code: "PUSH_UNAVAILABLE" } as const);
  return insertPushSubscription(actor, input);
}
export async function unsubscribePush(userId: string, endpoint: string) {
  return deletePushSubscription(userId, endpoint);
}
