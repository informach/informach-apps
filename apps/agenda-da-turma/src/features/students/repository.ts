import "server-only";
import { and, asc, count, db, eq, isNull, sql } from "@informach/db";
import {
  agendaSchools,
  agendaStudentProfiles,
  agendaTurmas,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
} from "@informach/db/schema";
import { FamilyError, type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership, removeProfileInTransaction } from "@informach/family/context";
import { eraseAgendaProfiles } from "@/features/account/cleanup-repository";
import { lockAgendaProfileSchoolContexts } from "@/features/account/school-closure-repository";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition, lockAgendaProfiles, studentName } from "@/features/family/scope";
import { familyService } from "@/features/family/service-repository";
import { activeMembershipCondition } from "@/features/turmas/access";

export class StudentCapacityError extends Error {
  constructor(
    readonly current: number,
    readonly limit: number,
    readonly isPro: boolean,
  ) {
    super("STUDENT_CAPACITY_EXCEEDED");
  }
}

const studentFields = {
  id: agendaStudentProfiles.id,
  familyProfileId: agendaStudentProfiles.familyProfileId,
  name: studentName,
  birthDate: agendaStudentProfiles.birthDate,
  activeTurmaId: agendaStudentProfiles.activeTurmaId,
  createdAt: agendaStudentProfiles.createdAt,
  updatedAt: agendaStudentProfiles.updatedAt,
};

function projection(actor: AgendaAuthority) {
  return {
    ...studentFields,
    canUseAi: sql<boolean>`${agendaProfileCondition(actor, "use_ai")}`.mapWith(Boolean),
    canWrite: sql<boolean>`${agendaProfileCondition(actor, "write")}`.mapWith(Boolean),
    canManage: sql<boolean>`${agendaProfileCondition(actor, "manage")}`.mapWith(Boolean),
  };
}

/** Capacity counts the whole family, including profiles the visiting adult cannot read. */
export async function groupStudentIds(
  client: typeof db | FamilyTransaction,
  actor: AgendaAuthority,
) {
  return client
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .innerJoin(
      familyGroupPeople,
      and(
        eq(familyGroupPeople.personId, familyPeople.id),
        eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
      ),
    )
    .where(
      and(
        eq(familyAppProfiles.app, "agenda-da-turma"),
        eq(familyAppProfiles.groupId, actor.familyGroupId),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    )
    .orderBy(asc(agendaStudentProfiles.createdAt), asc(agendaStudentProfiles.id));
}

export async function insertStudentProfileWithinLimit(
  actor: AgendaAuthority,
  input: { personId: string; birthDate: string | null },
) {
  const result = await familyService.activateProfile(
    actor.userId,
    { groupId: actor.familyGroupId, personId: input.personId, app: "agenda-da-turma" },
    async (tx, familyProfileId) => {
      const [person] = await tx
        .select({ kind: familyPeople.kind })
        .from(familyPeople)
        .where(eq(familyPeople.id, input.personId));
      requireFamilyCondition(
        person?.kind === "dependent",
        "INVALID_INPUT",
        "Escolha uma criança desta família.",
      );
      const access = await agendaAccessInTransaction(tx, actor);
      const current = (await groupStudentIds(tx, actor)).length;
      if (current >= access.profileLimit)
        throw new StudentCapacityError(current, access.profileLimit, access.enabled);
      const [profile] = await tx
        .insert(agendaStudentProfiles)
        .values({
          familyProfileId,
          birthDate: input.birthDate,
        })
        .returning({ id: agendaStudentProfiles.id });
      requireFamilyCondition(profile);
      return profile.id;
    },
  );
  const profile = await findStudentProfileByIdForUser(actor, result.value);
  requireFamilyCondition(profile);
  return profile;
}

export function findStudentProfilesByUser(actor: AgendaAuthority) {
  return db
    .select(projection(actor))
    .from(agendaStudentProfiles)
    .where(agendaProfileCondition(actor))
    .orderBy(asc(agendaStudentProfiles.createdAt), asc(agendaStudentProfiles.id));
}

export async function findStudentProfileByIdForUser(actor: AgendaAuthority, id: string) {
  const [row] = await db
    .select(projection(actor))
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.id, id), agendaProfileCondition(actor)))
    .limit(1);
  return row ?? null;
}

