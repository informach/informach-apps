import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeLegacyDeferralProvider } from "../providers/stripe-legacy-deferral";

function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const metadata: Record<string, string> = {};
  function noTrial(): number | null {
    return null;
  }
  const input = {
    intentId: "intent_fixture",
    customerId: "cus_fixture",
    subscriptionId: "sub_fixture",
    priceId: "price_fixture",
    interval: "month" as const,
    amountCents: 4990,
    expectedPeriodEnd: now + 86400,
    deferUntil: now + 10 * 86400,
  };
  const sub = {
    id: input.subscriptionId,
    object: "subscription",
    livemode: false,
    customer: input.customerId,
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    schedule: null,
    pending_update: null,
    pause_collection: null,
    trial_end: noTrial(),
    metadata,
    items: {
      data: [
        {
          price: { id: input.priceId },
          current_period_start: now - 60,
          current_period_end: input.expectedPeriodEnd,
        },
      ],
    },
  };
  const price = {
    id: input.priceId,
    object: "price",
    livemode: false,
    type: "recurring",
    billing_scheme: "per_unit",
    currency: "brl",
    unit_amount: 4990,
    recurring: { interval: "month", interval_count: 1 },
  };
  const invoice = {
    id: "in_fixture",
    object: "invoice",
    customer: input.customerId,
    status: "paid",
    amount_paid: 4990,
    currency: "brl",
    status_transitions: { paid_at: now - 60 },
  };
  const line = {
    id: "il_fixture",
    amount: 4990,
    parent: { subscription_item_details: { subscription: sub.id } },
    pricing: { price_details: { price: input.priceId } },
    period: { start: now - 60, end: input.expectedPeriodEnd },
  };
  const charge = {
    id: "ch_fixture",
    object: "charge",
    customer: input.customerId,
    paid: true,
    captured: true,
    currency: "brl",
    amount_captured: 4990,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
  };
  let pendingInvoice = false;
  let invoiceAfterUpdate: number | null = null;
  let lostResponse = false;
  let updateCalls = 0;
  const list = (data: unknown[]) => ({ object: "list", data, has_more: false, url: "/v1/fixture" });
  const transport: typeof fetch = async (resource, init) => {
    const url = new URL(
      typeof resource === "string"
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url,
    );
    const method = init?.method ?? "GET";
    let body: unknown;
    let status = 200;
    if (url.pathname === "/v1/subscriptions/sub_fixture" && method === "GET") body = sub;
    else if (url.pathname === "/v1/subscriptions/sub_fixture" && method === "POST") {
      updateCalls++;
      const fields = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
      if (
        fields.get("trial_end") !== String(input.deferUntil) ||
        fields.get("proration_behavior") !== "none" ||
        fields.get("metadata[compasso_legacy_deferral]") !== input.intentId
      )
        throw new Error("Unexpected deferral request");
      sub.status = "trialing";
      sub.trial_end = input.deferUntil;
      const item = sub.items.data[0];
      if (!item) throw new Error("Missing fixture subscription item");
      item.current_period_end = input.deferUntil;
      sub.metadata.compasso_legacy_deferral = input.intentId;
      if (lostResponse) {
        lostResponse = false;
        status = 500;
        body = { error: { message: "lost response", type: "api_error" } };
      } else body = sub;
    } else if (url.pathname === "/v1/prices/price_fixture") body = price;
    else if (url.pathname === "/v1/invoices") {
      const requested = url.searchParams.get("status");
      body = list(
        requested === "paid"
          ? [invoice]
          : requested === "open" && updateCalls > 0 && invoiceAfterUpdate !== null
            ? [{ id: "in_after", amount_due: invoiceAfterUpdate }]
            : pendingInvoice && requested === "open"
              ? [{ id: "in_open" }]
              : [],
      );
    } else if (url.pathname === "/v1/invoice_payments")
      body = list([
        {
          id: "inpay_fixture",
          amount_paid: 4990,
          payment: { type: "payment_intent", payment_intent: "pi_fixture" },
        },
      ]);
    else if (url.pathname === "/v1/payment_intents/pi_fixture")
      body = { id: "pi_fixture", latest_charge: charge };
    else if (url.pathname === "/v1/invoices/in_fixture/lines") body = list([line]);
    else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_fixture" },
    });
  };
  const client = new Stripe("sk_test_fixture", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  return {
    input,
    sub,
    price,
    line,
    provider: createStripeLegacyDeferralProvider({ secretKey: "unused", mode: "dev", client }),
    lose: () => {
      lostResponse = true;
    },
    pending: () => {
      pendingInvoice = true;
    },
    invoiceAfterUpdate: (amountDue: number) => {
      invoiceAfterUpdate = amountDue;
    },
    writes: () => updateCalls,
  };
}

