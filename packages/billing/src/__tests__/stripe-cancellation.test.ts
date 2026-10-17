import { PRODUCTS } from "@informach/config";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripePaymentFactReader } from "../payment-facts";
import { createStripeProvider } from "../providers/stripe";
import { handleSubscriptionLifecycle } from "../webhooks/subscription";
import { createFakeDb } from "./_fake-db";

const periodStart = 1792231169;
const periodEnd = 1794909532;
const ediProduct = PRODUCTS.find((entry) => entry.id === "edi_suite_monthly");
if (!ediProduct) throw new Error("Edi monthly product is missing");
const product = {
  ...ediProduct,
  stripePriceId: { dev: "price_edi_month", prod: "" },
};

describe("Stripe Portal scheduled cancellation", () => {
  it.each([
    {
      name: "Portal timestamp at the paid period end",
      cancelAt: periodEnd,
      flag: false,
      expected: true,
    },
    { name: "legacy period-end flag", cancelAt: null, flag: true, expected: true },
    {
      name: "custom cancellation before this period ends",
      cancelAt: periodEnd - 3600,
      flag: false,
      expected: false,
    },
    {
      name: "custom cancellation after this period ends",
      cancelAt: periodEnd + 3600,
      flag: false,
      expected: false,
    },
  ])("preserves active paid time for $name", async ({ cancelAt, flag, expected }) => {
    const subscription = {
      id: "sub_edi_portal_cancel",
      customer: "cus_edi_cancel",
      status: "active",
      cancel_at: cancelAt,
      cancel_at_period_end: flag,
      canceled_at: periodStart + 100,
      items: {
        data: [
          {
            price: { id: "price_edi_month" },
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
        ],
      },
      metadata: { product_id: product.id },
    };
    const client = {
      subscriptions: { retrieve: async () => subscription },
      invoices: { list: () => (async function* () {})() },
    } as unknown as Stripe;
    const provider = createStripeProvider({
      secretKey: "unused",
      webhookSecret: "unused",
      appName: "edi",
      client,
    });
    const summary = await provider.retrieveSubscription(subscription.id);
    expect(summary).toMatchObject({
      status: "active",
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: expected,
    });

    const snapshot = await createStripePaymentFactReader({ secretKey: "unused", client }).read(
      subscription.id,
      new Set(["price_edi_month"]),
    );
    expect(snapshot).toMatchObject({
      status: "active",
      end: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: expected,
      periods: [],
    });

    const { db, calls } = createFakeDb({
      selectQueue: [
        [
          {
            id: "local_customer",
            email: "test@example.invalid",
            subjectType: "user",
            subjectId: "user_edi",
          },
        ],
      ],
    });
    await handleSubscriptionLifecycle(
      { db: db as never, provider: "stripe", app: "edi" },
      subscription,
      "customer.subscription.updated",
      { products: [product] },
    );
    expect(calls.find((call) => call.mode === "values")?.args[0]).toMatchObject({
      status: "active",
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: expected ? new Date(periodEnd * 1000) : null,
    });
  });
});
