import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  createStripeRecreioRenewals,
  type RecreioRenewalScope,
  recreioRenewalKey,
} from "../providers/stripe-recreio-renewals";

/** Actual pinned SDK/HTTP serialization. No remote payments or access grant. */
function fixture() {
  const now = new Date("2026-11-19T12:00:00Z");
  const input: RecreioRenewalScope = {
    intentId: "0fad2331-a7db-4efc-b02d-cb254dfbddc9",
    customerId: "cus_native_payer",
    subscriptionId: "sub_native_contract",
    origin: { authorizationId: "purchase_original", productId: "original_offer", payerId: "payer" },
  };
  const customer = {
    id: input.customerId,
    object: "customer",
    deleted: false,
    livemode: false,
    metadata: { subject_type: "user", subject_id: input.origin.payerId },
  };
  const sub = {
    id: input.subscriptionId,
    object: "subscription",
    customer: input.customerId,
    livemode: false,
    status: "active",
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null as number | null,
    pending_update: null as { expires_at: number } | null,
    pause_collection: null,
    schedule: null as string | null,
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
          id: "si_native_item",
          quantity: 1,
          price: { id: "price_current_offer" },
          current_period_start: now.getTime() / 1000 - 3600,
          current_period_end: now.getTime() / 1000 + 86400,
        },
      ],
    },
  };
  const calls: { method: string; path: string; params: URLSearchParams; key: string | null }[] = [];
  const item = sub.items.data[0];
  if (!item) throw new Error("Missing closed item");
  let lose = false;
  let apply = true;
  let afterPost: (() => void) | undefined;
  const transport: typeof fetch = async (url, init) => {
    const request = new Request(url, init);
    const path = new URL(request.url).pathname;
    calls.push({
      method: request.method,
      path,
      params: new URLSearchParams(await request.text()),
      key: request.headers.get("idempotency-key"),
    });
    let body: unknown;
    if (request.method === "GET" && path === `/v1/customers/${input.customerId}`) body = customer;
    else if (request.method === "GET" && path === `/v1/subscriptions/${input.subscriptionId}`)
      body = sub;
    else if (request.method === "POST" && path === `/v1/subscriptions/${input.subscriptionId}`) {
      if (apply) sub.cancel_at_period_end = true;
      afterPost?.();
      if (lose) {
        lose = false;
        throw new TypeError("secret provider payload must never escape");
      }
      body = sub;
    } else throw new Error("Unsupported closed request");
    return Response.json(body, { headers: { "request-id": "req_native_renewal" } });
  };
  const client = new Stripe("sk_test_closed_renewal", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const provider = createStripeRecreioRenewals({
    secretKey: "sk_test_closed_renewal",
    mode: "dev",
    client,
    now: () => now,
  });
  return {
    input,
    customer,
    sub,
    item,
    calls,
    provider,
    loseResponse() {
      lose = true;
    },
    ignoreMutation() {
      apply = false;
    },
    afterPost(callback: () => void) {
      afterPost = callback;
    },
  };
}

