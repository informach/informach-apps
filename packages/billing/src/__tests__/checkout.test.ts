import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { createCreditPackCheckout, createSubscriptionCheckout, type CheckoutDeps } from "../checkout";
import { InvalidProductError } from "../errors";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const SUBSCRIPTION_PRODUCT: Product = {
  id: "agenda_pro_monthly",
  app: "agenda-da-turma",
  kind: "subscription",
  name: "Agenda Pro Mensal",
  tier: "pro",
  interval: "month",
  bonusCreditsPerMonth: 1000,
  stripePriceId: { dev: "price_dev_sub", prod: "price_prod_sub" },
};

const CREDIT_PACK_PRODUCT: Product = {
  id: "cozya_credits_5000",
  app: "cozya",
  kind: "credit_pack",
  name: "5000 créditos",
  creditAmount: 5000,
  stripePriceId: { dev: "price_dev_pack", prod: "price_prod_pack" },
};

function buildDeps(overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  const { db } = createFakeDb({
    selectQueue: [[]],
    insertResult: [{ id: "row-customer", providerCustomerId: "cus_test_1" }],
  });
  const { provider } = createFakeProvider({ customerIdSequence: ["cus_test_1"] });
  return {
    db: db as never,
    provider: "stripe",
    providerClient: provider,
    organizationsEnabled: true,
    products: [SUBSCRIPTION_PRODUCT, CREDIT_PACK_PRODUCT],
    publicAppUrl: "https://app.example.com",
    stripeMode: "dev",
    resolveSubjectEmail: vi.fn(async () => "owner@example.com"),
    ...overrides,
  };
}

describe("createSubscriptionCheckout", () => {
  it("creates a subscription checkout session for a valid product", async () => {
    const deps = buildDeps();
    const result = await createSubscriptionCheckout(deps, {
      subject: { type: "organization", id: "org-1" },
      productId: SUBSCRIPTION_PRODUCT.id,
      successUrl: "https://app.example.com/billing/success",
      cancelUrl: "https://app.example.com/billing/cancel",
    });
    expect(result.url).toBe("https://checkout.stripe.com/test");
    expect(result.sessionId).toBe("cs_test_1");
    expect(deps.providerClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        priceId: "price_dev_sub",
        customerId: "cus_test_1",
        metadata: expect.objectContaining({
          subject_type: "organization",
          subject_id: "org-1",
          product_id: SUBSCRIPTION_PRODUCT.id,
        }),
      }),
    );
  });

  it("rejects when product has wrong kind (credit_pack)", async () => {
    const deps = buildDeps();
    await expect(
      createSubscriptionCheckout(deps, {
        subject: { type: "organization", id: "org-1" },
        productId: CREDIT_PACK_PRODUCT.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow(InvalidProductError);
  });

  it("rejects when product is not in the catalog", async () => {
    const deps = buildDeps();
    await expect(
      createSubscriptionCheckout(deps, {
        subject: { type: "organization", id: "org-1" },
        productId: "missing_product",
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow(/missing_product/);
  });

  it("uses the prod Stripe price when stripeMode='prod'", async () => {
    const deps = buildDeps({ stripeMode: "prod" });
    await createSubscriptionCheckout(deps, {
      subject: { type: "organization", id: "org-1" },
      productId: SUBSCRIPTION_PRODUCT.id,
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    });
    expect(deps.providerClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_prod_sub" }),
    );
  });

  it("forwards trialDays to the provider", async () => {
    const deps = buildDeps();
    await createSubscriptionCheckout(deps, {
      subject: { type: "organization", id: "org-1" },
      productId: SUBSCRIPTION_PRODUCT.id,
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
      trialDays: 14,
    });
    expect(deps.providerClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: 14 }),
    );
  });
});

describe("createCreditPackCheckout", () => {
  it("creates a payment-mode checkout session with credit_amount metadata", async () => {
    const deps = buildDeps();
    const result = await createCreditPackCheckout(deps, {
      subject: { type: "user", id: "user-1" },
      productId: CREDIT_PACK_PRODUCT.id,
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    });
    expect(result.sessionId).toBe("cs_test_1");
    expect(deps.providerClient.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        priceId: "price_dev_pack",
        metadata: expect.objectContaining({
          credit_amount: "5000",
          product_id: CREDIT_PACK_PRODUCT.id,
        }),
      }),
    );
  });

  it("rejects when product has wrong kind (subscription)", async () => {
    const deps = buildDeps();
    await expect(
      createCreditPackCheckout(deps, {
        subject: { type: "user", id: "user-1" },
        productId: SUBSCRIPTION_PRODUCT.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow(InvalidProductError);
  });

  it("rejects when credit_pack lacks creditAmount", async () => {
    const badProduct: Product = { ...CREDIT_PACK_PRODUCT, creditAmount: 0 };
    const deps = buildDeps({ products: [badProduct] });
    await expect(
      createCreditPackCheckout(deps, {
        subject: { type: "user", id: "user-1" },
        productId: badProduct.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow(/creditAmount > 0/);
  });
});
