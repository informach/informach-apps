import "server-only";

import { and, asc, type Database, db, eq, ne, sql } from "@informach/db";
import {
  type AgendaClassDay,
  agendaActivities,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmas,
} from "@informach/db/schema";
import type { Subject, TurmaNeedingSubjects } from "./types";
import { pickAvailableColorIndex } from "./utils";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

export type NewSubjectPayload = {
  turmaId: string;
  name: string;
  teacherName: string | null;
  classDays: AgendaClassDay[];
  createdByUserId: string;
};

export type SubjectUpdatePayload = {
  name: string;
  teacherName: string | null;
  classDays: AgendaClassDay[];
};

export type InsertSubjectStatus = "created" | "merged" | "skipped";
export type InsertSubjectFilledFields = {
  teacherName: boolean;
  classDays: boolean;
};
export type InsertSubjectResult = {
  subject: Subject;
  status: InsertSubjectStatus;
  // Quais campos em branco foram preenchidos no merge. Sempre presente, mas
  // só relevante quando `status === "merged"` (em `created` tudo é "novo";
  // em `skipped` nada foi tocado).
  filled: InsertSubjectFilledFields;
};

/**
 * Idempotent upsert de matéria. Estados possíveis:
 *
 * - `created` — insert sucesso (turma×nome único, primeira vez).
 * - `merged` — UNIQUE bateu E pelo menos um campo da row existente estava
 *   em branco (`teacherName === null` OU `classDays.length === 0`) E o
 *   payload trouxe valor pra esse campo. Faz UPDATE preenchendo SÓ os
 *   brancos e devolve a row resultante + `filled` indicando quais campos
 *   foram preenchidos. **Nunca sobrescreve dados já cadastrados**.
 * - `skipped` — UNIQUE bateu mas não havia nada a fundir (todos os campos
 *   já tinham valor, ou o payload não trouxe valor pros campos em branco).
 *
 * Regra de governança: turmas são compartilhadas entre famílias. O merge
 * **opportunístico de campos em branco** vale mesmo quando outra família
 * criou a matéria — preencher um campo nulo não pisa em ninguém. Não há
 * mais a restrição de "mesmo usuário" que existia antes; o que protege é
 * só o "nunca sobrescrever não-nulo".
 */
export async function insertSubjectIfNotExists(
  payload: NewSubjectPayload,
): Promise<InsertSubjectResult> {
  return db.transaction(
    async (tx) => {
      // Serializa inserts concorrentes na MESMA turma (não bloqueia outras),
      // garantindo que pickAvailableColorIndex sempre veja a lista atualizada
      // de color_index em uso.
      await lockSubjectsColorForTurma(tx, payload.turmaId);

      const usedIndexes = await listUsedColorIndexesByTurma(tx, payload.turmaId);
      const colorIndex = pickAvailableColorIndex(payload.name, usedIndexes);

      const inserted = await tx
        .insert(agendaSubjects)
        .values({ ...payload, colorIndex })
        .onConflictDoNothing({ target: [agendaSubjects.turmaId, agendaSubjects.name] })
        .returning();

      const insertedRow = inserted[0];
      if (insertedRow) {
        return {
          subject: insertedRow,
          status: "created" as const,
          filled: { teacherName: false, classDays: false },
        };
      }

      const [existing] = await tx
        .select()
        .from(agendaSubjects)
        .where(
          and(eq(agendaSubjects.turmaId, payload.turmaId), eq(agendaSubjects.name, payload.name)),
        )
        .limit(1);

      if (!existing) {
        throw new Error(
          "agenda.subjects: insert returning empty AND existing row not found — check unique key",
        );
      }

      // Merge "fill-in-blank": para cada campo, só atualiza quando a row
      // existente está em branco E o payload trouxe valor. Vale pra qualquer
      // criador da row (turmas são compartilhadas — preencher branco é seguro).
      const shouldFillTeacher = existing.teacherName === null && payload.teacherName !== null;
      const shouldFillClassDays = existing.classDays.length === 0 && payload.classDays.length > 0;

      if (!shouldFillTeacher && !shouldFillClassDays) {
        return {
          subject: existing,
          status: "skipped" as const,
          filled: { teacherName: false, classDays: false },
        };
      }

      const updates: { teacherName?: string; classDays?: AgendaClassDay[]; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (shouldFillTeacher && payload.teacherName !== null) {
        updates.teacherName = payload.teacherName;
      }
      if (shouldFillClassDays) {
        updates.classDays = payload.classDays;
      }

      const [merged] = await tx
        .update(agendaSubjects)
        .set(updates)
        .where(eq(agendaSubjects.id, existing.id))
        .returning();
      if (!merged) {
        return {
          subject: existing,
          status: "skipped" as const,
          filled: { teacherName: false, classDays: false },
        };
      }
      return {
        subject: merged,
        status: "merged" as const,
        filled: { teacherName: shouldFillTeacher, classDays: shouldFillClassDays },
      };
    },
    { isolationLevel: "read committed" },
  );
}

async function lockSubjectsColorForTurma(tx: Tx, turmaId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:subjects:color:${turmaId}`}))`,
  );
}

async function listUsedColorIndexesByTurma(client: DbClient, turmaId: string): Promise<number[]> {
  const rows = await client
    .select({ colorIndex: agendaSubjects.colorIndex })
    .from(agendaSubjects)
    .where(eq(agendaSubjects.turmaId, turmaId));
  return rows.map((r) => r.colorIndex);
}

export async function findSubjectById(id: string): Promise<Subject | null> {
  const [row] = await db.select().from(agendaSubjects).where(eq(agendaSubjects.id, id)).limit(1);
  return row ?? null;
}

export async function subjectNameExistsInTurmaExceptId(
  turmaId: string,
  name: string,
  subjectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaSubjects.id })
    .from(agendaSubjects)
    .where(
      and(
        eq(agendaSubjects.turmaId, turmaId),
        eq(agendaSubjects.name, name),
        ne(agendaSubjects.id, subjectId),
      ),
    )
    .limit(1);
  return row !== undefined;
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
      classDays: payload.classDays,
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

// Há alguma atividade vinculada à matéria criada por um usuário diferente
// do creator? Usado pelo service de matérias pra (a) bloquear delete e (b)
// permitir só "ajustes pequenos" no nome (`isMinorNameEdit`). Atividades do
// próprio creator não contam — quem fez a matéria pode mexer livremente nas
// suas próprias atividades.
export async function isSubjectInUseByOtherUsers(
  subjectId: string,
  currentUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(
      and(
        eq(agendaActivities.subjectId, subjectId),
        ne(agendaActivities.createdByUserId, currentUserId),
      ),
    )
    .limit(1);
  return row !== undefined;
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
