import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaCities,
  agendaSchools,
  agendaStates,
  agendaStudentProfiles,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, studentGroupId, studentName } from "@/features/family/scope";
import { TURMA_CODE_ALPHABET, TURMA_CODE_LENGTH } from "./limits";
import { classroomCode, classroomReadCondition } from "./scope-repository";
import type { CityOption, SchoolOption, StateOption, TurmaForUser, TurmaWithSchool } from "./types";

const schoolFields = {
  id: agendaTurmas.id,
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
};
export async function findTurmaWithSchoolById(
  actor: AgendaAuthority,
  id: string,
  client: FamilyTransaction | typeof db = db,
): Promise<TurmaWithSchool | null> {
  const [row] = await client
    .select({ ...schoolFields, code: classroomCode(actor) })
    .from(agendaTurmas)
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(agendaCities, eq(agendaCities.ibgeCode, agendaSchools.cityIbgeCode))
    .where(and(eq(agendaTurmas.id, id), classroomReadCondition(actor)))
    .limit(1);
  return row ?? null;
}
/** Possession of the current invitation reveals school metadata, never children. */
export async function findTurmaByCode(code: string) {
  const [row] = await db
    .select({ ...schoolFields, code: agendaTurmas.code })
    .from(agendaTurmas)
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(agendaCities, eq(agendaCities.ibgeCode, agendaSchools.cityIbgeCode))
    .where(and(eq(agendaTurmas.code, code), sql`${agendaTurmas.createdByUserId} IS NOT NULL`))
    .limit(1);
  return row ?? null;
}
export async function listTurmasForUser(actor: AgendaAuthority): Promise<TurmaForUser[]> {
  const rows = await db
    .select({
      ...schoolFields,
      code: classroomCode(actor),
      hasActivities: sql<boolean>`EXISTS (SELECT 1 FROM ${agendaActivities} WHERE ${agendaActivities.turmaId} = ${agendaTurmas.id})`,
      hasOtherFamilies: sql<boolean>`EXISTS (SELECT 1 FROM ${agendaTurmaMembers} JOIN ${agendaStudentProfiles}
      ON ${agendaStudentProfiles.id} = ${agendaTurmaMembers.studentProfileId}
      WHERE ${agendaTurmaMembers.turmaId} = ${agendaTurmas.id} AND ${studentGroupId} IS DISTINCT FROM ${actor.familyGroupId})`,
    })
    .from(agendaTurmas)
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(agendaCities, eq(agendaCities.ibgeCode, agendaSchools.cityIbgeCode))
    .where(classroomReadCondition(actor))
    .orderBy(asc(agendaTurmas.year), asc(agendaTurmas.grade), asc(agendaTurmas.classLetter))
    .limit(200);
  if (!rows.length) return [];
  const members = await db
    .select({
      turmaId: agendaTurmaMembers.turmaId,
      profileId: agendaStudentProfiles.id,
      profileName: studentName,
      activeTurmaId: agendaStudentProfiles.activeTurmaId,
      canManage: sql<boolean>`${agendaProfileCondition(actor, "manage")}`,
    })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(
      and(
        inArray(
          agendaTurmaMembers.turmaId,
          rows.map((r) => r.id),
        ),
        agendaProfileCondition(actor),
      ),
    );
  return rows.map((row) => ({
    ...row,
    members: members
      .filter((m) => m.turmaId === row.id)
      .map((m) => ({
        profileId: m.profileId,
        profileName: m.profileName,
        isActive: m.activeTurmaId === row.id,
        canManage: m.canManage,
      })),
  }));
}
export async function userHasMemberInTurma(actor: AgendaAuthority, turmaId: string) {
  const [row] = await db
    .select({ id: agendaTurmaMembers.id })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(and(eq(agendaTurmaMembers.turmaId, turmaId), agendaProfileCondition(actor)))
    .limit(1);
  return Boolean(row);
}
export async function listMembershipsForProfiles(actor: AgendaAuthority, profileIds: string[]) {
  if (!profileIds.length) return [];
  return db
    .select({ profileId: agendaTurmaMembers.studentProfileId, turmaId: agendaTurmaMembers.turmaId })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(
      and(inArray(agendaTurmaMembers.studentProfileId, profileIds), agendaProfileCondition(actor)),
    );
}
export async function verifyMembership(actor: AgendaAuthority, profileId: string, turmaId: string) {
  return (await listMembershipsForProfiles(actor, [profileId])).some((m) => m.turmaId === turmaId);
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

export function generateRandomCode(): string {
  let out = "";
  for (let i = 0; i < TURMA_CODE_LENGTH; i += 1) {
    out += TURMA_CODE_ALPHABET.charAt(randomInt(TURMA_CODE_ALPHABET.length));
  }
  return out;
}
