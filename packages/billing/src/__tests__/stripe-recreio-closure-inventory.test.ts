import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  assertRecreioClosureInventory,
  createStripeRecreioClosureInventory,
  type RecreioClosureInventoryScope,
} from "../providers/stripe-recreio-closure-inventory";

function fixture() {
  const input: RecreioClosureInventoryScope = {
    operationId: "6bc63f93-8280-4123-864d-62dec0b67187",
    customerId: "cus_native_owner",
    payerId: "payer_one",
    purchases: [{ authorizationId: "native_purchase", productId: "original_offer" }],
    contracts: [
      {
        subscriptionId: "sub_native_one",
        authorizationId: "native_purchase",
        productId: "original_offer",
      },
    ],
    budget: { deadlineMs: Date.now() + 90_000 },
  };
  const customer = {
    id: input.customerId,
    livemode: false,
    deleted: false,
    metadata: { subject_type: "user", subject_id: input.payerId },
  };
  const changes: { schedule: string | null; cancel_at: number | null } = {
    schedule: null,
    cancel_at: null,
  };
  const sub = {
    ...changes,
    id: "sub_native_one",
    customer: input.customerId,
    livemode: false,
    status: "active",
    pending_update: null,
    pause_collection: null,
    cancel_at_period_end: true,
    metadata: {
      subject_type: "user",
      subject_id: input.payerId,
      checkout_intent_id: "native_purchase",
      product_id: "original_offer",
    },
    items: {
      has_more: false,
      data: [{ quantity: 1, current_period_end: Date.parse("2026-12-19T12:00:00Z") / 1000 }],
    },
  };
  const link: { subscription: string | null } = { subscription: sub.id };
  const session = {
    ...link,
    id: "cs_test_native_one",
    customer: input.customerId,
    livemode: false,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    metadata: { ...sub.metadata },
  };
  const subscriptions = [sub],
    sessions = [session];
  let pages = false,
    repeat = false,
    missing = false,
    unavailable = false;
  const calls: {
    path: string;
    customer: string | null;
    after: string | null;
    status: string | null;
    method: string;
  }[] = [];
  const transport: typeof fetch = async (url, init) => {
    const request = new Request(url, init),
      u = new URL(request.url);
    calls.push({
      path: u.pathname,
      customer: u.searchParams.get("customer"),
      after: u.searchParams.get("starting_after"),
      status: u.searchParams.get("status"),
      method: request.method,
    });
    if (unavailable) throw new TypeError("private transport details must not escape");
    if (request.method !== "GET") throw new Error("Read-only fixture forbids mutation");
    let body: unknown;
    if (u.pathname === `/v1/customers/${input.customerId}`) body = customer;
    else if (u.pathname === "/v1/subscriptions") {
      const after = u.searchParams.has("starting_after");
      body = {
        object: "list",
        data: pages
          ? after
            ? missing
              ? []
              : repeat
                ? subscriptions.slice(0, 1)
                : subscriptions.slice(1)
            : subscriptions.slice(0, 1)
          : subscriptions,
        has_more: pages && !after,
      };
    } else if (u.pathname === "/v1/checkout/sessions")
      body = { object: "list", data: sessions, has_more: false };
    else throw new Error("Unexpected closed read");
    return Response.json(body, { headers: { "request-id": "req_closed_inventory" } });
  };
  const client = new Stripe("sk_test_closed_inventory", {
    apiVersion: "2026-04-22.dahlia",
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(transport),
  });
  const reader = createStripeRecreioClosureInventory({
    secretKey: "rk_test_closed_inventory",
    mode: "dev",
    client,
    now: () => new Date("2026-11-19T12:00:00Z"),
  });
  return {
    input,
    customer,
    sub,
    session,
    subscriptions,
    sessions,
    calls,
    reader,
    secondPage() {
      pages = true;
      subscriptions.push({
        ...structuredClone(sub),
        id: "sub_native_two",
        metadata: { ...sub.metadata, checkout_intent_id: "native_purchase_two" },
      });
      input.purchases = [
        ...input.purchases,
        { authorizationId: "native_purchase_two", productId: "original_offer" },
      ];
      input.contracts = [
        ...input.contracts,
        {
          subscriptionId: "sub_native_two",
          authorizationId: "native_purchase_two",
          productId: "original_offer",
        },
      ];
    },
    repeatPage() {
      repeat = true;
    },
    omitPage() {
      missing = true;
    },
    unavailable() {
      unavailable = true;
    },
  };
}

