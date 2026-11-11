import "server-only";
import { getProSubscription } from "@informach/billing";
import { getCompassoAccessInTransaction } from "@informach/billing/compasso";
import { COMPASSO_POLICY } from "@informach/config/collections";
import { and, db, eq } from "@informach/db";
import { familyMigrationSources } from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";

/** Coverage is checked under the family lock in the same transaction as its use. */
export async function agendaAccessInTransaction(tx: FamilyTransaction, actor: AgendaAuthority) {
  const coverage = await getCompassoAccessInTransaction(tx, actor.userId, actor.familyGroupId);
  if (coverage.active)
    return {
      enabled: true,
      profileLimit: COMPASSO_POLICY.capacity.dependents,
      source: coverage.source,
    };
  const free = { enabled: false, profileLimit: 1, source: "free" as const };
  if (coverage.source === "review") return free;
  // Existing contractual rights are read by their recorded origin, never by the
  // viewing adult's unrelated purchases. New sales only happen in Minha conta.
  const sources = await tx
    .select({ owner: familyMigrationSources.sourceOwnerId })
    .from(familyMigrationSources)
    .where(
      and(
        eq(familyMigrationSources.groupId, actor.familyGroupId),
        eq(familyMigrationSources.app, "agenda-da-turma"),
      ),
    );
  requireFamilyCondition(
    sources.length <= 1,
    "CONFLICT",
    "A cobertura anterior desta família precisa de conferência.",
  );
  const source = sources[0];
  const legacy =
    source &&
    (await getProSubscription(
      { db: tx, app: "agenda-da-turma", provider: "stripe" },
      { type: "user", id: source.owner },
    ));
  return legacy ? { enabled: true, profileLimit: 3, source: "legacy" as const } : free;
}

export function getAgendaAccess(actor: AgendaAuthority) {
  return db.transaction((tx) => agendaAccessInTransaction(tx, actor));
}
