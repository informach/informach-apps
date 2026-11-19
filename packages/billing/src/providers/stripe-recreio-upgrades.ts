import Stripe from "stripe";
import { BillingError } from "../errors";
import type { PaymentReadBudget } from "../payment-facts";

/** Server-owned scope, never a browser request. The original purchase remains
 * immutable even after several native changes of the current offer. */
export type RecreioUpgradeScope = {
  intentId: string;
  customerId: string;
  subscriptionId: string;
  fromPriceId: string;
  toPriceId: string;
  periodStart: Date;
  periodEnd: Date;
  prorationAt: Date;
  origin: { authorizationId: string; productId: string; payerId: string };
  budget?: PaymentReadBudget;
};
export type RecreioUpgradeQuote = {
  itemId: string;
  amountDueCents: number;
  subtotalCents: number;
  creditCents: number;
  totalCents: number;
  startingBalanceCents: number;
  currency: "BRL";
};
export type RecreioUpgradeAttempt = RecreioUpgradeScope & {
  quote: RecreioUpgradeQuote;
  requestStartedAt: Date;
  /** Only the invoice already captured for this native attempt may be supplied. */
  providerInvoiceId?: string;
};
export type RecreioUpgradeObservation = {
  invoiceId: string;
  outcome: "pending" | "applied" | "failed";
};
export type RecreioUpgradeProvider = {
  preview(input: RecreioUpgradeScope): Promise<RecreioUpgradeQuote>;
  find(input: RecreioUpgradeAttempt): Promise<RecreioUpgradeObservation | null>;
  apply(input: RecreioUpgradeAttempt): Promise<RecreioUpgradeObservation>;
};
export const recreioUpgradeKey = (intentId: string) => `recreio:plan:${intentId}:upgrade`;
const resourceId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const MAX_EVENTS = 1000;
const MAX_LINES = 100;
const MAX_MONEY = 2147483647;

/** This adapter produces provider observations only. A paid/credit invoice
 * never grants access: the native writer must reconcile captured funding,
 * current contract, selection and adverse events in its own transaction. */