describe("complete Recreio closure inventory over the actual SDK", () => {
  it("binds the actual read to its original operation/customer and rejects copies or changed facts", async () => {
    const f = fixture();
    const observed = await f.reader.inspect(f.input);
    expect(() => assertRecreioClosureInventory(observed, f.input, "dev")).not.toThrow();
    expect(() =>
      assertRecreioClosureInventory(structuredClone(observed), f.input, "dev"),
    ).toThrow();
    expect(() =>
      assertRecreioClosureInventory(
        observed,
        { ...f.input, operationId: "66e34918-5d55-46b3-baad-571223a8c818" },
        "dev",
      ),
    ).toThrow();
    expect(() =>
      assertRecreioClosureInventory(
        observed,
        { ...f.input, customerId: "cus_another_owner" },
        "dev",
      ),
    ).toThrow();
    expect(() => assertRecreioClosureInventory(observed, f.input, "prod")).toThrow();
    const sub = observed.subscriptions[0];
    if (!sub) throw new Error("Closed observed subscription absent");
    sub.stopsAt = new Date("2027-01-01T12:00:00Z");
    expect(() => assertRecreioClosureInventory(observed, f.input, "dev")).toThrow();
  });
  it("uses only customer-scoped GETs and returns bounded private verified facts", async () => {
    const f = fixture();
    const observed = await f.reader.inspect(f.input);
    expect(observed).toEqual({
      subscriptions: [{ id: f.sub.id, terminal: false, stopsAt: new Date("2026-12-19T12:00:00Z") }],
      checkouts: [
        { id: f.session.id, authorizationId: "native_purchase", status: "complete", settled: true },
      ],
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "GET", "GET"]);
    expect(f.calls.slice(1).every((c) => c.customer === f.input.customerId)).toBe(true);
    expect(f.calls[1]?.status).toBe("all");
    expect(await f.reader.inspect(f.input)).toEqual(observed);
  });
  it("reads the following page and includes every known contract", async () => {
    const f = fixture();
    f.secondPage();
    const observed = await f.reader.inspect(f.input);
    expect(observed.subscriptions.map((s) => s.id)).toEqual(["sub_native_one", "sub_native_two"]);
    expect(f.calls.some((c) => c.after === "sub_native_one")).toBe(true);
  });
  it.each(["repeat", "empty", "missing_contract"])(
    "rejects an incomplete %s page instead of proving absence",
    async (failure) => {
      const f = fixture();
      if (failure === "missing_contract") {
        f.input.purchases = [
          ...f.input.purchases,
          { authorizationId: "purchase_missing", productId: "original_offer" },
        ];
        f.input.contracts = [
          ...f.input.contracts,
          {
            subscriptionId: "sub_missing_native",
            authorizationId: "purchase_missing",
            productId: "original_offer",
          },
        ];
      } else f.secondPage();
      if (failure === "repeat") f.repeatPage();
      if (failure === "empty") f.omitPage();
      await expect(f.reader.inspect(f.input)).rejects.toMatchObject({ code: "invalid_evidence" });
    },
  );
  it.each(["customer", "payer", "origin", "namespace", "checkout", "schedule"])(
    "rejects foreign or unsupported %s",
    async (change) => {
      const f = fixture();
      if (change === "customer") f.sub.customer = "cus_foreign_owner";
      if (change === "payer") f.customer.metadata.subject_id = "another_payer";
      if (change === "origin") f.sub.metadata.checkout_intent_id = "not_native";
      if (change === "namespace") f.session.livemode = true;
      if (change === "checkout") f.session.metadata.product_id = "another_app";
      if (change === "schedule") f.sub.schedule = "sub_sched_unknown";
      await expect(f.reader.inspect(f.input)).rejects.toMatchObject({
        code:
          change === "namespace"
            ? "namespace_mismatch"
            : change === "schedule"
              ? "scope_changed"
              : "foreign_contract",
      });
    },
  );
  it("does not mistake an open or complete-but-unsettled Checkout for completion", async () => {
    const f = fixture();
    f.session.status = "open";
    f.session.subscription = null;
    expect((await f.reader.inspect(f.input)).checkouts[0]).toMatchObject({
      settled: false,
      status: "open",
    });
    f.session.status = "complete";
    f.session.subscription = f.sub.id;
    f.session.payment_status = "unpaid";
    expect((await f.reader.inspect(f.input)).checkouts[0]).toMatchObject({
      settled: false,
      status: "complete",
    });
    f.session.status = "expired";
    f.session.subscription = null;
    expect((await f.reader.inspect(f.input)).checkouts[0]).toMatchObject({
      settled: true,
      status: "expired",
    });
  });
  it("requires a full provider read even for a customer without local contracts", async () => {
    const f = fixture();
    f.subscriptions.length = 0;
    f.sessions.length = 0;
    f.input.contracts = [];
    f.input.purchases = [];
    expect(await f.reader.inspect(f.input)).toMatchObject({ subscriptions: [], checkouts: [] });
    expect(f.calls).toHaveLength(3);
    f.unavailable();
    await expect(f.reader.inspect(f.input)).rejects.toMatchObject({ code: "provider_unavailable" });
  });
  it("keeps an un-stopped subscription visible and recognizes owned terminal contracts", async () => {
    const f = fixture();
    f.sub.cancel_at_period_end = false;
    expect((await f.reader.inspect(f.input)).subscriptions[0]).toMatchObject({
      terminal: false,
      stopsAt: null,
    });
    f.sub.status = "canceled";
    f.sub.items.data = [];
    expect((await f.reader.inspect(f.input)).subscriptions[0]).toMatchObject({
      terminal: true,
      stopsAt: null,
    });
  });
  it("does not perform HTTP after its budget expires or when the scope repeats an authorization", async () => {
    const f = fixture();
    await expect(
      f.reader.inspect({ ...f.input, budget: { deadlineMs: Date.now() - 1 } }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(
      f.reader.inspect({
        ...f.input,
        contracts: [
          ...f.input.contracts,
          {
            subscriptionId: "sub_duplicate_authorization",
            authorizationId: "native_purchase",
            productId: "original_offer",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_evidence" });
    expect(f.calls).toHaveLength(0);
  });
});
