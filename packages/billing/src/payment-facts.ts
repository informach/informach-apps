import type { Product, StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import { subscriptionPaymentPeriods } from "@informach/db/schema";
import { lte } from "drizzle-orm";
import Stripe from "stripe";

export type PaidPeriodFact = {
  invoiceId: string;
  lineId: string;
  priceId: string;
  start: Date;
  end: Date;
  paidAt: Date;
  fullyRefunded: boolean;
  disputed: boolean;
};
export type SubscriptionPaymentSnapshot = {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: Stripe.Subscription.Status;
  start: Date;
  end: Date;
  trialEnd: Date | null;
  canceledAt: Date | null;
  cancelAtPeriodEnd: boolean;
  periods: PaidPeriodFact[];
  observedAt: Date;
};
const MAX_HISTORY = 600;

export function createStripePaymentFactReader(config: { secretKey: string; client?: Stripe }) {
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 30000,
      maxNetworkRetries: 2,
    });
  async function chargeForPayment(payment: Stripe.InvoicePayment): Promise<Stripe.Charge> {
    if (payment.payment.type === "payment_intent" && payment.payment.payment_intent) {
      const intent =
        typeof payment.payment.payment_intent === "string"
          ? await stripe.paymentIntents.retrieve(payment.payment.payment_intent, {
              expand: ["latest_charge"],
            })
          : payment.payment.payment_intent;
      const charge = intent.latest_charge;
      if (charge && typeof charge !== "string") return charge;
      if (charge) return stripe.charges.retrieve(charge);
    }
    // Read-only legacy payment reconciliation, never creates a Charges payment.
    if (payment.payment.type === "charge" && payment.payment.charge)
      return typeof payment.payment.charge === "string"
        ? stripe.charges.retrieve(payment.payment.charge)
        : payment.payment.charge;
    throw new Error("Invoice settlement needs manual reconciliation before granting access");
  }
  return {
    async verifyCatalog(
      products: readonly Product[],
      mode: StripeMode,
      portalConfigurationId: string,
    ) {
      const ids = new Set<string>();
      const productIds = new Set<string>();
      for (const expected of products) {
        const id = expected.stripePriceId[mode];
        if (
          !id ||
          ids.has(id) ||
          expected.kind !== "subscription" ||
          !expected.listPrice ||
          !expected.interval
        )
          throw new Error("Invalid subscription catalog");
        ids.add(id);
        const price = await stripe.prices.retrieve(id);
        const product =
          typeof price.product === "string"
            ? await stripe.products.retrieve(price.product)
            : price.product;
        if (
          !price.active ||
          price.livemode !== (mode === "prod") ||
          price.type !== "recurring" ||
          price.billing_scheme !== "per_unit" ||
          price.unit_amount !== expected.listPrice.amountCents ||
          price.currency !== expected.listPrice.currency.toLowerCase() ||
          price.recurring?.interval !== expected.interval ||
          price.recurring.interval_count !== 1 ||
          product.deleted ||
          !product.active ||
          product.metadata.app !== expected.app
        )
          throw new Error("Stripe catalog does not match the approved offer");
        productIds.add(product.id);
      }
      if (productIds.size !== 1) throw new Error("Suite prices must belong to one product");
      const portal = await stripe.billingPortal.configurations.retrieve(portalConfigurationId);
      const updates = portal.features.subscription_update;
      if (
        !portal.active ||
        portal.livemode !== (mode === "prod") ||
        !portal.features.subscription_cancel.enabled ||
        !updates.enabled ||
        !updates.products ||
        updates.products.length !== 1 ||
        !productIds.has(updates.products[0]?.product ?? "") ||
        updates.products.some(
          (product) =>
            product.prices.some((id) => !ids.has(id)) || product.prices.length !== ids.size,
        )
      )
        throw new Error("Stripe portal must be restricted to the approved suite prices");
    },
    async eventCustomerId(object: unknown): Promise<string | null> {
      if (!object || typeof object !== "object") return null;
      if ("customer" in object && typeof object.customer === "string") return object.customer;
      if ("charge" in object && typeof object.charge === "string") {
        const charge = await stripe.charges.retrieve(object.charge);
        return typeof charge.customer === "string"
          ? charge.customer
          : (charge.customer?.id ?? null);
      }
      return null;
    },
    async listSubscriptionIds(customerId: string): Promise<string[]> {
      const ids: string[] = [];
      for await (const subscription of stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      })) {
        if (ids.length >= MAX_HISTORY)
          throw new Error("Subscription history exceeds reconciliation limit");
        ids.push(subscription.id);
      }
      return ids;
    },
    async read(
      subscriptionId: string,
      acceptedPriceIds: ReadonlySet<string>,
    ): Promise<SubscriptionPaymentSnapshot | null> {
      const observedAt = new Date();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.items.data.length !== 1)
        throw new Error("Suite subscriptions require exactly one recurring item");
      const item = subscription.items.data[0];
      if (!item || !acceptedPriceIds.has(item.price.id)) return null;
      const periods: PaidPeriodFact[] = [];
      let invoices = 0;
      for await (const invoice of stripe.invoices.list({
        subscription: subscription.id,
        status: "paid",
        limit: 100,
      })) {
        if (++invoices > MAX_HISTORY)
          throw new Error("Invoice history exceeds reconciliation limit");
        const paidAt = invoice.status_transitions?.paid_at;
        if (!paidAt) throw new Error("Paid invoice has no payment confirmation timestamp");
        let refunded = 0;
        let allocated = 0;
        let disputed = false;
        for await (const payment of stripe.invoicePayments.list({
          invoice: invoice.id,
          status: "paid",
          limit: 100,
        })) {
          const amount = payment.amount_paid;
          if (amount === null) throw new Error("Paid invoice settlement has no amount");
          if (amount === 0) continue;
          const charge = await chargeForPayment(payment);
          allocated += amount;
          // Shared PaymentIntents may settle multiple invoices. Never attribute
          // an ambiguous partial refund to the wrong paid period.
          if (charge.amount_refunded > 0 && !charge.refunded && charge.amount !== amount)
            throw new Error("Shared payment partial refund needs explicit allocation review");
          refunded += charge.refunded ? amount : Math.min(amount, charge.amount_refunded);
          if (charge.disputed) {
            let unresolved = false;
            for await (const dispute of stripe.disputes.list({ charge: charge.id, limit: 100 }))
              if (dispute.status !== "won" && dispute.status !== "warning_closed")
                unresolved = true;
            disputed ||= unresolved;
          }
        }
        if (invoice.amount_paid > allocated)
          throw new Error("Invoice has an unsupported or missing settlement");
        const fullyRefunded = invoice.amount_paid > 0 && refunded >= invoice.amount_paid;
        for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
          const details = line.parent?.subscription_item_details;
          const price = line.pricing?.price_details?.price;
          const priceId = typeof price === "string" ? price : price?.id;
          if (
            !details ||
            details.subscription !== subscription.id ||
            !priceId ||
            !acceptedPriceIds.has(priceId) ||
            line.amount < 0
          )
            continue;
          if (line.period.end <= line.period.start) continue;
          periods.push({
            invoiceId: invoice.id,
            lineId: line.id,
            priceId,
            start: new Date(line.period.start * 1000),
            end: new Date(line.period.end * 1000),
            paidAt: new Date(paidAt * 1000),
            fullyRefunded,
            disputed,
          });
        }
      }
      return {
        customerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        subscriptionId: subscription.id,
        priceId: item.price.id,
        status: subscription.status,
        start: new Date(item.current_period_start * 1000),
        end: new Date(item.current_period_end * 1000),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        periods,
        observedAt,
      };
    },
  };
}

export async function persistPaymentPeriods(
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  localSubscriptionId: string,
  snapshot: SubscriptionPaymentSnapshot,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const fact of snapshot.periods)
      await tx
        .insert(subscriptionPaymentPeriods)
        .values({
          subscriptionId: localSubscriptionId,
          provider: "stripe",
          providerInvoiceId: fact.invoiceId,
          providerLineId: fact.lineId,
          providerPriceId: fact.priceId,
          periodStart: fact.start,
          periodEnd: fact.end,
          paidAt: fact.paidAt,
          fullyRefunded: fact.fullyRefunded,
          disputed: fact.disputed,
          reconciledAt: snapshot.observedAt,
        })
        .onConflictDoUpdate({
          target: [
            subscriptionPaymentPeriods.provider,
            subscriptionPaymentPeriods.providerInvoiceId,
            subscriptionPaymentPeriods.providerLineId,
          ],
          set: {
            fullyRefunded: fact.fullyRefunded,
            disputed: fact.disputed,
            reconciledAt: snapshot.observedAt,
          },
          setWhere: lte(subscriptionPaymentPeriods.reconciledAt, snapshot.observedAt),
        });
  });
}
