import "server-only";

import { and, asc, type Database, db, eq, inArray, ne, sql } from "@informach/db";
import {
  type AgendaClassDay,
  agendaActivities,
  agendaSubjectAlternatingSlots,
  agendaSubjects,
} from "@informach/db/schema";
import type { AlternatingSlot, Subject } from "./types";
import { pickAvailableColorIndex } from "./utils";

// Shape "puro" da row de matéria (sem slots). Usado internamente pra
// queries que carregam batches; o caller chama `attachAlternatingSlots`
// pra montar o `Subject` completo.
export type SubjectRow = Omit<Subject, "alternatingSlots">;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Tx;

// Carrega slots de revezamento pra um conjunto de subjectIds e devolve um
// Map. Single query — usado pra atachar slots em batch sem N+1.
export async function loadSlotsForSubjects(
  subjectIds: readonly string[],
  client: DbClient = db,
): Promise<Map<string, AlternatingSlot[]>> {
  const map = new Map<string, AlternatingSlot[]>();
  if (subjectIds.length === 0) return map;
  const rows = await client
    .select({
      id: agendaSubjectAlternatingSlots.id,
      subjectId: agendaSubjectAlternatingSlots.subjectId,
      dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
      pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
      anchorDate: agendaSubjectAlternatingSlots.anchorDate,
    })
    .from(agendaSubjectAlternatingSlots)
    .where(inArray(agendaSubjectAlternatingSlots.subjectId, subjectIds));
  for (const row of rows) {
    const list = map.get(row.subjectId) ?? [];
    list.push(row);
    map.set(row.subjectId, list);
  }
  return map;
}

// Helper de "attach" — combina um array de SubjectRow com seus slots e
// devolve `Subject[]` completos. Usado pelos service methods que retornam
// matérias pra UI.
export async function attachAlternatingSlots(
  rows: readonly SubjectRow[],
  client: DbClient = db,
): Promise<Subject[]> {
  if (rows.length === 0) return [];
  const slotsMap = await loadSlotsForSubjects(
    rows.map((r) => r.id),
    client,
  );
  return rows.map((r) => ({ ...r, alternatingSlots: slotsMap.get(r.id) ?? [] }));
}

export async function attachAlternatingSlotsOne(
  row: SubjectRow | null,
  client: DbClient = db,
): Promise<Subject | null> {
  if (!row) return null;
  const [subject] = await attachAlternatingSlots([row], client);
  return subject ?? null;
}

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
// Devolve `SubjectRow` (sem slots) — o service que chama anexa via
// `attachAlternatingSlotsOne` antes de devolver ao caller externo.
// `insertSubjectIfNotExists` é só sobre a row de `agenda.subjects`; slots são
// orquestrados num passo separado no service (`syncAlternatingSlots`).
export type InsertSubjectResult = {
  subject: SubjectRow;
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

export async function findSubjectById(id: string): Promise<SubjectRow | null> {
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

export async function listSubjectsForTurma(turmaId: string): Promise<SubjectRow[]> {
  return db
    .select()
    .from(agendaSubjects)
    .where(eq(agendaSubjects.turmaId, turmaId))
    .orderBy(asc(agendaSubjects.name));
}

export async function updateSubjectById(
  id: string,
  payload: SubjectUpdatePayload,
  client: DbClient = db,
): Promise<SubjectRow | null> {
  const [row] = await client
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
