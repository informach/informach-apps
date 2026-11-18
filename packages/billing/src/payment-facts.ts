import type { Product, StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, subscriptionPaymentPeriods, subscriptions } from "@informach/db/schema";
import { and, eq, lt, lte } from "drizzle-orm";
import Stripe from "stripe";
import { reconcileSubscriptionFunding } from "./credits/funding";
import { PaymentEvidenceMismatchError } from "./errors";
import { cancelsAtPeriodEnd } from "./providers/stripe-cancellation";

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
  /** Optional for legacy readers; native purchases require this exact origin. */
  origin?: {
    authorizationId: string;
    subjectType: string | null;
    subjectId: string | null;
    productId: string | null;
  };
};
const MAX_HISTORY = 600;

/** Apps with coverage selection must keep plan changes in their native flow.
 * The legacy three-argument catalog verification keeps the Edi portal policy.
 */
export type NativePlanPortalPolicy = {
  planUpdates: "application";
  app: string;
  returnUrl: string;
  termsUrl: string;
  privacyUrl: string;
};

/** Optional worker deadline; legacy callers retain their existing SDK policy. */
export type PaymentReadBudget = { deadlineMs: number };

export function createStripePaymentFactReader(config: {
  secretKey: string;
  client?: Stripe;
  expectedMode?: StripeMode;
  timeoutMs?: number;
  maxNetworkRetries?: number;
}) {
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: config.timeoutMs ?? 30000,
      maxNetworkRetries: config.maxNetworkRetries ?? 2,
    });
  function requestOptions(budget?: PaymentReadBudget): Stripe.RequestOptions | undefined {
    if (!budget) return undefined;
    const remaining = budget.deadlineMs - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new Error("Financial reconciliation read deadline exceeded");
    return {
      timeout: Math.max(1, Math.min(config.timeoutMs ?? 30000, remaining)),
      maxNetworkRetries: 0,
    };
  }
  function conferirModo(resource: { livemode: boolean }) {
    if (config.expectedMode !== undefined && resource.livemode !== (config.expectedMode === "prod"))
      throw new Error("Financial resource belongs to another Stripe mode");
  }
  async function chargeForPayment(
    payment: Stripe.InvoicePayment,
    budget?: PaymentReadBudget,
  ): Promise<Stripe.Charge> {
    requestOptions(budget);
    if (payment.payment.type === "payment_intent" && payment.payment.payment_intent) {
      const intent =
        typeof payment.payment.payment_intent === "string"
          ? await stripe.paymentIntents.retrieve(
              payment.payment.payment_intent,
              {
                expand: ["latest_charge"],
              },
              requestOptions(budget),
            )
          : payment.payment.payment_intent;
      const charge = intent.latest_charge;
      if (charge && typeof charge !== "string") return charge;
      if (charge) return stripe.charges.retrieve(charge, {}, requestOptions(budget));
    }
    // Read-only legacy payment reconciliation, never creates a Charges payment.
    if (payment.payment.type === "charge" && payment.payment.charge)
      return typeof payment.payment.charge === "string"
        ? stripe.charges.retrieve(payment.payment.charge, {}, requestOptions(budget))
        : payment.payment.charge;
    throw new Error("Invoice settlement needs manual reconciliation before granting access");
  }
  return {
    async verifyCompassoCatalog(
      products: readonly Product[],
      mode: StripeMode,
      portalConfigurationId: string,
    ) {
      const priceIds = new Set<string>();
      const productIds = new Set<string>();
      if (!products.length) throw new Error("Compasso catalog is empty");
      for (const expected of products) {
        const id = expected.stripePriceId[mode];
        if (
          expected.app !== "compasso" ||
          !id ||
          priceIds.has(id) ||
          !expected.listPrice ||
          !["subscription", "credit_pack"].includes(expected.kind)
        )
          throw new Error("Invalid Compasso catalog");
        priceIds.add(id);
        const price = await stripe.prices.retrieve(id);
        const product =
          typeof price.product === "string"
            ? await stripe.products.retrieve(price.product)
            : price.product;
        const recurring = expected.kind === "subscription";
        if (
          !price.active ||
          price.livemode !== (mode === "prod") ||
          price.billing_scheme !== "per_unit" ||
          price.type !== (recurring ? "recurring" : "one_time") ||
          price.unit_amount !== expected.listPrice.amountCents ||
          price.currency !== expected.listPrice.currency.toLowerCase() ||
          (recurring &&
            (!expected.interval ||
              price.recurring?.interval !== expected.interval ||
              price.recurring.interval_count !== 1)) ||
          (!recurring && price.recurring !== null) ||
          product.deleted ||
          !product.active ||
          product.metadata.app !== "compasso"
        )
          throw new Error("Stripe Compasso catalog does not match the approved offer");
        productIds.add(product.id);
      }
      if (productIds.size !== 1)
        throw new Error("Compasso prices must belong to its single product");
      const portal = await stripe.billingPortal.configurations.retrieve(portalConfigurationId);
      if (
        !portal.active ||
        portal.livemode !== (mode === "prod") ||
        portal.features.subscription_update.enabled ||
        portal.features.subscription_cancel.enabled ||
        !portal.features.payment_method_update.enabled ||
        !portal.features.invoice_history.enabled
      )
        throw new Error("Compasso portal must limit access to payment details and invoice history");
    },
    async eventPaymentReference(
      object: unknown,
    ): Promise<{ customerId: string | null; paymentId?: string; checkoutIntentId?: string }> {
      if (!object || typeof object !== "object") return { customerId: null };
      let source = object as Record<string, unknown>;
      if (typeof source.charge === "string")
        source = (await stripe.charges.retrieve(source.charge)) as unknown as Record<
          string,
          unknown
        >;
      const customerId = typeof source.customer === "string" ? source.customer : null;
      const paymentId =
        source.object === "payment_intent" && typeof source.id === "string"
          ? source.id
          : typeof source.payment_intent === "string"
            ? source.payment_intent
            : undefined;
      const metadata =
        source.metadata && typeof source.metadata === "object"
          ? (source.metadata as Record<string, unknown>)
          : null;
      const intentId = metadata?.checkout_intent_id;
      return {
        customerId,
        paymentId,
        ...(typeof intentId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)
          ? { checkoutIntentId: intentId }
          : {}),
      };
    },
    async verifyCatalog(
      products: readonly Product[],
      mode: StripeMode,
      portalConfigurationId: string,
      nativePolicy?: NativePlanPortalPolicy,
      budget?: PaymentReadBudget,
    ) {
      const ids = new Set<string>();
      const productIds = new Set<string>();
      if (!products.length || (nativePolicy && products.some((p) => p.app !== nativePolicy.app)))
        throw new Error("Invalid subscription catalog scope");
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
        const price = await stripe.prices.retrieve(id, {}, requestOptions(budget));
        const product =
          typeof price.product === "string"
            ? await stripe.products.retrieve(price.product, {}, requestOptions(budget))
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
      if (!nativePolicy && productIds.size !== 1)
        throw new Error("Suite prices must belong to one product");
      const portal = await stripe.billingPortal.configurations.retrieve(
        portalConfigurationId,
        {
          // Stripe omits the allowed products unless explicitly expanded. Without
          // this, a valid portal is rejected and every Edi checkout is blocked.
          expand: ["features.subscription_update.products"],
        },
        requestOptions(budget),
      );
      requestOptions(budget);
      const updates = portal.features.subscription_update;
      if (nativePolicy) {
        const cancellation = portal.features.subscription_cancel;
        const customerUpdates = portal.features.customer_update;
        if (
          !portal.active ||
          portal.livemode !== (mode === "prod") ||
          portal.metadata?.app !== nativePolicy.app ||
          portal.default_return_url !== nativePolicy.returnUrl ||
          portal.business_profile.terms_of_service_url !== nativePolicy.termsUrl ||
          portal.business_profile.privacy_policy_url !== nativePolicy.privacyUrl ||
          portal.login_page.enabled ||
          updates.enabled ||
          !cancellation.enabled ||
          cancellation.mode !== "at_period_end" ||
          cancellation.proration_behavior !== "none" ||
          !portal.features.payment_method_update.enabled ||
          !portal.features.invoice_history.enabled ||
          (customerUpdates.enabled &&
            customerUpdates.allowed_updates.some(
              (field) => !["name", "address", "email", "tax_id"].includes(field),
            ))
        )
          throw new Error("Stripe portal must preserve native plan and coverage decisions");
        return;
      }
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
      if (
        "customer" in object &&
        object.customer &&
        typeof object.customer === "object" &&
        "id" in object.customer &&
        typeof object.customer.id === "string"
      )
        return object.customer.id;
      if ("charge" in object && typeof object.charge === "string") {
        const charge = await stripe.charges.retrieve(object.charge);
        return typeof charge.customer === "string"
          ? charge.customer
          : (charge.customer?.id ?? null);
      }
      if ("payment_intent" in object && typeof object.payment_intent === "string") {
        const payment = await stripe.paymentIntents.retrieve(object.payment_intent);
        return typeof payment.customer === "string"
          ? payment.customer
          : (payment.customer?.id ?? null);
      }
      return null;
    },
    async listSubscriptionIds(customerId: string, budget?: PaymentReadBudget): Promise<string[]> {
      const ids: string[] = [];
      for await (const subscription of stripe.subscriptions.list(
        {
          customer: customerId,
          status: "all",
          limit: 100,
        },
        requestOptions(budget),
      )) {
        requestOptions(budget);
        conferirModo(subscription);
        if (ids.length >= MAX_HISTORY)
          throw new Error("Subscription history exceeds reconciliation limit");
        ids.push(subscription.id);
      }
      requestOptions(budget);
      return ids;
    },
    async read(
      subscriptionId: string,
      acceptedPriceIds: ReadonlySet<string>,
      budget?: PaymentReadBudget,
    ): Promise<SubscriptionPaymentSnapshot | null> {
      const observedAt = new Date();
      const subscription = await stripe.subscriptions.retrieve(
        subscriptionId,
        {},
        requestOptions(budget),
      );
      requestOptions(budget);
      conferirModo(subscription);
      if (subscription.items.data.length !== 1)
        throw new Error("Suite subscriptions require exactly one recurring item");
      const item = subscription.items.data[0];
      if (!item || !acceptedPriceIds.has(item.price.id)) return null;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      const periods: PaidPeriodFact[] = [];
      let invoices = 0;
      for await (const invoice of stripe.invoices.list(
        {
          subscription: subscription.id,
          status: "paid",
          limit: 100,
        },
        requestOptions(budget),
      )) {
        requestOptions(budget);
        conferirModo(invoice);
        if (++invoices > MAX_HISTORY)
          throw new Error("Invoice history exceeds reconciliation limit");
        const paidAt = invoice.status_transitions?.paid_at;
        if (!paidAt) throw new Error("Paid invoice has no payment confirmation timestamp");
        const invoiceCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (
          invoiceCustomerId !== customerId ||
          !Number.isSafeInteger(invoice.amount_paid) ||
          invoice.amount_paid < 0
        )
          throw new Error("Invoice settlement does not belong to this customer");
        let refunded = 0;
        let allocated = 0;
        let disputed = false;
        let payments = 0;
        for await (const payment of stripe.invoicePayments.list(
          {
            invoice: invoice.id,
            status: "paid",
            limit: 100,
          },
          requestOptions(budget),
        )) {
          requestOptions(budget);
          const amount = payment.amount_paid;
          if (++payments > MAX_HISTORY)
            throw new Error("Invoice payment history exceeds reconciliation limit");
          if (amount === null || !Number.isSafeInteger(amount) || amount < 0)
            throw new Error("Paid invoice settlement has no valid amount");
          if (amount === 0) continue;
          const charge = await chargeForPayment(payment, budget);
          requestOptions(budget);
          conferirModo(charge);
          const chargeCustomerId =
            typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
          if (
            !charge.paid ||
            !charge.captured ||
            chargeCustomerId !== customerId ||
            charge.currency !== invoice.currency ||
            !Number.isSafeInteger(charge.amount_captured) ||
            charge.amount_captured < amount ||
            !Number.isSafeInteger(charge.amount_refunded) ||
            charge.amount_refunded < 0 ||
            charge.amount_refunded > charge.amount_captured
          )
            throw new Error("Invoice charge settlement is inconsistent");
          allocated += amount;
          // Shared PaymentIntents may settle multiple invoices. Never attribute
          // an ambiguous partial refund to the wrong paid period.
          if (charge.amount_refunded > 0 && !charge.refunded && charge.amount_captured !== amount)
            throw new Error("Shared payment partial refund needs explicit allocation review");
          refunded += charge.refunded ? amount : Math.min(amount, charge.amount_refunded);
          if (charge.disputed) {
            let unresolved = false;
            let disputes = 0;
            for await (const dispute of stripe.disputes.list(
              { charge: charge.id, limit: 100 },
              requestOptions(budget),
            )) {
              requestOptions(budget);
              if (++disputes > MAX_HISTORY)
                throw new Error("Dispute history exceeds reconciliation limit");
              if (dispute.status !== "won" && dispute.status !== "warning_closed")
                unresolved = true;
            }
            if (!disputes) throw new Error("Disputed invoice charge has no dispute facts");
            disputed ||= unresolved;
          }
        }
        if (invoice.amount_paid !== allocated)
          throw new Error("Invoice has an unsupported or missing settlement");
        const fullyRefunded = invoice.amount_paid > 0 && refunded >= invoice.amount_paid;
        let lines = 0;
        for await (const line of stripe.invoices.listLineItems(
          invoice.id,
          { limit: 100 },
          requestOptions(budget),
        )) {
          requestOptions(budget);
          if (++lines > MAX_HISTORY)
            throw new Error("Invoice line history exceeds reconciliation limit");
          const details = line.parent?.subscription_item_details;
          const price = line.pricing?.price_details?.price;
          const priceId = typeof price === "string" ? price : price?.id;
          if (
            !details ||
            details.subscription !== subscription.id ||
            !priceId ||
            !acceptedPriceIds.has(priceId) ||
            !Number.isSafeInteger(line.amount) ||
            line.amount <= 0
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
      requestOptions(budget);
      return {
        customerId,
        subscriptionId: subscription.id,
        priceId: item.price.id,
        status: subscription.status,
        start: new Date(item.current_period_start * 1000),
        end: new Date(item.current_period_end * 1000),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        cancelAtPeriodEnd: cancelsAtPeriodEnd(subscription, item.current_period_end),
        periods,
        observedAt,
        ...(subscription.metadata?.checkout_intent_id
          ? {
              origin: {
                authorizationId: subscription.metadata.checkout_intent_id,
                subjectType: subscription.metadata.subject_type ?? null,
                subjectId: subscription.metadata.subject_id ?? null,
                productId: subscription.metadata.product_id ?? null,
              },
            }
          : {}),
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
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, localSubscriptionId))
      .for("update");
    const [customer] = sub
      ? await tx.select().from(customers).where(eq(customers.id, sub.customerId))
      : [];
    if (
      !sub ||
      !customer ||
      sub.providerSubscriptionId !== snapshot.subscriptionId ||
      customer.providerCustomerId !== snapshot.customerId
    )
      throw new Error("Payment snapshot does not belong to the local subscription and customer");
    // Previously persisted evidence must remain present in a newer complete
    // provider observation. In particular, an old zero-value trial line may
    // have been recorded before it was excluded by the reader. Preserve that
    // history and require reconciliation instead of silently trusting it.
    const prior = await tx
      .select({
        invoiceId: subscriptionPaymentPeriods.providerInvoiceId,
        lineId: subscriptionPaymentPeriods.providerLineId,
      })
      .from(subscriptionPaymentPeriods)
      .where(
        and(
          eq(subscriptionPaymentPeriods.subscriptionId, localSubscriptionId),
          lte(subscriptionPaymentPeriods.reconciledAt, snapshot.observedAt),
        ),
      );
    const observedLines = new Set(
      snapshot.periods.map((fact) => JSON.stringify([fact.invoiceId, fact.lineId])),
    );
    for (const fact of snapshot.periods) {
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
          setWhere: and(
            eq(subscriptionPaymentPeriods.subscriptionId, localSubscriptionId),
            lt(subscriptionPaymentPeriods.reconciledAt, snapshot.observedAt),
          ),
        });
      const [stored] = await tx
        .select()
        .from(subscriptionPaymentPeriods)
        .where(
          and(
            eq(subscriptionPaymentPeriods.provider, "stripe"),
            eq(subscriptionPaymentPeriods.providerInvoiceId, fact.invoiceId),
            eq(subscriptionPaymentPeriods.providerLineId, fact.lineId),
          ),
        );
      if (
        !stored ||
        stored.subscriptionId !== localSubscriptionId ||
        stored.providerPriceId !== fact.priceId ||
        stored.periodStart.getTime() !== fact.start.getTime() ||
        stored.periodEnd.getTime() !== fact.end.getTime() ||
        stored.paidAt.getTime() !== fact.paidAt.getTime()
      )
        throw new Error("Paid invoice identity or immutable period changed");
      if (
        stored.reconciledAt.getTime() === snapshot.observedAt.getTime() &&
        (stored.fullyRefunded !== fact.fullyRefunded || stored.disputed !== fact.disputed)
      )
        throw new Error("Payment observations conflict at the same timestamp");
    }
    if (prior.some((fact) => !observedLines.has(JSON.stringify([fact.invoiceId, fact.lineId]))))
      throw new PaymentEvidenceMismatchError();
    await reconcileSubscriptionFunding(tx, localSubscriptionId);
  });
}