export function createStripeRecreioUpgrades(config: {
  secretKey: string;
  mode: "dev" | "prod";
  client?: Stripe;
  now?: () => Date;
}): RecreioUpgradeProvider {
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 10_000,
      maxNetworkRetries: 0,
      appInfo: { name: "informach-platform/recreio-upgrades" },
    });
  const now = () => (config.now?.() ?? new Date()).getTime();
  function options(input: RecreioUpgradeScope): Stripe.RequestOptions {
    const remaining = input.budget ? input.budget.deadlineMs - Date.now() : 10_000;
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new BillingError("Upgrade request deadline exceeded");
    return { timeout: Math.max(1, Math.min(10_000, remaining)), maxNetworkRetries: 0 };
  }
  function second(date: Date) {
    const value = date.getTime() / 1000;
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new BillingError("Upgrade requires a fixed Unix second");
    return value;
  }
  function validate(input: RecreioUpgradeScope) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.intentId,
      ) ||
      !input.customerId.startsWith("cus_") ||
      !input.subscriptionId.startsWith("sub_") ||
      !input.fromPriceId.startsWith("price_") ||
      !input.toPriceId.startsWith("price_") ||
      input.fromPriceId === input.toPriceId ||
      !input.origin.authorizationId ||
      !input.origin.productId ||
      !input.origin.payerId ||
      second(input.periodEnd) <= second(input.periodStart) ||
      second(input.prorationAt) < second(input.periodStart) ||
      second(input.prorationAt) >= second(input.periodEnd)
    )
      throw new BillingError("Upgrade native scope is invalid");
    options(input);
  }
  async function subscription(input: RecreioUpgradeScope) {
    validate(input);
    const sub = await stripe.subscriptions.retrieve(input.subscriptionId, {}, options(input));
    const item = sub.items.data[0];
    if (
      sub.id !== input.subscriptionId ||
      sub.livemode !== (config.mode === "prod") ||
      resourceId(sub.customer) !== input.customerId ||
      sub.metadata.subject_type !== "user" ||
      sub.metadata.subject_id !== input.origin.payerId ||
      sub.metadata.checkout_intent_id !== input.origin.authorizationId ||
      sub.metadata.product_id !== input.origin.productId ||
      sub.items.has_more ||
      sub.items.data.length !== 1 ||
      item?.quantity !== 1 ||
      !item.id.startsWith("si_")
    )
      throw new BillingError("Upgrade subscription belongs to another native scope");
    return { sub, item };
  }
  function unchanged(input: RecreioUpgradeScope, sub: Stripe.Subscription) {
    const item = sub.items.data[0];
    if (
      !item ||
      item.price.id !== input.fromPriceId ||
      item.current_period_start !== second(input.periodStart) ||
      item.current_period_end !== second(input.periodEnd) ||
      sub.status !== "active" ||
      sub.cancel_at_period_end ||
      sub.cancel_at ||
      sub.pending_update ||
      sub.pause_collection ||
      sub.schedule ||
      sub.collection_method !== "charge_automatically" ||
      sub.automatic_tax?.enabled ||
      sub.discounts.length ||
      item.discounts.length ||
      sub.default_tax_rates?.length ||
      item.tax_rates?.length ||
      sub.transfer_data ||
      sub.application_fee_percent != null ||
      sub.on_behalf_of ||
      sub.billing_thresholds ||
      item.billing_thresholds
    )
      throw new BillingError("The native contract changed or needs commercial review");
  }
  function money(value: number) {
    if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_MONEY)
      throw new BillingError("Upgrade invoice money is invalid");
    return value;
  }
  function quoteFor(
    invoice: Stripe.Invoice,
    lines: readonly Stripe.InvoiceLineItem[],
    input: RecreioUpgradeScope,
    itemId: string,
  ): RecreioUpgradeQuote {
    const parent = invoice.parent?.subscription_details;
    if (
      invoice.livemode !== (config.mode === "prod") ||
      resourceId(invoice.customer) !== input.customerId ||
      resourceId(parent?.subscription) !== input.subscriptionId ||
      invoice.currency !== "brl" ||
      invoice.automatic_tax?.enabled ||
      invoice.total_discount_amounts?.some((entry) => entry.amount !== 0) ||
      invoice.total_taxes?.some((entry) => entry.amount !== 0) ||
      invoice.pre_payment_credit_notes_amount ||
      invoice.post_payment_credit_notes_amount ||
      !lines.length ||
      lines.length > MAX_LINES
    )
      throw new BillingError("Upgrade invoice scope or commercial adjustments are unsupported");
    let subtotal = 0;
    let credit = 0;
    const seen = new Set<string>();
    for (const line of lines) {
      const details = line.parent?.subscription_item_details ?? line.parent?.invoice_item_details;
      const priceId = resourceId(line.pricing?.price_details?.price);
      const amount = money(line.amount);
      if (
        seen.has(line.id) ||
        line.currency !== "brl" ||
        details?.subscription !== input.subscriptionId ||
        (amount > 0 && priceId !== input.toPriceId) ||
        (amount < 0 && priceId !== input.fromPriceId) ||
        (amount === 0 && priceId !== input.fromPriceId && priceId !== input.toPriceId) ||
        line.quantity !== 1 ||
        line.discount_amounts?.some((entry) => entry.amount !== 0) ||
        line.taxes?.some((entry) => entry.amount !== 0)
      )
        throw new BillingError("Upgrade invoice lines do not match the native offer");
      seen.add(line.id);
      if (amount > 0) subtotal = money(subtotal + amount);
      else credit = money(credit + amount);
    }
    const total = money(invoice.total);
    const startingBalance = money(invoice.starting_balance);
    const amountDue = money(invoice.amount_due);
    if (
      subtotal <= 0 ||
      total !== money(subtotal + credit) ||
      amountDue !== Math.max(0, money(total + startingBalance))
    )
      throw new BillingError("Upgrade invoice totals differ from the complete native lines");
    return {
      itemId,
      amountDueCents: amountDue,
      subtotalCents: subtotal,
      creditCents: credit,
      totalCents: total,
      startingBalanceCents: startingBalance,
      currency: "BRL",
    };
  }
  function sameQuote(actual: RecreioUpgradeQuote, expected: RecreioUpgradeQuote) {
    if (
      actual.itemId !== expected.itemId ||
      actual.amountDueCents !== expected.amountDueCents ||
      actual.subtotalCents !== expected.subtotalCents ||
      actual.creditCents !== expected.creditCents ||
      actual.totalCents !== expected.totalCents ||
      actual.startingBalanceCents !== expected.startingBalanceCents ||
      actual.currency !== expected.currency
    )
      throw new BillingError("Upgrade invoice differs from the accepted native quote");
  }
  async function observe(input: RecreioUpgradeAttempt, invoiceId: string) {
    const invoice = await stripe.invoices.retrieve(invoiceId, {}, options(input));
    if (invoice.id !== invoiceId || invoice.billing_reason !== "subscription_update")
      throw new BillingError("Upgrade has no exact update invoice");
    const lines: Stripe.InvoiceLineItem[] = [];
    // Explicit pages allow the remaining deadline to be applied to every call.
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const page = await stripe.invoices.listLineItems(
        invoice.id,
        { limit: 100, ...(cursor ? { starting_after: cursor } : {}) },
        options(input),
      );
      if (lines.length + page.data.length > MAX_LINES)
        throw new BillingError("Upgrade invoice line bound exceeded");
      lines.push(...page.data);
      if (!page.has_more) break;
      const next = page.data.at(-1)?.id;
      if (!next || seen.has(next)) throw new BillingError("Upgrade line cursor is invalid");
      seen.add(next);
      cursor = next;
    }
    const { sub, item } = await subscription(input);
    sameQuote(quoteFor(invoice, lines, input, item.id), input.quote);
    const from = item.price.id === input.fromPriceId;
    const to = item.price.id === input.toPriceId;
    let outcome: RecreioUpgradeObservation["outcome"];
    if (invoice.status === "paid" && to && !sub.pending_update) outcome = "applied";
    else if (invoice.status === "open" && from && sub.pending_update) outcome = "pending";
    else if (["void", "uncollectible"].includes(invoice.status ?? "") && from) outcome = "failed";
    else throw new BillingError("Upgrade invoice and current subscription need reconciliation");
    return { invoiceId: invoice.id, outcome };
  }
  async function find(input: RecreioUpgradeAttempt): Promise<RecreioUpgradeObservation | null> {
    validate(input);
    if (
      !Number.isSafeInteger(input.requestStartedAt.getTime()) ||
      input.requestStartedAt.getTime() <= 0
    )
      throw new BillingError("Upgrade attempt has no valid admission time");
    await subscription(input);
    if (input.providerInvoiceId) return observe(input, input.providerInvoiceId);
    let cursor: string | undefined;
    let count = 0;
    let invoiceId: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const page = await stripe.events.list(
        {
          type: "customer.subscription.updated",
          created: { gte: Math.floor(input.requestStartedAt.getTime() / 1000) - 60 },
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        },
        options(input),
      );
      for (const event of page.data) {
        if (++count > MAX_EVENTS) throw new BillingError("Upgrade event history bound exceeded");
        if (event.request?.idempotency_key !== recreioUpgradeKey(input.intentId)) continue;
        const object = event.data.object;
        if (
          event.type !== "customer.subscription.updated" ||
          object.object !== "subscription" ||
          event.livemode !== (config.mode === "prod") ||
          object.id !== input.subscriptionId ||
          resourceId(object.customer) !== input.customerId ||
          object.metadata.checkout_intent_id !== input.origin.authorizationId ||
          object.metadata.subject_id !== input.origin.payerId ||
          object.metadata.subject_type !== "user" ||
          object.metadata.product_id !== input.origin.productId
        )
          throw new BillingError("Upgrade recovery event belongs to another native scope");
        const found = resourceId(object.latest_invoice);
        if (!found || (invoiceId && invoiceId !== found))
          throw new BillingError("Upgrade recovery events have no single invoice");
        invoiceId = found;
      }
      if (!page.has_more) break;
      const next = page.data.at(-1)?.id;
      if (!next || seen.has(next)) throw new BillingError("Upgrade event cursor is invalid");
      seen.add(next);
      cursor = next;
    }
    return invoiceId ? observe(input, invoiceId) : null;
  }
  async function preview(input: RecreioUpgradeScope) {
    const { sub, item } = await subscription(input);
    unchanged(input, sub);
    const invoice = await stripe.invoices.createPreview(
      {
        customer: input.customerId,
        subscription: input.subscriptionId,
        subscription_details: {
          items: [{ id: item.id, price: input.toPriceId, quantity: 1 }],
          proration_behavior: "always_invoice",
          proration_date: second(input.prorationAt),
        },
      },
      options(input),
    );
    if (invoice.lines.has_more) throw new BillingError("Upgrade preview lines are incomplete");
    // Preview can race with cancellation, renewal, another writer or item replacement.
    const current = await subscription(input);
    unchanged(input, current.sub);
    if (current.item.id !== item.id)
      throw new BillingError("Upgrade recurring item changed during preview");
    return quoteFor(invoice, invoice.lines.data, input, item.id);
  }
  return {
    preview,
    find,
    async apply(input) {
      const existing = await find(input);
      if (existing) return existing;
      if (now() - input.requestStartedAt.getTime() >= 23 * 60 * 60_000)
        throw new BillingError("Upgrade idempotency window elapsed; read-only review required");
      const { sub, item } = await subscription(input);
      unchanged(input, sub);
      if (item.id !== input.quote.itemId || input.requestStartedAt.getTime() > now())
        throw new BillingError("Upgrade attempt no longer has its accepted recurring item");
      sameQuote(await preview(input), input.quote);
      const updated = await stripe.subscriptions.update(
        input.subscriptionId,
        {
          items: [{ id: input.quote.itemId, price: input.toPriceId, quantity: 1 }],
          proration_date: second(input.prorationAt),
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
        },
        { ...options(input), idempotencyKey: recreioUpgradeKey(input.intentId) },
      );
      const invoiceId = resourceId(updated.latest_invoice);
      if (updated.id !== input.subscriptionId || !invoiceId)
        throw new BillingError("Upgrade response has no exact invoice identity");
      return observe(input, invoiceId);
    },
  };
}
