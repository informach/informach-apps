import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyInvitations,
  familyMembers,
  familyPeople,
  familyPersonManagers,
  users,
} from "@informach/db/schema";
import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { lockGroup, requireMember } from "./internal";
import { listPersonTransfers } from "./management-transfer";
import { listPeople } from "./people";
import type { FamilyServiceConfig } from "./types";
import { id } from "./validation";

/** Safe account-center projection: no domain content, invitation hashes or unrelated identities. */
export async function familyManagement(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
) {
  id.parse(groupId);
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    const now = deps.now?.() ?? new Date();
    const actor = await requireMember(tx, actorId, groupId, now);
    const people = await listPeople({ db: tx }, actorId, groupId);
    const archivedPeople = await tx
      .select({
        id: familyPeople.id,
        displayName: familyPeople.displayName,
        version: familyPeople.version,
      })
      .from(familyPeople)
      .innerJoin(
        familyGroupPeople,
        and(
          eq(familyGroupPeople.personId, familyPeople.id),
          eq(familyGroupPeople.groupId, groupId),
        ),
      )
      .innerJoin(
        familyPersonManagers,
        and(
          eq(familyPersonManagers.personId, familyPeople.id),
          eq(familyPersonManagers.userId, actorId),
        ),
      )
      .where(
        and(
          isNull(familyPeople.userId),
          isNull(familyPeople.archivedAt),
          isNotNull(familyGroupPeople.archivedAt),
        ),
      );
    const members = await tx
      .select({ userId: familyMembers.userId, name: users.name, role: familyMembers.role })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.userId))
      .where(and(eq(familyMembers.groupId, groupId), isNull(familyMembers.revokedAt)))
      .orderBy(familyMembers.createdAt);
    const invitations =
      actor.role === "administrator"
        ? await tx
            .select({
              id: familyInvitations.id,
              email: familyInvitations.email,
              expiresAt: familyInvitations.expiresAt,
            })
            .from(familyInvitations)
            .where(
              and(
                eq(familyInvitations.groupId, groupId),
                isNull(familyInvitations.revokedAt),
                isNull(familyInvitations.acceptedAt),
                gt(familyInvitations.expiresAt, now),
              ),
            )
            .orderBy(familyInvitations.createdAt)
        : [];
    const profiles = people.length
      ? await tx
          .select({
            id: familyAppProfiles.id,
            personId: familyAppProfiles.personId,
            app: familyAppProfiles.app,
          })
          .from(familyAppProfiles)
          .where(
            and(
              eq(familyAppProfiles.groupId, groupId),
              inArray(
                familyAppProfiles.personId,
                people.map((p) => p.id),
              ),
              isNull(familyAppProfiles.archivedAt),
            ),
          )
      : [];
    const ownGrants = profiles.length
      ? await tx
          .select({ profileId: familyAccessGrants.profileId, action: familyAccessGrants.action })
          .from(familyAccessGrants)
          .where(
            and(
              eq(familyAccessGrants.groupId, groupId),
              eq(familyAccessGrants.userId, actorId),
              inArray(
                familyAccessGrants.profileId,
                profiles.map((p) => p.id),
              ),
            ),
          )
      : [];
    const manageable = ownGrants.filter((g) => g.action === "manage").map((g) => g.profileId);
    const grants = manageable.length
      ? await tx
          .select({
            profileId: familyAccessGrants.profileId,
            userId: familyAccessGrants.userId,
            action: familyAccessGrants.action,
          })
          .from(familyAccessGrants)
          .innerJoin(
            familyMembers,
            and(
              eq(familyMembers.groupId, familyAccessGrants.groupId),
              eq(familyMembers.userId, familyAccessGrants.userId),
            ),
          )
          .where(
            and(
              eq(familyAccessGrants.groupId, groupId),
              inArray(familyAccessGrants.profileId, manageable),
              isNull(familyMembers.revokedAt),
            ),
          )
      : [];
    return {
      transfers: await listPersonTransfers(tx, actorId, groupId, now),
      people,
      archivedPeople,
      members,
      invitations,
      profiles: profiles
        .filter(
          (p) =>
            people.some((person) => person.id === p.personId && person.canManageIdentity) ||
            ownGrants.some(
              (g) => g.profileId === p.id && (g.action === "read" || g.action === "manage"),
            ),
        )
        .map((p) => ({
          ...p,
          actions: ownGrants.filter((g) => g.profileId === p.id).map((g) => g.action),
          grants: grants
            .filter((g) => g.profileId === p.id)
            .map((g) => ({ userId: g.userId, action: g.action })),
        })),
    };
  });
}
