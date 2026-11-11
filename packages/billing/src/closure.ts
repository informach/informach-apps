import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { and, type Database, eq, gt, inArray, sql } from "@informach/db";
import {
  collectionClosureReceipts,
  collectionPlanChanges,
  creditPurchaseIntents,
  customers,
  legacyFutureIntents,
  subscriptions,
} from "@informach/db/schema";
import { z } from "zod/v4";
import {
  assertBillingClosureScope,
  BillingClosureError,
  type FrozenBillingActor,
  hasBillingClosureReceipt,
  hasUnsettledClosureCustomer,
} from "./closure-scope";
import { type CompassoCommerceDeps, reconcileCompassoCustomerLocked } from "./compasso-commerce";
import { closeCreditPurchaseLocked, withCompassoBillingLock } from "./credit-purchases";
import {
  cancelUnsettledLegacyFutureIntent,
  cancelUnsettledLegacyFutureSetup,
} from "./legacy-future-intent";
import type { createStripeFutureContractProvider } from "./providers/stripe-future-contract";

export {
  BillingClosureError,
  type BillingClosureTransaction,
  commitBillingClosure,
  type FrozenBillingActor,
  lockBillingClosureScope,
} from "./closure-scope";

/** Provider access is resolved only for a customer that actually needs closing.
 * Accounts without billing can close while checkout is disabled or unconfigured. */
export type BillingClosureDeps = {
  db: Database;
  commerce: () => CompassoCommerceDeps;
  future?: () => Parameters<typeof cancelUnsettledLegacyFutureSetup>[0] &
    Parameters<typeof cancelUnsettledLegacyFutureIntent>[0] & {
      futureProvider: Pick<ReturnType<typeof createStripeFutureContractProvider>, "readSchedule">;
    };
};

/** A schedule can start between consent and cancellation. Verify its exact
 * subscription, close the consented customer, and require reconciled terminal
 * evidence before settling the future intent. */
async function closeStartedFuture(
  input: BillingClosureDeps,
  actor: FrozenBillingActor,
  fingerprint: string,
  selected: { id: string; accountId: string },
) {
  if (!input.future) throw new BillingClosureError("financial_review");
  const future = input.future();
  if (future.db !== input.db) throw new BillingClosureError("scope_changed");
  return withCompassoBillingLock(selected.accountId, async () => {
    const { intent, customer } = await input.db.transaction(async (tx) => {
      const scope = await assertBillingClosureScope(tx, actor, fingerprint);
      if (!scope.futureIntents.some((item) => item.id === selected.id))
        throw new BillingClosureError("scope_changed");
      const [intent] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.id, selected.id),
            eq(legacyFutureIntents.accountId, selected.accountId),
            eq(legacyFutureIntents.payerUserId, actor.userId),
            eq(legacyFutureIntents.state, "review"),
          ),
        );
      const customer = scope.customers.find((item) => item.subjectId === selected.accountId);
      if (!intent?.paymentMethodId || !customer) throw new BillingClosureError("financial_review");
      return { intent, customer };
    });
    if (!intent.paymentMethodId) throw new BillingClosureError("financial_review");
    const terms = {
      intentId: intent.id,
      customerId: customer.providerCustomerId,
      paymentMethodId: intent.paymentMethodId,
      priceId: intent.providerPriceId,
      interval: z.enum(["month", "year"]).parse(intent.interval),
      startsAt: intent.startsAt.getTime() / 1000,
      paidThroughMs: intent.paidThrough.getTime(),
      amountCents: intent.amountCents,
    };
    const found = await future.futureProvider.findSchedule(terms);
    if (intent.scheduleId && found?.id !== intent.scheduleId)
      throw new BillingClosureError("financial_review");
    if (!found || !["active", "released"].includes(found.status)) return false;
    const remote = await future.futureProvider.readSchedule(terms, found.id);
    if (!remote.subscriptionId || !["active", "released"].includes(remote.status))
      throw new BillingClosureError("pending_operations");
    const subscriptionId = remote.subscriptionId;
    const commerce = input.commerce();
    const close = commerce.providerClient.closeCustomerSubscriptions;
    if (commerce.db !== input.db || !close) throw new BillingClosureError("financial_review");
    const [fullCustomer] = await input.db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.id));
    if (!fullCustomer || fullCustomer.providerCustomerId !== customer.providerCustomerId)
      throw new BillingClosureError("scope_changed");
    await reconcileCompassoCustomerLocked(commerce, fullCustomer);
    await input.db.transaction(async (tx) => {
      await assertBillingClosureScope(tx, actor, fingerprint);
      const [subscription] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, "stripe"),
            eq(subscriptions.providerSubscriptionId, subscriptionId),
            eq(subscriptions.customerId, customer.id),
            eq(subscriptions.productId, intent.productId),
            eq(subscriptions.providerPriceId, intent.providerPriceId),
          ),
        );
      if (!subscription) throw new BillingClosureError("financial_review");
    });
    const closed = await close(customer.providerCustomerId);
    if (!closed.subscriptionIds.includes(subscriptionId))
      throw new BillingClosureError("pending_operations");
    await reconcileCompassoCustomerLocked(commerce, fullCustomer);
    const after = await future.futureProvider.readSchedule(terms, found.id);
    if (
      !["canceled", "released"].includes(after.status) ||
      (after.subscriptionId && after.subscriptionId !== subscriptionId)
    )
      throw new BillingClosureError("pending_operations");
    await input.db.transaction(async (tx) => {
      await assertBillingClosureScope(tx, actor, fingerprint);
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, "stripe"),
            eq(subscriptions.providerSubscriptionId, subscriptionId),
            eq(subscriptions.customerId, customer.id),
            eq(subscriptions.productId, intent.productId),
            eq(subscriptions.providerPriceId, intent.providerPriceId),
          ),
        );
      if (
        !subscription ||
        !["canceled", "incomplete_expired"].includes(subscription.status) ||
        (await hasUnsettledClosureCustomer(tx, customer.id))
      )
        throw new BillingClosureError("pending_operations");
      const [settled] = await tx
        .update(legacyFutureIntents)
        .set({
          state: "canceled",
          scheduleId: found.id,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(legacyFutureIntents.id, intent.id), eq(legacyFutureIntents.state, "review")))
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingClosureError("scope_changed");
    });
    return true;
  });
}

