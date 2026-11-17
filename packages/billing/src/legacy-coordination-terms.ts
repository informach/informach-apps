import { createHash } from "node:crypto";
import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import { COMPASSO_POLICY } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  checkoutIntents,
  collectionAccounts,
  collectionPlanChanges,
  customers,
  legacyBillingCoordinationContracts,
  legacyBillingCoordinations,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  legacyContractObservations,
  legacyFutureIntents,
  legacyPaymentEvidenceReviews,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { hasPendingCompassoReview } from "./collection-jobs";
import { BillingError } from "./errors";
import {
  LEGACY_CONTRACT_POLICY_VERSION,
  LEGACY_COORDINATION_MARGIN_MS,
  LEGACY_COORDINATION_POLICY_VERSION,
  LEGACY_OBSERVATION_MAX_AGE_MS,
} from "./legacy-contract-policy";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Account = typeof collectionAccounts.$inferSelect;
type Coordination = typeof legacyBillingCoordinations.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;
type FutureIntent = typeof legacyFutureIntents.$inferSelect;
type Customer = typeof customers.$inferSelect;

export const ACTIVE_COORDINATION_STATES = [
  "open",
  "payer_accepted",
  "applying",
  "applied",
  "review",
] as const;

export type LegacyCoordinationMode = "none" | "payer_decides" | "wait";
export type PayerTarget =
  | { kind: "subscription_trial"; subscription: Subscription; customer: Customer }
  | { kind: "schedule_start"; intent: FutureIntent; customer: Customer | null };
export type PayerCommitment =
  | { mode: "none"; account: Account | null }
  | { mode: "wait"; account: Account }
  | { mode: "payer_decides"; account: Account; target: PayerTarget };

/** What the family's payer has already committed to. The caller holds the
 * family lock. Native subscriptions, customers and wallets are read without
 * row locks: this transaction keeps the family lock, and locking them here
 * would close a cycle with the monthly grant (subscription -> wallet) and
 * with spending (wallet -> family). */
export async function readPayerCommitment(tx: Tx, groupId: string): Promise<PayerCommitment> {
  const [account] = await tx
    .select()
    .from(collectionAccounts)
    .where(
      and(
        eq(collectionAccounts.groupId, groupId),
        eq(collectionAccounts.collection, "compasso"),
        isNull(collectionAccounts.closedAt),
      ),
    );
  if (!account) return { mode: "none", account: null };
  if (await hasPendingCompassoReview(tx, groupId, "subscription")) return { mode: "wait", account };
  const [customer] = await tx
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.provider, "stripe"),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.subjectId, account.id),
      ),
    );
  const [intent] = await tx
    .select()
    .from(legacyFutureIntents)
    .where(
      and(
        eq(legacyFutureIntents.accountId, account.id),
        inArray(legacyFutureIntents.state, [
          "setup_pending",
          "setup_ready",
          "scheduling",
          "scheduled",
          "review",
        ]),
      ),
    );
  if (intent)
    return intent.state === "scheduled" && !intent.cancelRequestedAt
      ? {
          mode: "payer_decides",
          account,
          target: { kind: "schedule_start", intent, customer: customer ?? null },
        }
      : { mode: "wait", account };
  if (!customer) return { mode: "none", account };
  const [checkout] = await tx
    .select({ id: checkoutIntents.id })
    .from(checkoutIntents)
    .where(eq(checkoutIntents.customerId, customer.id))
    .limit(1);
  if (checkout) return { mode: "wait", account };
  const current = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customer.id),
        sql`${subscriptions.status} not in ('canceled', 'incomplete_expired')`,
      ),
    )
    .limit(2);
  const [subscription] = current;
  if (!subscription) return { mode: "none", account };
  if (current.length > 1) return { mode: "wait", account };
  if (subscription.status !== "active") return { mode: "wait", account };
  // A payer who already ended the renewal has no next charge to move.
  if (subscription.cancelAtPeriodEnd) return { mode: "none", account };
  const [change] = await tx
    .select({ id: collectionPlanChanges.id })
    .from(collectionPlanChanges)
    .where(
      and(
        eq(collectionPlanChanges.subscriptionId, subscription.id),
        inArray(collectionPlanChanges.status, ["preparing", "scheduled"]),
      ),
    )
    .limit(1);
  if (change) return { mode: "wait", account };
  return {
    mode: "payer_decides",
    account,
    target: { kind: "subscription_trial", subscription, customer },
  };
}

