import { getCollectionApps } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  checkoutIntents,
  collectionAccounts,
  customers,
  familyMigrationSources,
  legacyContractAcceptances,
  legacyFutureIntents,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { and, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import { LegacySubscriptionPendingError } from "./errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Cutover admission guard. Source provenance, not payer membership or name,
 * binds old contracts to a family. Existing webhooks/jobs still reconcile facts. */
export async function assertLegacySubscriptionsSettled(tx: Transaction, groupId: string) {
  const source = and(
    eq(familyMigrationSources.groupId, groupId),
    inArray(
      familyMigrationSources.app,
      getCollectionApps("compasso").map((app) => app.slug),
    ),
  );
  const legacyCustomer = and(
    eq(customers.subjectType, "user"),
    eq(customers.subjectId, familyMigrationSources.sourceOwnerId),
    eq(customers.app, familyMigrationSources.app),
  );
  const [contract] = await tx
    .select({ id: subscriptions.id })
    .from(familyMigrationSources)
    .innerJoin(customers, legacyCustomer)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        source,
        or(
          notInArray(subscriptions.status, ["canceled", "incomplete_expired"]),
          and(
            eq(subscriptions.status, "canceled"),
            gt(subscriptions.currentPeriodEnd, sql`clock_timestamp()`),
          ),
        ),
      ),
    )
    .limit(1);
  if (contract) throw new LegacySubscriptionPendingError();

  // A late reconciled invoice may cover time beyond a stale local subscription
  // snapshot, including a paid future period. Never infer its end from status.
  const [paidPeriod] = await tx
    .select({ id: subscriptionPaymentPeriods.id })
    .from(familyMigrationSources)
    .innerJoin(customers, legacyCustomer)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.subscriptionId, subscriptions.id),
    )
    .where(
      and(
        source,
        gt(subscriptionPaymentPeriods.periodEnd, sql`clock_timestamp()`),
        eq(subscriptionPaymentPeriods.fullyRefunded, false),
        eq(subscriptionPaymentPeriods.disputed, false),
      ),
    )
    .limit(1);
  if (paidPeriod) throw new LegacySubscriptionPendingError();

  const [unconfirmed] = await tx
    .select({ id: legacyContractAcceptances.id })
    .from(legacyContractAcceptances)
    .where(
      and(
        eq(legacyContractAcceptances.groupId, groupId),
        sql`${legacyContractAcceptances.cancellationConfirmedAt} is null`,
      ),
    )
    .limit(1);
  if (unconfirmed) throw new LegacySubscriptionPendingError();

  const [future] = await tx
    .select({ id: legacyFutureIntents.id })
    .from(legacyFutureIntents)
    .innerJoin(collectionAccounts, eq(collectionAccounts.id, legacyFutureIntents.accountId))
    .where(
      and(
        eq(collectionAccounts.groupId, groupId),
        eq(collectionAccounts.collection, "compasso"),
        sql`${legacyFutureIntents.state} in ('setup_pending', 'setup_ready', 'scheduling', 'scheduled', 'review')`,
      ),
    )
    .limit(1);
  if (future) throw new LegacySubscriptionPendingError();

  // A lost checkout response may still become a paid subscription. Do not
  // infer safety from its local expiry; the old reconciliation owns resolution.
  const [checkout] = await tx
    .select({ id: checkoutIntents.id })
    .from(familyMigrationSources)
    .innerJoin(customers, legacyCustomer)
    .innerJoin(checkoutIntents, eq(checkoutIntents.customerId, customers.id))
    .where(source)
    .limit(1);
  if (checkout) throw new LegacySubscriptionPendingError();
}
