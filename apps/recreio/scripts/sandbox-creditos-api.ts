import type { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { createStripeProvider } from "@informach/billing/providers/stripe";
import type Stripe from "stripe";

type Oferta = { productId: string; priceId: string; amountCents: number };
const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

/** Called only after the guarded GitHub executor has verified the test account,
 * catalog, owned clock/customer and actual annual card capture. No native
 * Checkout, plan consent, game access or credit-funding proof is claimed. */
export async function observarCreditoAnual(entrada: {
  stripe: Stripe;
  reader: ReturnType<typeof createStripePaymentFactReader>;
  sub: Stripe.Subscription;
  customerId: string;
  initialInvoiceId: string;
  individual: Oferta;
  family: Oferta;
  prefix: string;
  advance: (target: number) => Promise<void>;
  proof: Record<string, unknown>;
  verify: (value: unknown, code: string) => asserts value;
}) {
  const {
    stripe,
    reader,
    sub,
    customerId,
    initialInvoiceId,
    individual,
    family,
    prefix,
    advance,
    proof,
  } = entrada;
  function verify(value: unknown, code: string): asserts value {
    entrada.verify(value, code);
  }
  const prices = new Set([individual.priceId, family.priceId]);
  const item = sub.items.data[0];
  verify(
    item && item.price.id === individual.priceId && item.quantity === 1 && !sub.livemode,
    "annual_origin_scope_differs",
  );
  async function invoiceFacts(invoiceId: string) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    verify(
      !invoice.livemode && id(invoice.customer) === customerId && invoice.currency === "brl",
      "annual_invoice_scope_differs",
    );
    const lines: {
      id: string;
      amount: number;
      priceId: string | undefined;
      creditedInvoiceId: string | null;
      creditedLineIds: string[];
    }[] = [];
    for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 })) {
      verify(lines.length < 20, "annual_invoice_line_bound_exceeded");
      const details = line.parent?.subscription_item_details ?? line.parent?.invoice_item_details;
      const credited = details?.proration_details?.credited_items;
      lines.push({
        id: line.id,
        amount: line.amount,
        priceId: id(line.pricing?.price_details?.price),
        creditedInvoiceId: credited?.invoice ?? null,
        creditedLineIds: credited?.invoice_line_items ?? [],
      });
    }
    return {
      invoice,
      sanitized: {
        id: invoice.id,
        amountPaid: invoice.amount_paid,
        amountDue: invoice.amount_due,
        total: invoice.total,
        startingBalance: invoice.starting_balance,
        endingBalance: invoice.ending_balance,
        lines,
      },
    };
  }
  async function balanceFacts() {
    const result: {
      id: string;
      type: string;
      amount: number;
      endingBalance: number;
      invoiceId: string | undefined;
      creditNoteId: string | undefined;
    }[] = [];
    for await (const entry of stripe.customers.listBalanceTransactions(customerId, {
      limit: 100,
    })) {
      verify(
        result.length < 40 &&
          !entry.livemode &&
          id(entry.customer) === customerId &&
          entry.currency === "brl",
        "annual_balance_scope_or_bound_differs",
      );
      result.push({
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        endingBalance: entry.ending_balance,
        invoiceId: id(entry.invoice),
        creditNoteId: id(entry.credit_note),
      });
    }
    return result;
  }
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "Recreio annual credit API fixture",
    client: stripe,
  });
  verify(provider.previewInvoice, "annual_preview_api_missing");
  const prorationDate = item.current_period_start;
  const quote = await provider.previewInvoice({
    customerId,
    providerSubscriptionId: sub.id,
    newPriceId: family.priceId,
    prorationBehavior: "always_invoice",
    prorationDate,
  });
  verify(
    quote.currency === "BRL" &&
      quote.totalCents !== undefined &&
      quote.totalCents < 0 &&
      quote.amountDueCents === 0,
    "annual_credit_quote_differs",
  );
  proof.creditQuote = {
    subtotal: quote.subtotalCents,
    credit: quote.prorationCreditCents,
    total: quote.totalCents,
    due: quote.amountDueCents,
    prorationDate,
  };
  const updateKey = `${prefix}:annual-credit-upgrade`;
  const update = await provider.updateSubscription({
    providerSubscriptionId: sub.id,
    newPriceId: family.priceId,
    prorationBehavior: "always_invoice",
    prorationDate,
    paymentBehavior: "pending_if_incomplete",
    idempotencyKey: updateKey,
  });
  const upgradeInvoiceId = update.latestInvoice?.id;
  verify(
    upgradeInvoiceId && upgradeInvoiceId !== initialInvoiceId,
    "annual_upgrade_invoice_missing",
  );
  const credit = await invoiceFacts(upgradeInvoiceId);
  proof.creditInvoice = credit.sanitized;
  proof.balanceAfterUpgrade = await balanceFacts();
  verify(
    credit.invoice.status === "paid" &&
      credit.invoice.amount_paid === 0 &&
      credit.invoice.total < 0,
    "annual_credit_invoice_differs",
  );
  verify(
    credit.sanitized.lines.some(
      (line) => line.amount < 0 && line.creditedInvoiceId === initialInvoiceId,
    ),
    "annual_credit_origin_line_missing",
  );
  const replay = await provider.updateSubscription({
    providerSubscriptionId: sub.id,
    newPriceId: family.priceId,
    prorationBehavior: "always_invoice",
    prorationDate,
    paymentBehavior: "pending_if_incomplete",
    idempotencyKey: updateKey,
  });
  verify(replay.latestInvoice?.id === upgradeInvoiceId, "annual_upgrade_replay_differs");
  const changed = await stripe.subscriptions.retrieve(sub.id);
  const currentItem = changed.items.data[0];
  verify(
    !changed.livemode &&
      changed.id === sub.id &&
      id(changed.customer) === customerId &&
      changed.metadata.product_id === individual.productId &&
      currentItem?.price.id === family.priceId &&
      currentItem.quantity === 1,
    "annual_upgrade_contract_or_origin_differs",
  );
  const firstRead = await reader.read(sub.id, prices);
  verify(
    firstRead && !firstRead.periods.some((p) => p.invoiceId === upgradeInvoiceId),
    "annual_untraced_credit_created_paid_period",
  );
  const events: { id: string; invoiceId: string | undefined; pendingUpdate: boolean }[] = [];
  let seen = 0;
  for await (const event of stripe.events.list({
    type: "customer.subscription.updated",
    limit: 100,
    created: { gte: prorationDate - 60 },
  })) {
    verify(++seen <= 200, "annual_upgrade_event_bound_exceeded");
    if (
      event.type !== "customer.subscription.updated" ||
      event.request?.idempotency_key !== updateKey
    )
      continue;
    const observed = event.data.object;
    verify(
      !event.livemode && observed.id === sub.id && id(observed.customer) === customerId,
      "annual_upgrade_event_scope_differs",
    );
    events.push({
      id: event.id,
      invoiceId: id(observed.latest_invoice),
      pendingUpdate: Boolean(observed.pending_update),
    });
  }
  proof.exactUpdateEvents = events;
  await advance(currentItem.current_period_end + 7200);
  const renewed = await stripe.subscriptions.retrieve(sub.id);
  const renewalId = id(renewed.latest_invoice);
  verify(
    renewalId && renewalId !== upgradeInvoiceId && !renewed.livemode,
    "annual_credit_renewal_missing",
  );
  const renewal = await invoiceFacts(renewalId);
  proof.renewalInvoice = renewal.sanitized;
  proof.balanceAfterRenewal = await balanceFacts();
  verify(
    renewal.invoice.status === "paid" &&
      renewal.invoice.amount_paid === 0 &&
      renewal.invoice.total === family.amountCents &&
      renewal.invoice.starting_balance < 0,
    "annual_credit_renewal_not_balance_funded",
  );
  const renewedRead = await reader.read(sub.id, prices);
  verify(
    renewedRead && !renewedRead.periods.some((p) => p.invoiceId === renewalId),
    "annual_renewal_credit_created_untraced_period",
  );
  let paymentIntentId: string | undefined;
  for await (const allocation of stripe.invoicePayments.list({
    invoice: initialInvoiceId,
    status: "paid",
    limit: 100,
  })) {
    verify(
      !paymentIntentId &&
        allocation.amount_paid === individual.amountCents &&
        allocation.payment.type === "payment_intent",
      "annual_source_payment_ambiguous",
    );
    paymentIntentId = id(allocation.payment.payment_intent);
  }
  verify(paymentIntentId, "annual_source_payment_missing");
  const payment = await stripe.paymentIntents.retrieve(paymentIntentId);
  verify(
    !payment.livemode && id(payment.customer) === customerId && payment.status === "succeeded",
    "annual_refund_scope_differs",
  );
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `${prefix}:annual-source-refund` },
  );
  verify(
    refund.status === "succeeded" &&
      refund.amount === individual.amountCents &&
      refund.currency === "brl",
    "annual_source_refund_not_confirmed",
  );
  const refunded = await reader.read(sub.id, prices);
  verify(
    refunded?.periods.some((p) => p.invoiceId === initialInvoiceId && p.fullyRefunded),
    "annual_source_refund_not_detected",
  );
  Object.assign(proof, {
    initialInvoiceId,
    initialAmountPaid: individual.amountCents,
    refundId: refund.id,
    sourceRefundDetected: true,
    sameSubscriptionPreserved: true,
    initialProductPreserved: true,
    creditLedgerObserved: true,
    untracedCreditCoverageWithheld: true,
    nativeAnnualCreditFundingImplemented: false,
  });
}
