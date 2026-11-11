import "server-only";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { getProSubscription } from "@informach/billing";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { and, db, eq } from "@informach/db";
import { collectionTrials, cozyaProfiles, familyMigrationSources } from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import type { CozyaAuthority } from "@/features/family/authority";

const free = {
  enabled: false,
  source: "free" as const,
  trialStartsAt: null,
  trialEndsAt: null,
};

/** Membership and coverage remain locked until the domain write commits. */
export async function cozyaAccessInTransaction(tx: FamilyTransaction, actor: CozyaAuthority) {
  if (!actor.familyGroupId) {
    await lockActiveWebParticipation(tx, actor.userId);
    return free;
  }
  const coverage = await getCompassoAccessInTransaction(tx, actor.userId, actor.familyGroupId);
  if (coverage.active) {
    const trialEndsAt = coverage.source === "trial" ? coverage.endsAt : null;
    return {
      enabled: true,
      source: coverage.source,
      trialEndsAt,
      trialStartsAt: trialEndsAt
        ? new Date(trialEndsAt.getTime() - COMPASSO_POLICY.trialDays * 86400000)
        : null,
    };
  }
  if (coverage.source === "review") return { ...free, source: "review" as const };
  const sources = await tx
    .select({ owner: familyMigrationSources.sourceOwnerId })
    .from(familyMigrationSources)
    .where(
      and(
        eq(familyMigrationSources.groupId, actor.familyGroupId),
        eq(familyMigrationSources.app, "cozya"),
      ),
    );
  requireFamilyCondition(
    sources.length <= 1,
    "CONFLICT",
    "A cobertura anterior precisa de conferência.",
  );
  const source = sources[0];
  if (!source) return free;
  const legacy = await getProSubscription(
    { db: tx, app: "cozya", provider: "stripe" },
    { type: "user", id: source.owner },
  );
  if (legacy) return { ...free, enabled: true, source: "legacy" as const };
  // Honor an already started local trial; never start or grant another local trial.
  const [profile] = await tx
    .select({ startsAt: cozyaProfiles.trialStartedAt })
    .from(cozyaProfiles)
    .where(eq(cozyaProfiles.userId, source.owner));
  if (!profile?.startsAt) return free;
  const trialEndsAt = new Date(profile.startsAt.getTime() + 14 * 86400000);
  return {
    enabled: profile.startsAt <= new Date() && trialEndsAt > new Date(),
    source: "legacy-trial" as const,
    trialStartsAt: profile.startsAt,
    trialEndsAt,
  };
}

export function readKitchenAccess(actor: CozyaAuthority) {
  return db.transaction(async (tx) => {
    const coverage = await cozyaAccessInTransaction(tx, actor);
    const [profile] = await tx
      .select()
      .from(cozyaProfiles)
      .where(eq(cozyaProfiles.userId, actor.userId));
    const [trial] = actor.familyGroupId
      ? await tx
          .select()
          .from(collectionTrials)
          .where(
            and(
              eq(collectionTrials.groupId, actor.familyGroupId),
              eq(collectionTrials.collection, "compasso"),
            ),
          )
      : [];
    return {
      actor,
      source: coverage.source,
      isPro: coverage.enabled && coverage.source !== "trial" && coverage.source !== "legacy-trial",
      trialActive:
        coverage.enabled && (coverage.source === "trial" || coverage.source === "legacy-trial"),
      canPlan: coverage.enabled,
      // Balance is checked by the shared wallet. Cancellation does not destroy topups.
      canUseAi: actor.familyGroupId !== null,
      unlimitedRecipes: coverage.enabled,
      trialStartsAt: coverage.trialStartsAt ?? trial?.startsAt ?? null,
      trialEndsAt: coverage.trialEndsAt ?? trial?.endsAt ?? null,
      profile: profile ?? null,
    };
  });
}
