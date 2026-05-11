import "server-only";

import { and, asc, db, eq, inArray, or, sql } from "@informach/db";
import {
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
  createdByUserId: string;
};

export type InsertTurmaResult = { turma: Turma; created: boolean };

export async function insertTurmaIfNotExists(payload: NewTurmaPayload): Promise<InsertTurmaResult> {
  const inserted = await db
    .insert(agendaTurmas)
    .values(payload)
    .onConflictDoNothing({
      target: [
        agendaTurmas.schoolInepCode,
        agendaTurmas.grade,
        agendaTurmas.year,
        agendaTurmas.classLetter,
      ],
    })
    .returning();

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
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error(
      "agenda.turmas: insert returning empty AND existing row not found — check natural key",
    );
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

  const rows = await db
    .select({
      id: agendaTurmas.id,
      code: agendaTurmas.code,
      schoolInepCode: agendaTurmas.schoolInepCode,
      grade: agendaTurmas.grade,
      year: agendaTurmas.year,
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
    .orderBy(asc(agendaTurmas.year), asc(agendaTurmas.grade), asc(agendaTurmas.classLetter));

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
        classLetter: row.classLetter,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        schoolName: row.schoolName,
        cityName: row.cityName,
        stateUf: row.stateUf,
        members: [],
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
  return Array.from(byTurma.values());
}

export async function insertTurmaMember(turmaId: string, profileId: string): Promise<void> {
  await db
    .insert(agendaTurmaMembers)
    .values({ turmaId, studentProfileId: profileId })
    .onConflictDoNothing({
      target: [agendaTurmaMembers.turmaId, agendaTurmaMembers.studentProfileId],
    });
}

export async function setActiveTurma(profileId: string, turmaId: string | null): Promise<void> {
  await db
    .update(agendaStudentProfiles)
    .set({ activeTurmaId: turmaId, updatedAt: new Date() })
    .where(eq(agendaStudentProfiles.id, profileId));
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
        sql`unaccent(${agendaCities.name}) ilike unaccent(${pattern}) escape '\\'`,
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
        sql`unaccent(${agendaSchools.name}) ilike unaccent(${pattern}) escape '\\'`,
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
    out += TURMA_CODE_ALPHABET.charAt(Math.floor(Math.random() * TURMA_CODE_ALPHABET.length));
  }
  return out;
}