/** Mode shown to the adult who brings a contract, and required again at the
 * acceptance. An existing coordination that the payer already answered must
 * finish before another contract joins it. */
export async function readContributorMode(
  tx: Tx,
  groupId: string,
  contributorId: string,
): Promise<{ mode: LegacyCoordinationMode; commitment: PayerCommitment }> {
  const commitment = await readPayerCommitment(tx, groupId);
  if (commitment.mode !== "payer_decides") return { mode: commitment.mode, commitment };
  const [active] = await tx
    .select({
      state: legacyBillingCoordinations.state,
      contributorUserId: legacyBillingCoordinations.contributorUserId,
    })
    .from(legacyBillingCoordinations)
    .where(
      and(
        eq(legacyBillingCoordinations.accountId, commitment.account.id),
        inArray(legacyBillingCoordinations.state, [...ACTIVE_COORDINATION_STATES]),
      ),
    );
  if (active && (active.state !== "open" || active.contributorUserId !== contributorId))
    return { mode: "wait", commitment: { mode: "wait", account: commitment.account } };
  return { mode: "payer_decides", commitment };
}

export type CoordinationOffer =
  | { effect: "none"; reason: "covered" | "expired" }
  | {
      effect: "defer";
      kind: PayerTarget["kind"];
      target: PayerTarget;
      providerPriceId: string;
      amountCents: number;
      interval: "month" | "year";
      fromChargeAt: Date;
      contributedPaidThrough: Date;
      deferUntil: Date;
      revision: string;
    };

/** Local terms of what the payer is asked to approve. Callers refresh the
 * contributed contracts from the provider first and hold the family lock.
 * Throws while any fact still needs reconciliation; returns `none` when the
 * contributed period does not reach past the payer's own next charge. */
