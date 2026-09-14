import "server-only";

import { randomInt } from "node:crypto";
import { and, asc, db, eq, inArray, or, sql } from "@informach/db";
import {
  agendaActivities,
  agendaCities,
  agendaSchools,
  agendaStates,
  agendaStudentProfiles,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import { TURMA_CODE_ALPHABET, TURMA_CODE_LENGTH } from "./limits";
import type {
  CityOption,
  SchoolOption,
  StateOption,
  Turma,
  TurmaForUser,
  TurmaWithSchool,
} from "./types";

export type NewTurmaPayload = {
  code: string;
  schoolInepCode: string;
  grade: Turma["grade"];
  year: number;
  classLetter: string;
  shift?: Turma["shift"];
  createdByUserId: string;
};

export type InsertTurmaResult = { turma: Turma; created: boolean } | { codeConflict: true };

export async function insertTurmaIfNotExists(payload: NewTurmaPayload): Promise<InsertTurmaResult> {
  const inserted = await db.insert(agendaTurmas).values(payload).onConflictDoNothing().returning();

  const insertedRow = inserted[0];
  if (insertedRow) {
    return { turma: insertedRow, created: true };
  }

  const [existing] = await db
    .select()
    .from(agendaTurmas)
    .where(
      and(
        eq(agendaTurmas.schoolInepCode, payload.schoolInepCode),
        eq(agendaTurmas.grade, payload.grade),
        eq(agendaTurmas.year, payload.year),
        eq(agendaTurmas.classLetter, payload.classLetter),
        eq(agendaTurmas.shift, payload.shift ?? "unspecified"),
        eq(agendaTurmas.createdByUserId, payload.createdByUserId),
      ),
    )
    .limit(1);

  if (!existing) {
    return { codeConflict: true };
  }
  return { turma: existing, created: false };
}

export async function findTurmaByCode(code: string): Promise<Turma | null> {
  const [row] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.code, code)).limit(1);
  return row ?? null;
}

export async function findTurmaWithSchoolById(id: string): Promise<TurmaWithSchool | null> {
  const [row] = await db
    .select({
      id: agendaTurmas.id,
      code: agendaTurmas.code,
      schoolInepCode: agendaTurmas.schoolInepCode,
      grade: agendaTurmas.grade,
      year: agendaTurmas.year,
      shift: agendaTurmas.shift,
      classLetter: agendaTurmas.classLetter,
      createdByUserId: agendaTurmas.createdByUserId,
      createdAt: agendaTurmas.createdAt,
      updatedAt: agendaTurmas.updatedAt,
      schoolName: agendaSchools.name,
      cityName: agendaCities.name,
      stateUf: agendaCities.stateUf,
    })
    .from(agendaTurmas)
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(agendaCities, eq(agendaCities.ibgeCode, agendaSchools.cityIbgeCode))
    .where(eq(agendaTurmas.id, id))
    .limit(1);
  return row ?? null;
}

