import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, count, db, eq, sql } from "@informach/db";
import {
  agendaNotificationPreferences,
  agendaPushSubscriptions,
  emailUnsubscribes,
  users,
} from "@informach/db/schema";
import { assertFamilyMembership, lockFamilyMembership } from "@informach/family/context";
import type { z } from "zod";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import type { AgendaAuthority } from "@/features/family/authority";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type notificationPreferencesSchema,
  type pushSubscriptionSchema,
} from "./schemas";

export async function readNotificationPreferences(actor: AgendaAuthority) {
  await assertFamilyMembership(db, actor.userId, actor.familyGroupId);
  const [row] = await db
    .select()
    .from(agendaNotificationPreferences)
    .where(
      and(
        eq(agendaNotificationPreferences.userId, actor.userId),
        eq(agendaNotificationPreferences.familyGroupId, actor.familyGroupId),
      ),
    );
  return row
    ? {
        emailEnabled: row.emailEnabled,
        pushEnabled: row.pushEnabled,
        digestHour: row.digestHour,
        quietStart: row.quietStart,
        quietEnd: row.quietEnd,
        suggestReminders: row.suggestReminders,
        weeklyDigestEnabled: row.weeklyDigestEnabled,
        weeklyDigestDay: row.weeklyDigestDay,
        weeklyDigestHour: row.weeklyDigestHour,
      }
    : DEFAULT_NOTIFICATION_PREFERENCES;
}
export async function writeNotificationPreferences(
  actor: AgendaAuthority,
  input: z.infer<typeof notificationPreferencesSchema>,
) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    if (
      (input.emailEnabled || input.pushEnabled) &&
      !(await agendaAccessInTransaction(tx, actor)).enabled
    )
      return err({ code: "PRO_REQUIRED" } as const);
    const [current] = await tx
      .select()
      .from(agendaNotificationPreferences)
      .where(
        and(
          eq(agendaNotificationPreferences.userId, actor.userId),
          eq(agendaNotificationPreferences.familyGroupId, actor.familyGroupId),
        ),
      );
    if (!current?.emailEnabled && input.emailEnabled)
      await tx
        .delete(emailUnsubscribes)
        .where(
          and(
            eq(emailUnsubscribes.userId, actor.userId),
            eq(emailUnsubscribes.category, "agenda.routine"),
          ),
        );
    await tx
      .insert(agendaNotificationPreferences)
      .values({ userId: actor.userId, familyGroupId: actor.familyGroupId, ...input })
      .onConflictDoUpdate({
        target: [agendaNotificationPreferences.familyGroupId, agendaNotificationPreferences.userId],
        set: { ...input, updatedAt: new Date() },
      });
    return ok({ saved: true });
  });
}
export async function insertPushSubscription(
  actor: AgendaAuthority,
  input: z.infer<typeof pushSubscriptionSchema>,
) {
  const userId = actor.userId;
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, userId, actor.familyGroupId);
    if (!(await agendaAccessInTransaction(tx, actor)).enabled)
      return err({ code: "PRO_REQUIRED" } as const);
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
