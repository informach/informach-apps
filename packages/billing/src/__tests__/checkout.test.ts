import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import {
  type CheckoutDeps,
  createCreditPackCheckout,
  createSubscriptionCheckout,
} from "../checkout";
import { AlreadySubscribedError, InvalidProductError, SubscriptionRequiredError } from "../errors";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

/**
 * Shape returned by the inner-join in `getProSubscription` (drizzle returns
 * `{ subscriptions: {...}, customers: {...} }` for select() with .from + .innerJoin).
 */
const PRO_SUB_JOIN_ROW = {
  subscriptions: {
    id: "sub-row-1",
    customerId: "customer-row-1",
    provider: "stripe",
    providerSubscriptionId: "sub_test_1",
    productId: "agenda_pro_monthly",
    providerPriceId: "price_dev_sub",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    cancelAtPeriodEnd: null,
    canceledAt: null,
    trialEnd: null,
    nextCreditGrantAt: null,
    pendingProductId: null,
    pendingPriceId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  customers: {
    id: "customer-row-1",
    provider: "stripe",
    providerCustomerId: "cus_test_1",
    subjectType: "user",
    subjectId: "user-1",
    email: "user@cozya.app",
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

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

  it("throws AlreadySubscribedError when subject already has an active subscription", async () => {
    // The first SELECT inside createSubscriptionCheckout looks for an active
    // sub. Returning a row simulates "already subscribed", which should abort
    // before any provider call.
    const { db } = createFakeDb({
      selectQueue: [[{ id: "existing-sub-1", productId: "agenda_pro_monthly" }]],
    });
    const { provider } = createFakeProvider();
    const deps = buildDeps({ db: db as never, providerClient: provider });

    await expect(
      createSubscriptionCheckout(deps, {
        subject: { type: "organization", id: "org-1" },
        productId: SUBSCRIPTION_PRODUCT.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toBeInstanceOf(AlreadySubscribedError);

    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
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

  it("rejects placeholder Stripe price ids before calling the provider", async () => {
    const placeholderProduct: Product = {
      ...SUBSCRIPTION_PRODUCT,
      stripePriceId: { dev: "price_TODO_agenda_pro_dev", prod: "price_TODO_agenda_pro_prod" },
    };
    const deps = buildDeps({ products: [placeholderProduct] });

    await expect(
      createSubscriptionCheckout(deps, {
        subject: { type: "organization", id: "org-1" },
        productId: placeholderProduct.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow(/not configured/);
    expect(deps.providerClient.createCheckoutSession).not.toHaveBeenCalled();
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
  /**
   * Helper that mirrors `buildDeps` but seeds the SELECT queue with a Pro
   * subscription row (the new gate in `createCreditPackCheckout` does this
   * lookup first) followed by the customer SELECT used by `getOrCreateCustomer`.
   */
  function buildProDeps(overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
    const { db } = createFakeDb({
      selectQueue: [[PRO_SUB_JOIN_ROW], []],
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

  it("creates a payment-mode checkout session with credit_amount metadata when subject is Pro", async () => {
    const deps = buildProDeps();
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

  it("throws SubscriptionRequiredError when subject is not Pro", async () => {
    // First SELECT (getProSubscription) returns empty — no Pro sub.
    const { db } = createFakeDb({ selectQueue: [[]] });
    const { provider } = createFakeProvider();
    const deps = buildDeps({ db: db as never, providerClient: provider });

    await expect(
      createCreditPackCheckout(deps, {
        subject: { type: "user", id: "user-1" },
        productId: CREDIT_PACK_PRODUCT.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects when subject only has a past_due (not-Pro) subscription", async () => {
    // The query inside getProSubscription filters by PRO_STATUSES, so a user
    // with only `past_due` returns zero rows — same shape as "no sub at all".
    const { db } = createFakeDb({ selectQueue: [[]] });
    const { provider } = createFakeProvider();
    const deps = buildDeps({ db: db as never, providerClient: provider });

    await expect(
      createCreditPackCheckout(deps, {
        subject: { type: "user", id: "user-1" },
        productId: CREDIT_PACK_PRODUCT.id,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);
  });

  it("rejects when product has wrong kind (subscription) — before Pro check", async () => {
    // Kind validation happens BEFORE the Pro gate, so this should reject
    // with InvalidProductError regardless of subscription state.
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

  it("rejects when credit_pack lacks creditAmount — before Pro check", async () => {
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
