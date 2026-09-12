import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, count, db, eq, sql } from "@informach/db";
import {
  agendaNotificationPreferences,
  agendaPushSubscriptions,
  emailUnsubscribes,
  users,
} from "@informach/db/schema";
import type { z } from "zod";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type notificationPreferencesSchema,
  type pushSubscriptionSchema,
} from "./schemas";

export async function readNotificationPreferences(userId: string) {
  const [row] = await db
    .select()
    .from(agendaNotificationPreferences)
    .where(eq(agendaNotificationPreferences.userId, userId));
  return row
    ? {
        emailEnabled: row.emailEnabled,
        pushEnabled: row.pushEnabled,
        digestHour: row.digestHour,
        quietStart: row.quietStart,
        quietEnd: row.quietEnd,
      }
    : DEFAULT_NOTIFICATION_PREFERENCES;
}
export async function writeNotificationPreferences(
  userId: string,
  input: z.infer<typeof notificationPreferencesSchema>,
  canEnable: boolean,
) {
  const current = await readNotificationPreferences(userId);
  const enabling =
    (!current.emailEnabled && input.emailEnabled) || (!current.pushEnabled && input.pushEnabled);
  if (enabling && !canEnable) return err({ code: "PRO_REQUIRED" } as const);
  const [user] = await db
    .select({ verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));
  if (enabling && !user?.verified) return err({ code: "VERIFY_EMAIL" } as const);
  if (!current.emailEnabled && input.emailEnabled)
    await db
      .delete(emailUnsubscribes)
      .where(
        and(eq(emailUnsubscribes.userId, userId), eq(emailUnsubscribes.category, "agenda.routine")),
      );
  await db
    .insert(agendaNotificationPreferences)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: agendaNotificationPreferences.userId,
      set: { ...input, updatedAt: new Date() },
    });
  return ok({ saved: true });
}
export async function insertPushSubscription(
  userId: string,
  input: z.infer<typeof pushSubscriptionSchema>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:push:${userId}`}))`);
    const [user] = await tx
      .select({ verified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId));
    if (!user?.verified) return err({ code: "VERIFY_EMAIL" } as const);
    const [existing] = await tx
      .select()
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.endpoint, input.endpoint));
    if (existing && existing.userId !== userId)
      return err({ code: "DEVICE_ALREADY_LINKED" } as const);
    const [total] = await tx
      .select({ value: count() })
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.userId, userId));
    if (!existing && (total?.value ?? 0) >= 5) return err({ code: "DEVICE_LIMIT" } as const);
    await tx
      .insert(agendaPushSubscriptions)
      .values({ userId, endpoint: input.endpoint, ...input.keys })
      .onConflictDoUpdate({
        target: agendaPushSubscriptions.endpoint,
        set: { ...input.keys },
        setWhere: eq(agendaPushSubscriptions.userId, userId),
      });
    return ok({ subscribed: true });
  });
}
export async function deletePushSubscription(userId: string, endpoint: string) {
  await db
    .delete(agendaPushSubscriptions)
    .where(
      and(
        eq(agendaPushSubscriptions.userId, userId),
        eq(agendaPushSubscriptions.endpoint, endpoint),
      ),
    );
  return ok({ unsubscribed: true });
}