export async function listTurmasForUser(userId: string): Promise<TurmaForUser[]> {
  // Fetch user's profiles first.
  const profiles = await db
    .select({
      id: agendaStudentProfiles.id,
      name: agendaStudentProfiles.name,
      activeTurmaId: agendaStudentProfiles.activeTurmaId,
    })
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, userId));

  const profileIds = profiles.map((p) => p.id);

  // Lista turmas que: (a) o user criou, OU (b) algum perfil do user é membro.
  // LEFT JOIN turma_members só pra membros do user — turmas sem nenhum perfil
  // do user retornam uma row com memberProfileId=null mas ainda são listadas
  // se o user é o creator.
  const memberJoinCondition =
    profileIds.length > 0
      ? and(
          eq(agendaTurmaMembers.turmaId, agendaTurmas.id),
          inArray(agendaTurmaMembers.studentProfileId, profileIds),
        )
      : sql`false`;

  const whereClause =
    profileIds.length > 0
      ? or(eq(agendaTurmas.createdByUserId, userId), sql`${agendaTurmaMembers.id} IS NOT NULL`)
      : eq(agendaTurmas.createdByUserId, userId);

  // Cap defensivo: famílias normais têm <10 turmas. Creator que acumulou centenas
  // de turmas órfãs (criou e nunca apagou) é o pior-caso latente — sem LIMIT,
  // a página `/turmas` traz tudo + 2 queries auxiliares, podendo timeout. Cada
  // turma pode aparecer múltiplas vezes (1 row por membro vinculado); 200 *
  // ~3 membros médios = 600 rows ainda processável. Acima disso o usuário
  // precisa filtrar (UI já tem `?perfil=`).
  const TURMA_LIST_ROW_CAP = 600;
  const rows = await db
    .select({
      id: agendaTurmas.id,
      code: agendaTurmas.code,
      schoolInepCode: agendaTurmas.schoolInepCode,
      grade: agendaTurmas.grade,
      year: agendaTurmas.year,
      shift: agendaTurmas.shift,
      classLetter: agendaTurmas.classLetter,
      createdByUserId: agendaTurmas.createdByUserId,
      createdAt: agendaTurmas.createdAt,
      updatedAt: agendaTurmas.updatedAt,
      schoolName: agendaSchools.name,
      cityName: agendaCities.name,
      stateUf: agendaCities.stateUf,
      memberProfileId: agendaTurmaMembers.studentProfileId,
    })
    .from(agendaTurmas)
    .leftJoin(agendaTurmaMembers, memberJoinCondition)
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(agendaCities, eq(agendaCities.ibgeCode, agendaSchools.cityIbgeCode))
    .where(whereClause)
    .orderBy(asc(agendaTurmas.year), asc(agendaTurmas.grade), asc(agendaTurmas.classLetter))
    .limit(TURMA_LIST_ROW_CAP);

  // Group by turma id and merge members.
  const byTurma = new Map<string, TurmaForUser>();
  for (const row of rows) {
    let entry = byTurma.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        code: row.code,
        schoolInepCode: row.schoolInepCode,
        grade: row.grade,
        year: row.year,
        shift: row.shift,
        classLetter: row.classLetter,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        schoolName: row.schoolName,
        cityName: row.cityName,
        stateUf: row.stateUf,
        members: [],
        hasActivities: false,
        hasOtherFamilies: false,
      };
      byTurma.set(row.id, entry);
    }
    if (row.memberProfileId) {
      const profile = profiles.find((p) => p.id === row.memberProfileId);
      if (profile && !entry.members.some((m) => m.profileId === profile.id)) {
        entry.members.push({
          profileId: profile.id,
          profileName: profile.name,
          isActive: profile.activeTurmaId === row.id,
        });
      }
    }
  }

  // Anota flags por turma usadas pra gate de Editar/Apagar (UI esconde/disabilita
  // quando alguma família já entrou OU já há atividades). Dois SELECTs DISTINCT
  // pequenos pra não inflar o SELECT principal — bater o índice
  // `agenda_activities_turma_due_idx` e `agenda_turma_members_unique_idx`.
  const turmaIds = Array.from(byTurma.keys());
  if (turmaIds.length > 0) {
    const activityRows = await db
      .selectDistinct({ turmaId: agendaActivities.turmaId })
      .from(agendaActivities)
      .where(inArray(agendaActivities.turmaId, turmaIds));
    const turmasWithActivities = new Set(activityRows.map((r) => r.turmaId));

    const otherFamilyRows = await db
      .selectDistinct({ turmaId: agendaTurmaMembers.turmaId })
      .from(agendaTurmaMembers)
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
      )
      .where(
        and(
          inArray(agendaTurmaMembers.turmaId, turmaIds),
          sql`${agendaStudentProfiles.userId} <> ${userId}`,
        ),
      );
    const turmasWithOtherFamilies = new Set(otherFamilyRows.map((r) => r.turmaId));

    for (const turma of byTurma.values()) {
      turma.hasActivities = turmasWithActivities.has(turma.id);
      turma.hasOtherFamilies = turmasWithOtherFamilies.has(turma.id);
    }
  }

  return Array.from(byTurma.values());
}

// Usado pelo guard de Editar/Apagar turma — bloqueia mutação quando há qualquer
// atividade (própria ou de outras famílias). Cascade ON DELETE deletaria tudo;
// melhor forçar usuário a apagar atividades antes (vide CLAUDE.md §6).
export async function turmaHasActivities(turmaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(eq(agendaActivities.turmaId, turmaId))
    .limit(1);
  return row !== undefined;
}

export type UpdateTurmaPatch = {
  shift?: Turma["shift"];
  grade: Turma["grade"];
  year: number;
  classLetter: string;
};

export type UpdateTurmaResult =
  | { ok: true; turma: Turma }
  | { ok: false; code: "CONFLICT_EXISTING_TURMA" | "NOT_FOUND" };

