import type { StripeMode } from "@informach/config";
import type Stripe from "stripe";

export type InvoiceFundingLine = {
  id: string;
  priceId: string;
  amountCents: number;
  start: number;
  end: number;
  creditedItems?: { invoiceId: string; lineIds: string[] };
};
export type InvoiceFundingFact = {
  id: string;
  paidAt: number;
  totalCents: number;
  amountPaidCents: number;
  startingBalanceCents: number;
  endingBalanceCents: number;
  captures: { chargeId: string; amountCents: number }[];
  lines: InvoiceFundingLine[];
};
export type InvoiceCaptureFact = {
  id: string;
  amountCapturedCents: number;
  amountRefundedCents: number;
  disputed: boolean;
};
export type InvoiceFundingFacts = {
  customerId: string;
  subscriptionId: string;
  currency: "BRL";
  invoices: InvoiceFundingFact[];
  captures: InvoiceCaptureFact[];
};
const id = (resource: string | { id: string } | null | undefined) =>
  typeof resource === "string" ? resource : resource?.id;
function requireFact(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invoice funding evidence needs reconciliation: ${message}`);
}
function integer(value: number) {
  requireFact(Number.isSafeInteger(value), "invalid money or Unix second");
  return value;
}

/** Private accumulator for the authoritative read. Retains normalized IDs and
 * money only, without contact, descriptions, URLs, cards or raw API objects.
 * Collection does not certify the provenance of an invoice/customer balance. */
export class InvoiceFundingCollector {
  private readonly invoices = new Map<string, InvoiceFundingFact>();
  private readonly captures = new Map<string, InvoiceCaptureFact>();
  private readonly payments = new Set<string>();
  private readonly lines = new Set<string>();
  constructor(
    private readonly scope: {
      customerId: string;
      subscriptionId: string;
      mode: StripeMode;
      acceptedPriceIds: ReadonlySet<string>;
    },
  ) {}
  addInvoice(invoice: Stripe.Invoice) {
    requireFact(
      this.invoices.size < 600 &&
        !this.invoices.has(invoice.id) &&
        invoice.status === "paid" &&
        invoice.livemode === (this.scope.mode === "prod") &&
        invoice.currency === "brl" &&
        id(invoice.customer) === this.scope.customerId &&
        id(invoice.parent?.subscription_details?.subscription) === this.scope.subscriptionId &&
        invoice.status_transitions?.paid_at &&
        invoice.ending_balance !== null,
      "invoice scope, identity or settlement differs",
    );
    requireFact(integer(invoice.amount_paid) >= 0, "negative invoice payment");
    this.invoices.set(invoice.id, {
      id: invoice.id,
      paidAt: integer(invoice.status_transitions.paid_at),
      totalCents: integer(invoice.total),
      amountPaidCents: invoice.amount_paid,
      startingBalanceCents: integer(invoice.starting_balance),
      endingBalanceCents: integer(invoice.ending_balance),
      captures: [],
      lines: [],
    });
  }
  addCapture(
    invoiceId: string,
    payment: Stripe.InvoicePayment,
    charge: Stripe.Charge,
    disputed: boolean,
  ) {
    const invoice = this.invoices.get(invoiceId);
    requireFact(
      invoice &&
        this.payments.size < 2400 &&
        !this.payments.has(payment.id) &&
        id(payment.invoice) === invoiceId &&
        payment.status === "paid" &&
        payment.livemode === (this.scope.mode === "prod") &&
        payment.currency === "brl" &&
        payment.amount_paid !== null &&
        integer(payment.amount_paid) > 0 &&
        charge.livemode === (this.scope.mode === "prod") &&
        charge.currency === "brl" &&
        charge.paid &&
        charge.captured &&
        id(charge.customer) === this.scope.customerId &&
        integer(charge.amount_captured) >= payment.amount_paid &&
        integer(charge.amount_refunded) >= 0 &&
        charge.amount_refunded <= charge.amount_captured,
      "payment allocation or captured charge differs",
    );
    requireFact(
      payment.payment.type === "payment_intent"
        ? !!id(payment.payment.payment_intent) &&
            id(charge.payment_intent) === id(payment.payment.payment_intent)
        : payment.payment.type === "charge" && id(payment.payment.charge) === charge.id,
      "payment and charge identities differ",
    );
    const capture: InvoiceCaptureFact = {
      id: charge.id,
      amountCapturedCents: charge.amount_captured,
      amountRefundedCents: charge.amount_refunded,
      disputed,
    };
    const previous = this.captures.get(capture.id);
    requireFact(
      !previous || JSON.stringify(previous) === JSON.stringify(capture),
      "charge changed during the read",
    );
    requireFact(this.captures.size < 600 || previous, "capture history bound exceeded");
    this.payments.add(payment.id);
    this.captures.set(capture.id, capture);
    invoice.captures.push({ chargeId: charge.id, amountCents: payment.amount_paid });
  }
  addLine(invoiceId: string, line: Stripe.InvoiceLineItem) {
    const invoice = this.invoices.get(invoiceId);
    const details = line.parent?.subscription_item_details ?? line.parent?.invoice_item_details;
    const priceId = id(line.pricing?.price_details?.price);
    requireFact(
      invoice &&
        !this.lines.has(line.id) &&
        this.lines.size < 2400 &&
        line.invoice === invoiceId &&
        line.livemode === (this.scope.mode === "prod") &&
        details?.subscription === this.scope.subscriptionId &&
        priceId &&
        this.scope.acceptedPriceIds.has(priceId) &&
        line.currency === "brl" &&
        line.quantity === 1 &&
        integer(line.period.start) > 0 &&
        integer(line.period.end) > line.period.start &&
        Number.isFinite(new Date(line.period.end * 1000).getTime()),
      "line scope, range or price differs",
    );
    const credited = details.proration_details?.credited_items;
    requireFact(integer(line.amount) >= 0 || credited, "negative line has no credited item");
    if (credited)
      requireFact(
        credited.invoice &&
          credited.invoice_line_items.length > 0 &&
          credited.invoice_line_items.length <= 100 &&
          new Set(credited.invoice_line_items).size === credited.invoice_line_items.length,
        "credited items are incomplete",
      );
    this.lines.add(line.id);
    invoice.lines.push({
      id: line.id,
      priceId,
      amountCents: line.amount,
      start: line.period.start,
      end: line.period.end,
      ...(credited
        ? {
            creditedItems: {
              invoiceId: credited.invoice,
              lineIds: [...credited.invoice_line_items],
            },
          }
        : {}),
    });
  }
  finish(): InvoiceFundingFacts {
    for (const invoice of this.invoices.values()) {
      requireFact(
        invoice.captures.reduce((total, capture) => integer(total + capture.amountCents), 0) ===
          invoice.amountPaidCents,
        "invoice capture allocation is incomplete",
      );
      requireFact(
        invoice.lines.reduce((total, line) => integer(total + line.amountCents), 0) ===
          invoice.totalCents,
        "invoice line totals need explicit adjustment review",
      );
    }
    return {
      customerId: this.scope.customerId,
      subscriptionId: this.scope.subscriptionId,
      currency: "BRL",
      invoices: [...this.invoices.values()],
      captures: [...this.captures.values()],
    };
  }
}
