import "server-only";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { db } from "@informach/db";
import type { FamilyTransaction } from "@informach/family";
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
  // The app never sold a plan of its own, so there is no earlier contract to
  // honor: coverage is Compasso only (paid, trial or accepted legacy period).
  return free;
}
export function getEstrelaAccess(actor: EstrelaAuthority) {
  return db.transaction((tx) => estrelaAccessInTransaction(tx, actor));
}
