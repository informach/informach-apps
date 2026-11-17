import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { countPendingActivities } from "@/features/activities/pending-limit";
import { accessibleProfileCondition } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition } from "@/features/family/scope";
import { lockAgendaUse } from "@/features/family/use-repository";
import { activeProfileSubjectCondition } from "@/features/profile-subjects/visibility";
import {
  assertTaskSchoolContexts,
  lockTaskSchoolContexts,
} from "@/features/turmas/transaction-repository";
import { MAX_STUDY_SESSIONS } from "./plan";

export type StudySessionRow = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  estimatedMinutes: number | null;
};

export async function findStudySessions(
  actor: AgendaAuthority,
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
        accessibleProfileCondition(actor),
      ),
    )
    .orderBy(agendaTasks.dueAt);
}

/**
 * O que a criança já tem marcado entre hoje e a prova.
 *
 * O plano ANTERIOR fica de fora: ele vai ser desfeito, e contá-lo faria o
 * replanejamento fugir justamente dos dias que ele libera.
 *
 * Compõe `activeProfileSubjectCondition` como toda consulta que diz o que a
 * família ainda tem a fazer. Sem ele, a atividade de uma matéria extracurricular
 * PAUSADA — que a tela esconde — encheria um dia e empurraria a sessão de estudo
 * para outro, sem nenhuma causa visível. É o mesmo defeito que já fez o limite
 * do plano gratuito contar o que a tela não mostrava.
 */
export async function findLoadUntilExam(
  actor: AgendaAuthority,
  input: { profileId: string; taskId: string; fromIso: string; toIso: string },
) {
  return db
    .select({
      dueAt: agendaTasks.dueAt,
      estimatedMinutes: agendaTasks.estimatedMinutes,
      // O tipo vai junto para `summarizeDayLoad` separar entrega de sessão de
      // estudo: três sessões de OUTRA prova ocupam o dia, mas não são três
      // entregas.
      type: agendaTasks.type,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.profileId, input.profileId),
        eq(agendaTasks.status, "pending"),
        accessibleProfileCondition(actor),
        activeProfileSubjectCondition,
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
async function lockExam(tx: FamilyTransaction, actor: AgendaAuthority, taskId: string) {
  const schoolLocks = await lockTaskSchoolContexts(tx, { taskIds: [taskId] });
  await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
  const [candidate] = await tx
    .select({ profileId: agendaTasks.profileId })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaTasks.id, taskId), agendaProfileCondition(actor)));
  requireFamilyCondition(candidate);
  const access = await lockAgendaUse(tx, actor, [candidate.profileId]);
  const [task] = await tx
    .select()
    .from(agendaTasks)
    .where(and(eq(agendaTasks.id, taskId), eq(agendaTasks.profileId, candidate.profileId)))
    .for("update");
  requireFamilyCondition(task);
  await assertTaskSchoolContexts(tx, schoolLocks, { taskIds: [taskId] });
  return { task, access };
}
export async function replaceStudyPlan(
  actor: AgendaAuthority,
  taskId: string,
  expectedVersion: number,
  sessions: NewStudySession[],
): Promise<{ created: number } | { limit: number; current: number } | { conflict: true }> {
  return db.transaction(async (tx) => {
    const { task, access } = await lockExam(tx, actor, taskId);
    if (
      task.version !== expectedVersion ||
      task.status === "canceled" ||
      !task.dueAt ||
      !["exam", "project"].includes(task.type)
    )
      return { conflict: true };
    requireFamilyCondition(
      sessions.length > 0 &&
        sessions.length <= MAX_STUDY_SESSIONS &&
        sessions.every(
          (session) =>
            session.profileId === task.profileId &&
            session.studyForTaskId === taskId &&
            session.createdByUserId === actor.userId &&
            session.type === "study" &&
            typeof session.dueAt === "string" &&
            session.dueAt < (task.dueAt ?? "") &&
            session.subjectId === task.subjectId &&
            session.profileSubjectId === task.profileSubjectId,
        ),
      "INVALID_INPUT",
    );
    const scope = and(
      eq(agendaTasks.studyForTaskId, taskId),
      eq(agendaTasks.profileId, task.profileId),
      eq(agendaTasks.status, "pending"),
    );
    const replaced = await tx.select({ id: agendaTasks.id }).from(agendaTasks).where(scope);
    const pending = await countPendingActivities(tx, actor);
    if (!access.enabled && pending - replaced.length + sessions.length > FREE_ACTIVITY_LIMIT)
      return { limit: FREE_ACTIVITY_LIMIT, current: pending };
    if (replaced.length)
      await tx
        .update(agendaTasks)
        .set({
          status: "canceled",
          version: sql`${agendaTasks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(scope);
    const created = await tx.insert(agendaTasks).values(sessions).returning({ id: agendaTasks.id });
    return { created: created.length };
  });
}
export async function cancelStudySessions(actor: AgendaAuthority, taskId: string) {
  return db.transaction(async (tx) => {
    const { task } = await lockExam(tx, actor, taskId);
    const canceled = await tx
      .update(agendaTasks)
      .set({ status: "canceled", version: sql`${agendaTasks.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(agendaTasks.studyForTaskId, taskId),
          eq(agendaTasks.profileId, task.profileId),
          eq(agendaTasks.status, "pending"),
        ),
      )
      .returning({ id: agendaTasks.id });
    return canceled.length;
  });
}
