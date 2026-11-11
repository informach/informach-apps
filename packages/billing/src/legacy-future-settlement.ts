import type { Database } from "@informach/db";
import {
  collectionAccounts,
  customers,
  legacyFutureIntents,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { hasPendingCompassoReview, requestCollectionReconciliation } from "./collection-jobs";
import { withCompassoBillingLock } from "./credit-purchases";
import { BillingError } from "./errors";
import type { createStripeFutureContractProvider } from "./providers/stripe-future-contract";

/** An active schedule is not proof of payment. Only the existing authoritative
 * Compasso invoice reconciliation can supply the paid period used here. */
export async function settleLegacyFutureIntent(
  deps: {
    db: Database;
    futureProvider: Pick<ReturnType<typeof createStripeFutureContractProvider>, "readSchedule">;
  },
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(eq(legacyFutureIntents.id, intentId));
  if (!observed) throw new BillingError("Future contract is unavailable");
  return withCompassoBillingLock(observed.accountId, async () => {
    const [intent] = await deps.db
      .select()
      .from(legacyFutureIntents)
      .where(eq(legacyFutureIntents.id, intentId));
    if (intent?.state === "applied") return { intentId, state: "applied" as const };
    if (!intent || intent.state !== "scheduled" || !intent.scheduleId || !intent.paymentMethodId)
      throw new BillingError("Future schedule is not ready for settlement");
    if (intent.startsAt > new Date()) return { intentId, state: "waiting" as const };
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, intent.accountId),
        ),
      );
    if (!customer) throw new BillingError("Future schedule customer is unavailable");
    const future = {
      intentId,
      customerId: customer.providerCustomerId,
      paymentMethodId: intent.paymentMethodId,
      priceId: intent.providerPriceId,
      interval: z.enum(["month", "year"]).parse(intent.interval),
      startsAt: intent.startsAt.getTime() / 1000,
      paidThroughMs: intent.paidThrough.getTime(),
      amountCents: intent.amountCents,
    };
    const remote = await deps.futureProvider.readSchedule(future, intent.scheduleId);
    if (remote.status === "not_started") return { intentId, state: "waiting" as const };
    if (!(["active", "released"].includes(remote.status) && remote.subscriptionId))
      throw new BillingError("Future schedule requires financial reconciliation");
    const providerSubscriptionId = remote.subscriptionId;
    return deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(eq(legacyFutureIntents.id, intentId))
        .for("update");
      if (!current || current.state !== "scheduled" || current.scheduleId !== remote.id)
        throw new BillingError("Future schedule changed during settlement");
      const [account] = await tx
        .select()
        .from(collectionAccounts)
        .where(eq(collectionAccounts.id, current.accountId));
      if (!account || account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, "stripe"),
            eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
          ),
        );
      if (
        subscription &&
        (subscription.customerId !== customer.id ||
          subscription.productId !== current.productId ||
          subscription.providerPriceId !== current.providerPriceId)
      )
        throw new BillingError("Future subscription conflicts with its accepted terms");
      const [paid] = subscription
        ? await tx
            .select({ id: subscriptionPaymentPeriods.id })
            .from(subscriptionPaymentPeriods)
            .where(
              and(
                eq(subscriptionPaymentPeriods.subscriptionId, subscription.id),
                eq(subscriptionPaymentPeriods.provider, "stripe"),
                eq(subscriptionPaymentPeriods.providerPriceId, current.providerPriceId),
                gte(subscriptionPaymentPeriods.periodStart, current.startsAt),
                gte(subscriptionPaymentPeriods.paidAt, current.startsAt),
                eq(subscriptionPaymentPeriods.fullyRefunded, false),
                eq(subscriptionPaymentPeriods.disputed, false),
              ),
            )
            .limit(1)
        : [];
      if (!paid || (await hasPendingCompassoReview(tx, account.groupId, "subscription"))) {
        await requestCollectionReconciliation(tx, {
          customerId: customer.id,
          kind: "subscription",
          subjectId: customer.id,
        });
        return { intentId, state: "waiting" as const };
      }
      const [settled] = await tx
        .update(legacyFutureIntents)
        .set({ state: "applied", updatedAt: new Date() })
        .where(
          and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.state, "scheduled")),
        )
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingError("Future schedule changed during settlement");
      return { intentId, state: "applied" as const };
    });
  });
}
