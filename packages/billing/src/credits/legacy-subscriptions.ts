import type { Product } from "@informach/config";
import { getAppCollection } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  checkoutIntents,
  customers,
  legacyCheckoutResolutions,
  legacyContractObservations,
  legacyPaymentEvidenceReviews,
  subscriptions,
} from "@informach/db/schema";
import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { BillingError, PaymentEvidenceMismatchError } from "../errors";
import { persistPaymentPeriods } from "../payment-facts";
import type { BillingProviderClient } from "../providers/types";
import { lockLegacySourceFamily } from "./legacy-family-lock";
import { isMigratingCreditApp } from "./legacy-payments";
import { lockCreditOwner } from "./locks";
import { findCreditWalletMigration } from "./migration-forwarding";

type Deps = {
  db: Database;
  app: string;
  products: readonly Product[];
  providerClient: Pick<BillingProviderClient, "readSubscriptionPaymentFacts"> &
    Partial<Pick<BillingProviderClient, "findCheckoutSession">>;
};

/** Reads external facts before opening the transaction. Canceled historical
 * contracts remain eligible: their invoice refunds can arrive after the cut.
 */
export async function refreshLegacySubscriptionFunding(deps: Deps, providerSubscriptionId: string) {
  if (!isMigratingCreditApp(deps.app)) return false;
  return refreshCompassoLegacySubscriptionFunding(deps, providerSubscriptionId);
}

/** A contract can fund transitional access even when its app has no AI wallet.
 * This reads facts only; it does not grant coverage or accept a migration. */
export async function refreshCompassoLegacySubscriptionFunding(
  deps: Deps,
  providerSubscriptionId: string,
) {
  if (getAppCollection(deps.app) !== "compasso")
    throw new BillingError("Legacy subscription is outside Compasso");
  const [record] = await deps.db
    .select({ subscription: subscriptions, customer: customers })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(customers.app, deps.app),
        eq(customers.provider, "stripe"),
        eq(subscriptions.provider, "stripe"),
        eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
      ),
    );
  if (!record) return false;
  if (record.customer.subjectType !== "user" || !deps.providerClient.readSubscriptionPaymentFacts)
    throw new BillingError("Legacy subscription funding requires a supported personal account");
  const priceIds = new Set(
    deps.products
      .filter((product) => product.app === deps.app && product.kind === "subscription")
      .flatMap((product) => [product.stripePriceId.dev, product.stripePriceId.prod])
      .filter(Boolean),
  );
  const snapshot = await deps.providerClient.readSubscriptionPaymentFacts(
    providerSubscriptionId,
    priceIds,
  );
  if (!snapshot || !priceIds.has(snapshot.priceId))
    throw new BillingError("Legacy subscription price requires explicit reconciliation");
  if (
    snapshot.customerId !== record.customer.providerCustomerId ||
    snapshot.subscriptionId !== record.subscription.providerSubscriptionId ||
    !Number.isFinite(snapshot.observedAt.getTime()) ||
    snapshot.end <= snapshot.start
  )
    throw new BillingError("Legacy subscription snapshot does not belong to the contract");
  // Managed-checkout apps keep the intent while the subscription lives. Prove
  // with the provider that it completed into this very contract; anything
  // else stays an unresolved checkout for the Compasso barriers.
  const [intent] = await deps.db
    .select()
    .from(checkoutIntents)
    .where(eq(checkoutIntents.customerId, record.customer.id));
  const find = deps.providerClient.findCheckoutSession;
  const checkout =
    intent?.requestStarted && intent.providerSessionId && find
      ? await find(record.customer.providerCustomerId, intent.id, intent.providerSessionId)
      : null;
  const resolvedCheckout =
    intent?.providerSessionId &&
    checkout?.id === intent.providerSessionId &&
    checkout.status === "complete" &&
    checkout.subscriptionId === record.subscription.providerSubscriptionId
      ? { intentId: intent.id, sessionId: intent.providerSessionId }
      : null;
  const result = await deps.db.transaction(async (tx) => {
    // Historical financial event ingestion takes the source wallet before any
    // family lock. Take it before the subscription too, so a concurrent family
    // authorization cannot complete a wallet -> family -> subscription cycle.
    if (isMigratingCreditApp(deps.app)) {
      const owner = { type: "user" as const, id: record.customer.subjectId };
      await lockCreditOwner(tx, owner);
      const migration = await findCreditWalletMigration(tx, deps.app, owner);
      if (migration) await lockCreditOwner(tx, { type: "family", id: migration.groupId });
    }
    await lockLegacySourceFamily(tx, deps.app, record.customer.subjectId);
    const [locked] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, record.subscription.id))
      .for("update");
    if (
      !locked ||
      locked.customerId !== record.customer.id ||
      locked.providerSubscriptionId !== snapshot.subscriptionId
    )
      throw new BillingError("Legacy subscription changed during reconciliation");
    const [previous] = await tx
      .select()
      .from(legacyContractObservations)
      .where(eq(legacyContractObservations.subscriptionId, locked.id));
    if (previous && previous.observedAt > snapshot.observedAt) return;
    if (
      previous &&
      previous.observedAt.getTime() === snapshot.observedAt.getTime() &&
      (previous.status !== snapshot.status ||
        previous.providerPriceId !== snapshot.priceId ||
        previous.periodStart.getTime() !== snapshot.start.getTime() ||
        previous.periodEnd.getTime() !== snapshot.end.getTime() ||
        previous.cancelAtPeriodEnd !== snapshot.cancelAtPeriodEnd)
    )
      throw new BillingError("Conflicting legacy subscription observation");
    try {
      await persistPaymentPeriods(tx, locked.id, snapshot);
    } catch (error) {
      if (!(error instanceof PaymentEvidenceMismatchError)) throw error;
      // The nested payment transaction rolls back to its savepoint. Keep the
      // wallet, family and subscription locks while committing the review.
      await tx
        .insert(legacyPaymentEvidenceReviews)
        .values({ subscriptionId: locked.id, detectedAt: snapshot.observedAt })
        .onConflictDoUpdate({
          target: legacyPaymentEvidenceReviews.subscriptionId,
          set: { detectedAt: snapshot.observedAt, resolvedAt: null },
          setWhere: lte(legacyPaymentEvidenceReviews.detectedAt, snapshot.observedAt),
        });
      return "review" as const;
    }
    await tx
      .insert(legacyContractObservations)
      .values({
        subscriptionId: locked.id,
        status: snapshot.status,
        providerPriceId: snapshot.priceId,
        periodStart: snapshot.start,
        periodEnd: snapshot.end,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        observedAt: snapshot.observedAt,
      })
      .onConflictDoUpdate({
        target: legacyContractObservations.subscriptionId,
        set: {
          status: snapshot.status,
          providerPriceId: snapshot.priceId,
          periodStart: snapshot.start,
          periodEnd: snapshot.end,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
          observedAt: snapshot.observedAt,
        },
        setWhere: lt(legacyContractObservations.observedAt, snapshot.observedAt),
      });
    if (resolvedCheckout) {
      const [current] = await tx
        .select({ id: checkoutIntents.id, sessionId: checkoutIntents.providerSessionId })
        .from(checkoutIntents)
        .where(eq(checkoutIntents.customerId, record.customer.id));
      if (
        current?.id === resolvedCheckout.intentId &&
        current.sessionId === resolvedCheckout.sessionId
      )
        await tx
          .insert(legacyCheckoutResolutions)
          .values({
            providerSessionId: resolvedCheckout.sessionId,
            customerId: record.customer.id,
            subscriptionId: locked.id,
            checkoutIntentId: resolvedCheckout.intentId,
            observedAt: snapshot.observedAt,
          })
          .onConflictDoNothing();
    }
    await tx
      .update(legacyPaymentEvidenceReviews)
      .set({ resolvedAt: snapshot.observedAt })
      .where(
        and(
          eq(legacyPaymentEvidenceReviews.subscriptionId, locked.id),
          isNull(legacyPaymentEvidenceReviews.resolvedAt),
          lte(legacyPaymentEvidenceReviews.detectedAt, snapshot.observedAt),
        ),
      );
  });
  if (result === "review") throw new PaymentEvidenceMismatchError();
  return true;
}

