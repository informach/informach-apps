import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { handleSubscriptionLifecycle } from "../webhooks/subscription";
import { createFakeDb } from "./_fake-db";

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

const customerRow = {
  id: "customer-row-1",
  email: "user@cozya.app",
  subjectType: "user",
  subjectId: "user-1",
};

/**
 * Real bug from prod: a sub was created via Checkout with the monthly price
 * (so its `metadata.product_id` is "cozya_pro_monthly"), then upgraded to
 * annual via `subscriptions.update({ items: [{ price: annual }] })`. Stripe
 * does NOT migrate the metadata, so `subscription.updated` arrives with:
 *   - priceId = annual
 *   - metadata.product_id = "cozya_pro_monthly" (stale)
 *
 * The resolver must trust the priceId — what the customer is actually paying
 * for — not the stale metadata. Otherwise we persist productId="monthly" with
 * a yearly price item, which then breaks `bonusCreditsPerMonth` calc and the
 * UI plan card.
 */
describe("handleSubscriptionLifecycle — productId drift via metadata", () => {
  it("uses the priceId (annual) over stale metadata.product_id (monthly) on updates", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[customerRow]],
    });

    const stripeSubscription = {
      id: "sub_1",
      customer: "cus_test_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_dev_annual" }, // upgraded
            current_period_start: 1750000000,
            current_period_end: 1781856000,
          },
        ],
      },
      metadata: { product_id: "cozya_pro_monthly" }, // stale checkout metadata
    };

    const result = await handleSubscriptionLifecycle(
      {
        db: db as never,
        provider: "stripe",
      app: "test-app",
      },
      stripeSubscription as never,
      "customer.subscription.updated",
      { products },
    );

    expect(result.upserted).toBe(true);

    // The INSERT/UPDATE row written must use the annual product (resolved by
    // priceId), not the stale "cozya_pro_monthly" from metadata.
    const valuesCall = calls.find((c) => c.mode === "values");
    const insertedValues = valuesCall?.args[0] as Record<string, unknown>;
    expect(insertedValues.productId).toBe("cozya_pro_annual");
    expect(insertedValues.providerPriceId).toBe("price_dev_annual");
  });

  it("falls back to metadata.product_id when no product matches the priceId", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[customerRow]],
    });

    // Pretend Stripe returned an unknown priceId — defensive fallback path:
    // the metadata is the only signal we have left.
    const stripeSubscription = {
      id: "sub_2",
      customer: "cus_test_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_unknown_xyz" },
            current_period_start: 1750000000,
            current_period_end: 1781856000,
          },
        ],
      },
      metadata: { product_id: "cozya_pro_monthly" },
    };

    const onAudit = vi.fn();
    const result = await handleSubscriptionLifecycle(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        onAudit,
      },
      stripeSubscription as never,
      "customer.subscription.updated",
      { products },
    );

    // We had a fallback, so the upsert succeeded. Without it, the handler
    // would have skipped with reason="missing_price" / "product_not_in_catalog".
    expect(result.upserted).toBe(true);
    const insertedValues = calls.find((c) => c.mode === "values")?.args[0] as Record<
      string,
      unknown
    >;
    expect(insertedValues.productId).toBe("cozya_pro_monthly");
  });
});
