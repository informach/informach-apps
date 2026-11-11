import type { Product, StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import {
  collectionPlanChanges,
  customers,
  familyEvents,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { assertAccountPayer } from "./collection-accounts";
import { assertCompassoFundingClear, requestCollectionReconciliation } from "./collection-jobs";
import { BillingError } from "./errors";
import type { PlanScheduleProvider } from "./providers/stripe-plans";

type Deps = {
  db: Database;
  plans: PlanScheduleProvider;
  products: readonly Product[];
  mode: StripeMode;
};
const pending = ["preparing", "scheduled"] as const;
type Change = typeof collectionPlanChanges.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const planChangeInput = z.object({
  accountId: z.uuid(),
  subscriptionId: z.uuid(),
  requestKey: z.uuid(),
  productId: z.enum(["compasso_monthly", "compasso_annual"]),
  expectedEnd: z.iso.datetime(),
});

/** Caller holds the commercial account lifecycle lock for all of these operations. */
export async function requestCompassoPlanChange(
  deps: Deps,
  actorId: string,
  raw: z.input<typeof planChangeInput>,
) {
  const input = planChangeInput.parse(raw);
  const { account } = await assertAccountPayer(deps.db, actorId, input.accountId);
  if (account.closedAt || account.collection !== "compasso")
    throw new BillingError("Account cannot change plans");
  const product = deps.products.find(
    (p) => p.id === input.productId && p.app === "compasso" && p.kind === "subscription",
  );
  const price = product?.stripePriceId[deps.mode];
  if (!price?.startsWith("price_") || !product) throw new BillingError("Plan is not configured");
  return deps.db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actorId, account.groupId);
    await assertCompassoFundingClear(tx, account.groupId);
    const [row] = await tx
      .select({ sub: subscriptions, customer: customers })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          eq(subscriptions.id, input.subscriptionId),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, account.id),
          eq(customers.provider, "stripe"),
        ),
      );
    if (!row) throw new BillingError("Plan change belongs to another payer");
    const [replay] = await tx
      .select()
      .from(collectionPlanChanges)
      .where(
        and(
          eq(collectionPlanChanges.subscriptionId, row.sub.id),
          eq(collectionPlanChanges.requestKey, input.requestKey),
        ),
      );
    if (replay) {
      if (
        replay.actorId !== actorId ||
        replay.toProductId !== product.id ||
        replay.toPriceId !== price ||
        replay.effectiveAt.toISOString() !== input.expectedEnd
      )
        throw new BillingError("Plan request conflicts with its receipt");
      return replay;
    }
    const [existing] = await tx
      .select({ id: collectionPlanChanges.id })
      .from(collectionPlanChanges)
      .where(
        and(
          eq(collectionPlanChanges.subscriptionId, row.sub.id),
          inArray(collectionPlanChanges.status, pending),
        ),
      );
    if (existing) throw new BillingError("A plan change is already in progress");
    if (
      row.sub.status !== "active" ||
      row.sub.cancelAtPeriodEnd ||
      row.sub.providerPriceId === price ||
      row.sub.currentPeriodEnd.toISOString() !== input.expectedEnd ||
      row.sub.currentPeriodEnd.getTime() <= Date.now() + 300_000
    )
      throw new BillingError("Plan quote is stale or the subscription cannot change");
    const [paid] = await tx
      .select({ id: subscriptionPaymentPeriods.id })
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, row.sub.id),
          eq(subscriptionPaymentPeriods.providerPriceId, row.sub.providerPriceId),
          eq(subscriptionPaymentPeriods.periodStart, row.sub.currentPeriodStart),
          eq(subscriptionPaymentPeriods.periodEnd, row.sub.currentPeriodEnd),
          eq(subscriptionPaymentPeriods.fullyRefunded, false),
          eq(subscriptionPaymentPeriods.disputed, false),
        ),
      );
    if (!paid) throw new BillingError("Plan change requires a verified paid period");
    const [change] = await tx
      .insert(collectionPlanChanges)
      .values({
        subscriptionId: row.sub.id,
        actorId,
        requestKey: input.requestKey,
        fromPriceId: row.sub.providerPriceId,
        toPriceId: price,
        toProductId: product.id,
        effectiveAt: row.sub.currentPeriodEnd,
      })
      .returning();
    if (!change) throw new BillingError("Plan change receipt missing");
    await requestCollectionReconciliation(tx, {
      customerId: row.customer.id,
      kind: "subscription",
      subjectId: row.customer.id,
    });
    await tx.insert(familyEvents).values({
      groupId: account.groupId,
      actorId,
      event: "billing.plan_change_requested",
      targetId: change.id,
    });
    return change;
  });
}

