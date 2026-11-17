import "server-only";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
  missaoProfiles,
  users,
} from "@informach/db/schema";
import type { FamilyReader } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import { assertAllowed } from "@/lib/errors";
import type { LearningAuthority, ParentAuthority } from "./authority";
import { allowedProfileIds } from "./profile-access";
import { lockStudentAccess, studentAccessCondition } from "./scope";

/** Identity always comes from the shared person. The native ID and school data remain stable. */
export const studentFields = {
  id: missaoProfiles.id,
  familyProfileId: familyAppProfiles.id,
  familyGroupId: familyAppProfiles.groupId,
  personId: familyAppProfiles.personId,
  userId: missaoProfiles.userId,
  nickname: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
  avatar: familyPeople.avatar,
  grade: missaoProfiles.grade,
  gradeYear: missaoProfiles.gradeYear,
  birthMonth: missaoProfiles.birthMonth,
  courseId: missaoProfiles.courseId,
  accessEnabled: missaoProfiles.accessEnabled,
  createdAt: missaoProfiles.createdAt,
};

export function readStudents(reader: FamilyReader, actor: LearningAuthority, profileId?: string) {
  return reader
    .select({
      ...studentFields,
      // The WHERE clause already proves current membership, identity, app and
      // device scope. Capability flags only add the requested explicit grant;
      // repeating the complete multi-table predicate here multiplies planning cost.
      canWrite: sql<boolean>`EXISTS (SELECT 1 FROM ${familyAccessGrants} capability
        WHERE capability.profile_id = ${familyAppProfiles.id}
          AND capability.group_id = ${familyAppProfiles.groupId}
          AND capability.user_id = ${actor.userId} AND capability.action = 'write')`.mapWith(
        Boolean,
      ),
      canManage: (actor.kind === "study"
        ? sql<boolean>`false`
        : sql<boolean>`EXISTS (
        SELECT 1 FROM ${familyAccessGrants} capability
        WHERE capability.profile_id = ${familyAppProfiles.id}
          AND capability.group_id = ${familyAppProfiles.groupId}
          AND capability.user_id = ${actor.userId} AND capability.action = 'manage')`
      ).mapWith(Boolean),
    })
    .from(missaoProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .where(
      and(
        studentAccessCondition(actor, missaoProfiles.id),
        profileId ? eq(missaoProfiles.id, profileId) : undefined,
      ),
    )
    .orderBy(missaoProfiles.createdAt, missaoProfiles.id);
}

/** Slots belong to the whole family; a narrower grant must not create another free slot. */
export async function enabledStudentIds(
  reader: FamilyReader,
  actor: LearningAuthority,
  limit: number,
) {
  const rows = await reader
    .select({ id: missaoProfiles.id, accessEnabled: missaoProfiles.accessEnabled })
    .from(missaoProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
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
        eq(familyAppProfiles.groupId, actor.familyGroupId),
        eq(familyAppProfiles.app, "missao-saber"),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    )
    .orderBy(missaoProfiles.createdAt, missaoProfiles.id);
  return allowedProfileIds(rows, limit);
}

export async function countStudents(reader: FamilyReader, actor: LearningAuthority) {
  const rows = await reader
    .select({ total: sql<number>`count(*)::int` })
    .from(missaoProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
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
        eq(familyAppProfiles.groupId, actor.familyGroupId),
        eq(familyAppProfiles.app, "missao-saber"),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    );
  return rows[0]?.total ?? 0;
}

/** Preference for one-student coverage; never deletes history or changes the contract. */
export async function chooseLimitedStudent(actor: ParentAuthority, selectedId: string) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    const candidates = await tx
      .select({ id: missaoProfiles.id })
      .from(missaoProfiles)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
      .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
      .innerJoin(
        familyGroupPeople,
        and(
          eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
          eq(familyGroupPeople.personId, familyPeople.id),
        ),
      )
      .where(
        and(
          eq(familyAppProfiles.groupId, actor.familyGroupId),
          eq(familyAppProfiles.app, "missao-saber"),
          isNull(familyAppProfiles.archivedAt),
          isNull(familyPeople.archivedAt),
          isNull(familyGroupPeople.archivedAt),
        ),
      );
    const ids = candidates.map((profile) => profile.id);
    assertAllowed(
      ids.includes(selectedId),
      "PROFILE_SELECTION",
      "Escolha um estudante desta família.",
    );
    await lockStudentAccess(tx, actor, ids, "manage");
    await tx
      .update(missaoProfiles)
      .set({ accessEnabled: sql`${missaoProfiles.id} = ${selectedId}::uuid` })
      .where(inArray(missaoProfiles.id, ids));
  });
}
