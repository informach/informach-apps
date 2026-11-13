import "server-only";
import { and, eq, inArray, type SQLWrapper, sql } from "@informach/db";
import { boraProfiles, familyAppProfiles } from "@informach/db/schema";
import type { FamilyAction, FamilyTransaction } from "@informach/family";
import { profileAccessCondition } from "@informach/family/access";
import { lockProfilesAccess } from "@informach/family/context";
import { assertAllowed } from "@/lib/errors";

/** Applies authorization to the actual native profile referenced by a domain row. */
export function trainerAccessCondition(
  actorId: string,
  nativeProfileId: SQLWrapper,
  action: FamilyAction = "read",
  groupId?: string,
) {
  return sql`EXISTS (
    SELECT 1 FROM ${boraProfiles} trainer
    JOIN ${familyAppProfiles} activation ON activation.id = trainer.family_profile_id
    WHERE trainer.id = ${nativeProfileId}
      ${groupId ? sql`AND activation.group_id = ${groupId}::uuid` : sql``}
      AND ${profileAccessCondition(actorId, "bora-treinar", sql`trainer.family_profile_id`, action)}
  )`;
}

/** All groups are locked before any native profile, including workouts done together. */
export async function lockTrainerAccess(
  tx: FamilyTransaction,
  actorId: string,
  nativeProfileIds: readonly string[],
  action: FamilyAction = "write",
) {
  const ids = [...new Set(nativeProfileIds)];
  assertAllowed(ids.length > 0 && ids.length <= 100, "PROFILE", "Escolha os perfis do treino.");
  const profiles = await tx
    .select({ id: boraProfiles.id, activationId: boraProfiles.familyProfileId })
    .from(boraProfiles)
    .where(
      and(inArray(boraProfiles.id, ids), trainerAccessCondition(actorId, boraProfiles.id, action)),
    );
  const activationIds = profiles.flatMap((profile) =>
    profile.activationId ? [profile.activationId] : [],
  );
  assertAllowed(activationIds.length === ids.length, "PROFILE", "Perfil não disponível.");
  const scopes = await lockProfilesAccess(tx, actorId, "bora-treinar", activationIds, action);
  // Training writes read the current progress before updating it. A write-only
  // grant must not turn a hidden history into an empty progress map.
  if (action === "write")
    await lockProfilesAccess(tx, actorId, "bora-treinar", activationIds, "read");
  // A native row must still reference the activation checked above when it is locked.
  for (const profile of profiles.sort((a, b) => a.id.localeCompare(b.id))) {
    assertAllowed(profile.activationId, "PROFILE", "Perfil não disponível.");
    const [current] = await tx
      .select({ id: boraProfiles.id })
      .from(boraProfiles)
      .where(
        and(
          eq(boraProfiles.id, profile.id),
          eq(boraProfiles.familyProfileId, profile.activationId),
          trainerAccessCondition(actorId, boraProfiles.id, action),
        ),
      )
      .for("update");
    assertAllowed(current, "PROFILE", "Perfil não disponível.");
  }
  return scopes;
}
