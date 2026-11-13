import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import {
  checkoutIntents,
  collectionAccounts,
  collectionPlanChanges,
  customers,
  familyEvents,
  familyGroups,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createSubscriptionCheckout } from "./checkout";
import { recoverPendingCheckout, settleCheckoutIntent } from "./checkout-lifecycle";
import { assertAccountPayer, openCompassoAccount } from "./collection-accounts";
import {
  assertCompassoFundingClear,
  requestCollectionReconciliation,
  runCollectionBillingJobs,
} from "./collection-jobs";
import {
  cancelCompassoPlanChange,
  planChangeInput,
  reconcileCompassoPlanChanges,
  requestCompassoPlanChange,
} from "./compasso-plans";
import {
  refreshCreditPurchase,
  withActiveCompassoBillingLock,
  withCompassoBillingLock,
} from "./credit-purchases";
import { grantCalendarSubscriptionCredits } from "./credits/subscription-grants";
import { getOrCreateCustomer } from "./customers";
import { BillingError, InvalidProductError, PaymentEvidenceMismatchError } from "./errors";
import { assertLegacySubscriptionsSettled } from "./legacy-subscription-barrier";
import {
  type createStripePaymentFactReader,
  persistPaymentPeriods,
  type SubscriptionPaymentSnapshot,
} from "./payment-facts";
import type { PlanScheduleProvider } from "./providers/stripe-plans";
import type { BillingProviderClient } from "./providers/types";

type Customer = typeof customers.$inferSelect;
type Reader = Pick<
  ReturnType<typeof createStripePaymentFactReader>,
  "listSubscriptionIds" | "read"
>;
export type CompassoCommerceDeps = {
  db: Database;
  providerClient: BillingProviderClient;
  plans: PlanScheduleProvider;
  reader: Reader;
  products: readonly Product[];
  mode: StripeMode;
  publicUrl: string;
  portalConfigurationId: string;
  verifyCatalog: () => Promise<void>;
  onError: (jobId: string, error: unknown) => void | Promise<void>;
};

/** Scoped snapshots never use webhook status alone as proof of payment. Caller owns the lifecycle lock. */
export async function persistCompassoSubscriptionSnapshot(
  db: Database,
  customerId: string,
  product: Product,
  snapshot: SubscriptionPaymentSnapshot,
) {
  if (
    product.app !== "compasso" ||
    product.kind !== "subscription" ||
    !Object.values(product.stripePriceId).includes(snapshot.priceId) ||
    !Number.isFinite(snapshot.observedAt.getTime()) ||
    snapshot.end <= snapshot.start
  )
    throw new BillingError("Invalid Compasso subscription facts");
  const outcome = await db.transaction(async (tx) => {
    try {
      const id = await tx.transaction(async (inner) => {
        const [customer] = await inner
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.app, "compasso"),
              eq(customers.subjectType, "billing_account"),
              eq(customers.provider, "stripe"),
            ),
          )
          .for("update");
        if (!customer || customer.providerCustomerId !== snapshot.customerId)
          throw new BillingError("Compasso payment facts belong to another customer");
        await inner
          .insert(subscriptions)
          .values({
            customerId,
            provider: "stripe",
            providerSubscriptionId: snapshot.subscriptionId,
            productId: product.id,
            providerPriceId: snapshot.priceId,
            status: snapshot.status,
            currentPeriodStart: snapshot.start,
            currentPeriodEnd: snapshot.end,
          })
          .onConflictDoNothing({
            target: [subscriptions.provider, subscriptions.providerSubscriptionId],
          });
        const [row] = await inner
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.provider, "stripe"),
              eq(subscriptions.providerSubscriptionId, snapshot.subscriptionId),
            ),
          )
          .for("update");
        if (!row || row.customerId !== customer.id)
          throw new BillingError("Subscription belongs to another commercial account");
        if (row.providerObservedAt && row.providerObservedAt > snapshot.observedAt) return row.id;
        const cancelAtPeriodEnd = snapshot.cancelAtPeriodEnd ? snapshot.end : null;
        if (
          row.providerObservedAt?.getTime() === snapshot.observedAt.getTime() &&
          (row.status !== snapshot.status ||
            row.providerPriceId !== snapshot.priceId ||
            row.productId !== product.id ||
            row.currentPeriodStart.getTime() !== snapshot.start.getTime() ||
            row.currentPeriodEnd.getTime() !== snapshot.end.getTime() ||
            row.trialEnd?.getTime() !== snapshot.trialEnd?.getTime() ||
            row.canceledAt?.getTime() !== snapshot.canceledAt?.getTime() ||
            row.cancelAtPeriodEnd?.getTime() !== cancelAtPeriodEnd?.getTime())
        )
          throw new BillingError("Conflicting Compasso subscription observation");
        await inner
          .update(subscriptions)
          .set({
            productId: product.id,
            providerPriceId: snapshot.priceId,
            status: snapshot.status,
            currentPeriodStart: snapshot.start,
            currentPeriodEnd: snapshot.end,
            trialEnd: snapshot.trialEnd,
            canceledAt: snapshot.canceledAt,
            cancelAtPeriodEnd,
            providerObservedAt: snapshot.observedAt,
            confirmedAt: row.confirmedAt ?? (snapshot.periods.length ? snapshot.observedAt : null),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, row.id));
        await persistPaymentPeriods(inner, row.id, snapshot);
        return row.id;
      });
      return { id, review: false as const };
    } catch (error) {
      if (!(error instanceof PaymentEvidenceMismatchError)) throw error;
      // The failed savepoint released its subscription and wallet locks. Take
      // the same family lock held by access and spending before admitting risk.
      const scope = and(
        eq(customers.id, customerId),
        eq(customers.app, "compasso"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.providerCustomerId, snapshot.customerId),
        eq(collectionAccounts.collection, "compasso"),
      );
      const [before] = await tx
        .select({ groupId: collectionAccounts.groupId })
        .from(customers)
        .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
        .where(scope);
      if (!before) throw new BillingError("Compasso payment scope changed");
      const [group] = await tx
        .select({ id: familyGroups.id })
        .from(familyGroups)
        .where(eq(familyGroups.id, before.groupId))
        .for("update");
      const [after] = await tx
        .select({ groupId: collectionAccounts.groupId })
        .from(customers)
        .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
        .where(scope);
      if (!group || after?.groupId !== before.groupId)
        throw new BillingError("Compasso payment scope changed");
      await requestCollectionReconciliation(tx, {
        customerId,
        kind: "subscription",
        subjectId: customerId,
        risk: true,
      });
      return { review: true as const };
    }
  });
  if (outcome.review) throw new PaymentEvidenceMismatchError();
  return outcome.id;
}

