import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, subscriptions } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { BillingError, PaymentEvidenceMismatchError } from "./errors";
import { persistPaymentPeriods, type SubscriptionPaymentSnapshot } from "./payment-facts";

type Writer = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Caller holds its payer lifecycle/domain lock. The complete observation is
 * atomic and cannot move a subscription from another app, payer or customer.
 * This records financial facts; the app decides coverage using these facts.
 */
export function persistUserPaymentSnapshots(
  writer: Writer,
  input: {
    app: string;
    payerId: string;
    customerId: string;
    providerCustomerId: string;
    mode: StripeMode;
    products: readonly Product[];
    snapshots: readonly SubscriptionPaymentSnapshot[];
  },
) {
  return writer.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.app, input.app),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, input.payerId),
          eq(customers.providerCustomerId, input.providerCustomerId),
        ),
      )
      .for("update");
    if (!customer) throw new BillingError("Payment customer does not belong to this payer and app");
    const known = await tx
      .select({ id: subscriptions.providerSubscriptionId })
      .from(subscriptions)
      .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.provider, "stripe")))
      .for("update");
    const observed = new Set(input.snapshots.map((s) => s.subscriptionId));
    if (observed.size !== input.snapshots.length || known.some((s) => !observed.has(s.id)))
      throw new PaymentEvidenceMismatchError();
    const ids: string[] = [];
    for (const snapshot of input.snapshots) {
      const product = input.products.find(
        (p) =>
          p.app === input.app &&
          p.kind === "subscription" &&
          p.stripePriceId[input.mode] === snapshot.priceId,
      );
      if (
        !product ||
        !isStripePriceIdConfigured(snapshot.priceId) ||
        snapshot.customerId !== customer.providerCustomerId ||
        !Number.isFinite(snapshot.observedAt.getTime()) ||
        !Number.isFinite(snapshot.start.getTime()) ||
        !Number.isFinite(snapshot.end.getTime()) ||
        snapshot.end <= snapshot.start
      )
        throw new BillingError(
          "Payment observation does not match the approved customer and catalog",
        );
      await tx
        .insert(subscriptions)
        .values({
          customerId: customer.id,
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
      const [row] = await tx
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
      if (row.providerObservedAt && row.providerObservedAt > snapshot.observedAt)
        throw new PaymentEvidenceMismatchError();
      const cancelAt = snapshot.cancelAtPeriodEnd ? snapshot.end : null;
      if (
        row.providerObservedAt?.getTime() === snapshot.observedAt.getTime() &&
        (row.status !== snapshot.status ||
          row.productId !== product.id ||
          row.providerPriceId !== snapshot.priceId ||
          row.currentPeriodStart.getTime() !== snapshot.start.getTime() ||
          row.currentPeriodEnd.getTime() !== snapshot.end.getTime() ||
          row.trialEnd?.getTime() !== snapshot.trialEnd?.getTime() ||
          row.canceledAt?.getTime() !== snapshot.canceledAt?.getTime() ||
          row.cancelAtPeriodEnd?.getTime() !== cancelAt?.getTime())
      )
        throw new PaymentEvidenceMismatchError();
      await tx
        .update(subscriptions)
        .set({
          productId: product.id,
          providerPriceId: snapshot.priceId,
          status: snapshot.status,
          currentPeriodStart: snapshot.start,
          currentPeriodEnd: snapshot.end,
          trialEnd: snapshot.trialEnd,
          canceledAt: snapshot.canceledAt,
          cancelAtPeriodEnd: cancelAt,
          providerObservedAt: snapshot.observedAt,
          confirmedAt: row.confirmedAt ?? (snapshot.periods.length ? snapshot.observedAt : null),
          updatedAt: new Date(),
        })
        .where(and(eq(subscriptions.id, row.id), eq(subscriptions.customerId, customer.id)));
      await persistPaymentPeriods(tx, row.id, snapshot);
      ids.push(row.id);
    }
    return ids;
  });
}
