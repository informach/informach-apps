import "server-only";

import { and, asc, count, type Database, db, eq, inArray, ne, sql } from "@informach/db";
import {
  type AgendaExtracurricularDay,
  type AgendaProfileSubjectStatus,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaTasks,
} from "@informach/db/schema";
import type { ProfileSubject } from "./types";
import { pickAvailableColorIndexForProfile } from "./utils";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Tx;

export type NewProfileSubjectPayload = {
  profileId: string;
  name: string;
  classDays: AgendaExtracurricularDay[];
};

export type ProfileSubjectUpdatePayload = {
  name: string;
  classDays: AgendaExtracurricularDay[];
};

export type InsertProfileSubjectWithinLimitResult =
  | { ok: true; subject: ProfileSubject }
  | { ok: false; code: "LIMIT_REACHED"; current: number; limit: number }
  | { ok: false; code: "DUPLICATE_NAME" };

// Insere extracurricular respeitando limite (Free 1 / Pro 10 per profile).
// Advisory lock por perfil garante que count + insert sejam atômicos contra
// inserts concorrentes. Color picking acontece dentro da mesma transação
// pra ver lista atual de cores usadas (turma ativa + extras active).
export async function insertProfileSubjectWithinLimit(
  payload: NewProfileSubjectPayload,
  limit: number,
): Promise<InsertProfileSubjectWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      await lockProfileSubjectsForProfile(tx, payload.profileId);

      const current = await countProfileSubjectsByProfileWithClient(tx, payload.profileId);
      if (current >= limit) {
        return { ok: false as const, code: "LIMIT_REACHED" as const, current, limit };
      }

      const colorIndex = await pickAvailableColorIndexForProfile(payload.profileId, payload.name);

      const inserted = await tx
        .insert(agendaProfileSubjects)
        .values({
          profileId: payload.profileId,
          name: payload.name,
          classDays: payload.classDays,
          colorIndex,
        })
        .onConflictDoNothing({
          target: [agendaProfileSubjects.profileId, agendaProfileSubjects.name],
        })
        .returning();

      const row = inserted[0];
      if (!row) {
        return { ok: false as const, code: "DUPLICATE_NAME" as const };
      }
      return { ok: true as const, subject: row };
    },
    { isolationLevel: "read committed" },
  );
}

async function lockProfileSubjectsForProfile(tx: Tx, profileId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:profile_subjects:${profileId}`}))`,
  );
}

async function countProfileSubjectsByProfileWithClient(
  client: DbClient,
  profileId: string,
): Promise<number> {
  const [row] = await client
    .select({ count: count() })
    .from(agendaProfileSubjects)
    .where(eq(agendaProfileSubjects.profileId, profileId));
  return Number(row?.count ?? 0);
}

export async function countProfileSubjectsByProfile(profileId: string): Promise<number> {
  return countProfileSubjectsByProfileWithClient(db, profileId);
}

export async function findProfileSubjectById(id: string): Promise<ProfileSubject | null> {
  const [row] = await db
    .select()
    .from(agendaProfileSubjects)
    .where(eq(agendaProfileSubjects.id, id))
    .limit(1);
  return row ?? null;
}

// Garante que o user é dono do perfil que possui a matéria (single-user
// invariant). Usado pelo service antes de update/delete/setStatus.
export async function findProfileSubjectByIdForUser(
  userId: string,
  id: string,
): Promise<ProfileSubject | null> {
  const [row] = await db
    .select({ subject: agendaProfileSubjects })
    .from(agendaProfileSubjects)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaProfileSubjects.profileId))
    .where(and(eq(agendaStudentProfiles.userId, userId), eq(agendaProfileSubjects.id, id)))
    .limit(1);
  return row?.subject ?? null;
}