/** Caller holds the account lifecycle lock through provider reconciliation. */
export async function reconcileCompassoCustomerLocked(
  deps: CompassoCommerceDeps,
  customer: Customer,
) {
  const catalog = deps.products.filter((p) => p.app === "compasso");
  const paidProducts = catalog.filter((p) => p.kind === "subscription");
  const accepted = new Set(
    paidProducts.map((p) => p.stripePriceId[deps.mode]).filter(isStripePriceIdConfigured),
  );
  const lifecycle = { db: deps.db, app: "compasso", providerClient: deps.providerClient };
  await recoverPendingCheckout(lifecycle, customer);
  const providerIds = await deps.reader.listSubscriptionIds(customer.providerCustomerId);
  const known = await deps.db
    .select({ id: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.customerId, customer.id));
  if (known.some((sub) => !providerIds.includes(sub.id)))
    throw new BillingError("Provider subscription history is incomplete");
  for (const id of providerIds) {
    const snapshot = await deps.reader.read(id, accepted);
    const product =
      snapshot && paidProducts.find((p) => p.stripePriceId[deps.mode] === snapshot.priceId);
    if (!snapshot || !product)
      throw new BillingError("Customer subscription uses an unapproved price");
    const subscriptionId = await persistCompassoSubscriptionSnapshot(
      deps.db,
      customer.id,
      product,
      snapshot,
    );
    await grantCalendarSubscriptionCredits(
      { db: deps.db, app: "compasso", products: catalog },
      { subscriptionId },
    );
  }
  await reconcileCompassoPlanChanges(deps, customer.id);
  await settleCheckoutIntent(lifecycle, customer.providerCustomerId);
  const [pendingCheckout] = await deps.db
    .select({ expiresAt: checkoutIntents.request })
    .from(checkoutIntents)
    .where(eq(checkoutIntents.customerId, customer.id));
  const states = await deps.db
    .select({ status: subscriptions.status, nextGrant: subscriptions.nextCreditGrantAt })
    .from(subscriptions)
    .where(eq(subscriptions.customerId, customer.id));
  const awaitingPayment =
    (pendingCheckout && states.length === 0) || states.some((s) => s.status === "incomplete");
  const nextGrantDelay = states.flatMap((s) =>
    s.nextGrant ? [Math.max(60, Math.ceil((s.nextGrant.getTime() - Date.now()) / 1000))] : [],
  );
  return { retryAfterSeconds: awaitingPayment ? 60 : Math.min(21600, ...nextGrantDelay) };
}

