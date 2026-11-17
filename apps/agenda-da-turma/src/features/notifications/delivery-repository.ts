import "server-only";
import {
  activeWebParticipationCondition,
  currentWebParticipationCondition,
  lockActiveWebParticipation,
  WebParticipationError,
} from "@informach/auth/web-participation";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaNotices,
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaPushSubscriptions,
  users,
} from "@informach/db/schema";
import { FamilyError } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import type { AgendaAuthority } from "@/features/family/authority";

type DeliveryClaim = typeof agendaNotificationDeliveries.$inferSelect;
export const liveAgendaDeliveryCondition = () =>
  sql`${agendaNotificationDeliveries.status} = 'processing' AND ${agendaNotificationDeliveries.lastAttemptAt} > clock_timestamp() - interval '10 minutes'`;
function deliveryAttemptCondition(delivery: DeliveryClaim) {
  if (!delivery.lastAttemptAt) return sql`false`;
  return and(
    eq(agendaNotificationDeliveries.id, delivery.id),
    eq(agendaNotificationDeliveries.webParticipationRevision, delivery.webParticipationRevision),
    eq(agendaNotificationDeliveries.lastAttemptAt, delivery.lastAttemptAt),
    liveAgendaDeliveryCondition(),
  );
}

/** Content prepared before suspension must never become authorized again after
 * resumption. The receipt also fences reclaims of the same message. */
export async function isCurrentDelivery(actor: AgendaAuthority, delivery: DeliveryClaim) {
  const [current] = await db
    .select({ id: agendaNotificationDeliveries.id })
    .from(agendaNotificationDeliveries)
    .where(
      and(
        deliveryAttemptCondition(delivery),
        eq(agendaNotificationDeliveries.userId, actor.userId),
        eq(agendaNotificationDeliveries.familyGroupId, actor.familyGroupId),
        currentWebParticipationCondition(actor.userId, delivery.webParticipationRevision),
        familyMembershipCondition(actor.userId, agendaNotificationDeliveries.familyGroupId),
      ),
    );
  return !!current;
}
export async function claim(actor: AgendaAuthority, channel: "email" | "push", messageKey: string) {
  return db
    .transaction(async (tx) => {
      await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
      const userId = actor.userId;
      const revision = await lockActiveWebParticipation(tx, userId);
      // Admission time is operational, independent from the date used to build
      // a weekly/daily message (or a replay of a prior business day).
      const now = new Date();
      const [historical] = await tx
        .select({ id: agendaNotificationDeliveries.id })
        .from(agendaNotificationDeliveries)
        .where(
          and(
            eq(agendaNotificationDeliveries.userId, userId),
            eq(agendaNotificationDeliveries.channel, channel),
            eq(agendaNotificationDeliveries.messageKey, messageKey),
            sql`${agendaNotificationDeliveries.familyGroupId} IS NULL`,
            sql`${agendaNotificationDeliveries.status} IN ('sent', 'processing')`,
          ),
        );
      if (historical) return null;
      messageKey = `${actor.familyGroupId}:${messageKey}`;
      await tx
        .insert(agendaNotificationDeliveries)
        .values({ userId, familyGroupId: actor.familyGroupId, channel, messageKey })
        .onConflictDoNothing();
      const [row] = await tx
        .update(agendaNotificationDeliveries)
        .set({
          status: "processing",
          attempts: sql`CASE WHEN ${agendaNotificationDeliveries.status} = 'processing' THEN ${agendaNotificationDeliveries.attempts} ELSE ${agendaNotificationDeliveries.attempts} + 1 END`,
          lastAttemptAt: now,
          webParticipationRevision: revision,
        })
        .where(
          and(
            eq(agendaNotificationDeliveries.userId, userId),
            eq(agendaNotificationDeliveries.channel, channel),
            eq(agendaNotificationDeliveries.messageKey, messageKey),
            sql`(${agendaNotificationDeliveries.attempts} < 3 OR ${agendaNotificationDeliveries.status} = 'processing')`,
            sql`(${agendaNotificationDeliveries.status} = 'pending' OR (${agendaNotificationDeliveries.status} IN ('failed', 'processing') AND ${agendaNotificationDeliveries.lastAttemptAt} < ${new Date(now.valueOf() - 10 * 60_000).toISOString()}::timestamptz))`,
          ),
        )
        .returning();
      return row ?? null;
    })
    .catch((error) => {
      if (
        error instanceof WebParticipationError ||
        (error instanceof FamilyError && error.code === "ACCESS_DENIED")
      )
        return null;
      throw error;
    });
}
export async function finish(
  delivery: DeliveryClaim,
  status: "sent" | "failed" | "canceled",
  now: Date,
) {
  await db
    .update(agendaNotificationDeliveries)
    .set({ status, sentAt: status === "sent" ? now : null })
    .where(deliveryAttemptCondition(delivery));
}

export async function defer(delivery: DeliveryClaim) {
  // A busy/uncertain provider delivery is not a failed attempt and must not
  // exhaust this job's retry budget. The email layer owns reconciliation.
  await db
    .update(agendaNotificationDeliveries)
    .set({
      status: "failed",
      attempts: sql`greatest(0, ${agendaNotificationDeliveries.attempts} - 1)`,
    })
    .where(deliveryAttemptCondition(delivery));
}

export function listRecipients(afterId: string | null | undefined, limit: number) {
  return db
    .select({
      preferences: agendaNotificationPreferences,
      email: users.email,
      verified: users.emailVerified,
    })
    .from(agendaNotificationPreferences)
    .innerJoin(users, eq(users.id, agendaNotificationPreferences.userId))
    .where(
      and(
        sql`(${agendaNotificationPreferences.emailEnabled} OR ${agendaNotificationPreferences.pushEnabled})`,
        activeWebParticipationCondition(users.id),
        eq(users.emailVerified, true),
        sql`(${users.banned} = false OR ${users.banExpiresAt} <= statement_timestamp())`,
        afterId ? sql`${agendaNotificationPreferences.id} > ${afterId}::uuid` : undefined,
      ),
    )
    .orderBy(agendaNotificationPreferences.id)
    .limit(limit);
}
export function listPushDevices(userId: string) {
  return db
    .select()
    .from(agendaPushSubscriptions)
    .where(
      and(eq(agendaPushSubscriptions.userId, userId), activeWebParticipationCondition(userId)),
    );
}
export async function currentPushDevice(userId: string, deviceId: string) {
  const [device] = await db
    .select()
    .from(agendaPushSubscriptions)
    .where(
      and(
        eq(agendaPushSubscriptions.id, deviceId),
        eq(agendaPushSubscriptions.userId, userId),
        activeWebParticipationCondition(userId),
      ),
    );
  return device;
}
export async function retirePushDevice(userId: string, deviceId: string) {
  await db
    .delete(agendaPushSubscriptions)
    .where(
      and(eq(agendaPushSubscriptions.id, deviceId), eq(agendaPushSubscriptions.userId, userId)),
    );
}
export async function currentEmail(userId: string) {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.emailVerified, true),
        activeWebParticipationCondition(userId),
        sql`(${users.banned} = false OR ${users.banExpiresAt} <= statement_timestamp())`,
      ),
    );
  return user?.email;
}
export async function purgeExpiredAttachments(now: Date) {
  await db
    .update(agendaNotices)
    .set({ attachmentData: null })
    .where(
      sql`${agendaNotices.attachmentExpiresAt} <= ${now.toISOString()}::timestamptz AND ${agendaNotices.attachmentData} IS NOT NULL`,
    );
}