export async function readCoordinationOffer(
  tx: Tx,
  deps: { products: readonly Product[]; mode: StripeMode },
  coordination: Coordination,
  now: Date,
): Promise<CoordinationOffer> {
  const contracts = await tx
    .select({
      acceptance: legacyContractAcceptances,
      observation: legacyContractObservations,
      evidenceReview: legacyPaymentEvidenceReviews,
    })
    .from(legacyBillingCoordinationContracts)
    .innerJoin(
      legacyContractAcceptances,
      eq(legacyContractAcceptances.id, legacyBillingCoordinationContracts.acceptanceId),
    )
    .leftJoin(
      legacyContractObservations,
      eq(legacyContractObservations.subscriptionId, legacyContractAcceptances.subscriptionId),
    )
    .leftJoin(
      legacyPaymentEvidenceReviews,
      eq(legacyPaymentEvidenceReviews.subscriptionId, legacyContractAcceptances.subscriptionId),
    )
    .where(eq(legacyBillingCoordinationContracts.coordinationId, coordination.id))
    .orderBy(asc(legacyContractAcceptances.id))
    .limit(101);
  if (!contracts.length || contracts.length > 100)
    throw new BillingError("Contributed contracts require review");
  const acceptanceIds = contracts.map((item) => item.acceptance.id);
  const periods = await tx
    .select({
      fact: subscriptionPaymentPeriods,
      acceptanceId: legacyContractAcceptancePeriods.acceptanceId,
    })
    .from(legacyContractAcceptancePeriods)
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.id, legacyContractAcceptancePeriods.paymentPeriodId),
    )
    .where(
      and(
        inArray(legacyContractAcceptancePeriods.acceptanceId, acceptanceIds),
        gt(subscriptionPaymentPeriods.periodEnd, now),
      ),
    )
    .orderBy(asc(subscriptionPaymentPeriods.id))
    .limit(1001);
  if (periods.length > 1000) throw new BillingError("Contributed paid periods require review");
  let paidThrough: Date | null = null;
  for (const item of contracts) {
    const observed = item.observation;
    if (item.evidenceReview && !item.evidenceReview.resolvedAt)
      throw new BillingError("Contributed payment evidence requires reconciliation");
    if (
      item.acceptance.groupId !== coordination.groupId ||
      item.acceptance.payerUserId !== coordination.contributorUserId ||
      item.acceptance.policyVersion !== LEGACY_CONTRACT_POLICY_VERSION
    )
      throw new BillingError("Contributed contract does not belong to this coordination");
    if (
      !observed ||
      observed.observedAt > now ||
      now.getTime() - observed.observedAt.getTime() > LEGACY_OBSERVATION_MAX_AGE_MS
    )
      throw new BillingError("Contributed contract facts require reconciliation");
    // The paid-through date is only final once the old renewal has ended.
    if (
      !item.acceptance.cancellationConfirmedAt ||
      (observed.status !== "canceled" && !observed.cancelAtPeriodEnd)
    )
      throw new BillingError("Contributed renewal is still being ended");
    const relevant = periods.filter((period) => period.acceptanceId === item.acceptance.id);
    if (relevant.some((period) => period.fact.disputed))
      throw new BillingError("Contributed payment is disputed");
    for (const period of relevant.filter((entry) => !entry.fact.fullyRefunded)) {
      if (
        period.fact.subscriptionId !== item.acceptance.subscriptionId ||
        period.fact.reconciledAt > observed.observedAt ||
        period.fact.providerPriceId !== observed.providerPriceId ||
        period.fact.periodEnd > observed.periodEnd
      )
        throw new BillingError("Contributed paid period requires reconciliation");
      if (!paidThrough || period.fact.periodEnd > paidThrough) paidThrough = period.fact.periodEnd;
    }
  }
  if (!paidThrough) return { effect: "none", reason: "expired" };
  const commitment = await readPayerCommitment(tx, coordination.groupId);
  if (commitment.mode === "none") return { effect: "none", reason: "covered" };
  if (commitment.mode === "wait" || commitment.account.id !== coordination.accountId)
    throw new BillingError("Compasso billing requires reconciliation before coordination");
  const target = commitment.target;
  let fromChargeAt: Date;
  let providerPriceId: string;
  let amountCents: number;
  let interval: "month" | "year";
  if (target.kind === "subscription_trial") {
    const productId = target.subscription.productId;
    if (productId !== "compasso_monthly" && productId !== "compasso_annual")
      throw new BillingError("Payer subscription is outside the approved Compasso plans");
    const product = deps.products.find(
      (item) => item.id === productId && item.app === "compasso" && item.kind === "subscription",
    );
    interval = productId === "compasso_monthly" ? "month" : "year";
    amountCents =
      interval === "month" ? COMPASSO_POLICY.monthlyAmountCents : COMPASSO_POLICY.annualAmountCents;
    const priceId = product?.stripePriceId[deps.mode];
    if (
      !product ||
      product.interval !== interval ||
      product.listPrice?.currency !== "BRL" ||
      product.listPrice.amountCents !== amountCents ||
      !priceId ||
      !isStripePriceIdConfigured(priceId) ||
      priceId !== target.subscription.providerPriceId
    )
      throw new BillingError("Payer subscription price is not configured as approved");
    providerPriceId = priceId;
    fromChargeAt = target.subscription.currentPeriodEnd;
  } else {
    if (target.intent.interval !== "month" && target.intent.interval !== "year")
      throw new BillingError("Future contract interval is invalid");
    interval = target.intent.interval;
    amountCents = target.intent.amountCents;
    providerPriceId = target.intent.providerPriceId;
    fromChargeAt = target.intent.startsAt;
  }
  const deferUntil = new Date(Math.ceil(paidThrough.getTime() / 1000) * 1000);
  if (deferUntil <= fromChargeAt) return { effect: "none", reason: "covered" };
  if (fromChargeAt.getTime() <= now.getTime() + LEGACY_COORDINATION_MARGIN_MS)
    throw new BillingError("The payer's next charge is too close to be moved safely");
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        policy: LEGACY_COORDINATION_POLICY_VERSION,
        coordinationId: coordination.id,
        accountId: coordination.accountId,
        groupId: coordination.groupId,
        kind: target.kind,
        targetId: target.kind === "subscription_trial" ? target.subscription.id : target.intent.id,
        providerPriceId,
        amountCents,
        interval,
        fromChargeAt,
        contributedPaidThrough: paidThrough,
        deferUntil,
        acceptanceIds,
      }),
    )
    .digest("hex");
  return {
    effect: "defer",
    kind: target.kind,
    target,
    providerPriceId,
    amountCents,
    interval,
    fromChargeAt,
    contributedPaidThrough: paidThrough,
    deferUntil,
    revision,
  };
}
