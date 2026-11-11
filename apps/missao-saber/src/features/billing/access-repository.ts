import "server-only";
import { getProSubscription } from "@informach/billing";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { PRODUCTS } from "@informach/config";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { and, db, eq } from "@informach/db";
import { familyMigrationSources } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { assertAllowed } from "@/lib/errors";
import type { LearningAuthority } from "../family/authority";

export type LearningAccess = {
  paid: boolean;
  profileLimit: number;
  tier: string;
  source: "free" | "trial" | "paid" | "legacy" | "review";
};

/** Share coverage, never the payer's contract. Reuse this transaction before domain writes. */
export async function learningAccessInTransaction(
  tx: FamilyTransaction,
  actor: LearningAuthority,
): Promise<LearningAccess> {
  const compasso = await getCompassoAccessInTransaction(tx, actor.userId, actor.familyGroupId);
  const free: LearningAccess = { paid: false, profileLimit: 1, tier: "free", source: "free" };
  if (compasso.source === "review") return { ...free, source: "review" };
  if (compasso.active)
    return {
      paid: true,
      profileLimit: COMPASSO_POLICY.capacity.adults + COMPASSO_POLICY.capacity.dependents,
      tier: "family",
      source: compasso.source === "trial" ? "trial" : "paid",
    };
  const sources = await tx
    .select({ owner: familyMigrationSources.sourceOwnerId })
    .from(familyMigrationSources)
    .where(
      and(
        eq(familyMigrationSources.groupId, actor.familyGroupId),
        eq(familyMigrationSources.app, "missao-saber"),
      ),
    );
  assertAllowed(
    sources.length <= 1,
    "BILLING_REVIEW",
    "A cobertura anterior desta família precisa de conferência.",
  );
  if (!sources[0]) return free;
  const subscription = await getProSubscription(
    { db: tx, app: "missao-saber", provider: "stripe" },
    { type: "user", id: sources[0].owner },
  );
  const product = PRODUCTS.find(
    (entry) => entry.app === "missao-saber" && entry.id === subscription?.productId,
  );
  const tier = product?.tier;
  return subscription && (tier === "individual" || tier === "family")
    ? {
        paid: true,
        profileLimit: tier === "family" ? 3 : 1,
        tier,
        source: "legacy",
      }
    : free;
}

export function getLearningAccess(actor: LearningAuthority) {
  return db.transaction((tx) => learningAccessInTransaction(tx, actor));
}
