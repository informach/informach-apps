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
