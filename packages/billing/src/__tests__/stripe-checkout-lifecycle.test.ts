import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { CheckoutPendingError } from "../errors";
import { createStripeProvider } from "../providers/stripe";

function fixture() {
  const rows = Array.from({ length: 107 }, (_, i) => ({
    id: `cs_${i}`,
    customer: "cus_owner",
    mode: "subscription",
    status: "open",
    url: `https://checkout.test/${i}`,
    metadata: { checkout_intent_id: `intent_${i}` },
    subscription: null as string | null,
  }));
  const subscriptions: { id: string; status: string }[] = [];
  const client = {
    checkout: {
      sessions: {
        list: vi.fn((input: { status?: string }) =>
          (async function* () {
            for (const row of rows) if (!input.status || row.status === input.status) yield row;
          })(),
        ),
        retrieve: vi.fn(async (id: string) => rows.find((r) => r.id === id)),
        create: vi.fn(async () => ({ id: "cs_created", url: "https://checkout.test/created" })),
        expire: vi.fn(async (id: string) => {
          const row = rows.find((r) => r.id === id);
          if (row) row.status = "expired";
        }),
      },
    },
    subscriptions: {
      list: vi.fn(() =>
        (async function* () {
          for (const row of subscriptions) yield row;
        })(),
      ),
    },
  };
  const provider = createStripeProvider({
    secretKey: "unused",
    webhookSecret: "unused",
    appName: "test",
    client: client as unknown as Stripe,
  });
  return { provider, client, rows, subscriptions };
}
describe("Stripe checkout lifecycle boundary", () => {
  it("expires every other subscription checkout across the full iterator, preserving the chosen URL", async () => {
    const f = fixture();
    await f.provider.prepareSubscriptionCheckout?.("cus_owner", "cs_106");
    expect(f.rows.filter((s) => s.status === "open").map((s) => s.id)).toEqual(["cs_106"]);
    expect(f.client.subscriptions.list).toHaveBeenCalledTimes(2);
  });
  it("refuses an unprojected active subscription and does not expire the reusable session", async () => {
    const f = fixture();
    f.subscriptions.push({ id: "sub_paid", status: "active" });
    await expect(
      f.provider.prepareSubscriptionCheckout?.("cus_owner", "cs_106"),
    ).rejects.toBeInstanceOf(CheckoutPendingError);
    expect(f.rows.every((s) => s.status === "open")).toBe(true);
  });
  it("fails closed when completion wins the race with expiry", async () => {
    const f = fixture();
    f.client.checkout.sessions.expire.mockRejectedValue(new Error("Session completed"));
    await expect(f.provider.prepareSubscriptionCheckout?.("cus_owner")).rejects.toThrow(
      "Session completed",
    );
  });
  it("recovers completed sessions from history and rejects mismatched customer or intent", async () => {
    const f = fixture();
    const last = f.rows.at(-1);
    if (!last) throw new Error("Missing fixture");
    last.status = "complete";
    last.subscription = "sub_paid";
    expect(await f.provider.findCheckoutSession?.("cus_owner", "intent_106")).toMatchObject({
      id: "cs_106",
      status: "complete",
      subscriptionId: "sub_paid",
    });
    await expect(
      f.provider.findCheckoutSession?.("cus_foreign", "intent_106", "cs_106"),
    ).rejects.toThrow("does not belong");
    await expect(
      f.provider.findCheckoutSession?.("cus_owner", "intent_other", "cs_106"),
    ).rejects.toThrow("does not belong");
  });
  it("sends the fixed expiry and intent metadata to both Checkout and the subscription", async () => {
    const f = fixture();
    const metadata = { checkout_intent_id: "intent_fixed" };
    await f.provider.createCheckoutSession({
      customerId: "cus_owner",
      mode: "subscription",
      priceId: "price_test",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/cancel",
      metadata,
      expiresAt: 1800000000,
      idempotencyKey: "stable_key",
    });
    expect(f.client.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: 1800000000,
        metadata,
        subscription_data: { metadata },
      }),
      { idempotencyKey: "stable_key" },
    );
  });
});
