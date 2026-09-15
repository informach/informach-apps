import "server-only";
import { err, ok } from "@informach/auth/server-actions";
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
import { generateUniqueTurmaCode } from "./repository";

export async function joinPrivateGroup(userId: string, profileId: string, code: string) {
  return db.transaction(async (tx) => {
    const [turma] = await tx
      .select()
      .from(agendaTurmas)
      .where(eq(agendaTurmas.code, code))
      .for("update");
    if (!turma?.createdByUserId) return null;
    const [profile] = await tx
      .select()
      .from(agendaStudentProfiles)
      .where(and(eq(agendaStudentProfiles.id, profileId), eq(agendaStudentProfiles.userId, userId)))
      .for("update");
    if (!profile) return null;
    await tx
      .insert(agendaTurmaMembers)
      .values({ turmaId: turma.id, studentProfileId: profileId })
      .onConflictDoNothing();
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: turma.id, updatedAt: new Date() })
      .where(eq(agendaStudentProfiles.id, profileId));
    return turma;
  });
}

export async function rotateGroupCode(userId: string, turmaId: string) {
  const code = await generateUniqueTurmaCode();
  const [row] = await db
    .update(agendaTurmas)
    .set({ code, updatedAt: new Date() })
    .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)))
    .returning({ code: agendaTurmas.code });
  return row ? ok(row) : err({ code: "FORBIDDEN" } as const);
}

export async function listGroupAdults(userId: string, turmaId: string) {
  const [group] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)));
  if (!group) return null;
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .innerJoin(users, eq(users.id, agendaStudentProfiles.userId))
    .where(and(eq(agendaTurmaMembers.turmaId, turmaId), sql`${users.id} <> ${userId}`));
}

export async function removeGroupAdult(userId: string, turmaId: string, memberUserId: string) {
  if (userId === memberUserId) return err({ code: "FORBIDDEN" } as const);
  const newCode = await generateUniqueTurmaCode();
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(agendaTurmas)
      .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)))
      .for("update");
    if (!group) return err({ code: "FORBIDDEN" } as const);
    const profiles = tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.userId, memberUserId));
    // Revocation removes this group's incoming shared data, retaining work authored by that adult.
    await tx.delete(agendaTasks).where(
      and(
        inArray(agendaTasks.profileId, profiles),
        inArray(
          agendaTasks.sharedActivityId,
          tx
            .select({ id: agendaActivities.id })
            .from(agendaActivities)
            .where(
              and(
                eq(agendaActivities.turmaId, turmaId),
                sql`${agendaActivities.createdByUserId} IS DISTINCT FROM ${memberUserId}`,
              ),
            ),
        ),
      ),
    );
    await tx
      .delete(agendaActivityAcceptances)
      .where(
        and(
          eq(agendaActivityAcceptances.userId, memberUserId),
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
          inArray(agendaTurmaMembers.studentProfileId, profiles),
        ),
      );
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agendaStudentProfiles.userId, memberUserId),
          eq(agendaStudentProfiles.activeTurmaId, turmaId),
        ),
      );
    await tx
      .update(agendaTurmas)
      .set({ code: newCode, updatedAt: new Date() })
      .where(eq(agendaTurmas.id, turmaId));
    return ok({ removed: true });
  });
}
