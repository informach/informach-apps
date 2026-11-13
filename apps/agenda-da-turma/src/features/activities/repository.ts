import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, asc, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, lockAgendaProfiles } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { actionFingerprint } from "@/features/notices/write-repository";
import { groupStudentIds } from "@/features/students/repository";
import { lockTaskSchoolContexts } from "@/features/turmas/transaction-repository";
import { todayLocalIso } from "../dashboard/date";
import type { RespondSharedActivityInput } from "./schemas";

async function coveredProfiles(tx: FamilyTransaction, actor: AgendaAuthority) {
  const access = await agendaAccessInTransaction(tx, actor);
  return (await groupStudentIds(tx, actor)).slice(0, access.profileLimit).map((p) => p.id);
}
function participant(actor: AgendaAuthority, ids: string[]) {
  return and(
    inArray(agendaStudentProfiles.id, ids),
    agendaProfileCondition(actor),
    agendaProfileCondition(actor, "write"),
    sql`EXISTS (SELECT 1 FROM ${agendaTurmaMembers} WHERE ${agendaTurmaMembers.studentProfileId} = ${agendaStudentProfiles.id} AND ${agendaTurmaMembers.turmaId} = ${agendaStudentProfiles.activeTurmaId})`,
  );
}
export async function upsertAcceptanceAndTasks(
  actor: AgendaAuthority,
  input: RespondSharedActivityInput,
) {
  return atomicAgendaResult(async (tx) => {
    const [observed] = await tx
      .select({ turmaId: agendaActivities.turmaId })
      .from(agendaActivities)
      .where(eq(agendaActivities.id, input.activityId));
    if (!observed) return err({ code: "NOT_FOUND" } as const);
    await lockTaskSchoolContexts(tx, { classIds: [observed.turmaId] });
    const ids = await coveredProfiles(tx, actor);
    if (!ids.length) return err({ code: "NOT_A_MEMBER" } as const);
    const profiles = await tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(
        and(participant(actor, ids), eq(agendaStudentProfiles.activeTurmaId, observed.turmaId)),
      )
      .orderBy(agendaStudentProfiles.id);
    if (!profiles.length) return err({ code: "NOT_A_MEMBER" } as const);
    await lockAgendaProfiles(
      tx,
      actor,
      profiles.map((p) => p.id),
    );
    const [activity] = await tx
      .select()
      .from(agendaActivities)
      .where(
        and(
          eq(agendaActivities.id, input.activityId),
          eq(agendaActivities.turmaId, observed.turmaId),
        ),
      )
      .for("update");
    if (!activity || activity.canceledAt) return err({ code: "NOT_FOUND" } as const);
    if (activity.visibility !== "shared_with_turma") return err({ code: "NOT_SHARED" } as const);
    if (activity.familyGroupId === actor.familyGroupId) return err({ code: "FORBIDDEN" } as const);
    if (activity.dueAt < todayLocalIso()) return err({ code: "DUE_DATE_PASSED" } as const);
    await tx
      .insert(agendaActivityAcceptances)
      .values({
        activityId: activity.id,
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        accepted: input.accepted,
      })
      .onConflictDoUpdate({
        target: [
          agendaActivityAcceptances.activityId,
          agendaActivityAcceptances.userId,
          agendaActivityAcceptances.familyGroupId,
        ],
        set: { accepted: input.accepted, respondedAt: new Date() },
      });
    if (input.accepted)
      await tx
        .insert(agendaTasks)
        .values(
          profiles.map((profile) => ({
            sharedActivityId: activity.id,
            profileId: profile.id,
            createdByUserId: activity.createdByUserId,
            type: activity.type,
            subjectId: activity.subjectId,
            title: activity.title,
            description: activity.description,
            dueAt: activity.dueAt,
            dateOrigin: "school" as const,
            fingerprint: actionFingerprint(activity),
          })),
        )
        .onConflictDoNothing({
          target: [agendaTasks.sharedActivityId, agendaTasks.profileId],
          where: sql`${agendaTasks.sharedActivityId} IS NOT NULL`,
        });
    return ok({ activityId: activity.id, accepted: input.accepted });
  });
}
export async function listPendingSharedActivitiesForUser(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    const ids = await coveredProfiles(tx, actor);
    if (!ids.length) return [];
    return tx
      .select({
        activityId: agendaActivities.id,
        turmaId: agendaActivities.turmaId,
        type: agendaActivities.type,
        title: agendaActivities.title,
        description: agendaActivities.description,
        dueAt: agendaActivities.dueAt,
        subjectName: agendaSubjects.name,
        subjectColorIndex: agendaSubjects.colorIndex,
        schoolName: agendaSchools.name,
        grade: agendaTurmas.grade,
        classLetter: agendaTurmas.classLetter,
        year: agendaTurmas.year,
        createdByUserId: agendaActivities.createdByUserId,
        createdByUserName: users.name,
      })
      .from(agendaActivities)
      .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaActivities.subjectId))
      .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaActivities.turmaId))
      .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
      .leftJoin(users, eq(users.id, agendaActivities.createdByUserId))
      .where(
        and(
          eq(agendaActivities.visibility, "shared_with_turma"),
          sql`${agendaActivities.canceledAt} IS NULL`,
          sql`${agendaActivities.familyGroupId} IS DISTINCT FROM ${actor.familyGroupId}::uuid`,
          sql`${agendaActivities.dueAt} >= ${todayLocalIso()}`,
          sql`EXISTS (SELECT 1 FROM ${agendaStudentProfiles} WHERE ${agendaStudentProfiles.activeTurmaId} = ${agendaActivities.turmaId} AND ${participant(actor, ids)})`,
          sql`NOT EXISTS (SELECT 1 FROM ${agendaActivityAcceptances} WHERE ${agendaActivityAcceptances.activityId} = ${agendaActivities.id}
          AND ${agendaActivityAcceptances.userId} = ${actor.userId} AND ${agendaActivityAcceptances.familyGroupId} = ${actor.familyGroupId}::uuid)`,
        ),
      )
      .orderBy(asc(agendaActivities.dueAt), asc(agendaActivities.createdAt))
      .limit(200);
  });
}
