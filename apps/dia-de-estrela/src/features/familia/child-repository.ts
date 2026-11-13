import "server-only";
import { and, eq, isNull, sql } from "@informach/db";
import {
  estrelaChildren,
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
  users,
} from "@informach/db/schema";
import type { FamilyReader } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import { allowedChildIds } from "./acesso-criancas";
import type { EstrelaAuthority } from "./authority";
import { childAccessCondition } from "./scope";

export const childFields = {
  id: estrelaChildren.id,
  familyProfileId: familyAppProfiles.id,
  familyGroupId: familyAppProfiles.groupId,
  personId: familyAppProfiles.personId,
  name: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
  color: familyPeople.color,
  position: estrelaChildren.position,
  accessEnabled: estrelaChildren.accessEnabled,
  createdAt: estrelaChildren.createdAt,
};

export function readChildren(reader: FamilyReader, actor: EstrelaAuthority, childId?: string) {
  return reader
    .select({
      ...childFields,
      canWrite: sql<boolean>`EXISTS (SELECT 1 FROM ${familyAccessGrants} capability
      WHERE capability.profile_id = ${familyAppProfiles.id} AND capability.group_id = ${familyAppProfiles.groupId}
        AND capability.user_id = ${actor.userId} AND capability.action = 'write')`.mapWith(Boolean),
      canManage: (actor.kind !== "adult"
        ? sql<boolean>`false`
        : sql<boolean>`EXISTS (SELECT 1 FROM ${familyAccessGrants} capability
      WHERE capability.profile_id = ${familyAppProfiles.id} AND capability.group_id = ${familyAppProfiles.groupId}
        AND capability.user_id = ${actor.userId} AND capability.action = 'manage')`
      ).mapWith(Boolean),
    })
    .from(estrelaChildren)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, estrelaChildren.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .where(
      and(
        childAccessCondition(actor, estrelaChildren.id),
        childId ? eq(estrelaChildren.id, childId) : undefined,
      ),
    )
    .orderBy(estrelaChildren.position, estrelaChildren.createdAt, estrelaChildren.id);
}
export type ChildRow = Awaited<ReturnType<typeof readChildren>>[number];

/** Capacity belongs to the household, not to each subset granted to an adult/device. */
export async function enabledChildIds(
  reader: FamilyReader,
  actor: EstrelaAuthority,
  limit: number,
) {
  const candidates = await reader
    .select({ id: estrelaChildren.id, accessEnabled: estrelaChildren.accessEnabled })
    .from(estrelaChildren)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, estrelaChildren.familyProfileId))
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
        eq(familyAppProfiles.app, "dia-de-estrela"),
        familyMembershipCondition(actor.userId, familyAppProfiles.groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    )
    .orderBy(estrelaChildren.position, estrelaChildren.createdAt, estrelaChildren.id);
  return allowedChildIds(candidates, limit);
}
