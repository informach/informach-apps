import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeProvider } from "../providers/stripe";

function fixture() {
  const charge = {
    id: "ch_paid",
    payment_intent: "pi_paid",
    paid: true,
    captured: true,
    amount_captured: 1490,
    currency: "brl",
    amount_refunded: 0,
    created: 1794225600,
    disputed: false,
  };
  const payment = {
    id: "pi_paid",
    status: "succeeded",
    amount_received: 1490,
    amount: 1490,
    currency: "brl",
    customer: "cus_payer",
    latest_charge: charge,
  };
  const session = {
    id: "cs_receipt",
    mode: "payment",
    customer: "cus_payer",
    status: "complete",
    metadata: { checkout_intent_id: "intent_receipt" },
    payment_status: "paid",
    currency: "brl",
    amount_total: 1490,
    line_items: { has_more: false, data: [{ quantity: 1, price: { id: "price_100" } }] },
    payment_intent: payment,
  };
  const disputes: { status: string }[] = [];
  const api = {
    checkout: {
      sessions: {
        retrieve: async () => session,
        expire: async () => {
          if (session.status !== "open") throw new Error("Not open");
          session.status = "expired";
        },
      },
    },
    paymentIntents: {
      retrieve: async () => payment,
      cancel: async () => {
        if (payment.status === "processing" || payment.status === "succeeded")
          throw new Error("Cannot cancel this payment");
        payment.status = "canceled";
      },
    },
    disputes: {
      list: () =>
        (async function* () {
          yield* disputes;
        })(),
    },
  };
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "compasso",
    client: api as unknown as Stripe,
  });
  if (!provider.readCreditCheckout || !provider.closeCreditCheckout)
    throw new Error("Missing credit purchase capabilities");
  const read = () => provider.readCreditCheckout?.("cus_payer", "intent_receipt", "cs_receipt");
  const close = () => provider.closeCreditCheckout?.("cus_payer", "intent_receipt", "cs_receipt");
  return { session, payment, charge, disputes, provider, read, close };
}

describe("Stripe authoritative credit receipts", () => {
  it("reads settlement, proportional refund and unresolved dispute from expanded provider facts", async () => {
    const f = fixture();
    expect(await f.read()).toMatchObject({
      sessionId: "cs_receipt",
      intentId: "intent_receipt",
      priceId: "price_100",
      amountCents: 1490,
      currency: "BRL",
      paymentCanceled: false,
      payment: {
        id: "pi_paid",
        paidAt: new Date(1794225600_000),
        amountRefundedCents: 0,
        disputed: false,
      },
    });
    f.charge.amount_refunded = 745;
    f.charge.disputed = true;
    f.disputes.push({ status: "won" }, { status: "needs_response" });
    expect(await f.read()).toMatchObject({ payment: { amountRefundedCents: 745, disputed: true } });
    f.disputes[1] = { status: "won" };
    expect(await f.read()).toMatchObject({
      payment: { amountRefundedCents: 745, disputed: false },
    });
  });

  it("refuses a receipt outside the requested customer or intent", async () => {
    const f = fixture();
    await expect(
      f.provider.readCreditCheckout?.("cus_other", "intent_receipt", "cs_receipt"),
    ).rejects.toThrow("incompatible receipt");
    await expect(
      f.provider.readCreditCheckout?.("cus_payer", "intent_other", "cs_receipt"),
    ).rejects.toThrow("incompatible receipt");
    f.session.line_items.data.push({ quantity: 1, price: { id: "price_extra" } });
    await expect(f.read()).rejects.toThrow("incompatible receipt");
  });

  it("refuses amount/capture inconsistencies or a disputed charge without facts", async () => {
    const f = fixture();
    f.payment.amount_received = 100;
    await expect(f.read()).rejects.toThrow("matching settled payment");
    f.payment.amount_received = 1490;
    f.charge.captured = false;
    await expect(f.read()).rejects.toThrow("settlement is inconsistent");
    f.charge.captured = true;
    f.charge.disputed = true;
    await expect(f.read()).rejects.toThrow("no dispute facts");
  });

  it("a completed unpaid Checkout is pending until the payment can be canceled or settles", async () => {
    const f = fixture();
    f.session.payment_status = "unpaid";
    f.payment.status = "processing";
    expect(await f.read()).toMatchObject({
      status: "complete",
      payment: null,
      paymentCanceled: false,
    });
    await expect(f.close()).rejects.toThrow("Cannot cancel");
    f.payment.status = "requires_payment_method";
    await f.close();
    expect(await f.read()).toMatchObject({
      status: "complete",
      payment: null,
      paymentCanceled: true,
    });
    await f.close();
    expect(f.payment.status).toBe("canceled");
  });

  it("expires open sessions but refuses to cancel a paid Checkout or another payer's payment", async () => {
    const f = fixture();
    await expect(f.close()).rejects.toThrow();
    f.session.status = "open";
    f.session.payment_status = "unpaid";
    await expect(
      f.provider.closeCreditCheckout?.("cus_other", "intent_receipt", "cs_receipt"),
    ).rejects.toThrow("does not belong");
    expect(f.session.status).toBe("open");
    await f.close();
    expect(f.session.status).toBe("expired");
    await f.close();
    expect(f.session.status).toBe("expired");
  });
});
