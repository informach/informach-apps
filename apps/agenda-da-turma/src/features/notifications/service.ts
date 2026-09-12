import "server-only";
import { err } from "@informach/auth/server-actions";
import type { z } from "zod";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { recordProductEvent } from "@/features/metrics/events";
import { env } from "@/lib/env";
import {
  deletePushSubscription,
  insertPushSubscription,
  readNotificationPreferences,
  writeNotificationPreferences,
} from "./repository";
import type { notificationPreferencesSchema, pushSubscriptionSchema } from "./schemas";
export async function getNotificationPreferences(userId: string) {
  return readNotificationPreferences(userId);
}
export async function saveNotificationPreferences(
  userId: string,
  input: z.infer<typeof notificationPreferencesSchema>,
) {
  const current = await readNotificationPreferences(userId);
  const entitlement = await getFamilyEntitlements(userId);
  const result = await writeNotificationPreferences(userId, input, entitlement.enabled);
  if (
    result.ok &&
    ((!current.emailEnabled && input.emailEnabled) || (!current.pushEnabled && input.pushEnabled))
  )
    await recordProductEvent(userId, { event: "reminders_enabled" });
  return result;
}
export async function subscribePush(userId: string, input: z.infer<typeof pushSubscriptionSchema>) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
    return err({ code: "PUSH_UNAVAILABLE" } as const);
  if (!(await getFamilyEntitlements(userId)).enabled) return err({ code: "PRO_REQUIRED" } as const);
  return insertPushSubscription(userId, input);
}
export async function unsubscribePush(userId: string, endpoint: string) {
  return deletePushSubscription(userId, endpoint);
}
