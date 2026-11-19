import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  createStripeRecreioUpgrades,
  type RecreioUpgradeAttempt,
  type RecreioUpgradeScope,
  recreioUpgradeKey,
} from "../providers/stripe-recreio-upgrades";

/** Real Stripe SDK over closed HTTP. Exercises serialization, recovery and
 * identity validation, with no remote payments or native authorization claim. */
function fixture() {
  let now = new Date("2026-11-18T12:00:00Z");
  const input: RecreioUpgradeScope = {
    intentId: "d041686f-b849-4bd9-8cf5-d0286a84652a",
    customerId: "cus_native",
    subscriptionId: "sub_native",
    fromPriceId: "price_individual",
    toPriceId: "price_family",
    periodStart: now,
    periodEnd: new Date("2026-12-18T12:00:00Z"),
    prorationAt: now,
    origin: { authorizationId: "native_purchase", productId: "original_offer", payerId: "payer" },
  };
  const commercialState: { pending_update: { expires_at: number } | null; discounts: string[] } = {
    pending_update: null,
    discounts: [],
  };
  const sub = {
    ...commercialState,
    id: input.subscriptionId,
    object: "subscription",
    customer: input.customerId,
    livemode: false,
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    pause_collection: null,
    schedule: null,
    metadata: {
      subject_type: "user",
      subject_id: input.origin.payerId,
      checkout_intent_id: input.origin.authorizationId,
      product_id: input.origin.productId,
    },
    items: {
      has_more: false,
      data: [
        {
          id: "si_native",
          quantity: 1,
          price: { id: input.fromPriceId },
          current_period_start: input.periodStart.getTime() / 1000,
          current_period_end: input.periodEnd.getTime() / 1000,
          discounts: [] as string[],
        },
      ],
    },
    latest_invoice: "in_initial",
  };
  const item = sub.items.data[0];
  if (!item) throw new Error("Missing closed item");
  const line = (id: string, amount: number, price: string) => ({
    id,
    currency: "brl",
    quantity: 1,
    amount,
    parent: { subscription_item_details: { subscription: sub.id } },
    pricing: { price_details: { price } },
  });
  const invoice = {
    id: "in_upgrade",
    object: "invoice",
    livemode: false,
    customer: input.customerId,
    currency: "brl",
    billing_reason: "subscription_update",
    status: "paid",
    amount_due: 6800,
    amount_paid: 6800,
    total: 6800,
    starting_balance: 0,
    parent: { subscription_details: { subscription: sub.id } },
    lines: {
      has_more: false,
      data: [
        line("il_credit", -5990, input.fromPriceId),
        line("il_family", 12790, input.toPriceId),
      ],
    },
  };
  const events: Array<{
    id: string;
    type: string;
    livemode: boolean;
    request: { idempotency_key: string };
    data: { object: typeof sub };
  }> = [];
  const calls: Array<{
    method: string;
    path: string;
    params: URLSearchParams;
    key: string | null;
  }> = [];
  let lose = false;
  let decline = false;
  let afterPreview: (() => void) | undefined;
  let repeatedEvents = false;
  const transport: typeof fetch = async (url, init) => {
    const request = new Request(url, init);
    const path = new URL(request.url).pathname;
    const params = new URLSearchParams(await request.text());
    calls.push({
      method: request.method,
      path,
      params,
      key: request.headers.get("idempotency-key"),
    });
    let body: unknown;
    if (request.method === "GET") {
      if (path === `/v1/subscriptions/${sub.id}` || path === "/v1/subscriptions/sub_native")
        body = sub;
      else if (path === "/v1/events")
        body = { object: "list", data: events, has_more: repeatedEvents };
      else if (path === `/v1/invoices/${invoice.id}`) body = invoice;
      else if (path === `/v1/invoices/${invoice.id}/lines`) body = invoice.lines;
      else throw new Error(`Unexpected closed GET ${path}`);
    } else if (request.method === "POST" && path === "/v1/invoices/create_preview") {
      body = invoice;
      afterPreview?.();
    } else if (request.method === "POST" && path === "/v1/subscriptions/sub_native") {
      invoice.status = decline ? "open" : "paid";
      invoice.amount_paid = decline ? 0 : invoice.amount_due;
      item.price.id = decline ? input.fromPriceId : input.toPriceId;
      sub.pending_update = decline ? { expires_at: now.getTime() / 1000 + 3600 } : null;
      sub.latest_invoice = invoice.id;
      events.push({
        id: "evt_upgrade",
        type: "customer.subscription.updated",
        livemode: false,
        request: { idempotency_key: request.headers.get("idempotency-key") ?? "" },
        data: { object: structuredClone(sub) },
      });
      if (lose) {
        lose = false;
        throw new TypeError("Closed response lost after mutation");
      }
      body = sub;
    } else throw new Error(`Unexpected closed request ${request.method} ${path}`);
    return Response.json(body, { headers: { "request-id": "req_native_upgrade" } });
  };
  const client = new Stripe("sk_test_closed_upgrade", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const provider = createStripeRecreioUpgrades({
    secretKey: "unused",
    client,
    mode: "dev",
    now: () => now,
  });
  const attempt = async (): Promise<RecreioUpgradeAttempt> => ({
    ...input,
    requestStartedAt: now,
    quote: await provider.preview(input),
  });
  return {
    provider,
    input,
    sub,
    item,
    invoice,
    events,
    calls,
    attempt,
    setNow(value: Date) {
      now = value;
    },
    loseResponse() {
      lose = true;
    },
    decline() {
      decline = true;
    },
    afterPreview(callback: () => void) {
      afterPreview = callback;
    },
    repeatEventPage() {
      repeatedEvents = true;
    },
  };
}

describe("Recreio scoped immediate upgrade adapter", () => {
  it("fixes the recurring item, second, money and namespace without changing purchase metadata", async () => {
    const f = fixture();
    const attempt = await f.attempt();
    expect(attempt.quote).toEqual({
      itemId: "si_native",
      amountDueCents: 6800,
      subtotalCents: 12790,
      creditCents: -5990,
      totalCents: 6800,
      startingBalanceCents: 0,
      currency: "BRL",
    });
    expect(await f.provider.apply(attempt)).toEqual({
      invoiceId: "in_upgrade",
      outcome: "applied",
    });
    const preview = f.calls.find((c) => c.path === "/v1/invoices/create_preview");
    const update = f.calls.find(
      (c) => c.method === "POST" && c.path === "/v1/subscriptions/sub_native",
    );
    expect(preview?.params.get("subscription_details[items][0][id]")).toBe("si_native");
    expect(preview?.params.get("subscription_details[proration_date]")).toBe(
      String(f.input.prorationAt.getTime() / 1000),
    );
    expect(update?.params.get("items[0][id]")).toBe("si_native");
    expect(update?.params.get("proration_date")).toBe(
      preview?.params.get("subscription_details[proration_date]"),
    );
    expect(update?.params.get("payment_behavior")).toBe("pending_if_incomplete");
    expect(update?.params.get("proration_behavior")).toBe("always_invoice");
    expect(update?.key).toBe(recreioUpgradeKey(f.input.intentId));
    expect([...(update?.params.keys() ?? [])].some((k) => k.startsWith("metadata"))).toBe(false);
    expect(f.sub.metadata.product_id).toBe(f.input.origin.productId);
  });
  it("recovers the exact invoice after a lost response without another subscription POST", async () => {
    const f = fixture(),
      attempt = await f.attempt();
    f.loseResponse();
    await expect(f.provider.apply(attempt)).rejects.toThrow();
    expect(await f.provider.apply(attempt)).toEqual({
      invoiceId: "in_upgrade",
      outcome: "applied",
    });
    expect(
      f.calls.filter((c) => c.path === "/v1/subscriptions/sub_native" && c.method === "POST"),
    ).toHaveLength(1);
  });
  it("keeps a refused payment pending on the previous offer and recovers the same invoice", async () => {
    const f = fixture(),
      attempt = await f.attempt();
    f.decline();
    expect(await f.provider.apply(attempt)).toEqual({
      invoiceId: "in_upgrade",
      outcome: "pending",
    });
    expect(f.item.price.id).toBe(f.input.fromPriceId);
    expect(await f.provider.find(attempt)).toEqual({ invoiceId: "in_upgrade", outcome: "pending" });
    expect(
      f.calls.filter((c) => c.path === "/v1/subscriptions/sub_native" && c.method === "POST"),
    ).toHaveLength(1);
  });
  it("never equates absence with failure or sends a read-only recovery", async () => {
    const f = fixture(),
      attempt = await f.attempt();
    expect(await f.provider.find(attempt)).toBeNull();
    expect(
      f.calls.filter((c) => c.method === "POST" && !c.path.includes("create_preview")),
    ).toEqual([]);
    f.setNow(new Date(attempt.requestStartedAt.getTime() + 24 * 60 * 60_000));
    await expect(f.provider.apply(attempt)).rejects.toThrow("idempotency window");
    expect(
      f.calls.filter((c) => c.method === "POST" && !c.path.includes("create_preview")),
    ).toEqual([]);
  });
  it("accepts a negative annual invoice as a provider observation without claiming paid coverage", async () => {
    const f = fixture();
    const credit = f.invoice.lines.data[0];
    if (!credit) throw new Error("Missing credit line");
    credit.amount = -59900;
    f.invoice.total = -47110;
    f.invoice.amount_due = 0;
    const attempt = await f.attempt();
    expect(attempt.quote).toMatchObject({
      creditCents: -59900,
      totalCents: -47110,
      amountDueCents: 0,
    });
    expect(await f.provider.apply(attempt)).toEqual({
      invoiceId: "in_upgrade",
      outcome: "applied",
    });
    expect(f.invoice.amount_paid).toBe(0);
  });
  it("rejects changed items, scope, quantity and truncation before creating a preview", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.sub.customer = "cus_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.id = "sub_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.livemode = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.metadata.product_id = "other_origin";
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.items.has_more = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.item.quantity = 2;
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.cancel_at_period_end = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.sub.discounts.push("di_unaccepted");
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.provider.preview(f.input)).rejects.toThrow();
      expect(f.calls.filter((c) => c.method === "POST")).toEqual([]);
    }
  });
  it("revalidates after preview I/O and refuses an item replacement before charging", async () => {
    const f = fixture();
    f.afterPreview(() => {
      f.sub.cancel_at_period_end = true;
    });
    await expect(f.provider.preview(f.input)).rejects.toThrow("contract changed");
    const g = fixture(),
      attempt = await g.attempt();
    g.item.id = "si_replaced";
    await expect(g.provider.apply(attempt)).rejects.toThrow("accepted recurring item");
    expect(
      g.calls.filter((c) => c.method === "POST" && !c.path.includes("create_preview")),
    ).toEqual([]);
  });
  it("refuses wrong invoice scope, unknown lines, incomplete previews and incoherent totals", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.invoice.customer = "cus_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.parent.subscription_details.subscription = "sub_other";
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.lines.has_more = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.total += 1;
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.amount_due += 1;
      },
      (f: ReturnType<typeof fixture>) => {
        const l = f.invoice.lines.data[1];
        if (l) l.pricing.price_details.price = "price_other";
      },
    ]) {
      const f = fixture();
      change(f);
      await expect(f.provider.preview(f.input)).rejects.toThrow();
      expect(
        f.calls.filter((c) => c.method === "POST" && !c.path.includes("create_preview")),
      ).toEqual([]);
    }
  });
  it("refuses foreign exact-key events, an ambiguous event invoice or a repeated event cursor", async () => {
    for (const kind of ["foreign", "ambiguous", "cursor"]) {
      const f = fixture(),
        attempt = await f.attempt();
      await f.provider.apply(attempt);
      const event = f.events[0];
      if (!event) throw new Error("Missing closed update event");
      if (kind === "foreign") event.data.object.customer = "cus_other";
      if (kind === "ambiguous")
        f.events.push({
          ...structuredClone(event),
          id: "evt_second",
          data: { object: { ...structuredClone(event.data.object), latest_invoice: "in_other" } },
        });
      if (kind === "cursor") f.repeatEventPage();
      await expect(f.provider.find(attempt)).rejects.toThrow();
      expect(
        f.calls.filter((c) => c.method === "POST" && !c.path.includes("create_preview")),
      ).toHaveLength(1);
    }
  });
  it("checks the remaining request deadline before network access", async () => {
    const f = fixture();
    await expect(
      f.provider.preview({ ...f.input, budget: { deadlineMs: Date.now() - 1 } }),
    ).rejects.toThrow("deadline");
    expect(f.calls).toEqual([]);
  });
});
