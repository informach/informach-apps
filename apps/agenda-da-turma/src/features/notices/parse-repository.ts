import "server-only";
import { randomUUID } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { and, count, db, eq, sql } from "@informach/db";
import {
  agendaNotices,
  agendaProductEvents,
  creditReservations,
  users,
} from "@informach/db/schema";
import type { z } from "zod";
import type { prepareNoticeAttachment } from "./attachment";
import { FREE_NOTICE_TRIAL } from "./trial-reserve";

export { FREE_NOTICE_TRIAL };

import { type NoticeExtraction, noticeExtractionSchema, type parseNoticeSchema } from "./schemas";

const PROCESSING_LEASE_MS = 10 * 60_000;
export async function reserveNoticeParse({
  userId,
  ownerId,
  profileId,
  isPro,
  input,
  attachment,
  contentHash,
  now,
  trialDailyBudget,
}: {
  userId: string;
  ownerId: string;
  profileId: string;
  isPro: boolean;
  input: z.infer<typeof parseNoticeSchema>;
  attachment: Awaited<ReturnType<typeof prepareNoticeAttachment>>;
  contentHash: string;
  now: Date;
  trialDailyBudget: number;
}) {
  return db.transaction(async (tx) => {
    // One global admission lock makes the daily trial budget enforceable across accounts.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('agenda:notice-admission'))`);
    const expired = await tx
      .select()
      .from(agendaNotices)
      .where(
        and(
          eq(agendaNotices.ownerUserId, ownerId),
          eq(agendaNotices.status, "processing"),
          sql`${agendaNotices.updatedAt} < ${new Date(now.valueOf() - PROCESSING_LEASE_MS).toISOString()}::timestamptz`,
        ),
      )
      .for("update");
    for (const stale of expired) {
      const [reservation] = stale.billingRunId
        ? await tx
            .select()
            .from(creditReservations)
            .where(eq(creditReservations.id, stale.billingRunId))
        : [];
      const recoverable =
        reservation?.status === "committed" &&
        noticeExtractionSchema.safeParse(stale.parsedResult).success;
      await tx
        .update(agendaNotices)
        .set({ status: recoverable ? "ready" : "failed", updatedAt: now })
        .where(eq(agendaNotices.id, stale.id));
    }
    const [existing] = await tx
      .select()
      .from(agendaNotices)
      .where(
        and(eq(agendaNotices.ownerUserId, ownerId), eq(agendaNotices.contentHash, contentHash)),
      )
      .for("update");
    if (existing?.status === "ready" || existing?.status === "confirmed")
      return ok({ notice: existing, replay: true });
    if (existing?.status === "processing") return err({ code: "PROCESSING" } as const);
    const since = new Date(now.valueOf() - 24 * 60 * 60_000);
    const [attempts] = await tx
      .select({ value: count() })
      .from(agendaProductEvents)
      .where(
        and(
          eq(agendaProductEvents.userId, userId),
          eq(agendaProductEvents.event, "notice_attempt"),
          sql`${agendaProductEvents.createdAt} >= ${since.toISOString()}::timestamptz`,
        ),
      );
    if ((attempts?.value ?? 0) >= (isPro ? 70 : 10)) return err({ code: "DAILY_LIMIT" } as const);
    if (!isPro) {
      const [budget] = await tx
        .select({ value: count() })
        .from(agendaProductEvents)
        .where(
          and(
            eq(agendaProductEvents.event, "trial_started"),
            sql`${agendaProductEvents.createdAt} >= ${since.toISOString()}::timestamptz`,
          ),
        );
      if ((budget?.value ?? 0) >= trialDailyBudget) return err({ code: "TRIAL_BUSY" } as const);
      const [used] = await tx
        .select({ value: count() })
        .from(agendaNotices)
        .where(
          and(
            eq(agendaNotices.ownerUserId, ownerId),
            eq(agendaNotices.isTrial, true),
            sql`${agendaNotices.status} IN ('ready', 'confirmed', 'processing')`,
          ),
        );
      if ((used?.value ?? 0) >= FREE_NOTICE_TRIAL) return err({ code: "TRIAL_ENDED" } as const);
      await tx
        .insert(agendaProductEvents)
        .values({ userId, event: "trial_started", source: input.source });
    }
    await tx
      .insert(agendaProductEvents)
      .values({ userId, event: "notice_attempt", source: input.source });
    const data = {
      ownerUserId: ownerId,
      captureProfileId: profileId,
      createdByUserId: userId,
      source: input.source,
      sourceUrl: input.sourceUrl,
      publishedAt: input.publishedAt,
      text: input.text,
      contentHash,
      attachmentName: attachment?.name ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentData: attachment?.originalData ?? null,
      attachmentExpiresAt: attachment ? new Date(now.valueOf() + 30 * 86400_000) : null,
      status: "processing" as const,
      isTrial: !isPro,
      updatedAt: now,
      parsedResult: null,
      failureCode: null,
      billingRunId: randomUUID(),
    };
    const [notice] = existing
      ? await tx
          .update(agendaNotices)
          .set(data)
          .where(eq(agendaNotices.id, existing.id))
          .returning()
      : await tx.insert(agendaNotices).values(data).returning();
    if (!notice) throw new Error("Notice admission failed");
    return ok({ notice, replay: false });
  });
}
export async function isNoticeUserVerified(userId: string) {
  const [user] = await db
    .select({ verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId));
  return Boolean(user?.verified);
}
export async function persistNoticeExtraction(
  id: string,
  runId: string,
  extraction: NoticeExtraction,
) {
  const [saved] = await db
    .update(agendaNotices)
    .set({ parsedResult: extraction })
    .where(
      and(
        eq(agendaNotices.id, id),
        eq(agendaNotices.billingRunId, runId),
        eq(agendaNotices.status, "processing"),
      ),
    )
    .returning({ id: agendaNotices.id });
  if (!saved) throw new Error("Notice was removed before extraction could be saved");
}
export async function finishNoticeParse(
  id: string,
  runId: string,
  status: "ready" | "failed",
  failureCode: string | null = null,
) {
  const [finished] = await db
    .update(agendaNotices)
    .set({ status, failureCode, updatedAt: new Date() })
    .where(
      and(
        eq(agendaNotices.id, id),
        eq(agendaNotices.billingRunId, runId),
        eq(agendaNotices.status, "processing"),
      ),
    )
    .returning({ id: agendaNotices.id });
  return Boolean(finished);
}
export async function isNoticeRunCommitted(runId: string) {
  const [reservation] = await db
    .select({ status: creditReservations.status })
    .from(creditReservations)
    .where(eq(creditReservations.id, runId));
  return reservation?.status === "committed";
}
