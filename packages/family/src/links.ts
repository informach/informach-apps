import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { familyAccessGrants, familyAppProfiles } from "@informach/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { familyMembershipCondition } from "./access";
import { requireFamilyCondition } from "./errors";
import { audit, lockGroup, lockPerson, requireIdentityManager } from "./internal";
import {
  FAMILY_ACTIONS,
  type FamilyServiceConfig,
  type FamilyTransaction,
  type ProfileLinkInput,
} from "./types";
import { app as appSchema, id, linkSchema } from "./validation";

/** The caller must create app-specific data in this same transaction through activateProfile. */
export async function activateProfile<T>(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: ProfileLinkInput,
  createDomainData: (
    tx: Parameters<Parameters<FamilyServiceConfig["db"]["transaction"]>[0]>[0],
    profileId: string,
  ) => Promise<T>,
) {
  return deps.db.transaction((tx) =>
    activateProfileInTransaction(tx, actorId, raw, createDomainData, deps.now?.() ?? new Date()),
  );
}

/** Compose several activations and domain setup in one atomic, authorized transaction. */
export async function activateProfileInTransaction<T>(
  tx: FamilyTransaction,
  actorId: string,
  raw: ProfileLinkInput,
  createDomainData: (tx: FamilyTransaction, profileId: string) => Promise<T>,
  now = new Date(),
) {
  const input = linkSchema.parse(raw);
  await lockGroup(tx, input.groupId);
  await lockActiveWebParticipation(tx, actorId);
  await lockPerson(tx, input.personId);
  await requireIdentityManager(tx, actorId, input.groupId, input.personId, now);
  const [existing] = await tx
    .select({ id: familyAppProfiles.id })
    .from(familyAppProfiles)
    .where(
      and(
        eq(familyAppProfiles.groupId, input.groupId),
        eq(familyAppProfiles.personId, input.personId),
        eq(familyAppProfiles.app, input.app),
      ),
    );
  requireFamilyCondition(
    !existing,
    "CONFLICT",
    "Esta pessoa já tem um perfil neste aplicativo e contexto.",
  );
  const [profile] = await tx
    .insert(familyAppProfiles)
    .values(input)
    .returning({ id: familyAppProfiles.id });
  requireFamilyCondition(profile);
  await tx.insert(familyAccessGrants).values(
    FAMILY_ACTIONS.map((action) => ({
      groupId: input.groupId,
      profileId: profile.id,
      userId: actorId,
      action,
    })),
  );
  const value = await createDomainData(tx, profile.id);
  await audit(tx, {
    event: "profile.activated",
    groupId: input.groupId,
    personId: input.personId,
    actorId,
    targetId: profile.id,
  });
  return { profileId: profile.id, value };
}

/** Locate activation without returning any domain content; authorization stays explicit. */
export async function findPersonProfile(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: ProfileLinkInput,
) {
  const input = linkSchema.parse(raw);
  await requireIdentityManager(
    deps.db,
    actorId,
    input.groupId,
    input.personId,
    deps.now?.() ?? new Date(),
  );
  const [profile] = await deps.db
    .select({ id: familyAppProfiles.id })
    .from(familyAppProfiles)
    .where(
      and(
        eq(familyAppProfiles.groupId, input.groupId),
        eq(familyAppProfiles.personId, input.personId),
        eq(familyAppProfiles.app, input.app),
        isNull(familyAppProfiles.archivedAt),
      ),
    )
    .limit(1);
  return profile ?? null;
}

/** Explicit app-data deletion keeps the person and other app histories intact. */
export async function removeProfile(
  deps: FamilyServiceConfig,
  actorId: string,
  app: string,
  profileId: string,
  removeDomainData: Parameters<typeof activateProfile>[3],
) {
  return deps.db.transaction((tx) =>
    removeProfileInTransaction(tx, actorId, app, profileId, removeDomainData),
  );
}

/** Compose authorized domain removal into an existing transaction without weakening custody. */
export async function removeProfileInTransaction(
  tx: FamilyTransaction,
  actorId: string,
  app: string,
  profileId: string,
  removeDomainData: Parameters<typeof activateProfile>[3],
) {
  appSchema.parse(app);
  id.parse(profileId);
  // Archiving suppresses use of the content, not a manager's ability to erase it.
  // This narrower query is exclusive to removal and never returns domain history.
  const authorized = () =>
    tx
      .select({ groupId: familyAppProfiles.groupId, personId: familyAppProfiles.personId })
      .from(familyAppProfiles)
      .innerJoin(
        familyAccessGrants,
        and(
          eq(familyAccessGrants.profileId, familyAppProfiles.id),
          eq(familyAccessGrants.groupId, familyAppProfiles.groupId),
        ),
      )
      .where(
        and(
          eq(familyAppProfiles.id, profileId),
          eq(familyAppProfiles.app, app),
          eq(familyAccessGrants.userId, actorId),
          eq(familyAccessGrants.action, "manage"),
          familyMembershipCondition(actorId, familyAppProfiles.groupId),
        ),
      );
  const [observed] = await authorized();
  requireFamilyCondition(observed);
  await lockGroup(tx, observed.groupId);
  await lockActiveWebParticipation(tx, actorId);
  const [scope] = await authorized();
  requireFamilyCondition(
    scope && scope.groupId === observed.groupId && scope.personId === observed.personId,
  );
  // Domain FK restrictions make forgetting a domain history fail atomically.
  await removeDomainData(tx, profileId);
  await tx.delete(familyAppProfiles).where(eq(familyAppProfiles.id, profileId));
  await audit(tx, {
    event: "profile.removed",
    actorId,
    groupId: scope.groupId,
    personId: scope.personId,
    targetId: profileId,
  });
}
