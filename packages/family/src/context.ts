import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { lockGroup, requireMember } from "./internal";
import type { FamilyReader, FamilyTransaction } from "./types";
import { id } from "./validation";

export { lockProfileAccess, lockProfilesAccess } from "./profile-context";

/** Used by collaborating domains inside their transaction; revoke and spend share the lock. */
export async function lockFamilyMembership(
  tx: FamilyTransaction,
  actorId: string,
  groupId: string,
  role?: "administrator",
) {
  id.parse(groupId);
  await lockGroup(tx, groupId);
  await lockActiveWebParticipation(tx, actorId);
  return requireMember(tx, actorId, groupId, new Date(), role);
}

export async function assertFamilyMembership(
  reader: FamilyReader,
  actorId: string,
  groupId: string,
) {
  id.parse(groupId);
  return requireMember(reader, actorId, groupId, new Date());
}

export { activateProfileInTransaction, removeProfileInTransaction } from "./links";
