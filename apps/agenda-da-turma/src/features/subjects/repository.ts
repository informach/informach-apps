import "server-only";
import { and, asc, db, eq, inArray, sql } from "@informach/db";
import {
  agendaStudentProfiles,
  agendaSubjectAlternatingSlots,
  agendaSubjects,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, studentName } from "@/features/family/scope";
import { classroomReadCondition } from "@/features/turmas/scope-repository";
import type { Subject } from "./types";

const subjectFields = {
  id: agendaSubjects.id,
  turmaId: agendaSubjects.turmaId,
  name: agendaSubjects.name,
  teacherName: agendaSubjects.teacherName,
  colorIndex: agendaSubjects.colorIndex,
  classDays: agendaSubjects.classDays,
  createdByUserId: agendaSubjects.createdByUserId,
  createdAt: agendaSubjects.createdAt,
  updatedAt: agendaSubjects.updatedAt,
};
const slotFields = {
  id: agendaSubjectAlternatingSlots.id,
  subjectId: agendaSubjectAlternatingSlots.subjectId,
  dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
  pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
  anchorDate: agendaSubjectAlternatingSlots.anchorDate,
};
export type SubjectRow = Omit<Subject, "alternatingSlots">;
export function classroomWriteCondition(actor: AgendaAuthority) {
  return sql<boolean>`${agendaTurmas.createdByUserId} = ${actor.userId} OR EXISTS (
    SELECT 1 FROM ${agendaTurmaMembers} JOIN ${agendaStudentProfiles}
    ON ${agendaStudentProfiles.id} = ${agendaTurmaMembers.studentProfileId}
    WHERE ${agendaTurmaMembers.turmaId} = ${agendaTurmas.id}
    AND ${agendaProfileCondition(actor)} AND ${agendaProfileCondition(actor, "write")}
  )`;
}
export async function canContributeToClass(actor: AgendaAuthority, turmaId: string) {
  const [row] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(and(eq(agendaTurmas.id, turmaId), classroomWriteCondition(actor)));
  return Boolean(row);
}
export async function listSubjectsForTurma(
  actor: AgendaAuthority,
  turmaId: string,
): Promise<SubjectRow[]> {
  return db
    .select(subjectFields)
    .from(agendaSubjects)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaSubjects.turmaId))
    .where(and(eq(agendaSubjects.turmaId, turmaId), classroomReadCondition(actor)))
    .orderBy(asc(agendaSubjects.name));
}
export async function attachAlternatingSlots(
  actor: AgendaAuthority,
  rows: readonly SubjectRow[],
): Promise<Subject[]> {
  if (!rows.length) return [];
  // Reload both subject and slots with current access; a preceding read is never a capability.
  const subjects = await db
    .select(subjectFields)
    .from(agendaSubjects)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaSubjects.turmaId))
    .where(
      and(
        inArray(
          agendaSubjects.id,
          rows.map((r) => r.id),
        ),
        classroomReadCondition(actor),
      ),
    )
    .orderBy(asc(agendaSubjects.name));
  const slots = await db
    .select(slotFields)
    .from(agendaSubjectAlternatingSlots)
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaSubjectAlternatingSlots.subjectId))
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaSubjects.turmaId))
    .where(
      and(
        inArray(
          agendaSubjectAlternatingSlots.subjectId,
          rows.map((r) => r.id),
        ),
        classroomReadCondition(actor),
      ),
    );
  return subjects.map((subject) => ({
    ...subject,
    alternatingSlots: slots.filter((slot) => slot.subjectId === subject.id),
  }));
}

/** Explicit child attribution for class AI; being the classroom creator is not an AI grant. */
export function listAiProfilesForClass(actor: AgendaAuthority, turmaId: string) {
  return db
    .select({ id: agendaStudentProfiles.id, name: studentName })
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
        agendaProfileCondition(actor, "use_ai"),
      ),
    )
    .orderBy(agendaStudentProfiles.createdAt, agendaStudentProfiles.id);
}
