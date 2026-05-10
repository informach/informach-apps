import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { handleSubscriptionLifecycle } from "../webhooks/subscription";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const MONTHLY: Product = {
  id: "cozya_pro_monthly",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro",
  tier: "pro",
  interval: "month",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_monthly", prod: "price_prod_monthly" },
};

const ANNUAL: Product = {
  ...MONTHLY,
  id: "cozya_pro_annual",
  name: "Cozya Pro (Anual)",
  interval: "year",
  stripePriceId: { dev: "price_dev_annual", prod: "price_prod_annual" },
};

const products = [MONTHLY, ANNUAL];

function deletedAnnualSub() {
  return {
    id: "sub_annual_1",
    customer: "cus_test_1",
    status: "canceled",
    cancel_at_period_end: false,
    canceled_at: 1781856000,
    items: {
      data: [
        {
          price: { id: "price_dev_annual" },
          current_period_start: 1750000000,
          current_period_end: 1781856000,
        },
      ],
    },
    metadata: { product_id: "cozya_pro_annual" },
  };
}

const customerRow = {
  id: "customer-row-1",
  email: "user@cozya.app",
  subjectType: "user",
  subjectId: "user-1",
};

describe("handleSubscriptionLifecycle (pending intent on delete)", () => {
  it("creates a new subscription via provider when pending_product_id is set", async () => {
    const createSub = vi.fn().mockResolvedValue({
      id: "sub_new_monthly",
      providerCustomerId: "cus_test_1",
      providerPriceId: "price_dev_monthly",
      productId: "cozya_pro_monthly",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date("2027-04-01T00:00:00Z"),
      currentPeriodEnd: new Date("2027-05-01T00:00:00Z"),
      canceledAt: null,
      trialEnd: null,
      metadata: {},
    });
    const { provider } = createFakeProvider();
    provider.createSubscription = createSub;
    const onAudit = vi.fn();

    const { db } = createFakeDb({
      selectQueue: [
        // 1. customers lookup at top of handler
        [customerRow],
        // 2. readPendingIntent join
        [
          {
            id: "sub-row-1",
            pendingProductId: "cozya_pro_monthly",
            pendingPriceId: "price_dev_monthly",
            providerCustomerId: "cus_test_1",
          },
        ],
      ],
    });

    const result = await handleSubscriptionLifecycle(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: provider,
        onAudit,
      },
      deletedAnnualSub() as never,
      "customer.subscription.deleted",
      { products },
    );

    expect(result.upserted).toBe(true);
    expect(createSub).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_test_1",
        priceId: "price_dev_monthly",
        idempotencyKey: expect.stringContaining("pending_intent:sub_annual_1"),
      }),
    );
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.subscription_created",
        payload: expect.objectContaining({ reason: "scheduled_downgrade" }),
      }),
    );
  });

  it("when provider.createSubscription throws, clears pending fields and stamps error metadata", async () => {
    const createSub = vi.fn().mockRejectedValue(new Error("card_expired"));
    const { provider } = createFakeProvider();
    provider.createSubscription = createSub;

    const { db, calls } = createFakeDb({
      selectQueue: [
        [customerRow],
        [
          {
            id: "sub-row-1",
            pendingProductId: "cozya_pro_monthly",
            pendingPriceId: "price_dev_monthly",
            providerCustomerId: "cus_test_1",
          },
        ],
      ],
    });

    const result = await handleSubscriptionLifecycle(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: provider,
      },
      deletedAnnualSub() as never,
      "customer.subscription.deleted",
      { products },
    );

    // The cancellation upsert still succeeded — only the new sub failed.
    expect(result.upserted).toBe(true);

    const setArgs = calls.filter((c) => c.mode === "set");
    // One UPDATE writes the error metadata + clears pending fields.
    const errorUpdate = setArgs.find((c) => {
      const a = c.args[0] as Record<string, unknown>;
      return (
        a.pendingProductId === null &&
        (a.metadata as { pendingPlanError?: unknown })?.pendingPlanError
      );
    });
    expect(errorUpdate).toBeDefined();
  });

  it("does nothing when no pending_product_id is set on the deleted sub", async () => {
    const createSub = vi.fn();
    const { provider } = createFakeProvider();
    provider.createSubscription = createSub;

    const { db } = createFakeDb({
      selectQueue: [
        [customerRow],
        // readPendingIntent: no rows or pending fields are null
        [
          {
            id: "sub-row-1",
            pendingProductId: null,
            pendingPriceId: null,
            providerCustomerId: "cus_test_1",
          },
        ],
      ],
    });

    const result = await handleSubscriptionLifecycle(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: provider,
      },
      deletedAnnualSub() as never,
      "customer.subscription.deleted",
      { products },
    );

    expect(result.upserted).toBe(true);
    expect(createSub).not.toHaveBeenCalled();
  });
});
