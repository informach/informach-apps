import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripePaymentFactReader } from "../payment-facts";

/** Real SDK and explicit closed HTTP facts. Collection is not a balance-origin
 * proof and may not promote zero-capture invoices to ordinary paid coverage. */
function fixture() {
  const charge = {
    id: "ch_funding",
    object: "charge",
    customer: "cus_funding",
    livemode: false,
    paid: true,
    captured: true,
    amount_captured: 49900,
    amount_refunded: 0,
    refunded: false,
    currency: "brl",
    disputed: false,
    payment_intent: "pi_funding",
  };
  const payment = {
    id: "inpay_funding",
    object: "invoice_payment",
    invoice: "in_funding",
    amount_paid: 49900,
    status: "paid",
    currency: "brl",
    livemode: false,
    payment: { type: "payment_intent", payment_intent: "pi_funding" },
  };
  const proration: { credited_items: { invoice: string; invoice_line_items: string[] } | null } = {
    credited_items: null,
  };
  const line = {
    id: "il_funding",
    invoice: "in_funding",
    livemode: false,
    amount: 49900,
    currency: "brl",
    quantity: 1,
    parent: {
      subscription_item_details: { subscription: "sub_funding", proration_details: proration },
    },
    pricing: { price_details: { price: "price_funding" } },
    period: { start: 1794225600, end: 1825761600 },
  };
  const invoice = {
    id: "in_funding",
    object: "invoice",
    customer: "cus_funding",
    livemode: false,
    status: "paid",
    currency: "brl",
    amount_paid: 49900,
    total: 49900,
    starting_balance: 0,
    ending_balance: 0,
    status_transitions: { paid_at: 1794225600 },
    parent: { subscription_details: { subscription: "sub_funding" } },
    hosted_invoice_url: "https://invoice.example.test/private",
    customer_email: "private@example.test",
  };
  const subscription = {
    id: "sub_funding",
    object: "subscription",
    customer: "cus_funding",
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    canceled_at: null,
    items: {
      has_more: false,
      data: [
        {
          id: "si_funding",
          quantity: 1,
          price: { id: "price_funding" },
          current_period_start: 1794225600,
          current_period_end: 1825761600,
        },
      ],
    },
  };
  const lines = [line],
    paths: string[] = [],
    disputes: { id: string; status: string }[] = [];
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/fixture" });
  let repeatLines = false;
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    paths.push(path);
    if (request.method !== "GET") throw new Error("Funding collection may only read");
    let body: unknown;
    if (path === "/v1/subscriptions/sub_funding") body = subscription;
    else if (path === "/v1/invoices") body = list([invoice]);
    else if (path === "/v1/invoice_payments") body = list([payment]);
    else if (path === "/v1/payment_intents/pi_funding")
      body = {
        id: "pi_funding",
        object: "payment_intent",
        customer: "cus_funding",
        status: "succeeded",
        livemode: false,
        latest_charge: charge,
      };
    else if (path === "/v1/invoices/in_funding/lines")
      body = { ...list(lines), has_more: repeatLines };
    else if (path === "/v1/disputes") body = list(disputes);
    else throw new Error(`Unexpected closed funding request ${path}`);
    return Response.json(body, { headers: { "request-id": "req_funding" } });
  };
  const client = new Stripe("sk_test_closed_funding", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const reader = createStripePaymentFactReader({
    secretKey: "unused",
    client,
    expectedMode: "dev",
  });
  return {
    reader,
    client,
    charge,
    payment,
    line,
    lines,
    invoice,
    subscription,
    paths,
    disputes,
    repeatLines() {
      repeatLines = true;
    },
    collect: () => reader.readWithFunding("sub_funding", new Set(["price_funding"])),
  };
}

