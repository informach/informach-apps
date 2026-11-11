import { familyAccessGrants, familyAppProfiles } from "@informach/db/schema";
import { and, eq, inArray, type SQLWrapper, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { profileAccessCondition } from "./access";
import type { ProfileDelegation, ProfileReadDelegation } from "./delegation-contract";
import { requireFamilyCondition } from "./errors";
import { lockProfilesAccess } from "./profile-context";
import type { FamilyTransaction } from "./types";
import { app as appSchema, id } from "./validation";

export {
  type ProfileDelegation,
  type ProfileReadDelegation,
  profileDelegationSchema,
  profileReadDelegationSchema,
} from "./delegation-contract";

/** Capture only currently granted reads, without requiring or manufacturing write access. */
export async function captureProfileReadDelegations(
  tx: FamilyTransaction,
  actorId: string,
  app: string,
  groupId: string,
  profileIds: readonly string[],
): Promise<ProfileReadDelegation[]> {
  id.parse(groupId);
  const ids = z
    .array(id)
    .min(1)
    .max(100)
    .parse([...new Set(profileIds)]);
  const scopes = await lockProfilesAccess(tx, actorId, app, ids, "read");
  requireFamilyCondition(scopes.every((scope) => scope.groupId === groupId));
  const claims = await tx
    .select({
      profileId: familyAppProfiles.id,
      groupId: familyAppProfiles.groupId,
      delegationKey: familyAppProfiles.delegationKey,
      readGrantId: familyAccessGrants.id,
    })
    .from(familyAppProfiles)
    .innerJoin(
      familyAccessGrants,
      and(
        eq(familyAccessGrants.profileId, familyAppProfiles.id),
        eq(familyAccessGrants.userId, actorId),
        eq(familyAccessGrants.action, "read"),
      ),
    )
    .where(and(inArray(familyAppProfiles.id, ids), eq(familyAppProfiles.groupId, groupId)))
    .orderBy(familyAppProfiles.id);
  requireFamilyCondition(claims.length === ids.length);
  return claims;
}

/** The consumer must additionally validate its token, expiry and revocation in the same query. */
export function delegatedProfileReadCondition(
  actorId: string | SQLWrapper,
  app: string,
  claim: { [Key in keyof ProfileReadDelegation]: SQLWrapper },
) {
  appSchema.parse(app);
  return sql`EXISTS (
    SELECT 1 FROM ${familyAppProfiles} delegated_read_profile
    JOIN ${familyAccessGrants} delegated_read_grant ON delegated_read_grant.profile_id = delegated_read_profile.id
    WHERE delegated_read_profile.id = ${claim.profileId}
      AND delegated_read_profile.group_id = ${claim.groupId}
      AND delegated_read_profile.app = ${app}
      AND delegated_read_profile.delegation_key = ${claim.delegationKey}
      AND delegated_read_grant.id = ${claim.readGrantId}
      AND delegated_read_grant.user_id = ${actorId} AND delegated_read_grant.action = 'read'
      AND ${profileAccessCondition(actorId, app, sql`delegated_read_profile.id`)}
  )`;
}

/** Server-only minting inside the app's device transaction; no domain content is returned. */
export async function captureProfileDelegations(
  tx: FamilyTransaction,
  actorId: string,
  app: string,
  groupId: string,
  profileIds: readonly string[],
): Promise<ProfileDelegation[]> {
  id.parse(groupId);
  const ids = z
    .array(id)
    .min(1)
    .max(100)
    .parse([...new Set(profileIds)]);
  const scopes = await lockProfilesAccess(tx, actorId, app, ids, "read");
  requireFamilyCondition(scopes.every((scope) => scope.groupId === groupId));
  await lockProfilesAccess(tx, actorId, app, ids, "write");
  const read = alias(familyAccessGrants, "delegation_read");
  const write = alias(familyAccessGrants, "delegation_write");
  const claims = await tx
    .select({
      profileId: familyAppProfiles.id,
      groupId: familyAppProfiles.groupId,
      delegationKey: familyAppProfiles.delegationKey,
      readGrantId: read.id,
      writeGrantId: write.id,
    })
    .from(familyAppProfiles)
    .innerJoin(
      read,
      and(
        eq(read.profileId, familyAppProfiles.id),
        eq(read.userId, actorId),
        eq(read.action, "read"),
      ),
    )
    .innerJoin(
      write,
      and(
        eq(write.profileId, familyAppProfiles.id),
        eq(write.userId, actorId),
        eq(write.action, "write"),
      ),
    )
    .where(and(inArray(familyAppProfiles.id, ids), eq(familyAppProfiles.groupId, groupId)))
    .orderBy(familyAppProfiles.id);
  requireFamilyCondition(claims.length === ids.length);
  return claims;
}

/** Bind persisted capability columns, in addition to the device's own token/expiry/revocation. */
export function delegatedProfileAccessCondition(
  actorId: string | SQLWrapper,
  app: string,
  claim: { [Key in keyof ProfileDelegation]: SQLWrapper },
) {
  appSchema.parse(app);
  return sql`EXISTS (
    SELECT 1 FROM ${familyAppProfiles} delegated_profile
    JOIN ${familyAccessGrants} delegated_read ON delegated_read.profile_id = delegated_profile.id
    JOIN ${familyAccessGrants} delegated_write ON delegated_write.profile_id = delegated_profile.id
    WHERE delegated_profile.id = ${claim.profileId}
      AND delegated_profile.group_id = ${claim.groupId}
      AND delegated_profile.app = ${app}
      AND delegated_profile.delegation_key = ${claim.delegationKey}
      AND delegated_read.id = ${claim.readGrantId} AND delegated_read.user_id = ${actorId}
      AND delegated_read.action = 'read'
      AND delegated_write.id = ${claim.writeGrantId} AND delegated_write.user_id = ${actorId}
      AND delegated_write.action = 'write'
      AND ${profileAccessCondition(actorId, app, sql`delegated_profile.id`)}
  )`;
}
