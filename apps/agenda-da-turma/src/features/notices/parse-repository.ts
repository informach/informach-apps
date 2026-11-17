import "server-only";
import { randomUUID } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { and, count, db, eq, sql } from "@informach/db";
import {
  agendaNotices,
  agendaProductEvents,
  creditReservations,
  users,
} from "@informach/db/schema";
import type { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";
import { lockAgendaProfiles } from "@/features/family/scope";
import { lockAgendaUse } from "@/features/family/use-repository";
import type { prepareNoticeAttachment } from "./attachment";
import { ensureStoredActionIds, restoreDiscardedActions } from "./drafts";
import { sourceAccessCondition } from "./repository";
import { type parseNoticeSchema, type StoredExtraction, storedExtractionSchema } from "./schemas";

const PROCESSING_LEASE_MS = 10 * 60_000;
export async function reserveNoticeParse({
  actor,
  input,
  attachment,
  contentHash,
  now,
}: {
  actor: AgendaAuthority;
  input: z.infer<typeof parseNoticeSchema>;
  attachment: Awaited<ReturnType<typeof prepareNoticeAttachment>>;
  contentHash: string;
  now: Date;
}) {
  return db.transaction(async (tx) => {
    // Family lock serializes admissions with grant revocation and reassociation.
    // It is released before wallet → family reservation; never invert that order.
    await lockAgendaUse(tx, actor, [input.profileId], "use_ai");
    await lockAgendaProfiles(tx, actor, [input.profileId], "write");
    const webParticipationRevision = await lockActiveWebParticipation(tx, actor.userId);
    let [existing] = await tx
      .select()
      .from(agendaNotices)
      .where(
        and(
          eq(agendaNotices.familyGroupId, actor.familyGroupId),
          eq(agendaNotices.contentHash, contentHash),
        ),
      )
      .for("update");
    if (existing) {
      const [accessible] = await tx
        .select({ id: agendaNotices.id })
        .from(agendaNotices)
        .where(and(eq(agendaNotices.id, existing.id), sourceAccessCondition(actor)));
      if (!accessible) return err({ code: "NOT_FOUND" } as const);
      if (
        existing.status === "processing" &&
        existing.updatedAt.valueOf() < now.valueOf() - PROCESSING_LEASE_MS
      ) {
        const [reservation] = existing.billingRunId
          ? await tx
              .select()
              .from(creditReservations)
              .where(
                and(
                  eq(creditReservations.id, existing.billingRunId),
                  eq(creditReservations.app, "compasso"),
                  eq(creditReservations.ownerType, "family"),
                  eq(creditReservations.ownerId, actor.familyGroupId),
                ),
              )
          : [];
        // A pending reservation may still settle. Never replace its run id.
        if (reservation?.status === "active" && reservation.expiresAt > now)
          return err({ code: "PROCESSING" } as const);
        const recovered =
          reservation?.status === "committed" &&
          storedExtractionSchema.safeParse(existing.parsedResult).success;
        if (reservation?.status === "committed" && !recovered)
          return err({ code: "RECOVERY_REQUIRED" } as const);
        [existing] = await tx
          .update(agendaNotices)
          .set({ status: recovered ? "ready" : "failed", updatedAt: now })
          .where(eq(agendaNotices.id, existing.id))
          .returning();
      }
      if (existing?.status === "confirmed") return ok({ notice: existing, replay: true });
      if (existing?.status === "ready" || existing?.status === "discarded") {
        const stored = storedExtractionSchema.safeParse(existing.parsedResult);
        if (stored.success) {
          const restored = restoreDiscardedActions(ensureStoredActionIds(stored.data).extraction);
          const [notice] = await tx
            .update(agendaNotices)
            .set({ parsedResult: restored.extraction, status: "ready", updatedAt: now })
            .where(eq(agendaNotices.id, existing.id))
            .returning();
          if (!notice) throw new Error("Notice replay failed");
          return ok({ notice, replay: true });
        }
        // A charged but corrupt result requires recovery, not a second debit.
        return err({ code: "RECOVERY_REQUIRED" } as const);
      }
      if (existing?.status === "processing") return err({ code: "PROCESSING" } as const);
    }
    const since = new Date(now.valueOf() - 86400_000);
    const [attempts] = await tx
      .select({ value: count() })
      .from(agendaProductEvents)
      .where(
        and(
          eq(agendaProductEvents.userId, actor.userId),
          eq(agendaProductEvents.event, "notice_attempt"),
          sql`${agendaProductEvents.createdAt} >= ${since.toISOString()}::timestamptz`,
        ),
      );
    if ((attempts?.value ?? 0) >= 70) return err({ code: "DAILY_LIMIT" } as const);
    await tx
      .insert(agendaProductEvents)
      .values({ userId: actor.userId, event: "notice_attempt", source: input.source });
    const data = {
      familyGroupId: actor.familyGroupId,
      captureProfileId: input.profileId,
      createdByUserId: actor.userId,
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
      isTrial: false,
      updatedAt: now,
      parsedResult: null,
      sourceProfileIds: null,
      failureCode: null,
      billingRunId: randomUUID(),
      webParticipationRevision,
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
  actor: AgendaAuthority,
  id: string,
  runId: string,
  extraction: StoredExtraction,
) {
  return db.transaction(async (tx) => {
    const condition = and(
      eq(agendaNotices.id, id),
      eq(agendaNotices.billingRunId, runId),
      eq(agendaNotices.status, "processing"),
      eq(agendaNotices.createdByUserId, actor.userId),
      eq(agendaNotices.familyGroupId, actor.familyGroupId),
    );
    // Observe identifiers only before taking canonical family/participation locks.
    const [source] = await tx
      .select({
        profileId: agendaNotices.captureProfileId,
        revision: agendaNotices.webParticipationRevision,
      })
      .from(agendaNotices)
      .where(condition);
    if (!source?.profileId) throw new Error("Notice attempt is no longer available");
    await lockAgendaUse(tx, actor, [source.profileId], "use_ai");
    await lockAgendaProfiles(tx, actor, [source.profileId], "write");
    await lockActiveWebParticipation(tx, actor.userId, source.revision);
    const [saved] = await tx
      .update(agendaNotices)
      .set({ parsedResult: extraction })
      .where(
        and(
          condition,
          eq(agendaNotices.captureProfileId, source.profileId),
          eq(agendaNotices.webParticipationRevision, source.revision),
        ),
      )
      .returning({ id: agendaNotices.id });
    if (!saved) throw new Error("Notice attempt changed before extraction could be saved");
  });
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