export async function refreshLegacySubscriptionGrants(deps: Deps) {
  if (!isMigratingCreditApp(deps.app)) return { checked: 0 };
  // Rotate attempts even when every provider read in a batch fails. This queue
  // timestamp is neither lifecycle updatedAt nor verified payment freshness.
  // Claim under short row locks, then perform all network reads outside tx.
  const rows = await deps.db.transaction(async (tx) => {
    const due = alias(subscriptions, "due_legacy_funding");
    const claimed = await tx
      .select({ localId: due.id, id: due.providerSubscriptionId })
      .from(due)
      .innerJoin(customers, eq(customers.id, due.customerId))
      .where(
        and(
          eq(customers.app, deps.app),
          eq(customers.provider, "stripe"),
          eq(due.provider, "stripe"),
          sql`exists (select 1 from billing.credit_ledger l where l.app = ${deps.app}
        and l.owner_type = 'user' and l.owner_id = ${customers.subjectId} and l.entry_type = 'bonus_grant')`,
        ),
      )
      .orderBy(sql`${due.legacyFundingAttemptedAt} asc nulls first`, asc(due.id))
      .limit(50)
      .for("update", { of: due, skipLocked: true });
    if (claimed.length)
      await tx
        .update(subscriptions)
        .set({ legacyFundingAttemptedAt: sql`clock_timestamp()` })
        .where(
          inArray(
            subscriptions.id,
            claimed.map((row) => row.localId),
          ),
        );
    return claimed;
  });
  const failures: unknown[] = [];
  for (const row of rows) {
    try {
      await refreshLegacySubscriptionFunding(deps, row.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Legacy subscription funding is incomplete");
  return { checked: rows.length };
}

export async function refreshLegacyCustomerSubscriptionFunding(
  deps: Deps,
  providerCustomerId: string,
) {
  if (getAppCollection(deps.app) !== "compasso") return false;
  const rows = await deps.db
    .select({ id: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(customers.app, deps.app),
        eq(customers.provider, "stripe"),
        eq(customers.providerCustomerId, providerCustomerId),
        eq(subscriptions.provider, "stripe"),
      ),
    );
  const failures: unknown[] = [];
  for (const row of rows) {
    try {
      await refreshCompassoLegacySubscriptionFunding(deps, row.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Legacy customer funding is incomplete");
  return rows.length > 0;
}
