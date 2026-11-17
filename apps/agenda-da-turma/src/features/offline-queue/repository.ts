import "server-only";
import { err } from "@informach/auth/server-actions";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaIdempotentWrites,
  agendaStudentProfiles,
  agendaTasks,
  familyAppProfiles,
} from "@informach/db/schema";
import { profileAccessCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import type { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, lockAgendaProfiles } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import type { statusNoticeActionSchema } from "@/features/notices/schemas";
import { setNoticeActionStatusWithinTx } from "@/features/notices/write-repository";
import { lockTaskSchoolContexts } from "@/features/turmas/transaction-repository";
import { logger } from "@/lib/logger";
import { type WriteReceipt, writeReceiptSchema } from "./schemas";
export const RECEIPT_RETENTION_DAYS = 7;

/** Receipt and mutation commit together. Replays never become access to current content. */
export async function applyTaskStatusOnce(params: {
  key: string;
  actor: AgendaAuthority;
  input: z.infer<typeof statusNoticeActionSchema>;
}): Promise<{ result: WriteReceipt; replayed: boolean }> {
  const { key, actor, input } = params;
  return db.transaction(async (tx) => {
    const schoolLocks = await lockTaskSchoolContexts(tx, { taskIds: [input.id] });
    // The family follows school dependencies and precedes the key/native rows.
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:idem:${actor.userId}:${key}`}))`,
    );
    const [stored] = await tx
      .select()
      .from(agendaIdempotentWrites)
      .where(
        and(
          eq(agendaIdempotentWrites.userId, actor.userId),
          eq(agendaIdempotentWrites.key, key),
          sql`${agendaIdempotentWrites.createdAt} > statement_timestamp() - interval '7 days'`,
        ),
      );
    if (stored && (stored.taskId !== input.id || stored.familyGroupId !== actor.familyGroupId))
      return { result: err({ code: "KEY_REUSED" }), replayed: false };
    const [task] = await tx
      .select({ profileId: agendaTasks.profileId })
      .from(agendaTasks)
      .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
      .where(and(eq(agendaTasks.id, input.id), agendaProfileCondition(actor, "write")));
    if (task) await lockAgendaProfiles(tx, actor, [task.profileId]);
    else {
      const [existing] = await tx
        .select({ id: agendaTasks.id })
        .from(agendaTasks)
        .where(eq(agendaTasks.id, input.id));
      if (existing || !stored) return { result: err({ code: "NOT_FOUND" }), replayed: false };
    }
    if (stored) {
      const parsed = writeReceiptSchema.safeParse(stored.result);
      if (parsed.success) return { result: parsed.data, replayed: true };
      logger.warn({ key }, "agenda.offline_queue.unreadable_receipt");
    }
    if (!task) return { result: err({ code: "NOT_FOUND" }), replayed: false };
    // A refused domain operation rolls its savepoint back; its refusal receipt
    // may still be committed, preserving the same answer on a network retry.
    const result: WriteReceipt = await atomicAgendaResult(
      (nested) => setNoticeActionStatusWithinTx(nested, actor, input, schoolLocks),
      tx,
    );
    await tx
      .insert(agendaIdempotentWrites)
      .values({
        key,
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        taskId: input.id,
        result,
      })
      .onConflictDoUpdate({
        target: [agendaIdempotentWrites.userId, agendaIdempotentWrites.key],
        set: {
          result,
          taskId: input.id,
          familyGroupId: actor.familyGroupId,
          createdAt: new Date(),
        },
      });
    return { result, replayed: false };
  });
}

/**
 * Retenção: recibo é lembrança de curto prazo.
 *
 * Sete dias cobrem com folga um aparelho que ficou sem rede uma semana. Guardar
 * para sempre transformaria a tabela num diário de tudo que a família concluiu,
 * que é justamente o que ela não precisa ser.
 */
export async function purgeExpiredIdempotentWrites(now: Date) {
  await db
    .delete(agendaIdempotentWrites)
    .where(
      sql`${agendaIdempotentWrites.createdAt} <= ${new Date(now.valueOf() - RECEIPT_RETENTION_DAYS * 86_400_000).toISOString()}::timestamptz`,
    );
}

/** Recover only a migrated history with current read AND write authority. No identity guessing. */
export async function resolveLegacyQueueContexts(userId: string, taskIds: readonly string[]) {
  const ids = [...new Set(taskIds)];
  if (!ids.length || ids.length > 100) return [];
  return db
    .select({ taskId: agendaTasks.id, familyGroupId: familyAppProfiles.groupId })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
    .where(
      and(
        inArray(agendaTasks.id, ids),
        eq(familyAppProfiles.app, "agenda-da-turma"),
        sql`${familyAppProfiles.sourceKey} = ${agendaStudentProfiles.id}::text`,
        profileAccessCondition(userId, "agenda-da-turma", familyAppProfiles.id, "read"),
        profileAccessCondition(userId, "agenda-da-turma", familyAppProfiles.id, "write"),
      ),
    );
}