describe("Stripe existing subscription deferral", () => {
  it("recovers an update whose response was lost without a second mutation", async () => {
    const f = fixture();
    f.lose();
    await expect(f.provider.defer(f.input)).rejects.toThrow();
    await expect(f.provider.defer(f.input)).resolves.toEqual({
      status: "deferred",
      until: f.input.deferUntil,
    });
    expect(f.writes()).toBe(1);
  });
  it("refuses changed price, zero-value evidence and unresolved invoices before mutation", async () => {
    const changed = fixture();
    changed.price.unit_amount = 1;
    await expect(changed.provider.defer(changed.input)).rejects.toThrow("conflict");
    expect(changed.writes()).toBe(0);
    const zero = fixture();
    zero.line.amount = 0;
    await expect(zero.provider.defer(zero.input)).rejects.toThrow("conflict");
    expect(zero.writes()).toBe(0);
    const pending = fixture();
    pending.pending();
    await expect(pending.provider.defer(pending.input)).rejects.toThrow("invoice");
    expect(pending.writes()).toBe(0);
  });
  it("keeps a safety margin before the renewal and the provider trial limit", async () => {
    const close = fixture();
    const now = Math.floor(Date.now() / 1000);
    const item = close.sub.items.data[0];
    if (!item) throw new Error("Missing fixture subscription item");
    close.input.expectedPeriodEnd = now + 600;
    item.current_period_end = close.input.expectedPeriodEnd;
    close.line.period.end = close.input.expectedPeriodEnd;
    await expect(close.provider.defer(close.input)).rejects.toThrow("changed before deferral");
    expect(close.writes()).toBe(0);
    const far = fixture();
    far.input.deferUntil = now + 731 * 86400;
    await expect(far.provider.defer(far.input)).rejects.toThrow("changed before deferral");
    expect(far.writes()).toBe(0);
  });
  it("classifies the provider state without mutating it", async () => {
    const f = fixture();
    await expect(f.provider.classify(f.input)).resolves.toBe("not_deferred");
    await f.provider.defer(f.input);
    await expect(f.provider.classify(f.input)).resolves.toBe("deferred");
    await expect(f.provider.classify({ ...f.input, intentId: "another_intent" })).resolves.toBe(
      "conflict",
    );
    await expect(f.provider.classify({ ...f.input, priceId: "price_other" })).resolves.toBe(
      "conflict",
    );
    expect(f.writes()).toBe(1);
  });
  it("reports a charge drafted during the update and tolerates the zero trial invoice", async () => {
    const charged = fixture();
    charged.invoiceAfterUpdate(4990);
    await expect(charged.provider.defer(charged.input)).rejects.toThrow("charge requiring");
    expect(charged.writes()).toBe(1);
    await expect(charged.provider.classify(charged.input)).resolves.toBe("deferred");
    const zero = fixture();
    zero.invoiceAfterUpdate(0);
    await expect(zero.provider.defer(zero.input)).resolves.toEqual({
      status: "deferred",
      until: zero.input.deferUntil,
    });
  });
});
