import "server-only";
import { err, ok, type Result } from "@informach/auth/server-actions";
import { and, asc, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaStudentProfiles,
  agendaSubjectAlternatingSlots,
  agendaSubjectKits,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import { lockTaskSchoolContexts } from "@/features/turmas/transaction-repository";
import { syncAlternatingSlotsForSubject } from "./alternating-slots-repository";
import type {
  CreateSubjectInput,
  CreateSubjectsBatchInput,
  DeleteSubjectInput,
  UpdateSubjectInput,
} from "./schemas";
import type {
  BatchSubjectResultItem,
  CreateSubjectSuccess,
  CreateSubjectsBatchResult,
  SubjectError,
} from "./service";
import type { AlternatingSlotInput, Subject } from "./types";
import { isMinorNameEdit, pickAvailableColorIndex } from "./utils";
import { validateSlotsAgainstClassDays } from "./validation";

/** Must follow the classroom lock; enrolled writers need current read + write and coverage. */
async function lockSchoolWrite(tx: FamilyTransaction, actor: AgendaAuthority, turmaId: string) {
  const [classroom] = await tx.select().from(agendaTurmas).where(eq(agendaTurmas.id, turmaId));
  requireFamilyCondition(classroom, "ACCESS_DENIED");
  if (classroom.createdByUserId === actor.userId) return;
  const [profile] = await tx
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .innerJoin(
      agendaTurmaMembers,
      eq(agendaTurmaMembers.studentProfileId, agendaStudentProfiles.id),
    )
    .where(
      and(
        eq(agendaTurmaMembers.turmaId, turmaId),
        agendaProfileCondition(actor),
        agendaProfileCondition(actor, "write"),
      ),
    )
    .orderBy(asc(agendaStudentProfiles.createdAt), asc(agendaStudentProfiles.id))
    .limit(1);
  requireFamilyCondition(profile);
  await lockAgendaUse(tx, actor, [profile.id]);
}
async function fullSubject(
  tx: FamilyTransaction,
  subject: typeof agendaSubjects.$inferSelect,
): Promise<Subject> {
  const slots = await tx
    .select()
    .from(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.subjectId, subject.id));
  return { ...subject, alternatingSlots: slots };
}
async function validatePairs(
  tx: FamilyTransaction,
  turmaId: string,
  subjectId: string,
  slots: readonly AlternatingSlotInput[],
) {
  for (const slot of slots) {
    if (slot.pairedSubjectId === subjectId) return false;
    const [paired] = await tx
      .select({ days: agendaSubjects.classDays })
      .from(agendaSubjects)
      .where(and(eq(agendaSubjects.id, slot.pairedSubjectId), eq(agendaSubjects.turmaId, turmaId)));
    if (!paired?.days.includes(slot.dayOfWeek)) return false;
  }
  return true;
}
async function insertSubject(
  tx: FamilyTransaction,
  actor: AgendaAuthority,
  input: CreateSubjectInput,
): Promise<Result<CreateSubjectSuccess, SubjectError>> {
  const validation = validateSlotsAgainstClassDays(input.alternatingSlots, input.classDays);
  if (validation) return err(validation);
  const [existing] = await tx
    .select()
    .from(agendaSubjects)
    .where(and(eq(agendaSubjects.turmaId, input.turmaId), eq(agendaSubjects.name, input.name)));
  if (existing) {
    const teacherName = existing.teacherName === null && input.teacherName != null;
    const classDays = existing.classDays.length === 0 && input.classDays.length > 0;
    if (!teacherName && !classDays)
      return ok({
        subject: await fullSubject(tx, existing),
        status: "merged_noop",
        filled: { teacherName, classDays },
      });
    const [updated] = await tx
      .update(agendaSubjects)
      .set({
        teacherName: teacherName ? input.teacherName : existing.teacherName,
        classDays: classDays ? input.classDays : existing.classDays,
        updatedAt: new Date(),
      })
      .where(eq(agendaSubjects.id, existing.id))
      .returning();
    requireFamilyCondition(updated, "ACCESS_DENIED");
    return ok({
      subject: await fullSubject(tx, updated),
      status: "merged_filled",
      filled: { teacherName, classDays },
    });
  }
  const colors = await tx
    .select({ color: agendaSubjects.colorIndex })
    .from(agendaSubjects)
    .where(eq(agendaSubjects.turmaId, input.turmaId));
  const [inserted] = await tx
    .insert(agendaSubjects)
    .values({
      turmaId: input.turmaId,
      name: input.name,
      teacherName: input.teacherName ?? null,
      classDays: input.classDays,
      colorIndex: pickAvailableColorIndex(
        input.name,
        colors.map((c) => c.color),
      ),
      createdByUserId: actor.userId,
    })
    .returning();
  requireFamilyCondition(inserted, "ACCESS_DENIED");
  if (!(await validatePairs(tx, input.turmaId, inserted.id, input.alternatingSlots)))
    return err({ code: "INVALID_PAIRED_SUBJECT" });
  await syncAlternatingSlotsForSubject(inserted.id, input.alternatingSlots, tx);
  return ok({
    subject: await fullSubject(tx, inserted),
    status: "created",
    filled: { teacherName: false, classDays: false },
  });
}
export async function createSubject(actor: AgendaAuthority, input: CreateSubjectInput) {
  return atomicAgendaResult(async (tx) => {
    await lockTaskSchoolContexts(tx, { classIds: [input.turmaId] });
    await lockSchoolWrite(tx, actor, input.turmaId);
    return insertSubject(tx, actor, input);
  });
}
export async function createSubjectsBatch(
  actor: AgendaAuthority,
  input: CreateSubjectsBatchInput,
): Promise<Result<CreateSubjectsBatchResult, SubjectError>> {
  return atomicAgendaResult(async (tx) => {
    await lockTaskSchoolContexts(tx, { classIds: [input.turmaId] });
    await lockSchoolWrite(tx, actor, input.turmaId);
    const items: BatchSubjectResultItem[] = [];
    const counts = { created: 0, merged: 0, skipped: 0 };
    for (const subject of input.subjects) {
      const result = await insertSubject(tx, actor, {
        ...subject,
        turmaId: input.turmaId,
        alternatingSlots: [],
      });
      if (!result.ok) return result;
      const status =
        result.value.status === "created"
          ? "created"
          : result.value.status === "merged_filled"
            ? "merged"
            : "skipped";
      items.push({ name: subject.name, id: result.value.subject.id, status });
      counts[status]++;
    }
    return ok({ items, counts, turmaId: input.turmaId });
  });
}
async function lockExisting(tx: FamilyTransaction, actor: AgendaAuthority, id: string) {
  await lockTaskSchoolContexts(tx, { subjectIds: [id] });
  const [subject] = await tx.select().from(agendaSubjects).where(eq(agendaSubjects.id, id));
  requireFamilyCondition(subject, "ACCESS_DENIED");
  await lockSchoolWrite(tx, actor, subject.turmaId);
  return subject;
}
async function subjectInUse(tx: FamilyTransaction, id: string) {
  const [row] = await tx.execute<{ used: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${agendaTasks} WHERE ${agendaTasks.subjectId} = ${id}) OR EXISTS (SELECT 1 FROM ${agendaActivities} WHERE ${agendaActivities.subjectId} = ${id}) OR EXISTS (SELECT 1 FROM ${agendaSubjectKits} WHERE ${agendaSubjectKits.subjectId} = ${id}) AS used`,
  );
  return row?.used ?? false;
}
export async function updateSubject(
  actor: AgendaAuthority,
  input: UpdateSubjectInput,
): Promise<Result<Subject, SubjectError>> {
  return atomicAgendaResult(async (tx) => {
    const subject = await lockExisting(tx, actor, input.id);
    if (subject.createdByUserId !== actor.userId) return err({ code: "FORBIDDEN" });
    if (subject.name !== input.name) {
      const [duplicate] = await tx
        .select({ id: agendaSubjects.id })
        .from(agendaSubjects)
        .where(
          and(
            eq(agendaSubjects.turmaId, subject.turmaId),
            eq(agendaSubjects.name, input.name),
            sql`${agendaSubjects.id} <> ${subject.id}`,
          ),
        );
      if (duplicate) return err({ code: "DUPLICATE" });
      if ((await subjectInUse(tx, subject.id)) && !isMinorNameEdit(subject.name, input.name))
        return err({ code: "NAME_CHANGE_TOO_BIG" });
    }
    const validation = validateSlotsAgainstClassDays(input.alternatingSlots, input.classDays);
    if (validation) return err(validation);
    if (!(await validatePairs(tx, subject.turmaId, subject.id, input.alternatingSlots)))
      return err({ code: "INVALID_PAIRED_SUBJECT" });
    const [updated] = await tx
      .update(agendaSubjects)
      .set({
        name: input.name,
        teacherName: input.teacherName ?? null,
        classDays: input.classDays,
        updatedAt: new Date(),
      })
      .where(eq(agendaSubjects.id, subject.id))
      .returning();
    requireFamilyCondition(updated, "ACCESS_DENIED");
    await syncAlternatingSlotsForSubject(updated.id, input.alternatingSlots, tx);
    return ok(await fullSubject(tx, updated));
  });
}
export async function deleteSubject(
  actor: AgendaAuthority,
  input: DeleteSubjectInput,
): Promise<Result<true, SubjectError>> {
  return atomicAgendaResult(async (tx) => {
    const subject = await lockExisting(tx, actor, input.id);
    if (subject.createdByUserId !== actor.userId) return err({ code: "FORBIDDEN" });
    if (await subjectInUse(tx, subject.id)) return err({ code: "IN_USE" });
    await tx.delete(agendaSubjects).where(eq(agendaSubjects.id, subject.id));
    return ok(true);
  });
}
