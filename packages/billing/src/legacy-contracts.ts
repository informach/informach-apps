import { getCollectionApps } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  customers,
  familyMigrationSources,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";

export {
  confirmRecentLegacyContractAcceptance,
  prepareLegacyContractAcceptance,
} from "./legacy-contract-acceptance";

/** Only the existence of an accepted family period is shared, not its payer or app. */
export async function familyHasAcceptedLegacyContract(
  db: Database,
  actorId: string,
  groupId: string,
) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, groupId);
    const [row] = await tx
      .select({ id: legacyContractAcceptances.id })
      .from(legacyContractAcceptances)
      .innerJoin(
        legacyContractAcceptancePeriods,
        eq(legacyContractAcceptancePeriods.acceptanceId, legacyContractAcceptances.id),
      )
      .innerJoin(
        subscriptionPaymentPeriods,
        eq(subscriptionPaymentPeriods.id, legacyContractAcceptancePeriods.paymentPeriodId),
      )
      .where(
        and(
          eq(legacyContractAcceptances.groupId, groupId),
          isNotNull(legacyContractAcceptances.cancellationConfirmedAt),
          gt(subscriptionPaymentPeriods.periodEnd, new Date()),
          eq(subscriptionPaymentPeriods.disputed, false),
          eq(subscriptionPaymentPeriods.fullyRefunded, false),
        ),
      )
      .limit(1);
    return !!row;
  });
}

/** Only the caller's own historical contracts mapped to the selected family. */
export async function listLegacyContracts(db: Database, actorId: string, groupId: string) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, groupId);
    const rows = await tx
      .select({
        id: subscriptions.id,
        app: customers.app,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        acceptanceId: legacyContractAcceptances.id,
        acceptanceGroupId: legacyContractAcceptances.groupId,
        cancellationConfirmedAt: legacyContractAcceptances.cancellationConfirmedAt,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(
        familyMigrationSources,
        and(
          eq(familyMigrationSources.app, customers.app),
          eq(familyMigrationSources.sourceOwnerId, actorId),
          eq(familyMigrationSources.groupId, groupId),
        ),
      )
      .leftJoin(
        legacyContractAcceptances,
        eq(legacyContractAcceptances.subscriptionId, subscriptions.id),
      )
      .where(
        and(
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, actorId),
          eq(customers.provider, "stripe"),
          eq(subscriptions.provider, "stripe"),
          inArray(
            customers.app,
            getCollectionApps("compasso").map((app) => app.slug),
          ),
        ),
      )
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
      .limit(101);
    return { contracts: rows.slice(0, 100), hasMore: rows.length > 100 };
  });
}