export async function updateStudentProfileForUser(
  actor: AgendaAuthority,
  id: string,
  payload: { birthDate: string | null },
) {
  try {
    await db.transaction(async (tx) => {
      await lockAgendaProfiles(tx, actor, [id]);
      await tx
        .update(agendaStudentProfiles)
        .set({ birthDate: payload.birthDate, updatedAt: new Date() })
        .where(eq(agendaStudentProfiles.id, id));
    });
    return findStudentProfileByIdForUser(actor, id);
  } catch (error) {
    if (error instanceof FamilyError && error.code === "ACCESS_DENIED") return null;
    throw error;
  }
}

export async function deleteStudentProfileForUser(actor: AgendaAuthority, id: string) {
  const [row] = await db
    .select({ activationId: agendaStudentProfiles.familyProfileId })
    .from(agendaStudentProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
    .where(
      and(
        eq(agendaStudentProfiles.id, id),
        eq(familyAppProfiles.groupId, actor.familyGroupId),
        eq(familyAppProfiles.app, "agenda-da-turma"),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
      ),
    );
  if (!row?.activationId) return false;
  try {
    await db.transaction(async (tx) => {
      const verifySchool = await lockAgendaProfileSchoolContexts(tx, [row.activationId]);
      await removeProfileInTransaction(
        tx,
        actor.userId,
        "agenda-da-turma",
        row.activationId,
        async (tx, activationId) => {
          await verifySchool();
          const [removed] = await eraseAgendaProfiles(tx, [activationId], actor.userId);
          requireFamilyCondition(
            removed?.id === id,
            "CONFLICT",
            "O histórico mudou. Atualize a página.",
          );
        },
      );
    });
    return true;
  } catch (error) {
    if (error instanceof FamilyError && error.code === "ACCESS_DENIED") return false;
    throw error;
  }
}

export async function countStudentProfilesByUser(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    return (await groupStudentIds(tx, actor)).length;
  });
}

export async function findStudentProfilesWithActiveTurmaByUser(actor: AgendaAuthority) {
  const rows = await db
    .select({
      profile: projection(actor),
      turmaId: agendaTurmas.id,
      turmaGrade: agendaTurmas.grade,
      turmaClassLetter: agendaTurmas.classLetter,
      schoolName: agendaSchools.name,
    })
    .from(agendaStudentProfiles)
    .leftJoin(
      agendaTurmas,
      and(eq(agendaTurmas.id, agendaStudentProfiles.activeTurmaId), activeMembershipCondition()),
    )
    .leftJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .where(agendaProfileCondition(actor))
    .orderBy(asc(agendaStudentProfiles.createdAt), asc(agendaStudentProfiles.id));
  return rows.map((row) => {
    const activeTurma =
      row.turmaId && row.turmaGrade && row.turmaClassLetter && row.schoolName
        ? {
            id: row.turmaId,
            grade: row.turmaGrade,
            classLetter: row.turmaClassLetter,
            schoolName: row.schoolName,
          }
        : null;
    return { ...row.profile, activeTurmaId: activeTurma?.id ?? null, activeTurma };
  });
}

export async function countProfilesWithoutActiveTurmaByUser(actor: AgendaAuthority) {
  const [row] = await db
    .select({ count: count() })
    .from(agendaStudentProfiles)
    .where(
      and(agendaProfileCondition(actor, "manage"), isNull(agendaStudentProfiles.activeTurmaId)),
    );
  return Number(row?.count ?? 0);
}
