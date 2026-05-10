import "server-only";

import { and, asc, db, eq, sql } from "@informach/db";
import {
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmas,
} from "@informach/db/schema";
import type { Subject, TurmaNeedingSubjects } from "./types";

export type NewSubjectPayload = {
  turmaId: string;
  name: string;
  teacherName: string | null;
  createdByUserId: string;
};

export type SubjectUpdatePayload = {
  name: string;
  teacherName: string | null;
};

export type InsertSubjectResult = { subject: Subject; created: boolean };

export async function insertSubjectIfNotExists(
  payload: NewSubjectPayload,
): Promise<InsertSubjectResult> {
  const inserted = await db
    .insert(agendaSubjects)
    .values(payload)
    .onConflictDoNothing({ target: [agendaSubjects.turmaId, agendaSubjects.name] })
    .returning();

  const insertedRow = inserted[0];
  if (insertedRow) {
    return { subject: insertedRow, created: true };
  }

  const [existing] = await db
    .select()
    .from(agendaSubjects)
    .where(and(eq(agendaSubjects.turmaId, payload.turmaId), eq(agendaSubjects.name, payload.name)))
    .limit(1);

  if (!existing) {
    throw new Error(
      "agenda.subjects: insert returning empty AND existing row not found — check unique key",
    );
  }
  return { subject: existing, created: false };
}

export async function findSubjectById(id: string): Promise<Subject | null> {
  const [row] = await db.select().from(agendaSubjects).where(eq(agendaSubjects.id, id)).limit(1);
  return row ?? null;
}

export async function listSubjectsForTurma(turmaId: string): Promise<Subject[]> {
  return db
    .select()
    .from(agendaSubjects)
    .where(eq(agendaSubjects.turmaId, turmaId))
    .orderBy(asc(agendaSubjects.name));
}

export async function updateSubjectById(
  id: string,
  payload: SubjectUpdatePayload,
): Promise<Subject | null> {
  const [row] = await db
    .update(agendaSubjects)
    .set({
      name: payload.name,
      teacherName: payload.teacherName,
      updatedAt: new Date(),
    })
    .where(eq(agendaSubjects.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSubjectById(id: string): Promise<boolean> {
  const removed = await db
    .delete(agendaSubjects)
    .where(eq(agendaSubjects.id, id))
    .returning({ id: agendaSubjects.id });
  return removed.length > 0;
}

// Turmas das quais o user é creator E que estão como activeTurma de algum perfil dele
// E que ainda não têm matérias cadastradas. Usado pelo widget do dashboard.
export async function findTurmasOfUserMissingSubjects(
  userId: string,
): Promise<TurmaNeedingSubjects[]> {
  const rows = await db
    .selectDistinct({
      turmaId: agendaTurmas.id,
      schoolName: agendaSchools.name,
      grade: agendaTurmas.grade,
      classLetter: agendaTurmas.classLetter,
      year: agendaTurmas.year,
    })
    .from(agendaStudentProfiles)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaStudentProfiles.activeTurmaId))
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .where(
      and(
        eq(agendaStudentProfiles.userId, userId),
        eq(agendaTurmas.createdByUserId, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${agendaSubjects} WHERE ${agendaSubjects.turmaId} = ${agendaTurmas.id})`,
      ),
    )
    .orderBy(asc(agendaSchools.name));
  return rows;
}
