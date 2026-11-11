import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaStudentProfiles,
  agendaSubjectKits,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { lockAgendaProfiles, studentGroupId } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import { findTurmaWithSchoolById, generateRandomCode } from "./repository";
import type { CreateTurmaInput, UpdateTurmaInput } from "./schemas";
import { lockTaskSchoolContexts } from "./transaction-repository";

async function lockCreatorKey(tx: FamilyTransaction, userId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agenda-school-owner:${userId}`}, 0))`,
  );
}
async function enroll(
  tx: FamilyTransaction,
  actor: AgendaAuthority,
  profileId: string,
  turmaId: string,
) {
  await lockAgendaUse(tx, actor, [profileId], "manage");
  await tx
    .insert(agendaTurmaMembers)
    .values({ turmaId, studentProfileId: profileId, enrolledByUserId: actor.userId })
    .onConflictDoNothing();
  await tx
    .update(agendaStudentProfiles)
    .set({ activeTurmaId: turmaId, updatedAt: new Date() })
    .where(eq(agendaStudentProfiles.id, profileId));
}
export async function createAndEnroll(actor: AgendaAuthority, input: CreateTurmaInput) {
  return atomicAgendaResult(async (tx) => {
    await lockCreatorKey(tx, actor.userId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const fields = {
        schoolInepCode: input.schoolInepCode,
        grade: input.grade,
        year: input.year,
        classLetter: input.classLetter,
        shift: input.shift ?? "unspecified",
        createdByUserId: actor.userId,
      };
      const [inserted] = await tx
        .insert(agendaTurmas)
        .values({ ...fields, code: generateRandomCode() })
        .onConflictDoNothing()
        .returning();
      const [existing] = inserted
        ? [inserted]
        : await tx
            .select()
            .from(agendaTurmas)
            .where(
              and(
                eq(agendaTurmas.schoolInepCode, fields.schoolInepCode),
                eq(agendaTurmas.grade, fields.grade),
                eq(agendaTurmas.year, fields.year),
                eq(agendaTurmas.classLetter, fields.classLetter),
                eq(agendaTurmas.shift, fields.shift),
                eq(agendaTurmas.createdByUserId, actor.userId),
              ),
            )
            .for("update");
      if (!existing) continue;
      await enroll(tx, actor, input.profileId, existing.id);
      const turma = await findTurmaWithSchoolById(actor, existing.id, tx);
      if (!turma) return err({ code: "TURMA_NOT_FOUND" } as const);
      return ok({ turma, code: existing.code, created: Boolean(inserted) });
    }
    return err({ code: "CONFLICT_EXISTING_TURMA" } as const);
  });
}
export async function joinPrivateGroup(actor: AgendaAuthority, profileId: string, code: string) {
  return atomicAgendaResult(async (tx) => {
    const [group] = await tx
      .select()
      .from(agendaTurmas)
      .where(eq(agendaTurmas.code, code))
      .for("update");
    if (!group?.createdByUserId) return err({ code: "TURMA_NOT_FOUND" } as const);
    await enroll(tx, actor, profileId, group.id);
    const turma = await findTurmaWithSchoolById(actor, group.id, tx);
    return turma ? ok({ turma }) : err({ code: "TURMA_NOT_FOUND" } as const);
  });
}
export async function setActiveTurma(
  actor: AgendaAuthority,
  profileId: string,
  turmaId: string | null,
) {
  return atomicAgendaResult(async (tx) => {
    await lockTaskSchoolContexts(tx, { classIds: turmaId ? [turmaId] : [] });
    await lockAgendaUse(tx, actor, [profileId], "manage");
    if (turmaId) {
      const [member] = await tx
        .select({ id: agendaTurmaMembers.id })
        .from(agendaTurmaMembers)
        .where(
          and(
            eq(agendaTurmaMembers.turmaId, turmaId),
            eq(agendaTurmaMembers.studentProfileId, profileId),
          ),
        );
      if (!member) return err({ code: "NOT_A_MEMBER" } as const);
    }
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: turmaId, updatedAt: new Date() })
      .where(eq(agendaStudentProfiles.id, profileId));
    return ok(true as const);
  });
}
/** Detach membership without deleting the child's existing personal work. */
export async function deleteTurmaMember(
  actor: AgendaAuthority,
  profileId: string,
  turmaId: string,
) {
  return atomicAgendaResult(async (tx) => {
    await lockTaskSchoolContexts(tx, { classIds: [turmaId] });
    await lockAgendaProfiles(tx, actor, [profileId], "manage");
    const removed = await tx
      .delete(agendaTurmaMembers)
      .where(
        and(
          eq(agendaTurmaMembers.turmaId, turmaId),
          eq(agendaTurmaMembers.studentProfileId, profileId),
        ),
      )
      .returning({ id: agendaTurmaMembers.id });
    if (!removed.length) return err({ code: "NOT_A_MEMBER" } as const);
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agendaStudentProfiles.id, profileId),
          eq(agendaStudentProfiles.activeTurmaId, turmaId),
        ),
      );
    return ok(true as const);
  });
}
async function lockFreshClass(tx: FamilyTransaction, actor: AgendaAuthority, turmaId: string) {
  await lockTaskSchoolContexts(tx, { classIds: [turmaId] });
  const [group] = await tx.select().from(agendaTurmas).where(eq(agendaTurmas.id, turmaId));
  if (!group) return err({ code: "TURMA_NOT_FOUND" } as const);
  if (group.createdByUserId !== actor.userId) return err({ code: "FORBIDDEN" } as const);
  const members = await tx
    .select({ id: agendaStudentProfiles.id, groupId: studentGroupId })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(eq(agendaTurmaMembers.turmaId, turmaId));
  if (members.some((m) => m.groupId !== actor.familyGroupId))
    return err({ code: "HAS_OTHER_MEMBERS" } as const);
  if (members.length)
    await lockAgendaProfiles(
      tx,
      actor,
      members.map((m) => m.id),
      "manage",
    );
  const [publication] = await tx
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(eq(agendaActivities.turmaId, turmaId))
    .limit(1);
  // Private school tasks also block deletion: deleting subjects must not silently detach their history.
  const [task] = await tx
    .select({ id: agendaTasks.id })
    .from(agendaTasks)
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaTasks.subjectId))
    .where(eq(agendaSubjects.turmaId, turmaId))
    .limit(1);
  const [kit] = await tx
    .select({ id: agendaSubjectKits.id })
    .from(agendaSubjectKits)
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaSubjectKits.subjectId))
    .where(eq(agendaSubjects.turmaId, turmaId))
    .limit(1);
  if (publication || task || kit) return err({ code: "HAS_ACTIVITIES" } as const);
  return ok(group);
}
export async function mutateFreshClass(
  actor: AgendaAuthority,
  turmaId: string,
  patch?: UpdateTurmaInput,
) {
  return atomicAgendaResult(async (tx) => {
    await lockCreatorKey(tx, actor.userId);
    const locked = await lockFreshClass(tx, actor, turmaId);
    if (!locked.ok) return locked;
    if (!patch) {
      await tx.delete(agendaTurmas).where(eq(agendaTurmas.id, turmaId));
      return ok(true as const);
    }
    const current = locked.value;
    const [conflict] = await tx
      .select({ id: agendaTurmas.id })
      .from(agendaTurmas)
      .where(
        and(
          eq(agendaTurmas.schoolInepCode, current.schoolInepCode),
          eq(agendaTurmas.createdByUserId, actor.userId),
          eq(agendaTurmas.grade, patch.grade),
          eq(agendaTurmas.year, patch.year),
          eq(agendaTurmas.classLetter, patch.classLetter),
          eq(agendaTurmas.shift, patch.shift ?? current.shift),
          sql`${agendaTurmas.id} <> ${turmaId}`,
        ),
      );
    if (conflict) return err({ code: "CONFLICT_EXISTING_TURMA" } as const);
    await tx
      .update(agendaTurmas)
      .set({
        grade: patch.grade,
        year: patch.year,
        classLetter: patch.classLetter,
        shift: patch.shift,
        updatedAt: new Date(),
      })
      .where(eq(agendaTurmas.id, turmaId));
    return ok(true as const);
  });
}