/** Confirmed irreversible phase only. The server coordinator authorizes this
 * call; browser input never supplies the actor, operation, or prepared selection.
 * Completed customers have durable receipts, so a retry continues across accounts.
 * Legacy contracts are settled once by the internal cutover, not by a second
 * permanent commercial migration engine. Unsettled legacy facts block the plan. */
export async function reconcileBillingClosure(
  input: BillingClosureDeps,
  actor: FrozenBillingActor,
  fingerprint: string,
) {
  const scope = await input.db.transaction((tx) =>
    assertBillingClosureScope(tx, actor, fingerprint),
  );
  const deadline = performance.now() + 45_000;
  for (const selected of scope.futureIntents) {
    if (["canceled", "applied"].includes(selected.state)) continue;
    if (performance.now() > deadline) throw new BillingClosureError("pending_operations");
    const kind = await withCompassoBillingLock(selected.accountId, () =>
      input.db.transaction(async (tx) => {
        const currentScope = await assertBillingClosureScope(tx, actor, fingerprint);
        if (!currentScope.futureIntents.some((intent) => intent.id === selected.id))
          throw new BillingClosureError("scope_changed");
        const [intent] = await tx
          .select()
          .from(legacyFutureIntents)
          .where(
            and(
              eq(legacyFutureIntents.id, selected.id),
              eq(legacyFutureIntents.accountId, selected.accountId),
              eq(legacyFutureIntents.payerUserId, actor.userId),
            ),
          )
          .for("update");
        if (!intent) throw new BillingClosureError("scope_changed");
        if (["canceled", "applied"].includes(intent.state)) return "settled" as const;
        if (
          (intent.state === "setup_ready" && !intent.scheduleId) ||
          (intent.state === "setup_pending" &&
            intent.setupProtocolVersion === 1 &&
            !intent.setupAttemptedAt &&
            !intent.setupSessionId &&
            !intent.paymentMethodId &&
            !intent.scheduleId) ||
          (intent.state === "review" &&
            intent.paymentMethodId &&
            intent.scheduleProtocolVersion === 1 &&
            !intent.scheduleAttemptedAt &&
            !intent.scheduleId)
        ) {
          await tx
            .update(legacyFutureIntents)
            .set({
              state: "canceled",
              cancelRequestedAt: sql`coalesce(${legacyFutureIntents.cancelRequestedAt}, clock_timestamp())`,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(eq(legacyFutureIntents.id, intent.id));
          return "settled" as const;
        }
        if (
          !["setup_pending", "scheduling", "scheduled", "review"].includes(intent.state) ||
          (!intent.paymentMethodId && intent.scheduleId)
        )
          throw new BillingClosureError("financial_review");
        await tx
          .update(legacyFutureIntents)
          .set({
            state: "review",
            cancelRequestedAt: sql`coalesce(${legacyFutureIntents.cancelRequestedAt}, clock_timestamp())`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(legacyFutureIntents.id, intent.id));
        return intent.paymentMethodId ? ("schedule" as const) : ("setup" as const);
      }),
    );
    if (kind === "settled") continue;
    if (!input.future) throw new BillingClosureError("financial_review");
    const deps = input.future();
    if (deps.db !== input.db) throw new BillingClosureError("scope_changed");
    if (kind === "schedule" && (await closeStartedFuture(input, actor, fingerprint, selected)))
      continue;
    const result =
      kind === "setup"
        ? await cancelUnsettledLegacyFutureSetup(deps, { intentId: selected.id })
        : await cancelUnsettledLegacyFutureIntent(deps, { intentId: selected.id });
    if (result.state !== "canceled") throw new BillingClosureError("pending_operations");
  }
  if (!scope.customers.length) return;
  const deps = input.commerce();
  if (deps.db !== input.db) throw new BillingClosureError("scope_changed");
  const close = deps.providerClient.closeCustomerSubscriptions;
  if (scope.customers.length && !close) throw new BillingClosureError("financial_review");
  for (const expected of scope.customers) {
    if (performance.now() > deadline) throw new BillingClosureError("pending_operations");
    await withCompassoBillingLock(expected.subjectId, async () => {
      const complete = await deps.db.transaction(async (tx) => {
        const current = await assertBillingClosureScope(tx, actor, fingerprint);
        if (!current.customers.some((c) => c.id === expected.id))
          throw new BillingClosureError("scope_changed");
        return hasBillingClosureReceipt(tx, actor, expected.id, fingerprint);
      });
      if (complete) return;
      const [customer] = await deps.db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, expected.id),
            eq(customers.app, "compasso"),
            eq(customers.provider, "stripe"),
            eq(customers.subjectType, "billing_account"),
            eq(customers.subjectId, expected.subjectId),
            eq(customers.providerCustomerId, expected.providerCustomerId),
          ),
        );
      if (!customer || !close) throw new BillingClosureError("scope_changed");
      const ownSubscriptions = deps.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.customerId, customer.id));
      await deps.db
        .update(collectionPlanChanges)
        .set({
          cancelRequestedAt: sql`coalesce(${collectionPlanChanges.cancelRequestedAt}, clock_timestamp())`,
        })
        .where(
          and(
            inArray(collectionPlanChanges.subscriptionId, ownSubscriptions),
            inArray(collectionPlanChanges.status, ["preparing", "scheduled"]),
          ),
        );
      // Recover previously admitted requests with their original keys/expiry,
      // including a lost schedule response, before terminating remote objects.
      await reconcileCompassoCustomerLocked(deps, customer);
      let after: string | undefined;
      while (true) {
        if (performance.now() > deadline) throw new BillingClosureError("pending_operations");
        const pending = await deps.db
          .select()
          .from(creditPurchaseIntents)
          .where(
            and(
              eq(creditPurchaseIntents.customerId, customer.id),
              eq(creditPurchaseIntents.outcome, "pending"),
              after ? gt(creditPurchaseIntents.id, after) : undefined,
            ),
          )
          .orderBy(creditPurchaseIntents.id)
          .limit(100);
        for (const intent of pending) {
          const result = await closeCreditPurchaseLocked(deps, customer, intent);
          if (result.status === "open" || result.status === "pending")
            throw new BillingClosureError("pending_operations");
        }
        if (pending.length < 100) break;
        after = pending.at(-1)?.id;
        if (!after) throw new BillingClosureError("scope_changed");
      }
      await close(customer.providerCustomerId);
      await reconcileCompassoCustomerLocked(deps, customer);
      await deps.db.transaction(async (tx) => {
        await lockFrozenWebParticipation(tx, actor);
        if (await hasUnsettledClosureCustomer(tx, customer.id))
          throw new BillingClosureError("pending_operations");
        await tx
          .insert(collectionClosureReceipts)
          .values({
            operationId: actor.operationId,
            customerId: customer.id,
            actorId: actor.userId,
            frozenRevision: actor.expectedRevision,
            scopeFingerprint: fingerprint,
          })
          .onConflictDoUpdate({
            target: [
              collectionClosureReceipts.operationId,
              collectionClosureReceipts.customerId,
              collectionClosureReceipts.scopeFingerprint,
            ],
            set: { confirmedAt: sql`clock_timestamp()` },
            setWhere: and(
              eq(collectionClosureReceipts.actorId, actor.userId),
              eq(collectionClosureReceipts.frozenRevision, actor.expectedRevision),
              eq(collectionClosureReceipts.scopeFingerprint, fingerprint),
            ),
          });
        if (!(await hasBillingClosureReceipt(tx, actor, customer.id, fingerprint)))
          throw new BillingClosureError("scope_changed");
      });
    });
  }
}
