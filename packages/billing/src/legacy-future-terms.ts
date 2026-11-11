import { createHash } from "node:crypto";
import { getCollectionApps } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  checkoutIntents,
  collectionAccounts,
  customers,
  familyMigrationSources,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  legacyContractObservations,
  legacyPaymentEvidenceReviews,
  subscriptionPaymentPeriods,
  subscriptions,
  webhookEvents,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, asc, eq, gt, inArray, isNull, like, or, sql } from "drizzle-orm";
import { hasPendingCompassoReview } from "./collection-jobs";
import { BillingError } from "./errors";
import {
  LEGACY_CONTRACT_POLICY_VERSION,
  LEGACY_OBSERVATION_MAX_AGE_MS,
} from "./legacy-contract-policy";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Pure local preflight. Callers reconcile all provider facts before entering
 * this transaction and must recheck these terms before any external action. */
export async function readLegacyFutureTerms(tx: Tx, actorId: string, accountId: string) {
  const [initial] = await tx
    .select()
    .from(collectionAccounts)
    .where(
      and(
        eq(collectionAccounts.id, accountId),
        eq(collectionAccounts.payerUserId, actorId),
        eq(collectionAccounts.collection, "compasso"),
        isNull(collectionAccounts.closedAt),
      ),
    );
  if (!initial) throw new BillingError("Future contract account is unavailable");
  await lockFamilyMembership(tx, actorId, initial.groupId);
  const [account] = await tx
    .select()
    .from(collectionAccounts)
    .where(
      and(
        eq(collectionAccounts.id, accountId),
        eq(collectionAccounts.payerUserId, actorId),
        eq(collectionAccounts.groupId, initial.groupId),
        isNull(collectionAccounts.closedAt),
      ),
    );
  if (!account) throw new BillingError("Future contract account changed");
  if (await hasPendingCompassoReview(tx, account.groupId, "subscription"))
    throw new BillingError("Compasso billing requires reconciliation");
  const nativeCustomer = and(
    eq(customers.app, "compasso"),
    eq(customers.provider, "stripe"),
    eq(customers.subjectType, "billing_account"),
    eq(collectionAccounts.groupId, account.groupId),
    eq(collectionAccounts.collection, "compasso"),
  );
  const [nativeCheckout] = await tx
    .select({ id: checkoutIntents.id })
    .from(customers)
    .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
    .innerJoin(checkoutIntents, eq(checkoutIntents.customerId, customers.id))
    .where(nativeCustomer)
    .limit(1);
  const [nativeContract] = await tx
    .select({ id: subscriptions.id })
    .from(customers)
    .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        nativeCustomer,
        or(
          sql`${subscriptions.status} not in ('canceled', 'incomplete_expired')`,
          and(
            eq(subscriptions.status, "canceled"),
            gt(subscriptions.currentPeriodEnd, sql`clock_timestamp()`),
          ),
        ),
      ),
    )
    .limit(1);
  const [nativePaid] = await tx
    .select({ id: subscriptionPaymentPeriods.id })
    .from(customers)
    .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.subscriptionId, subscriptions.id),
    )
    .where(
      and(
        nativeCustomer,
        gt(subscriptionPaymentPeriods.periodEnd, sql`clock_timestamp()`),
        eq(subscriptionPaymentPeriods.fullyRefunded, false),
        eq(subscriptionPaymentPeriods.disputed, false),
      ),
    )
    .limit(1);
  if (nativeCheckout || nativeContract || nativePaid)
    throw new BillingError("Existing Compasso billing requires coordinated migration");
  const apps = getCollectionApps("compasso").map((app) => app.slug);
  const scope = and(
    eq(familyMigrationSources.groupId, account.groupId),
    inArray(familyMigrationSources.app, apps),
  );
  const owner = and(
    eq(customers.app, familyMigrationSources.app),
    eq(customers.subjectType, "user"),
    eq(customers.subjectId, familyMigrationSources.sourceOwnerId),
    eq(customers.provider, "stripe"),
  );
  const [checkout] = await tx
    .select({ id: checkoutIntents.id })
    .from(familyMigrationSources)
    .innerJoin(customers, owner)
    .innerJoin(checkoutIntents, eq(checkoutIntents.customerId, customers.id))
    .where(scope)
    .limit(1);
  if (checkout) throw new BillingError("Historical checkout requires reconciliation");
  const payloadCustomer = sql<
    string | null
  >`coalesce(${webhookEvents.payload} #>> '{data,object,customer,id}', ${webhookEvents.payload} #>> '{data,object,customer}')`;
  const [pending] = await tx
    .select({ id: webhookEvents.id })
    .from(familyMigrationSources)
    .innerJoin(customers, owner)
    .innerJoin(
      webhookEvents,
      and(
        eq(webhookEvents.provider, "stripe"),
        isNull(webhookEvents.processedAt),
        or(
          eq(webhookEvents.eventType, "charge.refunded"),
          like(webhookEvents.eventType, "charge.dispute.%"),
          like(webhookEvents.eventType, "customer.subscription.%"),
          like(webhookEvents.eventType, "invoice.%"),
        ),
        or(eq(webhookEvents.app, customers.app), isNull(webhookEvents.app)),
        or(
          eq(webhookEvents.providerCustomerId, customers.providerCustomerId),
          eq(payloadCustomer, customers.providerCustomerId),
          and(isNull(webhookEvents.providerCustomerId), sql`${payloadCustomer} is null`),
        ),
      ),
    )
    .where(scope)
    .limit(1);
  if (pending) throw new BillingError("Historical financial event requires reconciliation");
  const contracts = await tx
    .select({
      sub: subscriptions,
      sourceOwner: familyMigrationSources.sourceOwnerId,
      acceptance: legacyContractAcceptances,
      observation: legacyContractObservations,
      evidenceReview: legacyPaymentEvidenceReviews,
    })
    .from(familyMigrationSources)
    .innerJoin(customers, owner)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .leftJoin(
      legacyContractAcceptances,
      eq(legacyContractAcceptances.subscriptionId, subscriptions.id),
    )
    .leftJoin(
      legacyContractObservations,
      eq(legacyContractObservations.subscriptionId, subscriptions.id),
    )
    .leftJoin(
      legacyPaymentEvidenceReviews,
      eq(legacyPaymentEvidenceReviews.subscriptionId, subscriptions.id),
    )
    .where(and(scope, eq(subscriptions.provider, "stripe")))
    .orderBy(asc(subscriptions.id))
    .limit(101);
  if (contracts.length > 100) throw new BillingError("Historical contract set requires review");
  const now = new Date();
  const ids = contracts.map((row) => row.sub.id);
  const periods = ids.length
    ? await tx
        .select({
          fact: subscriptionPaymentPeriods,
          acceptedBy: legacyContractAcceptancePeriods.acceptanceId,
        })
        .from(subscriptionPaymentPeriods)
        .leftJoin(
          legacyContractAcceptancePeriods,
          eq(legacyContractAcceptancePeriods.paymentPeriodId, subscriptionPaymentPeriods.id),
        )
        .where(
          and(
            inArray(subscriptionPaymentPeriods.subscriptionId, ids),
            gt(subscriptionPaymentPeriods.periodEnd, now),
          ),
        )
        .orderBy(asc(subscriptionPaymentPeriods.id))
        .limit(1001)
    : [];
  if (periods.length > 1000) throw new BillingError("Historical paid periods require review");
  let paidThrough: Date | null = null;
  for (const item of contracts) {
    if (item.evidenceReview && !item.evidenceReview.resolvedAt)
      throw new BillingError("Historical payment evidence requires reconciliation");
    const observed = item.observation;
    if (
      !observed ||
      observed.observedAt > now ||
      now.getTime() - observed.observedAt.getTime() > LEGACY_OBSERVATION_MAX_AGE_MS
    )
      throw new BillingError("Historical subscription facts require reconciliation");
    const relevant = periods.filter((period) => period.fact.subscriptionId === item.sub.id);
    if (relevant.some((period) => period.fact.disputed))
      throw new BillingError("Historical payment is disputed");
    const paid = relevant.filter((period) => !period.fact.fullyRefunded);
    const terminal = observed.status === "canceled" || observed.status === "incomplete_expired";
    if (!paid.length && terminal) continue;
    if (
      !item.acceptance ||
      item.acceptance.groupId !== account.groupId ||
      item.acceptance.payerUserId !== item.sourceOwner ||
      item.acceptance.policyVersion !== LEGACY_CONTRACT_POLICY_VERSION ||
      !item.acceptance.cancellationConfirmedAt ||
      (observed.status !== "canceled" && !observed.cancelAtPeriodEnd) ||
      paid.some(
        (period) =>
          period.acceptedBy !== item.acceptance?.id ||
          period.fact.reconciledAt > observed.observedAt ||
          period.fact.providerPriceId !== observed.providerPriceId ||
          period.fact.periodEnd > observed.periodEnd,
      )
    )
      throw new BillingError("Historical contracts require consent and cancellation confirmation");
    for (const period of paid)
      if (!paidThrough || period.fact.periodEnd > paidThrough) paidThrough = period.fact.periodEnd;
  }
  if (!paidThrough) throw new BillingError("There is no remaining historical paid period");
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        accountId,
        actorId,
        groupId: account.groupId,
        paidThrough,
        contracts: contracts.map((item) => ({
          id: item.sub.id,
          acceptanceId: item.acceptance?.id ?? null,
          status: item.observation?.status,
          canceled: item.observation?.cancelAtPeriodEnd,
          price: item.observation?.providerPriceId,
        })),
        periods: periods.map((item) => ({
          id: item.fact.id,
          end: item.fact.periodEnd,
          refunded: item.fact.fullyRefunded,
          disputed: item.fact.disputed,
          acceptedBy: item.acceptedBy,
        })),
      }),
    )
    .digest("hex");
  return {
    groupId: account.groupId,
    accountId,
    paidThrough,
    startsAt: new Date(Math.ceil(paidThrough.getTime() / 1000) * 1000),
    revision,
  };
}