export async function profileSubjectNameExistsExceptId(
  profileId: string,
  name: string,
  subjectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaProfileSubjects.id })
    .from(agendaProfileSubjects)
    .where(
      and(
        eq(agendaProfileSubjects.profileId, profileId),
        eq(agendaProfileSubjects.name, name),
        ne(agendaProfileSubjects.id, subjectId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// Lista todas as extras do perfil (active + paused). Ordenado por status
// active primeiro, depois nome — UI da página `/perfis/[id]/extras` usa
// essa ordem default.
export async function listProfileSubjectsForProfile(profileId: string): Promise<ProfileSubject[]> {
  return db
    .select()
    .from(agendaProfileSubjects)
    .where(eq(agendaProfileSubjects.profileId, profileId))
    .orderBy(asc(agendaProfileSubjects.status), asc(agendaProfileSubjects.name));
}

// Lista só as `active` — usado em queries de leitura unificada (dashboard,
// calendar, today-subjects).
export async function listActiveProfileSubjectsForProfile(
  profileId: string,
): Promise<ProfileSubject[]> {
  return db
    .select()
    .from(agendaProfileSubjects)
    .where(
      and(
        eq(agendaProfileSubjects.profileId, profileId),
        eq(agendaProfileSubjects.status, "active"),
      ),
    )
    .orderBy(asc(agendaProfileSubjects.name));
}

// Extras `active` de vários perfis de uma vez. Recebe ids já autorizados pelo
// caller (o serviço resolve os perfis acessíveis antes), então não repete a
// checagem de acesso aqui.
export async function listActiveProfileSubjectsForProfiles(
  profileIds: string[],
): Promise<ProfileSubject[]> {
  if (profileIds.length === 0) return [];
  return db
    .select()
    .from(agendaProfileSubjects)
    .where(
      and(
        inArray(agendaProfileSubjects.profileId, profileIds),
        eq(agendaProfileSubjects.status, "active"),
      ),
    )
    .orderBy(asc(agendaProfileSubjects.name));
}

// Lista todas as extras `active` de todos os perfis do user — utility pro
// dashboard quando não tem filtro de perfil.
export async function listActiveProfileSubjectsForUser(userId: string): Promise<ProfileSubject[]> {
  const rows = await db
    .select({ subject: agendaProfileSubjects })
    .from(agendaProfileSubjects)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaProfileSubjects.profileId))
    .where(
      and(eq(agendaStudentProfiles.userId, userId), eq(agendaProfileSubjects.status, "active")),
    )
    .orderBy(asc(agendaProfileSubjects.name));
  return rows.map((r) => r.subject);
}

export async function updateProfileSubjectById(
  id: string,
  payload: ProfileSubjectUpdatePayload,
): Promise<ProfileSubject | null> {
  const [row] = await db
    .update(agendaProfileSubjects)
    .set({
      name: payload.name,
      classDays: payload.classDays,
      updatedAt: new Date(),
    })
    .where(eq(agendaProfileSubjects.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProfileSubjectById(id: string): Promise<boolean> {
  const removed = await db
    .delete(agendaProfileSubjects)
    .where(eq(agendaProfileSubjects.id, id))
    .returning({ id: agendaProfileSubjects.id });
  return removed.length > 0;
}

// Seta status (`active`/`paused`) + paused_at consistente.
//   - paused: paused_at = today (caller passa ISO via app TZ)
//   - active: paused_at = null
// Check constraint do DB força essa consistência também, mas o app aplica
// a regra explicitamente pra audit log carregar from→to + pausedAtIso.
export async function setProfileSubjectStatus(
  id: string,
  status: AgendaProfileSubjectStatus,
  pausedAtIso: string | null,
): Promise<ProfileSubject | null> {
  const [row] = await db
    .update(agendaProfileSubjects)
    .set({
      status,
      pausedAt: pausedAtIso,
      updatedAt: new Date(),
    })
    .where(eq(agendaProfileSubjects.id, id))
    .returning();
  return row ?? null;
}

// Mapa profileSubjectId → (pending count, done count). Usado pelo card de
// matéria extracurricular pra mostrar "3 pendentes". Single query com
// GROUP BY pra evitar N+1.
export async function loadActivityCountsForProfileSubjects(
  ids: readonly string[],
): Promise<Map<string, { pending: number; done: number }>> {
  const map = new Map<string, { pending: number; done: number }>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      profileSubjectId: agendaTasks.profileSubjectId,
      status: agendaTasks.status,
      total: count(),
    })
    .from(agendaTasks)
    .where(inArray(agendaTasks.profileSubjectId, ids))
    .groupBy(agendaTasks.profileSubjectId, agendaTasks.status);
  for (const row of rows) {
    if (!row.profileSubjectId) continue;
    const existing = map.get(row.profileSubjectId) ?? { pending: 0, done: 0 };
    if (row.status === "pending") existing.pending = Number(row.total);
    if (row.status === "done") existing.done = Number(row.total);
    map.set(row.profileSubjectId, existing);
  }
  return map;
}
