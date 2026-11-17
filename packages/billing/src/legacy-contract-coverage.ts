import { getAppCollection } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
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
import { and, desc, eq, gt, isNull, like, lte, or, sql } from "drizzle-orm";
import {
  LEGACY_CONTRACT_POLICY_VERSION,
  LEGACY_OBSERVATION_MAX_AGE_MS,
} from "./legacy-contract-policy";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The caller holds the family lock through the protected domain operation. */
export async function legacyContractCoverage(tx: Tx, groupId: string, now: Date) {
  const [evidenceReview] = await tx
    .select({ id: legacyPaymentEvidenceReviews.subscriptionId })
    .from(legacyContractAcceptances)
    .innerJoin(
      legacyPaymentEvidenceReviews,
      eq(legacyPaymentEvidenceReviews.subscriptionId, legacyContractAcceptances.subscriptionId),
    )
    .where(
      and(
        eq(legacyContractAcceptances.groupId, groupId),
        isNull(legacyPaymentEvidenceReviews.resolvedAt),
      ),
    )
    .limit(1);
  if (evidenceReview) return { status: "review" as const };
  const paid = and(
    eq(legacyContractAcceptances.groupId, groupId),
    lte(subscriptionPaymentPeriods.periodStart, now),
    gt(subscriptionPaymentPeriods.periodEnd, now),
    eq(subscriptionPaymentPeriods.fullyRefunded, false),
  );
  const payloadCustomer = sql<
    string | null
  >`coalesce(${webhookEvents.payload} #>> '{data,object,customer,id}', ${webhookEvents.payload} #>> '{data,object,customer}')`;
  const [pending] = await tx
    .select({ id: webhookEvents.id })
    .from(legacyContractAcceptances)
    .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .innerJoin(
      legacyContractAcceptancePeriods,
      eq(legacyContractAcceptancePeriods.acceptanceId, legacyContractAcceptances.id),
    )
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.id, legacyContractAcceptancePeriods.paymentPeriodId),
    )
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
    .where(paid)
    .limit(1);
  if (pending) return { status: "review" as const };
  const rows = await tx
    .select({
      end: subscriptionPaymentPeriods.periodEnd,
      disputed: subscriptionPaymentPeriods.disputed,
      periodSubscriptionId: subscriptionPaymentPeriods.subscriptionId,
      subscriptionId: subscriptions.id,
      subscriptionProvider: subscriptions.provider,
      customerProvider: customers.provider,
      customerType: customers.subjectType,
      customerId: customers.subjectId,
      payerId: legacyContractAcceptances.payerUserId,
      app: customers.app,
      priceId: subscriptionPaymentPeriods.providerPriceId,
      reconciledAt: subscriptionPaymentPeriods.reconciledAt,
      confirmedAt: legacyContractAcceptances.cancellationConfirmedAt,
      policyVersion: legacyContractAcceptances.policyVersion,
      observation: legacyContractObservations,
      sourceGroup: familyMigrationSources.groupId,
    })
    .from(legacyContractAcceptances)
    .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .leftJoin(
      familyMigrationSources,
      and(
        eq(familyMigrationSources.app, customers.app),
        eq(familyMigrationSources.sourceOwnerId, legacyContractAcceptances.payerUserId),
        eq(familyMigrationSources.groupId, legacyContractAcceptances.groupId),
      ),
    )
    .innerJoin(
      legacyContractAcceptancePeriods,
      eq(legacyContractAcceptancePeriods.acceptanceId, legacyContractAcceptances.id),
    )
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.id, legacyContractAcceptancePeriods.paymentPeriodId),
    )
    .leftJoin(
      legacyContractObservations,
      eq(legacyContractObservations.subscriptionId, subscriptions.id),
    )
    .where(paid)
    .orderBy(desc(subscriptionPaymentPeriods.periodEnd));
  if (!rows.length) return { status: "none" as const };
  for (const row of rows) {
    const observation = row.observation;
    if (
      row.disputed ||
      !row.sourceGroup ||
      row.periodSubscriptionId !== row.subscriptionId ||
      row.subscriptionProvider !== "stripe" ||
      row.customerProvider !== "stripe" ||
      row.customerType !== "user" ||
      row.customerId !== row.payerId ||
      getAppCollection(row.app) !== "compasso" ||
      row.policyVersion !== LEGACY_CONTRACT_POLICY_VERSION ||
      !observation ||
      observation.observedAt > now ||
      now.getTime() - observation.observedAt.getTime() > LEGACY_OBSERVATION_MAX_AGE_MS ||
      observation.observedAt < row.reconciledAt ||
      observation.providerPriceId !== row.priceId ||
      observation.periodEnd < row.end ||
      (row.confirmedAt !== null &&
        observation.status !== "canceled" &&
        !observation.cancelAtPeriodEnd)
    )
      return { status: "review" as const };
  }
  const first = rows[0];
  if (!first) return { status: "none" as const };
  return { status: "active" as const, endsAt: first.end };
}