/** A signed schedule.created event is a durable recovery receipt even after Stripe's retention window. */
export async function recordCompassoScheduleCreated(
  tx: Database | Tx,
  input: {
    customerId: string;
    subscriptionId: string;
    intentId: string;
    scheduleId: string;
  },
) {
  const [row] = await tx
    .select({ change: collectionPlanChanges })
    .from(collectionPlanChanges)
    .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
    .where(
      and(
        eq(collectionPlanChanges.id, input.intentId),
        eq(subscriptions.customerId, input.customerId),
        eq(subscriptions.providerSubscriptionId, input.subscriptionId),
      ),
    );
  if (!row?.change.requestStartedAt)
    throw new BillingError("Schedule event does not match a started plan request");
  if (row.change.providerScheduleId && row.change.providerScheduleId !== input.scheduleId)
    throw new BillingError("Schedule creation receipt conflicts with its provider identity");
  await tx
    .update(collectionPlanChanges)
    .set({ providerScheduleId: input.scheduleId })
    .where(
      and(
        eq(collectionPlanChanges.id, input.intentId),
        isNull(collectionPlanChanges.providerScheduleId),
      ),
    );
  const [confirmed] = await tx
    .select({ id: collectionPlanChanges.providerScheduleId })
    .from(collectionPlanChanges)
    .where(eq(collectionPlanChanges.id, input.intentId));
  if (confirmed?.id !== input.scheduleId)
    throw new BillingError("Concurrent schedule creation identity conflict");
}

export async function cancelCompassoPlanChange(
  deps: Deps,
  actorId: string,
  accountId: string,
  changeId: string,
) {
  z.uuid().parse(changeId);
  const { account } = await assertAccountPayer(deps.db, actorId, accountId);
  const [row] = await deps.db
    .select({ change: collectionPlanChanges, customer: customers })
    .from(collectionPlanChanges)
    .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(collectionPlanChanges.id, changeId),
        eq(customers.subjectId, account.id),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
      ),
    );
  if (!row) throw new BillingError("Plan change belongs to another payer");
  if (!["preparing", "scheduled"].includes(row.change.status)) return row.change;
  await deps.db.transaction(async (tx) => {
    await tx
      .update(collectionPlanChanges)
      .set({ cancelRequestedAt: sql`coalesce(${collectionPlanChanges.cancelRequestedAt}, now())` })
      .where(eq(collectionPlanChanges.id, changeId));
    await requestCollectionReconciliation(tx, {
      customerId: row.customer.id,
      kind: "subscription",
      subjectId: row.customer.id,
    });
    await tx.insert(familyEvents).values({
      groupId: account.groupId,
      actorId,
      event: "billing.plan_change_cancel_requested",
      targetId: changeId,
    });
  });
  return row.change;
}

export async function reconcileCompassoPlanChanges(deps: Deps, customerId: string) {
  const rows = await deps.db
    .select({ change: collectionPlanChanges, sub: subscriptions, customer: customers })
    .from(collectionPlanChanges)
    .innerJoin(subscriptions, eq(subscriptions.id, collectionPlanChanges.subscriptionId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.app, "compasso"),
        eq(customers.subjectType, "billing_account"),
        inArray(collectionPlanChanges.status, pending),
      ),
    );
  for (const { change, sub, customer } of rows) {
    let status: Change["status"];
    if (change.cancelRequestedAt && !change.requestStartedAt) status = "canceled";
    else {
      const product = deps.products.find(
        (p) =>
          p.id === change.toProductId &&
          p.app === "compasso" &&
          p.kind === "subscription" &&
          p.stripePriceId[deps.mode] === change.toPriceId,
      );
      if (!product || (product.interval !== "month" && product.interval !== "year"))
        throw new BillingError("Scheduled plan is no longer in the approved catalog");
      if (!change.requestStartedAt && change.effectiveAt.getTime() <= Date.now() + 60_000)
        status = "failed";
      else {
        const requestStartedAt = change.requestStartedAt ?? new Date();
        if (!change.requestStartedAt)
          await deps.db
            .update(collectionPlanChanges)
            .set({ requestStartedAt })
            .where(eq(collectionPlanChanges.id, change.id));
        const input = {
          intentId: change.id,
          customerId: customer.providerCustomerId,
          subscriptionId: sub.providerSubscriptionId,
          fromPriceId: change.fromPriceId,
          toPriceId: change.toPriceId,
          toProductId: product.id,
          interval: product.interval,
          effectiveAt: change.effectiveAt,
          requestStartedAt,
        };
        let scheduleId = change.providerScheduleId;
        if (!scheduleId) {
          scheduleId = await deps.plans.create(input);
          await recordCompassoScheduleCreated(deps.db, {
            customerId,
            subscriptionId: sub.providerSubscriptionId,
            intentId: change.id,
            scheduleId,
          });
        }
        status = await deps.plans.reconcile({
          ...input,
          scheduleId,
          cancel: !!change.cancelRequestedAt,
        });
      }
    }
    await deps.db
      .update(collectionPlanChanges)
      .set({ status, resolvedAt: status === "scheduled" ? null : new Date() })
      .where(eq(collectionPlanChanges.id, change.id));
  }
}
