import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import { boraProfiles, familyAppProfiles, familyMigrationSources } from "@informach/db/schema";
import { trainerAccessCondition } from "../familia/scope";
import type { LegacyQueueCandidate, TrainingContext } from "./context";

/** Old unscoped rows belong only to the imported owner, never the next browser user. */
export async function recoverableLegacyQueue(
  scope: TrainingContext,
  candidates: LegacyQueueCandidate[],
) {
  const ids = [...new Set(candidates.flatMap((candidate) => candidate.profileIds))];
  if (!ids.length) return [];
  const profiles = await db
    .select({ id: boraProfiles.id })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .innerJoin(
      familyMigrationSources,
      and(
        eq(familyMigrationSources.groupId, familyAppProfiles.groupId),
        eq(familyMigrationSources.app, "bora-treinar"),
        eq(familyMigrationSources.sourceOwnerId, scope.actorId),
      ),
    )
    .where(
      and(
        inArray(boraProfiles.id, ids),
        eq(familyAppProfiles.groupId, scope.familyGroupId),
        eq(familyAppProfiles.app, "bora-treinar"),
        eq(familyAppProfiles.sourceKey, sql`${boraProfiles.id}::text`),
        trainerAccessCondition(scope.actorId, boraProfiles.id, "read"),
        trainerAccessCondition(scope.actorId, boraProfiles.id, "write"),
      ),
    );
  const allowed = new Set(profiles.map((profile) => profile.id));
  return candidates
    .filter((candidate) => candidate.profileIds.every((id) => allowed.has(id)))
    .map((candidate) => candidate.id);
}
