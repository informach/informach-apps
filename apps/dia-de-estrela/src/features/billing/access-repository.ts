import "server-only";
import { getProSubscription } from "@informach/billing";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { PRODUCTS } from "@informach/config";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { and, db, eq } from "@informach/db";
import { familyMigrationSources } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { assertAllowed } from "@/lib/errors";
import type { Access } from "../acesso/policy";
import type { EstrelaAuthority } from "../familia/authority";

export type EstrelaAccess = Access & { source: "free" | "trial" | "paid" | "legacy" | "review" };
export async function estrelaAccessInTransaction(
  tx: FamilyTransaction,
  actor: EstrelaAuthority,
): Promise<EstrelaAccess> {
  const coverage = await getCompassoAccessInTransaction(tx, actor.userId, actor.familyGroupId);
  const free: EstrelaAccess = { paid: false, tier: "free", childLimit: 1, source: "free" };
  if (coverage.source === "review") return { ...free, source: "review" };
  if (coverage.active)
    return {
      paid: true,
      tier: "family",
      childLimit: COMPASSO_POLICY.capacity.dependents,
      source: coverage.source === "trial" ? "trial" : "paid",
    };
  const origins = await tx
    .select({ userId: familyMigrationSources.sourceOwnerId })
    .from(familyMigrationSources)
    .where(
      and(
        eq(familyMigrationSources.groupId, actor.familyGroupId),
        eq(familyMigrationSources.app, "dia-de-estrela"),
      ),
    );
  assertAllowed(
    origins.length <= 1,
    "BILLING_REVIEW",
    "A cobertura anterior desta família precisa de conferência.",
  );
  if (!origins[0]) return free;
  const subscription = await getProSubscription(
    { db: tx, app: "dia-de-estrela", provider: "stripe" },
    { type: "user", id: origins[0].userId },
  );
  const product = PRODUCTS.find(
    (product) => product.app === "dia-de-estrela" && product.id === subscription?.productId,
  );
  return subscription && product?.tier === "family"
    ? { paid: true, tier: "family", childLimit: 4, source: "legacy" }
    : free;
}
export function getEstrelaAccess(actor: EstrelaAuthority) {
  return db.transaction((tx) => estrelaAccessInTransaction(tx, actor));
}
