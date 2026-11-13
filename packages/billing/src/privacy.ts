import { and, type Database, desc, eq, inArray, lt, or, sql } from "@informach/db";
import {
  collectionAccounts,
  creditLedger,
  creditPurchaseIntents,
  customers,
  legacyBillingConsents,
  legacyBillingCoordinations,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  legacyFutureIntents,
  legacyPaymentEvidenceReviews,
  oneTimePayments,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { lte } from "drizzle-orm";
import {
  personalWebBillingApps as apps,
  personalWebCustomerCondition as ownCustomer,
} from "./personal-scope";

const PAGE_SIZE = 100;

async function* pages<K extends string, T extends { id: string }>(
  kind: K,
  read: (before?: string) => Promise<T[]>,
) {
  let before: string | undefined;
  while (true) {
    const records = await read(before);
    if (records.length === 0) return;
    yield { kind, records };
    if (records.length < PAGE_SIZE) return;
    before = records[records.length - 1]?.id;
    if (!before) throw new Error("Invalid export cursor");
  }
}

/** Bounded-memory records for the central's downloadable copy. This is a live
 * authorized export, not a frozen database snapshot. The caller checks the
 * requesting session between pages and stops on abort/revocation. */
export async function* exportPersonalBillingRecords(
  db: Database,
  actorId: string,
  startedAt = new Date(),
) {
  yield* pages("billing.customers", (before) =>
    db
      .select({
        id: customers.id,
        app: customers.app,
        billingEmail: customers.email,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          ownCustomer(actorId),
          lte(customers.createdAt, startedAt),
          before ? lt(customers.id, before) : undefined,
        ),
      )
      .orderBy(desc(customers.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.subscriptions", (before) =>
    db
      .select({
        id: subscriptions.id,
        app: customers.app,
        customerId: subscriptions.customerId,
        productId: subscriptions.productId,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        canceledAt: subscriptions.canceledAt,
        confirmedAt: subscriptions.confirmedAt,
        trialEnd: subscriptions.trialEnd,
        pendingProductId: subscriptions.pendingProductId,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          ownCustomer(actorId),
          lte(subscriptions.createdAt, startedAt),
          before ? lt(subscriptions.id, before) : undefined,
        ),
      )
      .orderBy(desc(subscriptions.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.paid_periods", (before) =>
    db
      .select({
        id: subscriptionPaymentPeriods.id,
        subscriptionId: subscriptions.id,
        app: customers.app,
        startsAt: subscriptionPaymentPeriods.periodStart,
        endsAt: subscriptionPaymentPeriods.periodEnd,
        paidAt: subscriptionPaymentPeriods.paidAt,
        fullyRefunded: subscriptionPaymentPeriods.fullyRefunded,
        disputed: subscriptionPaymentPeriods.disputed,
      })
      .from(subscriptionPaymentPeriods)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionPaymentPeriods.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          ownCustomer(actorId),
          lte(subscriptionPaymentPeriods.paidAt, startedAt),
          before ? lt(subscriptionPaymentPeriods.id, before) : undefined,
        ),
      )
      .orderBy(desc(subscriptionPaymentPeriods.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.legacy_contract_acceptances", (before) =>
    db
      .select({
        id: legacyContractAcceptances.id,
        groupId: legacyContractAcceptances.groupId,
        subscriptionId: legacyContractAcceptances.subscriptionId,
        policyVersion: legacyContractAcceptances.policyVersion,
        acceptedAt: legacyContractAcceptances.acceptedAt,
        cancellationConfirmedAt: legacyContractAcceptances.cancellationConfirmedAt,
      })
      .from(legacyContractAcceptances)
      .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          eq(legacyContractAcceptances.payerUserId, actorId),
          ownCustomer(actorId),
          lte(legacyContractAcceptances.acceptedAt, startedAt),
          before ? lt(legacyContractAcceptances.id, before) : undefined,
        ),
      )
      .orderBy(desc(legacyContractAcceptances.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.legacy_payment_evidence_reviews", (before) =>
    db
      .select({
        id: legacyPaymentEvidenceReviews.subscriptionId,
        app: customers.app,
        detectedAt: legacyPaymentEvidenceReviews.detectedAt,
        resolvedAt: legacyPaymentEvidenceReviews.resolvedAt,
      })
      .from(legacyPaymentEvidenceReviews)
      .innerJoin(subscriptions, eq(subscriptions.id, legacyPaymentEvidenceReviews.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          ownCustomer(actorId),
          lte(legacyPaymentEvidenceReviews.detectedAt, startedAt),
          before ? lt(legacyPaymentEvidenceReviews.subscriptionId, before) : undefined,
        ),
      )
      .orderBy(desc(legacyPaymentEvidenceReviews.subscriptionId))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.legacy_contract_accepted_periods", (before) =>
    db
      .select({
        id: legacyContractAcceptancePeriods.paymentPeriodId,
        acceptanceId: legacyContractAcceptancePeriods.acceptanceId,
      })
      .from(legacyContractAcceptancePeriods)
      .innerJoin(
        legacyContractAcceptances,
        eq(legacyContractAcceptances.id, legacyContractAcceptancePeriods.acceptanceId),
      )
      .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          eq(legacyContractAcceptances.payerUserId, actorId),
          ownCustomer(actorId),
          lte(legacyContractAcceptances.acceptedAt, startedAt),
          before ? lt(legacyContractAcceptancePeriods.paymentPeriodId, before) : undefined,
        ),
      )
      .orderBy(desc(legacyContractAcceptancePeriods.paymentPeriodId))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.future_contract_intents", (before) =>
    db
      .select({
        id: legacyFutureIntents.id,
        accountId: legacyFutureIntents.accountId,
        productId: legacyFutureIntents.productId,
        amountCents: legacyFutureIntents.amountCents,
        interval: legacyFutureIntents.interval,
        paidThrough: legacyFutureIntents.paidThrough,
        startsAt: legacyFutureIntents.startsAt,
        state: legacyFutureIntents.state,
        cancelRequestedAt: legacyFutureIntents.cancelRequestedAt,
        createdAt: legacyFutureIntents.createdAt,
      })
      .from(legacyFutureIntents)
      .innerJoin(collectionAccounts, eq(collectionAccounts.id, legacyFutureIntents.accountId))
      .where(
        and(
          eq(legacyFutureIntents.payerUserId, actorId),
          eq(collectionAccounts.payerUserId, actorId),
          lte(legacyFutureIntents.createdAt, startedAt),
          before ? lt(legacyFutureIntents.id, before) : undefined,
        ),
      )
      .orderBy(desc(legacyFutureIntents.id))
      .limit(PAGE_SIZE),
  );

  // Own receipts only. `terms` is what this person was shown; it never holds
  // the other adult's contract, plan or payment method.
  yield* pages("billing.coordination_consents", (before) =>
    db
      .select({
        id: legacyBillingConsents.id,
        coordinationId: legacyBillingConsents.coordinationId,
        role: legacyBillingConsents.role,
        decision: legacyBillingConsents.decision,
        terms: legacyBillingConsents.terms,
        createdAt: legacyBillingConsents.createdAt,
      })
      .from(legacyBillingConsents)
      .where(
        and(
          eq(legacyBillingConsents.userId, actorId),
          lte(legacyBillingConsents.createdAt, startedAt),
          before ? lt(legacyBillingConsents.id, before) : undefined,
        ),
      )
      .orderBy(desc(legacyBillingConsents.id))
      .limit(PAGE_SIZE),
  );

  // The payer sees the dates of their own charge; the contributor only that a
  // coordination exists and its state.
  yield* pages("billing.coordinations", (before) =>
    db
      .select({
        id: legacyBillingCoordinations.id,
        role: sql<
          "payer" | "contributor"
        >`case when ${legacyBillingCoordinations.payerUserId} = ${actorId} then 'payer' else 'contributor' end`,
        state: legacyBillingCoordinations.state,
        fromChargeAt: sql<Date | null>`case when ${legacyBillingCoordinations.payerUserId} = ${actorId} then ${legacyBillingCoordinations.fromChargeAt} end`,
        deferUntil: sql<Date | null>`case when ${legacyBillingCoordinations.payerUserId} = ${actorId} then ${legacyBillingCoordinations.deferUntil} end`,
        amountCents: sql<
          number | null
        >`case when ${legacyBillingCoordinations.payerUserId} = ${actorId} then ${legacyBillingCoordinations.amountCents} end`,
        createdAt: legacyBillingCoordinations.createdAt,
      })
      .from(legacyBillingCoordinations)
      .where(
        and(
          or(
            eq(legacyBillingCoordinations.payerUserId, actorId),
            eq(legacyBillingCoordinations.contributorUserId, actorId),
          ),
          lte(legacyBillingCoordinations.createdAt, startedAt),
          before ? lt(legacyBillingCoordinations.id, before) : undefined,
        ),
      )
      .orderBy(desc(legacyBillingCoordinations.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.payments", (before) =>
    db
      .select({
        id: oneTimePayments.id,
        customerId: customers.id,
        app: customers.app,
        productId: oneTimePayments.productId,
        amountCents: oneTimePayments.amountCents,
        currency: oneTimePayments.currency,
        status: oneTimePayments.status,
        creditAmount: oneTimePayments.creditAmount,
        paidAt: oneTimePayments.paidAt,
        createdAt: oneTimePayments.createdAt,
      })
      .from(oneTimePayments)
      .innerJoin(customers, eq(customers.id, oneTimePayments.customerId))
      .where(
        and(
          ownCustomer(actorId),
          lte(oneTimePayments.createdAt, startedAt),
          before ? lt(oneTimePayments.id, before) : undefined,
        ),
      )
      .orderBy(desc(oneTimePayments.id))
      .limit(PAGE_SIZE),
  );

  yield* pages("billing.credit_purchases", (before) =>
    db
      .select({
        id: creditPurchaseIntents.id,
        customerId: customers.id,
        app: customers.app,
        productId: creditPurchaseIntents.productId,
        amountCents: creditPurchaseIntents.amountCents,
        currency: creditPurchaseIntents.currency,
        credits: creditPurchaseIntents.credits,
        outcome: creditPurchaseIntents.outcome,
        refundedAmountCents: creditPurchaseIntents.refundedAmountCents,
        revokedCredits: creditPurchaseIntents.revokedCredits,
        disputed: creditPurchaseIntents.disputed,
        createdAt: creditPurchaseIntents.createdAt,
        resolvedAt: creditPurchaseIntents.resolvedAt,
      })
      .from(creditPurchaseIntents)
      .innerJoin(customers, eq(customers.id, creditPurchaseIntents.customerId))
      .where(
        and(
          ownCustomer(actorId),
          lte(creditPurchaseIntents.createdAt, startedAt),
          before ? lt(creditPurchaseIntents.id, before) : undefined,
        ),
      )
      .orderBy(desc(creditPurchaseIntents.id))
      .limit(PAGE_SIZE),
  );

  // Historical personal wallets are separate from shared household statements.
  let before: number | undefined;
  while (true) {
    const rows = await db
      .select({
        id: creditLedger.id,
        sequence: creditLedger.sequence,
        app: creditLedger.app,
        type: creditLedger.entryType,
        amount: creditLedger.amount,
        createdAt: creditLedger.createdAt,
        expiresAt: creditLedger.expiresAt,
      })
      .from(creditLedger)
      .innerJoin(users, eq(users.id, creditLedger.ownerId))
      .where(
        and(
          eq(creditLedger.ownerType, "user"),
          eq(creditLedger.ownerId, actorId),
          inArray(creditLedger.app, apps),
          eq(users.emailVerified, true),
          or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
          lte(creditLedger.createdAt, startedAt),
          before === undefined ? undefined : lt(creditLedger.sequence, before),
        ),
      )
      .orderBy(desc(creditLedger.sequence))
      .limit(PAGE_SIZE);
    if (!rows.length) return;
    yield {
      kind: "billing.personal_credits" as const,
      records: rows.map(({ sequence: _sequence, ...row }) => row),
    };
    if (rows.length < PAGE_SIZE) return;
    before = rows[rows.length - 1]?.sequence;
    if (before === undefined) throw new Error("Invalid personal-credit cursor");
  }
}
