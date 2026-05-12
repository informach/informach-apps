import "server-only";

import { and, asc, type Database, db, eq, ne, sql } from "@informach/db";
import {
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
  createdByUserId: string;
};

export type SubjectUpdatePayload = {
  name: string;
  teacherName: string | null;
};

export type InsertSubjectStatus = "created" | "merged" | "skipped";
export type InsertSubjectResult = { subject: Subject; status: InsertSubjectStatus };

/**
 * Idempotent upsert de matéria. Estados possíveis:
 *
 * - `created` — insert sucesso (turma×nome único, primeira vez).
 * - `merged` — UNIQUE bateu E a row existente tinha `teacherName=null` E o
 *   payload trouxe `teacherName` não-nulo E foi o MESMO usuário que criou
 *   a row (`existing.createdByUserId === payload.createdByUserId`). Faz
 *   UPDATE setando `teacherName` e devolve a row mergeada.
 * - `skipped` — UNIQUE bateu mas nada a fundir (já tem teacherName, ou
 *   payload não trouxe, ou row foi criada por outro usuário da turma
 *   compartilhada). Devolve a row existente intacta.
 *
 * Restrição de governança: NUNCA pisar em cima de dados de outra família
 * (turmas são compartilhadas). Se a row existente foi criada por outro
 * membro, ainda que esteja sem teacherName, retorna `skipped` — quem fez
 * a matéria tem o direito de preencher o professor.
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
        return { subject: insertedRow, status: "created" };
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

      // Merge oportunístico de teacherName: só quando o MESMO usuário criou
      // a row, ela está sem teacherName, e o payload trouxe um. Cobre o caso
      // típico do fluxo de IA: usuário cadastrou "Matemática" manualmente
      // ontem sem professor, hoje grava áudio dizendo "Matemática com prof
      // Carla" — a chamada do batch popula o teacherName em vez de skippar.
      const canMerge =
        existing.teacherName === null &&
        payload.teacherName !== null &&
        existing.createdByUserId === payload.createdByUserId;
      if (canMerge) {
        const [merged] = await tx
          .update(agendaSubjects)
          .set({ teacherName: payload.teacherName, updatedAt: new Date() })
          .where(eq(agendaSubjects.id, existing.id))
          .returning();
        if (merged) {
          return { subject: merged, status: "merged" };
        }
      }

      return { subject: existing, status: "skipped" };
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
