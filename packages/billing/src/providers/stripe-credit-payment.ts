import type Stripe from "stripe";
import type { ProviderCreditPaymentSnapshot } from "./types";

/** Shared settlement verifier for both current checkout receipts and legacy purchases. */
export async function readSettledStripeCreditPayment(
  stripe: Stripe,
  payment: Stripe.PaymentIntent,
  expected: { customerId: string; amountCents: number; currency: string },
  observedAt: Date,
): Promise<ProviderCreditPaymentSnapshot> {
  const customerId = typeof payment.customer === "string" ? payment.customer : payment.customer?.id;
  const charge = payment.latest_charge;
  if (
    payment.status !== "succeeded" ||
    customerId !== expected.customerId ||
    payment.amount_received !== expected.amountCents ||
    payment.amount !== expected.amountCents ||
    payment.currency.toUpperCase() !== expected.currency.toUpperCase() ||
    !charge ||
    typeof charge === "string" ||
    !charge.paid ||
    !charge.captured ||
    charge.amount_captured !== expected.amountCents ||
    charge.currency !== payment.currency ||
    (typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id) !== payment.id ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > expected.amountCents
  )
    throw new Error("Credit payment settlement is inconsistent");
  let disputed = false;
  if (charge.disputed) {
    let count = 0;
    for await (const dispute of stripe.disputes.list({ charge: charge.id, limit: 100 })) {
      if (++count > 100) throw new Error("Dispute history exceeds the reconciliation limit");
      if (dispute.status !== "won" && dispute.status !== "warning_closed") disputed = true;
    }
    if (count === 0) throw new Error("Disputed credit payment has no dispute facts");
  }
  return {
    paymentId: payment.id,
    customerId,
    amountCents: expected.amountCents,
    currency: expected.currency.toUpperCase(),
    paidAt: new Date(charge.created * 1000),
    amountRefundedCents: charge.amount_refunded,
    disputed,
    observedAt,
  };
}