// Atualiza grade/year/classLetter mantendo o natural key UNIQUE. Pre-check de
// colisão com outra turma da mesma escola — raro ter race aqui porque o gate
// (sem atividades, sem outras famílias) já isola turmas "frescas".
export async function updateTurma(
  turmaId: string,
  patch: UpdateTurmaPatch,
): Promise<UpdateTurmaResult> {
  const [existing] = await db
    .select({
      schoolInepCode: agendaTurmas.schoolInepCode,
      createdByUserId: agendaTurmas.createdByUserId,
      shift: agendaTurmas.shift,
    })
    .from(agendaTurmas)
    .where(eq(agendaTurmas.id, turmaId))
    .limit(1);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  const [conflict] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(
      and(
        eq(agendaTurmas.schoolInepCode, existing.schoolInepCode),
        eq(agendaTurmas.grade, patch.grade),
        eq(agendaTurmas.year, patch.year),
        eq(agendaTurmas.classLetter, patch.classLetter),
        sql`${agendaTurmas.createdByUserId} IS NOT DISTINCT FROM ${existing.createdByUserId}`,
        eq(agendaTurmas.shift, patch.shift ?? existing.shift),
        sql`${agendaTurmas.id} <> ${turmaId}`,
      ),
    )
    .limit(1);
  if (conflict) return { ok: false, code: "CONFLICT_EXISTING_TURMA" };

  const [updated] = await db
    .update(agendaTurmas)
    .set({
      grade: patch.grade,
      year: patch.year,
      classLetter: patch.classLetter,
      shift: patch.shift,
      updatedAt: new Date(),
    })
    .where(eq(agendaTurmas.id, turmaId))
    .returning();

  if (!updated) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, turma: updated };
}

export async function insertTurmaMember(turmaId: string, profileId: string): Promise<void> {
  await db
    .insert(agendaTurmaMembers)
    .values({ turmaId, studentProfileId: profileId })
    .onConflictDoNothing({
      target: [agendaTurmaMembers.turmaId, agendaTurmaMembers.studentProfileId],
    });
}

export async function setActiveTurma(
  profileId: string,
  turmaId: string | null,
  userId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (turmaId) {
      const [group] = await tx
        .select({ id: agendaTurmas.id })
        .from(agendaTurmas)
        .where(eq(agendaTurmas.id, turmaId))
        .for("update");
      if (!group) return false;
    }
    const [profile] = await tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(and(eq(agendaStudentProfiles.id, profileId), eq(agendaStudentProfiles.userId, userId)))
      .for("update");
    if (!profile) return false;
    if (turmaId) {
      const [member] = await tx
        .select({ id: agendaTurmaMembers.id })
        .from(agendaTurmaMembers)
        .where(
          and(
            eq(agendaTurmaMembers.studentProfileId, profileId),
            eq(agendaTurmaMembers.turmaId, turmaId),
          ),
        );
      if (!member) return false;
    }
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: turmaId, updatedAt: new Date() })
      .where(eq(agendaStudentProfiles.id, profileId));
    return true;
  });
}

export async function userHasMemberInTurma(userId: string, turmaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaTurmaMembers.id })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(and(eq(agendaTurmaMembers.turmaId, turmaId), eq(agendaStudentProfiles.userId, userId)))
    .limit(1);
  return row !== undefined;
}

// Versão em lote de `verifyMembership`, para telas que resolvem vários perfis
// de uma vez (o horário do dia no dashboard). Devolve os pares
// (perfil, turma) que realmente existem — `active_turma_id` sozinho é
// preferência, não participação.
export async function listMembershipsForProfiles(
  profileIds: string[],
): Promise<Array<{ profileId: string; turmaId: string }>> {
  if (profileIds.length === 0) return [];
  return db
    .select({
      profileId: agendaTurmaMembers.studentProfileId,
      turmaId: agendaTurmaMembers.turmaId,
    })
    .from(agendaTurmaMembers)
    .where(inArray(agendaTurmaMembers.studentProfileId, profileIds));
}