export function createCompassoCommerce(deps: CompassoCommerceDeps) {
  const catalog = deps.products.filter((p) => p.app === "compasso");
  const paidProducts = catalog.filter((p) => p.kind === "subscription");
  const origin = new URL(deps.publicUrl);
  if (
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.hash ||
    origin.search ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new BillingError("Invalid central billing origin");
  const lifecycle = { db: deps.db, app: "compasso", providerClient: deps.providerClient };
  async function customerRecord(customerId: string) {
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.provider, "stripe"),
        ),
      );
    if (!customer) throw new BillingError("Unknown Compasso customer");
    return customer;
  }
  async function reconcileCustomer(customerId: string) {
    const customer = await customerRecord(z.uuid().parse(customerId));
    return withCompassoBillingLock(customer.subjectId, () =>
      reconcileCompassoCustomerLocked(deps, customer),
    );
  }
  async function subscribe(actorId: string, raw: { groupId: string; productId: string }) {
    const input = z.object({ groupId: z.uuid(), productId: z.string().min(1).max(120) }).parse(raw);
    const product = paidProducts.find((p) => p.id === input.productId);
    if (!product || !isStripePriceIdConfigured(product.stripePriceId[deps.mode]))
      throw new InvalidProductError(input.productId);
    const account = await openCompassoAccount(deps.db, actorId, input.groupId);
    return withActiveCompassoBillingLock(deps.db, actorId, account.id, async () => {
      const { email } = await assertAccountPayer(deps.db, actorId, account.id);
      await deps.db.transaction(async (tx) => {
        await lockFamilyMembership(tx, actorId, account.groupId);
        await assertLegacySubscriptionsSettled(tx, account.groupId);
      });
      await assertCompassoFundingClear(deps.db, account.groupId);
      await deps.verifyCatalog();
      const record = await getOrCreateCustomer(
        { ...lifecycle, provider: "stripe", organizationsEnabled: false },
        { subject: { type: "billing_account", id: account.id }, actorId, email },
      );
      const customer = await customerRecord(record.customerId);
      await requestCollectionReconciliation(deps.db, {
        customerId: customer.id,
        kind: "subscription",
        subjectId: customer.id,
      });
      await reconcileCompassoCustomerLocked(deps, customer);
      return createSubscriptionCheckout(
        {
          ...lifecycle,
          provider: "stripe",
          organizationsEnabled: false,
          managedCheckout: true,
          products: catalog,
          stripeMode: deps.mode,
          publicAppUrl: origin.origin,
          resolveSubjectEmail: async () => email,
        },
        {
          subject: { type: "billing_account", id: account.id },
          actorId,
          productId: product.id,
          successUrl: `${origin.origin}/?assinatura=retorno#compasso`,
          cancelUrl: `${origin.origin}/#compasso`,
        },
      );
    });
  }
  async function ownedCustomer(actorId: string, accountId: string) {
    const { account } = await assertAccountPayer(deps.db, actorId, z.uuid().parse(accountId));
    if (account.collection !== "compasso") throw new BillingError("Account is outside Compasso");
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, account.id),
          eq(customers.app, "compasso"),
          eq(customers.provider, "stripe"),
        ),
      );
    if (!customer) throw new BillingError("Commercial customer has not been created");
    return { account, customer };
  }
  async function setCancellation(
    actorId: string,
    raw: { accountId: string; subscriptionId: string; cancel: boolean },
  ) {
    const input = z
      .object({ accountId: z.uuid(), subscriptionId: z.uuid(), cancel: z.boolean() })
      .parse(raw);
    return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, async () => {
      const { account, customer } = await ownedCustomer(actorId, input.accountId);
      if (!input.cancel) {
        if (account.closedAt) throw new BillingError("Closed accounts cannot renew");
        await deps.db.transaction((tx) => lockFamilyMembership(tx, actorId, account.groupId));
      }
      if (input.cancel) {
        const changes = await deps.db
          .select({ id: collectionPlanChanges.id })
          .from(collectionPlanChanges)
          .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
          .where(
            and(
              eq(subscriptions.customerId, customer.id),
              eq(subscriptions.id, input.subscriptionId),
              inArray(collectionPlanChanges.status, ["preparing", "scheduled"]),
            ),
          );
        for (const change of changes)
          await cancelCompassoPlanChange(deps, actorId, account.id, change.id);
      }
      await reconcileCompassoCustomerLocked(deps, customer);
      const [sub] = await deps.db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.id, input.subscriptionId),
            eq(subscriptions.customerId, customer.id),
          ),
        );
      if (!sub || ["canceled", "incomplete_expired"].includes(sub.status))
        throw new BillingError("Subscription cannot be changed");
      await requestCollectionReconciliation(deps.db, {
        customerId: customer.id,
        kind: "subscription",
        subjectId: customer.id,
      });
      if (input.cancel) {
        await deps.providerClient.cancelSubscription({
          providerSubscriptionId: sub.providerSubscriptionId,
          atPeriodEnd: true,
        });
      } else {
        if (!deps.providerClient.reactivateSubscription)
          throw new BillingError("Provider cannot restore renewal");
        await deps.providerClient.reactivateSubscription({
          providerSubscriptionId: sub.providerSubscriptionId,
        });
      }
      await reconcileCompassoCustomerLocked(deps, customer);
      await deps.db.insert(familyEvents).values({
        groupId: account.groupId,
        actorId,
        event: input.cancel ? "billing.cancellation_scheduled" : "billing.renewal_restored",
        targetId: sub.id,
      });
    });
  }
  async function portal(actorId: string, accountId: string) {
    // This verified portal has no subscription-changing capabilities. A payer
    // retains payment details/receipts after their web participation closes.
    return withCompassoBillingLock(z.uuid().parse(accountId), async () => {
      const { customer } = await ownedCustomer(actorId, accountId);
      await deps.verifyCatalog();
      return deps.providerClient.createPortalSession({
        customerId: customer.providerCustomerId,
        configurationId: deps.portalConfigurationId,
        returnUrl: `${origin.origin}/#compasso`,
      });
    });
  }
  async function changePlan(actorId: string, raw: z.input<typeof planChangeInput>) {
    const input = planChangeInput.parse(raw);
    return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, async () => {
      const { customer } = await ownedCustomer(actorId, input.accountId);
      await deps.verifyCatalog();
      await reconcileCompassoCustomerLocked(deps, customer);
      const change = await requestCompassoPlanChange(deps, actorId, input);
      await reconcileCompassoCustomerLocked(deps, customer);
      const [result] = await deps.db
        .select()
        .from(collectionPlanChanges)
        .where(eq(collectionPlanChanges.id, change.id));
      if (!result) throw new BillingError("Plan receipt disappeared");
      return result;
    });
  }
  async function cancelPlanChange(actorId: string, raw: { accountId: string; changeId: string }) {
    const input = z.object({ accountId: z.uuid(), changeId: z.uuid() }).parse(raw);
    return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, async () => {
      const { customer } = await ownedCustomer(actorId, input.accountId);
      await cancelCompassoPlanChange(deps, actorId, input.accountId, input.changeId);
      await reconcileCompassoCustomerLocked(deps, customer);
      const [result] = await deps.db
        .select()
        .from(collectionPlanChanges)
        .where(eq(collectionPlanChanges.id, input.changeId));
      if (!result) throw new BillingError("Plan receipt disappeared");
      return result;
    });
  }
  async function runReconciliation(options?: { limit?: number; customerId?: string }) {
    return runCollectionBillingJobs(
      {
        db: deps.db,
        onError: deps.onError,
        reconcile: async (job) => {
          if (job.kind === "subscription") {
            return reconcileCustomer(job.customerId);
          }
          const result = await refreshCreditPurchase(deps, job.subjectId);
          return {
            terminal: result.status === "expired" || result.status === "failed",
            retryAfterSeconds: result.status === "open" || result.status === "pending" ? 60 : 21600,
          };
        },
      },
      options,
    );
  }
  async function refreshPayerAccount(actorId: string, accountId: string) {
    const { customer } = await ownedCustomer(actorId, accountId);
    await requestCollectionReconciliation(deps.db, {
      customerId: customer.id,
      kind: "subscription",
      subjectId: customer.id,
    });
    return runReconciliation({ customerId: customer.id });
  }
  return {
    subscribe,
    setCancellation,
    changePlan,
    cancelPlanChange,
    portal,
    reconcileCustomer,
    runReconciliation,
    refreshPayerAccount,
  };
}
