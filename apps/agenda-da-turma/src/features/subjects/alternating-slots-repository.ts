import "server-only";

import { and, type Database, db, eq, inArray, ne } from "@informach/db";
import {
  type AgendaClassDay,
  agendaSubjectAlternatingSlots,
  agendaSubjects,
} from "@informach/db/schema";
import { addDaysIso } from "@/features/dashboard/date";
import type { AlternatingSlot as ClassDaySlot } from "./class-days";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

// Shape exposto pelo repo. Domain-friendly (anchorDate como string ISO em vez
// de Date), porque a coluna Postgres é `date` e Drizzle devolve string.
export type AlternatingSlotRow = {
  id: string;
  subjectId: string;
  dayOfWeek: AgendaClassDay;
  pairedSubjectId: string;
  anchorDate: string; // "YYYY-MM-DD"
};

export type NewAlternatingSlotPayload = {
  subjectId: string;
  dayOfWeek: AgendaClassDay;
  pairedSubjectId: string;
  anchorDate: string; // "YYYY-MM-DD"
};

export async function listAlternatingSlotsBySubject(
  subjectId: string,
  client: DbClient = db,
): Promise<AlternatingSlotRow[]> {
  const rows = await client
    .select({
      id: agendaSubjectAlternatingSlots.id,
      subjectId: agendaSubjectAlternatingSlots.subjectId,
      dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
      pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
      anchorDate: agendaSubjectAlternatingSlots.anchorDate,
    })
    .from(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));
  return rows;
}

export async function listAlternatingSlotsBySubjectIds(
  subjectIds: readonly string[],
  client: DbClient = db,
): Promise<AlternatingSlotRow[]> {
  if (subjectIds.length === 0) return [];
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
  return rows;
}

// Substitui TODOS os slots de uma matéria. Idiomático pro fluxo de
// "edit subject" — o form devolve o conjunto atual de slots e o service
// reconcilia. Atômico via transação no caller; aqui só o delete+insert.
// NÃO sincroniza espelho — quem chama deve garantir consistência da matéria
// pareada (ver `subjects/service.ts:syncAlternatingSlots`).
export async function replaceAlternatingSlotsForSubject(
  subjectId: string,
  slots: readonly NewAlternatingSlotPayload[],
  client: DbClient,
): Promise<void> {
  await client
    .delete(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));
  if (slots.length === 0) return;
  await client.insert(agendaSubjectAlternatingSlots).values(
    slots.map((s) => ({
      subjectId: s.subjectId,
      dayOfWeek: s.dayOfWeek,
      pairedSubjectId: s.pairedSubjectId,
      anchorDate: s.anchorDate,
    })),
  );
}

// Apaga slots que referenciam uma matéria como PAIRED (mas não como subject).
// Usado quando uma matéria é deletada — os FKs do schema cuidam dos slots
// onde ela é `subject_id` (ON DELETE CASCADE), mas slots em OUTRAS matérias
// que apontam pra ela como `paired_subject_id` precisam ser removidos antes
// pra não deixar referência órfã. Na prática o FK cascade já cobre — esse
// helper existe pra casos de edit/sync onde queremos remover slots órfãos
// preservando os outros.
export async function deleteAlternatingSlotsByPairedSubject(
  pairedSubjectId: string,
  client: DbClient,
): Promise<void> {
  await client
    .delete(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.pairedSubjectId, pairedSubjectId));
}

// Map subjectId → slots no formato consumido por `nextClassDayIso` (i.e.,
// `{ day, anchorIso }` em vez do shape completo do row do DB). Usado pelo
// fluxo de IA de atividades pra alimentar o fallback quinzenal sem fazer
// shape conversion no caller. Single query — sem N+1.
export async function loadSlotsByClassDayMap(
  subjectIds: readonly string[],
  client: DbClient = db,
): Promise<Map<string, ClassDaySlot[]>> {
  const rows = await listAlternatingSlotsBySubjectIds(subjectIds, client);
  const map = new Map<string, ClassDaySlot[]>();
  for (const row of rows) {
    const list = map.get(row.subjectId) ?? [];
    list.push({ day: row.dayOfWeek, anchorIso: row.anchorDate });
    map.set(row.subjectId, list);
  }
  return map;
}

// Carrega TODOS os slots de uma turma — usado pelo fluxo de IA de atividades
// pra alimentar o fallback de dueAt quinzenal. Path: turma → subjects → slots.
export async function listAlternatingSlotsByTurma(
  turmaId: string,
  client: DbClient = db,
): Promise<AlternatingSlotRow[]> {
  const rows = await client
    .select({
      id: agendaSubjectAlternatingSlots.id,
      subjectId: agendaSubjectAlternatingSlots.subjectId,
      dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
      pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
      anchorDate: agendaSubjectAlternatingSlots.anchorDate,
    })
    .from(agendaSubjectAlternatingSlots)
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaSubjectAlternatingSlots.subjectId))
    .where(eq(agendaSubjects.turmaId, turmaId));
  return rows;
}

// Input pro sync (sem id, sem subjectId — vem do contexto).
export type SyncSlotInput = {
  dayOfWeek: AgendaClassDay;
  pairedSubjectId: string;
  anchorDate: string;
};