export async function verifyMembership(profileId: string, turmaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaTurmaMembers.id })
    .from(agendaTurmaMembers)
    .where(
      and(
        eq(agendaTurmaMembers.studentProfileId, profileId),
        eq(agendaTurmaMembers.turmaId, turmaId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// Verifica se há perfis vinculados à turma cujo `userId` != `currentUserId`.
// Usado pelo guard de "Apagar turma" — só pode apagar quando nenhuma outra
// família está vinculada (a regra é "outras famílias", não "outros perfis":
// múltiplos perfis do MESMO user não bloqueiam o creator).
export async function hasOtherFamilyMembersInTurma(
  turmaId: string,
  currentUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaTurmaMembers.id })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(
      and(
        eq(agendaTurmaMembers.turmaId, turmaId),
        sql`${agendaStudentProfiles.userId} <> ${currentUserId}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function deleteTurmaById(turmaId: string): Promise<boolean> {
  const removed = await db
    .delete(agendaTurmas)
    .where(eq(agendaTurmas.id, turmaId))
    .returning({ id: agendaTurmas.id });
  return removed.length > 0;
}

export async function deleteTurmaMember(profileId: string, turmaId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: agendaTurmas.id })
      .from(agendaTurmas)
      .where(eq(agendaTurmas.id, turmaId))
      .for("update");
    // Clear active flag if this is the active turma.
    await tx
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agendaStudentProfiles.id, profileId),
          eq(agendaStudentProfiles.activeTurmaId, turmaId),
        ),
      );
    const removed = await tx
      .delete(agendaTurmaMembers)
      .where(
        and(
          eq(agendaTurmaMembers.studentProfileId, profileId),
          eq(agendaTurmaMembers.turmaId, turmaId),
        ),
      )
      .returning({ id: agendaTurmaMembers.id });
    return removed.length > 0;
  });
}

// ----- Reference data lookups (for comboboxes) -----

export async function listStates(): Promise<StateOption[]> {
  return db
    .select({ uf: agendaStates.uf, name: agendaStates.name })
    .from(agendaStates)
    .orderBy(asc(agendaStates.name));
}

export async function searchCitiesInState(
  stateUf: string,
  q: string | undefined,
  limit = 50,
): Promise<CityOption[]> {
  const trimmed = q?.trim() ?? "";
  if (trimmed.length === 0) {
    return db
      .select({ ibgeCode: agendaCities.ibgeCode, name: agendaCities.name })
      .from(agendaCities)
      .where(eq(agendaCities.stateUf, stateUf))
      .orderBy(asc(agendaCities.name))
      .limit(limit);
  }
  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({ ibgeCode: agendaCities.ibgeCode, name: agendaCities.name })
    .from(agendaCities)
    .where(
      and(
        eq(agendaCities.stateUf, stateUf),
        // Bate o GIN trigram `agenda_cities_name_unaccent_trgm_idx` (migration
        // 0030) — usa `agenda.unaccent_immutable` (IMMUTABLE) em vez do
        // `unaccent()` bruto pra que o planner case com a expressão indexada.
        sql`agenda.unaccent_immutable(${agendaCities.name}) ilike agenda.unaccent_immutable(${pattern}) escape '\\'`,
      ),
    )
    .orderBy(asc(agendaCities.name))
    .limit(limit);
}

export async function searchSchoolsInCity(
  cityIbgeCode: string,
  q: string | undefined,
  limit = 50,
): Promise<SchoolOption[]> {
  const trimmed = q?.trim() ?? "";
  if (trimmed.length === 0) {
    return db
      .select({ inepCode: agendaSchools.inepCode, name: agendaSchools.name })
      .from(agendaSchools)
      .where(eq(agendaSchools.cityIbgeCode, cityIbgeCode))
      .orderBy(asc(agendaSchools.name))
      .limit(limit);
  }
  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({ inepCode: agendaSchools.inepCode, name: agendaSchools.name })
    .from(agendaSchools)
    .where(
      and(
        eq(agendaSchools.cityIbgeCode, cityIbgeCode),
        // Bate o GIN trigram `agenda_schools_name_unaccent_trgm_idx` (migration
        // 0030). Mesma forma usada em searchCitiesInState pra que ambos índices
        // sejam aproveitados consistentemente.
        sql`agenda.unaccent_immutable(${agendaSchools.name}) ilike agenda.unaccent_immutable(${pattern}) escape '\\'`,
      ),
    )
    .orderBy(asc(agendaSchools.name))
    .limit(limit);
}

// ----- Code generation -----

export async function generateUniqueTurmaCode(maxAttempts = 10): Promise<string> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const code = generateRandomCode();
    const existing = await findTurmaByCode(code);
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique turma code after multiple attempts");
}

function generateRandomCode(): string {
  let out = "";
  for (let i = 0; i < TURMA_CODE_LENGTH; i += 1) {
    out += TURMA_CODE_ALPHABET.charAt(randomInt(TURMA_CODE_ALPHABET.length));
  }
  return out;
}
