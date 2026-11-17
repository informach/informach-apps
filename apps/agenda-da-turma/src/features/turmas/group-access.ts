import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
  WebParticipationError,
} from "@informach/auth/web-participation";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaStudentProfiles,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { studentGroupId } from "@/features/family/scope";
import { generateUniqueTurmaCode } from "./repository";

/** Explicit classroom administration remains an account role, independent of household billing. */
export async function rotateGroupCode(userId: string, turmaId: string) {
  const code = await generateUniqueTurmaCode();
  return db
    .transaction(async (tx) => {
      const [group] = await tx
        .select({ id: agendaTurmas.id })
        .from(agendaTurmas)
        .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)))
        .for("update");
      if (!group) return err({ code: "FORBIDDEN" } as const);
      await lockActiveWebParticipation(tx, userId);
      const [row] = await tx
        .update(agendaTurmas)
        .set({ code, updatedAt: new Date() })
        .where(eq(agendaTurmas.id, turmaId))
        .returning({ code: agendaTurmas.code });
      return row ? ok(row) : err({ code: "FORBIDDEN" } as const);
    })
    .catch((error) => {
      if (error instanceof WebParticipationError) return err({ code: "FORBIDDEN" } as const);
      throw error;
    });
}
export async function listGroupAdults(userId: string, turmaId: string) {
  const [group] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(
      and(
        eq(agendaTurmas.id, turmaId),
        eq(agendaTurmas.createdByUserId, userId),
        activeWebParticipationCondition(userId),
      ),
    );
  if (!group) return null;
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(agendaTurmaMembers)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaTurmaMembers.turmaId))
    .innerJoin(users, eq(users.id, agendaTurmaMembers.enrolledByUserId))
    .where(
      and(
        eq(agendaTurmaMembers.turmaId, turmaId),
        eq(agendaTurmas.createdByUserId, userId),
        sql`${users.id} <> ${userId}`,
        activeWebParticipationCondition(userId),
      ),
    );
}
export async function removeGroupAdult(userId: string, turmaId: string, memberUserId: string) {
  if (userId === memberUserId) return err({ code: "FORBIDDEN" } as const);
  const newCode = await generateUniqueTurmaCode();
  return db
    .transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(agendaTurmas)
        .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)))
        .for("update");
      if (!group) return err({ code: "FORBIDDEN" } as const);
      await lockActiveWebParticipation(tx, userId);
      // An enrollment records the inviting adult; payer changes never change this authority.
      const locked = await tx
        .select({ id: agendaStudentProfiles.id })
        .from(agendaStudentProfiles)
        .where(
          inArray(
            agendaStudentProfiles.id,
            tx
              .select({ id: agendaTurmaMembers.studentProfileId })
              .from(agendaTurmaMembers)
              .where(
                and(
                  eq(agendaTurmaMembers.turmaId, turmaId),
                  eq(agendaTurmaMembers.enrolledByUserId, memberUserId),
                ),
              ),
          ),
        )
        .orderBy(agendaStudentProfiles.id)
        .for("update");
      if (!locked.length) return err({ code: "NOT_FOUND" } as const);
      const members = await tx
        .select({ id: agendaStudentProfiles.id, groupId: studentGroupId })
        .from(agendaStudentProfiles)
        .where(
          inArray(
            agendaStudentProfiles.id,
            locked.map((p) => p.id),
          ),
        );
      for (const member of members) {
        // System removal touches only incoming publications from this room, never private family tasks.
        await tx.delete(agendaTasks).where(
          and(
            eq(agendaTasks.profileId, member.id),
            inArray(
              agendaTasks.sharedActivityId,
              tx
                .select({ id: agendaActivities.id })
                .from(agendaActivities)
                .where(
                  and(
                    eq(agendaActivities.turmaId, turmaId),
                    sql`${agendaActivities.familyGroupId} IS DISTINCT FROM ${member.groupId}`,
                  ),
                ),
            ),
          ),
        );
      }
      const profileIds = members.map((m) => m.id);
      const groupIds = [...new Set(members.map((m) => m.groupId))];
      await tx
        .delete(agendaActivityAcceptances)
        .where(
          and(
            eq(agendaActivityAcceptances.userId, memberUserId),
            inArray(agendaActivityAcceptances.familyGroupId, groupIds),
            inArray(
              agendaActivityAcceptances.activityId,
              tx
                .select({ id: agendaActivities.id })
                .from(agendaActivities)
                .where(eq(agendaActivities.turmaId, turmaId)),
            ),
          ),
        );
      await tx
        .delete(agendaTurmaMembers)
        .where(
          and(
            eq(agendaTurmaMembers.turmaId, turmaId),
            inArray(agendaTurmaMembers.studentProfileId, profileIds),
          ),
        );
      await tx
        .update(agendaStudentProfiles)
        .set({ activeTurmaId: null, updatedAt: new Date() })
        .where(
          and(
            inArray(agendaStudentProfiles.id, profileIds),
            eq(agendaStudentProfiles.activeTurmaId, turmaId),
          ),
        );
      await tx
        .update(agendaTurmas)
        .set({ code: newCode, updatedAt: new Date() })
        .where(eq(agendaTurmas.id, turmaId));
      return ok({ removed: true });
    })
    .catch((error) => {
      if (error instanceof WebParticipationError) return err({ code: "FORBIDDEN" } as const);
      throw error;
    });
}
