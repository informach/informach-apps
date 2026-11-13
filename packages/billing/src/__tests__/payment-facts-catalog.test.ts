import { PRODUCTS } from "@informach/config";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripePaymentFactReader } from "../payment-facts";

const products = PRODUCTS.filter((product) => product.app === "edi").map((product) => ({
  ...product,
  stripePriceId: { dev: `price_${product.interval}`, prod: "" },
}));

function reader(allowedPrices = products.map((product) => product.stripePriceId.dev)) {
  const client = {
    prices: {
      retrieve: async (id: string) => {
        const product = products.find((entry) => entry.stripePriceId.dev === id);
        if (!product) throw new Error("Unknown price");
        return {
          id,
          active: true,
          livemode: false,
          type: "recurring",
          billing_scheme: "per_unit",
          unit_amount: product.listPrice?.amountCents,
          currency: "brl",
          recurring: { interval: product.interval, interval_count: 1 },
          product: "prod_suite",
        };
      },
    },
    products: {
      retrieve: async () => ({ id: "prod_suite", active: true, metadata: { app: "edi" } }),
    },
    billingPortal: {
      configurations: {
        retrieve: async (_id: string, params?: { expand?: string[] }) => ({
          active: true,
          livemode: false,
          features: {
            subscription_cancel: { enabled: true },
            subscription_update: {
              enabled: true,
              // Reproduce Stripe's expand-dependent response, not an always-expanded fixture.
              ...(params?.expand?.includes("features.subscription_update.products")
                ? { products: [{ product: "prod_suite", prices: allowedPrices }] }
                : {}),
            },
          },
        }),
      },
    },
  };
  return createStripePaymentFactReader({
    secretKey: "unused",
    client: client as unknown as Stripe,
  });
}

describe("Stripe catalog and expanded Portal restrictions", () => {
  it("accepts the approved suite catalog when Stripe requires explicit expansion", async () => {
    await expect(reader().verifyCatalog(products, "dev", "bpc_suite")).resolves.toBeUndefined();
  });
  it("still refuses an expanded Portal containing another product's price", async () => {
    await expect(
      reader(["price_month", "price_other"]).verifyCatalog(products, "dev", "bpc_suite"),
    ).rejects.toThrow("restricted to the approved suite prices");
  });
});

function compassoFixture() {
  const catalog = PRODUCTS.filter((p) => p.app === "compasso").map((p) => ({
    ...p,
    stripePriceId: { dev: `price_${p.id}`, prod: "" },
  }));
  const prices = catalog.map((p) => ({
    id: p.stripePriceId.dev,
    active: true,
    livemode: false,
    type: p.kind === "subscription" ? "recurring" : "one_time",
    billing_scheme: "per_unit",
    unit_amount: p.listPrice?.amountCents,
    currency: "brl",
    product: "prod_compasso",
    recurring: p.kind === "subscription" ? { interval: p.interval, interval_count: 1 } : null,
  }));
  const portal = {
    active: true,
    livemode: false,
    features: {
      subscription_cancel: { enabled: false, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: { enabled: false },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
  };
  const client = {
    prices: { retrieve: async (id: string) => prices.find((p) => p.id === id) },
    products: {
      retrieve: async (id: string) => ({ id, active: true, metadata: { app: "compasso" } }),
    },
    billingPortal: { configurations: { retrieve: async () => portal } },
    charges: {
      retrieve: async () => ({ customer: "cus_owner", payment_intent: "pi_paid", metadata: {} }),
    },
  };
  return {
    catalog,
    prices,
    portal,
    reader: createStripePaymentFactReader({
      secretKey: "unused",
      client: client as unknown as Stripe,
    }),
  };
}
describe("Compasso product and portal boundary", () => {
  it("accepts its two recurring prices and three one-time packs on a single product", async () => {
    const f = compassoFixture();
    expect(f.catalog).toHaveLength(5);
    await expect(
      f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso"),
    ).resolves.toBeUndefined();
  });
  it("refuses price drift, mixed products and mismatched live mode", async () => {
    const f = compassoFixture();
    const price = f.prices[0];
    if (!price) throw new Error("Missing fixture");
    price.unit_amount = 1;
    await expect(f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso")).rejects.toThrow(
      "approved offer",
    );
    price.unit_amount = f.catalog[0]?.listPrice?.amountCents;
    price.product = "prod_other";
    await expect(f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso")).rejects.toThrow(
      "single product",
    );
    price.product = "prod_compasso";
    price.livemode = true;
    await expect(f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso")).rejects.toThrow(
      "approved offer",
    );
  });
  it("keeps subscription changes in the central account so the maintenance portal cannot bypass closure", async () => {
    const f = compassoFixture();
    f.portal.features.subscription_cancel.enabled = true;
    await expect(f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso")).rejects.toThrow(
      "limit access",
    );
    f.portal.features.subscription_cancel.enabled = false;
    f.portal.features.subscription_update.enabled = true;
    await expect(f.reader.verifyCompassoCatalog(f.catalog, "dev", "bpc_compasso")).rejects.toThrow(
      "limit access",
    );
  });
  it("resolves a dispute via its charge without persisting personal provider fields", async () => {
    const f = compassoFixture();
    expect(
      await f.reader.eventPaymentReference({
        object: "dispute",
        charge: "ch_original",
        reason: "irrelevant",
      }),
    ).toEqual({ customerId: "cus_owner", paymentId: "pi_paid" });
    expect(
      await f.reader.eventPaymentReference({
        object: "payment_intent",
        id: "pi_new",
        customer: "cus_owner",
        metadata: { checkout_intent_id: "not-a-receipt", email: "private@example.test" },
      }),
    ).toEqual({ customerId: "cus_owner", paymentId: "pi_new" });
  });
});