/**
 * Sincroniza os slots de revezamento de uma matéria E os slots-espelho nas
 * matérias pareadas. Roda numa transação atomicamente.
 *
 * Algoritmo:
 *   1. Sever espelhos atuais — pra cada slot (A, day, paired=B) que já
 *      existe, apaga o espelho correspondente (B, day, paired=A).
 *   2. Apaga todos os slots de A.
 *   3. Pra cada novo slot S = (A, day, paired=B, anchor):
 *      a. Se B já tem slot pra `day` apontando pra C (≠ A), apaga TAMBÉM
 *         o espelho de C apontando pra B (relação antiga B↔C dissolvida).
 *      b. Apaga qualquer slot de B nesse dia (limpa o espaço).
 *      c. Insere o slot novo de A.
 *      d. Insere o espelho de B (anchor + 7 dias — se A teve aula em X,
 *         B tem aula em X+7).
 *
 * Invariante: par sempre tem espelho 1↔1. Esta função preserva isso.
 */
export async function syncAlternatingSlotsForSubject(
  subjectId: string,
  newSlots: readonly SyncSlotInput[],
  client: DbClient = db,
): Promise<void> {
  // Se já estamos numa transação (caller passou tx), reusa. Senão abre uma.
  const runInTx = async (tx: DbClient): Promise<void> => {
    // 1. Severar espelhos atuais.
    const oldSlots = await tx
      .select({
        dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
        pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
      })
      .from(agendaSubjectAlternatingSlots)
      .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));
    for (const old of oldSlots) {
      await tx
        .delete(agendaSubjectAlternatingSlots)
        .where(
          and(
            eq(agendaSubjectAlternatingSlots.subjectId, old.pairedSubjectId),
            eq(agendaSubjectAlternatingSlots.dayOfWeek, old.dayOfWeek),
            eq(agendaSubjectAlternatingSlots.pairedSubjectId, subjectId),
          ),
        );
    }
    // 2. Apaga slots de A.
    await tx
      .delete(agendaSubjectAlternatingSlots)
      .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));

    // 3. Insere novos + espelhos.
    for (const s of newSlots) {
      const [existingOnB] = await tx
        .select({
          pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
        })
        .from(agendaSubjectAlternatingSlots)
        .where(
          and(
            eq(agendaSubjectAlternatingSlots.subjectId, s.pairedSubjectId),
            eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
          ),
        )
        .limit(1);
      if (existingOnB && existingOnB.pairedSubjectId !== subjectId) {
        // Severa espelho de C apontando pra B.
        await tx
          .delete(agendaSubjectAlternatingSlots)
          .where(
            and(
              eq(agendaSubjectAlternatingSlots.subjectId, existingOnB.pairedSubjectId),
              eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
              eq(agendaSubjectAlternatingSlots.pairedSubjectId, s.pairedSubjectId),
            ),
          );
      }
      await tx
        .delete(agendaSubjectAlternatingSlots)
        .where(
          and(
            eq(agendaSubjectAlternatingSlots.subjectId, s.pairedSubjectId),
            eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
          ),
        );
      await tx.insert(agendaSubjectAlternatingSlots).values({
        subjectId,
        dayOfWeek: s.dayOfWeek,
        pairedSubjectId: s.pairedSubjectId,
        anchorDate: s.anchorDate,
      });
      await tx.insert(agendaSubjectAlternatingSlots).values({
        subjectId: s.pairedSubjectId,
        dayOfWeek: s.dayOfWeek,
        pairedSubjectId: subjectId,
        anchorDate: addDaysIso(s.anchorDate, 7),
      });
    }
  };

  // Detecta se `client` já é uma transaction-like (tem `.rollback`) e reusa,
  // ou se é o pool e precisa abrir tx. Heurística suja mas evita re-design
  // do callsite. Drizzle tx tem `.rollback`; o pool não tem.
  if ("rollback" in (client as object)) {
    await runInTx(client);
  } else {
    await (client as Database).transaction(async (tx) => {
      await runInTx(tx);
    });
  }
}

// Helper: verifica se o `pairedSubjectId` é da mesma turma do `subjectId`.
// Service usa isso pra validar antes de inserir slot — não faz sentido
// parear matérias de turmas diferentes.
export async function pairedSubjectBelongsToSameTurma(
  subjectId: string,
  pairedSubjectId: string,
  client: DbClient = db,
): Promise<boolean> {
  if (subjectId === pairedSubjectId) return false;
  const [a] = await client
    .select({ turmaId: agendaSubjects.turmaId })
    .from(agendaSubjects)
    .where(eq(agendaSubjects.id, subjectId))
    .limit(1);
  if (!a) return false;
  const [b] = await client
    .select({ turmaId: agendaSubjects.turmaId })
    .from(agendaSubjects)
    .where(
      and(
        eq(agendaSubjects.id, pairedSubjectId),
        eq(agendaSubjects.turmaId, a.turmaId),
        ne(agendaSubjects.id, subjectId),
      ),
    )
    .limit(1);
  return b !== undefined;
}
