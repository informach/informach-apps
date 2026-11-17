import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyGroups,
  familyMembers,
  familyPeople,
  users,
} from "@informach/db/schema";
import { and, eq, isNull, type SQLWrapper, sql } from "drizzle-orm";
import { requireFamilyCondition } from "./errors";
import { activeUserCondition, audit, lockGroup, requireMember } from "./internal";
import type { FamilyReader, FamilyServiceConfig, GrantAccessInput, PersonTarget } from "./types";
import { app as appSchema, grantSchema, targetSchema } from "./validation";

/** Membership for group-owned settings only; it never grants access to profile content. */
export function familyMembershipCondition(actorId: string | SQLWrapper, groupId: SQLWrapper) {
  // Keep this authorization graph as a correlated subplan. Flattening several
  // nested device/profile checks into one join graph makes PostgreSQL spend
  // hundreds of milliseconds planning single-row lookups. OFFSET 0 preserves
  // every predicate and live revocation check, without caching authorization.
  return sql`EXISTS (
    SELECT 1 FROM ${familyMembers} fm
    JOIN ${familyGroups} g ON g.id = fm.group_id
    JOIN ${users} u ON u.id = fm.user_id
    WHERE fm.group_id = ${groupId} AND fm.user_id = ${actorId}
      AND fm.revoked_at IS NULL AND g.archived_at IS NULL AND u.email_verified = true
      AND ${activeWebParticipationCondition(actorId)}
      AND (u.banned = false OR u.ban_expires_at <= statement_timestamp())
    OFFSET 0
  )`;
}

export async function assertPersonAccess(
  reader: FamilyReader,
  actorId: string,
  target: PersonTarget,
  now = new Date(),
) {
  const input = targetSchema.parse(target);
  const [profile] = await reader
    .select({ id: familyAppProfiles.id })
    .from(familyAppProfiles)
    .innerJoin(
      familyAccessGrants,
      and(
        eq(familyAccessGrants.profileId, familyAppProfiles.id),
        eq(familyAccessGrants.groupId, familyAppProfiles.groupId),
      ),
    )
    .innerJoin(
      familyMembers,
      and(
        eq(familyMembers.groupId, familyAccessGrants.groupId),
        eq(familyMembers.userId, familyAccessGrants.userId),
      ),
    )
    .innerJoin(familyGroups, eq(familyGroups.id, familyAppProfiles.groupId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .innerJoin(
      familyGroupPeople,
      and(
        eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
        eq(familyGroupPeople.personId, familyAppProfiles.personId),
      ),
    )
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(
      and(
        eq(familyAppProfiles.groupId, input.groupId),
        eq(familyAppProfiles.personId, input.personId),
        eq(familyAppProfiles.app, input.app),
        eq(familyAccessGrants.userId, actorId),
        eq(familyAccessGrants.action, input.action),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroups.archivedAt),
        isNull(familyGroupPeople.archivedAt),
        isNull(familyMembers.revokedAt),
        activeUserCondition(now),
      ),
    )
    .limit(1);
  requireFamilyCondition(profile);
  return profile;
}

/** Predicate for domain queries. Bind the actual profile ID column, never a client-supplied scope. */
export function profileAccessCondition(
  actorId: string | SQLWrapper,
  app: string,
  profileId: SQLWrapper,
  action: PersonTarget["action"] = "read",
) {
  appSchema.parse(app);
  return sql`EXISTS (
    SELECT 1 FROM ${familyAppProfiles} fp
    JOIN ${familyAccessGrants} fg ON fg.profile_id = fp.id AND fg.group_id = fp.group_id
    JOIN ${familyMembers} fm ON fm.group_id = fp.group_id AND fm.user_id = fg.user_id
    JOIN ${familyGroups} g ON g.id = fp.group_id
    JOIN ${familyGroupPeople} gp ON gp.group_id = fp.group_id AND gp.person_id = fp.person_id
    JOIN ${familyPeople} p ON p.id = fp.person_id
    JOIN ${users} u ON u.id = fm.user_id
    WHERE fp.id = ${profileId} AND fp.app = ${app} AND fg.user_id = ${actorId} AND fg.action = ${action}
      AND fp.archived_at IS NULL AND g.archived_at IS NULL AND gp.archived_at IS NULL
      AND p.archived_at IS NULL AND fm.revoked_at IS NULL AND u.email_verified = true
      AND ${activeWebParticipationCondition(actorId)}
      AND (u.banned = false OR u.ban_expires_at <= statement_timestamp())
    OFFSET 0
  )`;
}

export async function changeAccess(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: GrantAccessInput,
  grant: boolean,
) {
  const input = grantSchema.parse(raw);
  const now = deps.now?.() ?? new Date();
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    const profile = await assertPersonAccess(
      tx,
      actorId,
      { ...inputTarget(input), action: "manage" },
      now,
    );
    // A manager cannot delegate a capability that they do not themselves possess.
    await assertPersonAccess(tx, actorId, inputTarget(input), now);
    await requireMember(tx, input.userId, input.groupId, now);
    requireFamilyCondition(
      input.userId !== actorId,
      "CONFLICT",
      "Use a gestão de responsáveis para alterar seu próprio acesso.",
    );
    const identity = {
      groupId: input.groupId,
      profileId: profile.id,
      userId: input.userId,
      action: input.action,
    };
    if (grant) await tx.insert(familyAccessGrants).values(identity).onConflictDoNothing();
    else
      await tx
        .delete(familyAccessGrants)
        .where(
          and(
            eq(familyAccessGrants.profileId, profile.id),
            eq(familyAccessGrants.userId, input.userId),
            eq(familyAccessGrants.action, input.action),
          ),
        );
    await audit(tx, {
      event: grant ? `access.${input.action}.granted` : `access.${input.action}.revoked`,
      groupId: input.groupId,
      personId: input.personId,
      actorId,
      targetId: input.userId,
    });
  });
}

function inputTarget(input: GrantAccessInput): PersonTarget {
  return { groupId: input.groupId, personId: input.personId, app: input.app, action: input.action };
}
