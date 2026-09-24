import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { countPendingActivities, lockPendingLimit } from "@/features/activities/pending-limit";
import { accessibleProfileCondition } from "@/features/family/access";

export type StudySessionRow = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  estimatedMinutes: number | null;
};

export async function findStudySessions(
  userId: string,
  taskId: string,
): Promise<StudySessionRow[]> {
  return db
    .select({
      id: agendaTasks.id,
      title: agendaTasks.title,
      dueAt: agendaTasks.dueAt,
      status: agendaTasks.status,
      estimatedMinutes: agendaTasks.estimatedMinutes,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.studyForTaskId, taskId),
        sql`${agendaTasks.status} <> 'canceled'`,
        accessibleProfileCondition(userId),
      ),
    )
    .orderBy(agendaTasks.dueAt);
}

/**
 * O que a criança já tem marcado entre hoje e a prova.
 *
 * O plano ANTERIOR fica de fora: ele vai ser desfeito, e contá-lo faria o
 * replanejamento fugir justamente dos dias que ele libera.
 */
export async function findLoadUntilExam(
  userId: string,
  input: { profileId: string; taskId: string; fromIso: string; toIso: string },
) {
  return db
    .select({ dueAt: agendaTasks.dueAt, estimatedMinutes: agendaTasks.estimatedMinutes })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.profileId, input.profileId),
        eq(agendaTasks.status, "pending"),
        accessibleProfileCondition(userId),
        sql`(${agendaTasks.studyForTaskId} IS NULL OR ${agendaTasks.studyForTaskId} <> ${input.taskId})`,
        sql`${agendaTasks.dueAt} BETWEEN ${input.fromIso}::date AND ${input.toIso}::date`,
      ),
    );
}

export type NewStudySession = typeof agendaTasks.$inferInsert;

/**
 * Troca o plano de estudo de uma prova, sob a trava do limite de pendências.
 *
 * Toda decisão antes de qualquer escrita: um `return` de dentro de uma
 * transação Drizzle COMMITA, então cancelar o plano anterior e só então recusar
 * por limite apagaria o plano da família e não devolveria nada.
 */
export async function replaceStudyPlan(
  ownerId: string,
  taskId: string,
  sessions: NewStudySession[],
  isPro: boolean,
): Promise<{ created: number } | { limit: number; current: number }> {
  return db.transaction(async (tx) => {
    await lockPendingLimit(tx, ownerId);
    const replaced = await tx
      .select({ id: agendaTasks.id })
      .from(agendaTasks)
      .where(and(eq(agendaTasks.studyForTaskId, taskId), eq(agendaTasks.status, "pending")));
    const pending = await countPendingActivities(tx, ownerId);
    // O plano anterior sai da conta: ele será cancelado nesta mesma transação.
    if (!isPro && pending - replaced.length + sessions.length > FREE_ACTIVITY_LIMIT)
      return { limit: FREE_ACTIVITY_LIMIT, current: pending };
    if (replaced.length)
      await tx
        .update(agendaTasks)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(agendaTasks.studyForTaskId, taskId), eq(agendaTasks.status, "pending")));
    const created = await tx.insert(agendaTasks).values(sessions).returning({ id: agendaTasks.id });
    return { created: created.length };
  });
}

export async function cancelStudySessions(ids: string[]) {
  if (!ids.length) return 0;
  const canceled = await db
    .update(agendaTasks)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(inArray(agendaTasks.id, ids), eq(agendaTasks.status, "pending")))
    .returning({ id: agendaTasks.id });
  return canceled.length;
}
