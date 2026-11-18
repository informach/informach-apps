import { randomUUID } from "node:crypto";
import type { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import {
  createStripeRecreioUpgrades,
  type RecreioUpgradeScope,
  recreioUpgradeKey,
} from "@informach/billing/providers/stripe-recreio-upgrades";
import type Stripe from "stripe";
import { criarConferenciaDeFinanciamento } from "../src/features/cobranca/financiamento-stripe";

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
  const provider = createStripeRecreioUpgrades({
    secretKey: "unused",
    mode: "dev",
    client: stripe,
  });
  const prorationDate = item.current_period_start;
  const scope: RecreioUpgradeScope = {
    intentId: randomUUID(),
    customerId,
    subscriptionId: sub.id,
    fromPriceId: individual.priceId,
    toPriceId: family.priceId,
    periodStart: new Date(item.current_period_start * 1000),
    periodEnd: new Date(item.current_period_end * 1000),
    prorationAt: new Date(prorationDate * 1000),
    origin: {
      authorizationId: sub.metadata.checkout_intent_id ?? "",
      productId: sub.metadata.product_id ?? "",
      payerId: sub.metadata.subject_id ?? "",
    },
    budget: { deadlineMs: Date.now() + 90_000 },
  };
  const quote = await provider.preview(scope);
  verify(
    quote.currency === "BRL" && quote.totalCents < 0 && quote.amountDueCents === 0,
    "annual_credit_quote_differs",
  );
  proof.creditQuote = {
    subtotal: quote.subtotalCents,
    credit: quote.creditCents,
    total: quote.totalCents,
    due: quote.amountDueCents,
    prorationDate,
  };
  const attempt = { ...scope, quote, requestStartedAt: new Date() };
  const updateKey = recreioUpgradeKey(scope.intentId);
  const update = await provider.apply(attempt);
  const upgradeInvoiceId = update.invoiceId;
  verify(
    update.outcome === "applied" && upgradeInvoiceId !== initialInvoiceId,
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
  const replay = await provider.apply(attempt);
  verify(replay.invoiceId === upgradeInvoiceId, "annual_upgrade_replay_differs");
  proof.upgradeAdapter = "recreio_scoped_v1";
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
  const conferencia = criarConferenciaDeFinanciamento({
    modo: "dev",
    cliente: stripe,
    leitor: reader,
  });
  const conferirOrigem = () =>
    conferencia.conferir(
      { clienteId: customerId, assinaturaId: sub.id, precosAceitos: prices },
      { deadlineMs: Date.now() + 90_000 },
    );
  const financiada = await conferirOrigem();
  verify(
    financiada?.financiamento.periodos.some(
      (p) => p.faturaId === upgradeInvoiceId && p.estado === "comprovado",
    ) &&
      financiada.financiamento.periodos.some(
        (p) => p.faturaId === initialInvoiceId && p.cobertoAte === prorationDate,
      ),
    "annual_upgrade_funding_or_credit_cutoff_missing",
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
  const renovada = await conferirOrigem();
  verify(
    renovada?.financiamento.periodos.some(
      (p) => p.faturaId === renewalId && p.estado === "comprovado",
    ),
    "annual_renewal_funding_not_traced",
  );
  const encerrada = await stripe.subscriptions.cancel(sub.id, {
    prorate: false,
    invoice_now: false,
  });
  verify(
    encerrada.id === sub.id &&
      id(encerrada.customer) === customerId &&
      encerrada.status === "canceled" &&
      !encerrada.livemode,
    "annual_origin_contract_not_closed",
  );
  const seguinte = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: family.priceId, quantity: 1 }],
      payment_behavior: "error_if_incomplete",
      metadata: { ...sub.metadata, checkout_intent_id: randomUUID(), product_id: family.productId },
    },
    { idempotencyKey: `${prefix}:annual-credit-following-contract` },
  );
  const seguinteInvoiceId = id(seguinte.latest_invoice);
  verify(
    !seguinte.livemode &&
      id(seguinte.customer) === customerId &&
      seguinte.status === "active" &&
      seguinteInvoiceId,
    "annual_following_contract_scope_differs",
  );
  const seguinteInvoice = await invoiceFacts(seguinteInvoiceId);
  verify(
    seguinteInvoice.invoice.amount_paid === 0 &&
      seguinteInvoice.invoice.starting_balance < 0 &&
      seguinteInvoice.invoice.total === family.amountCents,
    "annual_following_contract_not_credit_funded",
  );
  proof.followingContract = { id: seguinte.id, invoice: seguinteInvoice.sanitized };
  const conferirCliente = () =>
    conferencia.conferirCliente(
      {
        clienteId: customerId,
        paganteId: sub.metadata.subject_id ?? "",
        assinaturaIds: [sub.id, seguinte.id],
        precosAceitos: prices,
      },
      { deadlineMs: Date.now() + 90_000 },
    );
  const transferida = await conferirCliente();
  verify(
    transferida.financiamento.periodos.some(
      (p) => p.faturaId === seguinteInvoiceId && p.estado === "comprovado",
    ),
    "annual_carried_credit_funding_not_traced",
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
  const revogada = await conferirCliente();
  verify(
    [upgradeInvoiceId, renewalId, seguinteInvoiceId].every((invoiceId) =>
      revogada.financiamento.periodos.some(
        (p) => p.faturaId === invoiceId && p.estado === "revogado",
      ),
    ),
    "annual_source_refund_did_not_revoke_dependencies",
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
    creditFundingGraphApiVerified: true,
    sourceRefundPropagationVerified: true,
    originalCreditedPeriodLimited: true,
    creditAcrossContractsApiVerified: true,
    creditFundingPeriods: revogada.financiamento.periodos.map((p) => ({
      invoiceId: p.faturaId,
      lineId: p.linhaId,
      sourceCaptureCount: p.capturasDeOrigem.length,
      state: p.estado,
      coveredUntil: p.cobertoAte,
    })),
    nativeAnnualCreditFundingImplemented: false,
  });
}
