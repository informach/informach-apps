import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripePaymentFactReader } from "../payment-facts";

/** Exercise the real SDK's requests/pagination against an HTTP boundary fixture. */
function fixture() {
  const charge = {
    id: "ch_paid",
    object: "charge",
    customer: "cus_owner",
    payment_intent: "pi_paid",
    paid: true,
    captured: true,
    amount: 49900,
    amount_captured: 49900,
    amount_refunded: 0,
    refunded: false,
    currency: "brl",
    disputed: false,
  };
  const invoice = {
    id: "in_paid",
    object: "invoice",
    customer: "cus_owner",
    amount_paid: 49900,
    currency: "brl",
    status: "paid",
    status_transitions: { paid_at: 1794225600 },
  };
  const allocation = {
    id: "inpay_paid",
    object: "invoice_payment",
    invoice: "in_paid",
    amount_paid: 49900,
    status: "paid",
    payment: { type: "payment_intent", payment_intent: "pi_paid" },
  };
  const disputes: { id: string; status: string }[] = [];
  const line = {
    id: "il_paid",
    amount: 49900,
    parent: { subscription_item_details: { subscription: "sub_paid" } },
    pricing: { price_details: { price: "price_paid" } },
    period: { start: 1794225600, end: 1825761600 },
  };
  const paths: string[] = [];
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/v1/fixture" });
  const transport: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    paths.push(url.pathname);
    let body: unknown;
    switch (url.pathname) {
      case "/v1/subscriptions/sub_paid":
        body = {
          id: "sub_paid",
          object: "subscription",
          customer: "cus_owner",
          status: "active",
          cancel_at_period_end: false,
          cancel_at: null,
          trial_end: null,
          canceled_at: null,
          items: {
            data: [
              {
                id: "si_paid",
                price: { id: "price_paid" },
                current_period_start: 1794225600,
                current_period_end: 1825761600,
              },
            ],
          },
        };
        break;
      case "/v1/invoices":
        body = list([invoice]);
        break;
      case "/v1/invoice_payments":
        body = list([allocation]);
        break;
      case "/v1/payment_intents/pi_paid":
        body = {
          id: "pi_paid",
          object: "payment_intent",
          status: "succeeded",
          customer: "cus_owner",
          latest_charge: charge,
        };
        break;
      case "/v1/invoices/in_paid/lines":
        body = list([line]);
        break;
      case "/v1/disputes":
        body = list(disputes);
        break;
      default:
        throw new Error(`Unexpected Stripe fixture request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_fixture" },
    });
  };
  const client = new Stripe("sk_test_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const reader = createStripePaymentFactReader({ secretKey: "unused", client });
  return {
    charge,
    invoice,
    allocation,
    line,
    disputes,
    paths,
    read: () => reader.read("sub_paid", new Set(["price_paid"])),
  };
}

describe("Authoritative subscription invoice settlement", () => {
  it("does not interpret a zero-value trial line as paid coverage", async () => {
    const f = fixture();
    f.invoice.amount_paid = 0;
    f.allocation.amount_paid = 0;
    f.line.amount = 0;
    expect((await f.read())?.periods).toEqual([]);
  });
  it("reads the paid line through the SDK and distinguishes a full refund from a partial refund", async () => {
    const f = fixture();
    expect((await f.read())?.periods).toMatchObject([
      { invoiceId: "in_paid", fullyRefunded: false, disputed: false },
    ]);
    f.charge.amount_refunded = 1000;
    expect((await f.read())?.periods[0]?.fullyRefunded).toBe(false);
    f.charge.amount_refunded = 49900;
    f.charge.refunded = true;
    expect((await f.read())?.periods[0]?.fullyRefunded).toBe(true);
    expect(f.paths).toContain("/v1/invoice_payments");
  });
  it("refuses a shared payment's ambiguous partial refund and a missing settlement", async () => {
    const f = fixture();
    f.charge.amount_captured = 99800;
    f.charge.amount = 99800;
    f.charge.amount_refunded = 1000;
    await expect(f.read()).rejects.toThrow("explicit allocation review");
    f.charge.amount_refunded = 0;
    f.allocation.amount_paid = 1;
    await expect(f.read()).rejects.toThrow("missing settlement");
  });
  it("requires coherent customer, capture, currency and allocation facts", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.charge.customer = "cus_other";
      },
      (f: ReturnType<typeof fixture>) => {
        f.charge.captured = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.charge.currency = "usd";
      },
      (f: ReturnType<typeof fixture>) => {
        f.charge.amount_captured = 100;
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.read()).rejects.toThrow("settlement is inconsistent");
    }
    const f = fixture();
    f.invoice.customer = "cus_other";
    await expect(f.read()).rejects.toThrow("does not belong");
  });
  it("keeps a lost/open dispute blocked and refuses a disputed charge without its facts", async () => {
    const f = fixture();
    f.charge.disputed = true;
    await expect(f.read()).rejects.toThrow("no dispute facts");
    f.disputes.push({ id: "dp_lost", status: "lost" });
    expect((await f.read())?.periods[0]?.disputed).toBe(true);
    f.disputes[0] = { id: "dp_lost", status: "won" };
    expect((await f.read())?.periods[0]?.disputed).toBe(false);
  });
});
