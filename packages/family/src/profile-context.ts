import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { familyAppProfiles } from "@informach/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { profileAccessCondition } from "./access";
import { requireFamilyCondition } from "./errors";
import { lockGroup } from "./internal";
import type { FamilyAction, FamilyTransaction } from "./types";
import { action as actionSchema, app as appSchema, id } from "./validation";

/**
 * Authorizes a domain write under the same locks used by revocation and association.
 * IDs must come from the domain's persisted activation references, never a second
 * client-supplied scope. Call before locking domain rows and keep the write in tx.
 */
export async function lockProfilesAccess(
  tx: FamilyTransaction,
  actorId: string,
  app: string,
  profileIds: readonly string[],
  action: FamilyAction = "write",
) {
  appSchema.parse(app);
  actionSchema.parse(action);
  const ids = z
    .array(id)
    .min(1)
    .max(100)
    .parse([...new Set(profileIds)]);
  const authorized = () =>
    tx
      .select({
        profileId: familyAppProfiles.id,
        groupId: familyAppProfiles.groupId,
        personId: familyAppProfiles.personId,
      })
      .from(familyAppProfiles)
      .where(
        and(
          eq(familyAppProfiles.app, app),
          inArray(familyAppProfiles.id, ids),
          profileAccessCondition(actorId, app, familyAppProfiles.id, action),
        ),
      )
      .orderBy(familyAppProfiles.id);
  // Do not let an unauthorized caller acquire another family's lock.
  const observed = await authorized();
  requireFamilyCondition(observed.length === ids.length);
  const groups = [...new Set(observed.map((profile) => profile.groupId))].sort();
  for (const groupId of groups) await lockGroup(tx, groupId);
  await lockActiveWebParticipation(tx, actorId);
  // Authorization observed before waiting is not permission to write afterwards.
  const current = await authorized();
  requireFamilyCondition(
    current.length === ids.length && current.every((profile) => groups.includes(profile.groupId)),
  );
  return current;
}

export async function lockProfileAccess(
  tx: FamilyTransaction,
  actorId: string,
  app: string,
  profileId: string,
  action: FamilyAction = "write",
) {
  const [profile] = await lockProfilesAccess(tx, actorId, app, [profileId], action);
  requireFamilyCondition(profile);
  return profile;
}