describe("Recreio renewal stop over the real Stripe SDK", () => {
  it("only schedules renewal stop and verifies customer/origin again after the POST", async () => {
    const f = fixture();
    const result = await f.provider.stop(f.input);
    expect(result).toMatchObject({
      outcome: "scheduled",
      stopsAt: new Date("2026-11-20T12:00:00Z"),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(f.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/customers/cus_native_payer",
      "GET /v1/subscriptions/sub_native_contract",
      "POST /v1/subscriptions/sub_native_contract",
      "GET /v1/customers/cus_native_payer",
      "GET /v1/subscriptions/sub_native_contract",
    ]);
    const post = f.calls.find((call) => call.method === "POST");
    expect(post?.params.toString()).toBe("cancel_at_period_end=true");
    expect(post?.key).toBe(recreioRenewalKey(f.input.intentId));
    expect(await f.provider.stop(f.input)).toEqual(result);
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("recovers a lost response by reading the applied effect, without SDK retry/another POST", async () => {
    const f = fixture();
    f.loseResponse();
    await expect(f.provider.stop(f.input)).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    await expect(f.provider.stop(f.input)).resolves.toMatchObject({ outcome: "scheduled" });
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("preserves an earlier cancellation date and observes a changed current offer without buying", async () => {
    const f = fixture();
    f.sub.cancel_at = Date.parse("2026-11-19T18:00:00Z") / 1000;
    f.item.price.id = "price_after_native_change";
    await expect(f.provider.stop(f.input)).resolves.toMatchObject({
      stopsAt: new Date("2026-11-19T18:00:00Z"),
    });
    expect(f.calls.some((call) => call.method !== "GET")).toBe(false);
  });

  it.each(["canceled", "incomplete_expired"])(
    "confirms an owned terminal %s without mutation",
    async (status) => {
      const f = fixture();
      f.sub.status = status;
      f.sub.items.data = [];
      await expect(f.provider.stop(f.input)).resolves.toMatchObject({
        outcome: "terminal",
        stopsAt: null,
      });
      expect(f.calls).toHaveLength(2);
    },
  );

  it.each(["customer", "payer", "purchase", "offer", "namespace", "deleted"])(
    "rejects foreign %s before sending",
    async (change) => {
      const f = fixture();
      if (change === "customer") f.sub.customer = "cus_other_payer";
      if (change === "payer") f.customer.metadata.subject_id = "another_payer";
      if (change === "purchase") f.sub.metadata.checkout_intent_id = "foreign_purchase";
      if (change === "offer") f.sub.metadata.product_id = "another_app";
      if (change === "namespace") f.sub.livemode = true;
      if (change === "deleted") f.customer.deleted = true;
      await expect(f.provider.stop(f.input)).rejects.toMatchObject({
        code: change === "namespace" ? "namespace_mismatch" : "foreign_contract",
      });
      expect(f.calls.some((call) => call.method === "POST")).toBe(false);
    },
  );

  it.each(["schedule", "pending", "seats", "incomplete", "past_stop", "invalid_period"])(
    "does not confirm or mutate unsupported %s",
    async (change) => {
      const f = fixture();
      if (change === "schedule") f.sub.schedule = "sub_sched_original";
      if (change === "pending") f.sub.pending_update = { expires_at: 1800000000 };
      if (change === "seats") f.item.quantity = 2;
      if (change === "incomplete") f.sub.status = "incomplete";
      if (change === "past_stop") f.sub.cancel_at = 1700000000;
      if (change === "invalid_period") f.item.current_period_end = Number.NaN;
      await expect(f.provider.stop(f.input)).rejects.toMatchObject({
        code: change === "invalid_period" ? "invalid_evidence" : "scope_changed",
      });
      expect(f.calls.some((call) => call.method === "POST")).toBe(false);
    },
  );

  it("does not treat a successful HTTP mutation as confirmation without its subsequent effect", async () => {
    const f = fixture();
    f.ignoreMutation();
    await expect(f.provider.stop(f.input)).rejects.toMatchObject({ code: "invalid_evidence" });
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("revalidates ownership after mutation", async () => {
    const f = fixture();
    f.afterPost(() => {
      f.customer.metadata.subject_id = "other_payer";
    });
    await expect(f.provider.stop(f.input)).rejects.toMatchObject({ code: "foreign_contract" });
  });

  it("rejects malformed native scopes and an expired budget before HTTP", async () => {
    const f = fixture();
    await expect(
      f.provider.stop({ ...f.input, subscriptionId: "sub_../../foreign" }),
    ).rejects.toMatchObject({
      code: "invalid_evidence",
    });
    await expect(
      f.provider.stop({ ...f.input, budget: { deadlineMs: Date.now() - 1 } }),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(f.calls).toHaveLength(0);
  });
});