describe("scoped invoice funding fact collection", () => {
  it("collects complete cash/line identities without private invoice fields or duplicate API reads", async () => {
    const f = fixture(),
      result = await f.collect();
    expect(result?.funding).toEqual({
      customerId: "cus_funding",
      subscriptionId: "sub_funding",
      currency: "BRL",
      invoices: [
        {
          id: "in_funding",
          paidAt: 1794225600,
          totalCents: 49900,
          amountPaidCents: 49900,
          startingBalanceCents: 0,
          endingBalanceCents: 0,
          captures: [{ chargeId: "ch_funding", amountCents: 49900 }],
          lines: [
            {
              id: "il_funding",
              priceId: "price_funding",
              amountCents: 49900,
              start: 1794225600,
              end: 1825761600,
            },
          ],
        },
      ],
      captures: [
        { id: "ch_funding", amountCapturedCents: 49900, amountRefundedCents: 0, disputed: false },
      ],
    });
    expect(result?.snapshot.periods).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("invoice.example.test");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(f.paths.filter((p) => p === "/v1/invoices")).toHaveLength(1);
    expect(f.paths.filter((p) => p === "/v1/payment_intents/pi_funding")).toHaveLength(1);
  });
  it("collects a zero-paid balance invoice as facts while ordinary coverage stays withheld", async () => {
    const f = fixture();
    f.invoice.amount_paid = 0;
    f.invoice.starting_balance = -49900;
    f.payment.amount_paid = 0;
    const result = await f.collect();
    expect(result?.snapshot.periods).toEqual([]);
    expect(result?.funding.invoices[0]).toMatchObject({
      amountPaidCents: 0,
      startingBalanceCents: -49900,
      captures: [],
      lines: [{ amountCents: 49900 }],
    });
    expect(result?.funding.captures).toEqual([]);
    expect(f.paths).not.toContain("/v1/payment_intents/pi_funding");
  });
  it("retains exact credit references without claiming that missing origins are verified", async () => {
    const f = fixture(),
      credit = structuredClone(f.line);
    credit.id = "il_credit";
    credit.amount = -1000;
    credit.parent.subscription_item_details.proration_details.credited_items = {
      invoice: "in_original",
      invoice_line_items: ["il_original"],
    };
    f.lines.push(credit);
    f.invoice.total = 48900;
    f.invoice.amount_paid = 48900;
    f.payment.amount_paid = 48900;
    f.charge.amount_captured = 48900;
    const result = await f.collect();
    expect(result?.funding.invoices[0]?.lines[1]).toMatchObject({
      id: "il_credit",
      amountCents: -1000,
      creditedItems: { invoiceId: "in_original", lineIds: ["il_original"] },
    });
    expect(result?.snapshot.periods).toHaveLength(1);
  });
  it("rejects a foreign invoice/payment/charge association, mode or currency", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.invoice.parent.subscription_details.subscription = "sub_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.payment.invoice = "in_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.payment.currency = "usd";
      },
      (f: ReturnType<typeof fixture>) => {
        f.payment.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.charge.payment_intent = "pi_foreign";
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.collect()).rejects.toThrow("funding evidence needs reconciliation");
    }
  });
  it("requires complete declared totals and unique, scoped recurring lines", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.invoice.total = 49901;
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.quantity = 2;
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.invoice = "in_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.line.parent.subscription_item_details.subscription = "sub_other";
      },
      (f: ReturnType<typeof fixture>) => {
        f.lines.push(structuredClone(f.line));
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.collect()).rejects.toThrow("funding evidence needs reconciliation");
    }
  });
  it("keeps explicit adverse capture facts, including a won dispute", async () => {
    const f = fixture();
    f.charge.disputed = true;
    f.disputes.push({ id: "dp_funding", status: "lost" });
    expect((await f.collect())?.funding.captures[0]?.disputed).toBe(true);
    const dispute = f.disputes[0];
    if (!dispute) throw new Error("Missing closed dispute");
    dispute.status = "won";
    expect((await f.collect())?.funding.captures[0]?.disputed).toBe(false);
    f.charge.disputed = false;
    f.charge.refunded = true;
    f.charge.amount_refunded = 49900;
    expect((await f.collect())?.funding.captures[0]).toMatchObject({
      amountCapturedCents: 49900,
      amountRefundedCents: 49900,
      disputed: false,
    });
  });
  it("legacy read does not opt into collection and collection requires explicit provider mode", async () => {
    const f = fixture();
    f.invoice.total = 1;
    f.invoice.parent.subscription_details.subscription = "sub_unknown";
    expect((await f.reader.read("sub_funding", new Set(["price_funding"])))?.periods).toHaveLength(
      1,
    );
    const reader = createStripePaymentFactReader({ secretKey: "unused", client: f.client });
    await expect(reader.readWithFunding("sub_funding", new Set(["price_funding"]))).rejects.toThrow(
      "explicit Stripe mode",
    );
  });
  it("bounds a repeated line page and refuses an empty continuation cursor", async () => {
    const f = fixture();
    f.repeatLines();
    await expect(f.collect()).rejects.toThrow("duplicate or excessive page item");
    expect(f.paths.filter((p) => p === "/v1/invoices/in_funding/lines")).toHaveLength(2);
    const g = fixture();
    g.lines.splice(0);
    g.repeatLines();
    await expect(g.collect()).rejects.toThrow("incomplete page cursor");
    expect(g.paths.filter((p) => p === "/v1/invoices/in_funding/lines")).toHaveLength(1);
  });
});
