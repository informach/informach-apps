import type { Product } from "@informach/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingError, CustomerNotFoundError, InvalidProductError } from "../errors";
import {
  type PlanChangesDeps,
  previewPlanChange,
  reactivateSubscription,
  switchPlan,
} from "../plan-changes";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const baseSubRow = {
  id: "sub-row-1",
  customerId: "customer-row-1",
  provider: "stripe",
  providerSubscriptionId: "sub_test_1",
  productId: "cozya_pro_monthly",
  providerPriceId: "price_dev_monthly",
  status: "active",
  currentPeriodStart: new Date("2026-04-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-05-01T00:00:00Z"),
  cancelAtPeriodEnd: null,
  canceledAt: null,
  trialEnd: null,
  nextCreditGrantAt: null,
  pendingProductId: null,
  pendingPriceId: null,
  metadata: {},
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

const monthlyProduct: Product = {
  id: "cozya_pro_monthly",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro",
  tier: "pro",
  interval: "month",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_monthly", prod: "price_prod_monthly" },
};

const annualProduct: Product = {
  id: "cozya_pro_annual",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro (Anual)",
  tier: "pro",
  interval: "year",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_annual", prod: "price_prod_annual" },
};

const creditPackProduct: Product = {
  id: "cozya_credits_100",
  app: "cozya",
  kind: "credit_pack",
  name: "100 créditos",
  creditAmount: 100,
  stripePriceId: { dev: "price_dev_pack", prod: "price_prod_pack" },
};

function makeDeps(overrides: Partial<PlanChangesDeps> = {}): PlanChangesDeps {
  const { db } = createFakeDb();
  const { provider } = createFakeProvider();
  return {
    db: db as never,
    provider: "stripe",
    providerClient: provider,
    organizationsEnabled: false,
    products: [monthlyProduct, annualProduct, creditPackProduct],
    stripeMode: "dev",
    onAudit: vi.fn(),
    ...overrides,
  };
}

describe("switchPlan(immediate)", () => {
  it("calls updateSubscription with always_invoice and seeds nextCreditGrantAt for annual", async () => {
    const periodEnd = new Date("2027-04-01T00:00:00Z");
    const { db, calls } = createFakeDb({
      selectQueue: [[baseSubRow]],
      updateQueue: [
        [
          {
            ...baseSubRow,
            productId: "cozya_pro_annual",
            providerPriceId: "price_dev_annual",
            currentPeriodEnd: periodEnd,
            nextCreditGrantAt: new Date(),
          },
        ],
      ],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    });
    const onAudit = vi.fn();
    const deps = makeDeps({ db: db as never, providerClient: provider, onAudit });

    const result = await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_annual",
      mode: "immediate",
    });

    expect(provider.updateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSubscriptionId: "sub_test_1",
        newPriceId: "price_dev_annual",
        prorationBehavior: "always_invoice",
      }),
    );
    expect(result.appliedImmediately).toBe(true);
    const setCall = calls.find((c) => c.mode === "set");
    expect(setCall).toBeDefined();
    const setArgs = setCall?.args[0] as Record<string, unknown>;
    expect(setArgs.productId).toBe("cozya_pro_annual");
    expect(setArgs.providerPriceId).toBe("price_dev_annual");
    expect(setArgs.pendingProductId).toBeNull();
    expect(setArgs.pendingPriceId).toBeNull();
    expect(setArgs.nextCreditGrantAt).toBeInstanceOf(Date);
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.subscription_updated",
        payload: expect.objectContaining({ mode: "immediate" }),
      }),
    );
  });

  it("returns paymentActionUrl when latest invoice is unpaid (open/uncollectible)", async () => {
    const periodEnd = new Date("2027-04-01T00:00:00Z");
    const { db } = createFakeDb({
      selectQueue: [[baseSubRow]],
      updateQueue: [[baseSubRow]],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
        latestInvoice: {
          id: "in_open_1",
          status: "open",
          hostedUrl: "https://invoice.stripe.com/pay/in_open_1",
          amountDueCents: 18_000,
          currency: "BRL",
        },
      },
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });

    const result = await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_annual",
      mode: "immediate",
    });

    expect(result.paymentActionUrl).toBe("https://invoice.stripe.com/pay/in_open_1");
  });

  it("returns paymentActionUrl null when invoice is already paid", async () => {
    const periodEnd = new Date("2027-04-01T00:00:00Z");
    const { db } = createFakeDb({
      selectQueue: [[baseSubRow]],
      updateQueue: [[baseSubRow]],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
        latestInvoice: {
          id: "in_paid_1",
          status: "paid",
          hostedUrl: "https://invoice.stripe.com/pay/in_paid_1",
          amountDueCents: 0,
          currency: "BRL",
        },
      },
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });

    const result = await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_annual",
      mode: "immediate",
    });

    expect(result.paymentActionUrl).toBeNull();
  });

  it("returns paymentActionUrl null when provider does not include latestInvoice", async () => {
    const periodEnd = new Date("2027-04-01T00:00:00Z");
    const { db } = createFakeDb({
      selectQueue: [[baseSubRow]],
      updateQueue: [[baseSubRow]],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
        // No latestInvoice — defensive: unknown payment status, don't redirect.
      },
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });

    const result = await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_annual",
      mode: "immediate",
    });

    expect(result.paymentActionUrl).toBeNull();
  });

  it("clears nextCreditGrantAt when switching to monthly", async () => {
    const annualRow = {
      ...baseSubRow,
      productId: "cozya_pro_annual",
      providerPriceId: "price_dev_annual",
      nextCreditGrantAt: new Date("2026-05-01T00:00:00Z"),
    };
    const { db, calls } = createFakeDb({
      selectQueue: [[annualRow]],
      updateQueue: [[{ ...annualRow }]],
    });
    const { provider } = createFakeProvider();
    const deps = makeDeps({ db: db as never, providerClient: provider });

    await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_monthly",
      mode: "immediate",
    });

    const setArgs = calls.find((c) => c.mode === "set")?.args[0] as Record<string, unknown>;
    expect(setArgs.nextCreditGrantAt).toBeNull();
  });

  it("rejects credit_pack products", async () => {
    const { db } = createFakeDb({ selectQueue: [[baseSubRow]] });
    const deps = makeDeps({ db: db as never });
    await expect(
      switchPlan(deps, {
        subscriptionId: "sub-row-1",
        newProductId: "cozya_credits_100",
        mode: "immediate",
      }),
    ).rejects.toBeInstanceOf(InvalidProductError);
  });

  it("throws when subscription does not exist", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const deps = makeDeps({ db: db as never });
    await expect(
      switchPlan(deps, {
        subscriptionId: "missing",
        newProductId: "cozya_pro_annual",
        mode: "immediate",
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});

describe("switchPlan(schedule_at_period_end)", () => {
  it("cancels at period end and stores pending product/price", async () => {
    const annualRow = {
      ...baseSubRow,
      productId: "cozya_pro_annual",
      providerPriceId: "price_dev_annual",
    };
    const periodEnd = new Date("2027-04-01T00:00:00Z");
    const { db, calls } = createFakeDb({
      selectQueue: [[annualRow]],
      updateQueue: [[{ ...annualRow, cancelAtPeriodEnd: periodEnd }]],
    });
    const { provider } = createFakeProvider({
      subscriptionSummary: {
        id: "sub_test_1",
        status: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd,
      },
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });

    const result = await switchPlan(deps, {
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_monthly",
      mode: "schedule_at_period_end",
    });

    expect(provider.cancelSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ atPeriodEnd: true }),
    );
    expect(result.appliedImmediately).toBe(false);
    const setArgs = calls.find((c) => c.mode === "set")?.args[0] as Record<string, unknown>;
    expect(setArgs.pendingProductId).toBe("cozya_pro_monthly");
    expect(setArgs.pendingPriceId).toBe("price_dev_monthly");
    expect(setArgs.cancelAtPeriodEnd).toEqual(periodEnd);
  });
});

describe("reactivateSubscription", () => {
  it("clears cancelAtPeriodEnd and pending fields", async () => {
    const cancelingRow = {
      ...baseSubRow,
      cancelAtPeriodEnd: new Date("2026-05-01T00:00:00Z"),
      pendingProductId: "cozya_pro_monthly",
      pendingPriceId: "price_dev_monthly",
    };
    const { db, calls } = createFakeDb({
      selectQueue: [[cancelingRow]],
      updateQueue: [[{ ...cancelingRow, cancelAtPeriodEnd: null }]],
    });
    const reactivateMock = vi.fn().mockResolvedValue({
      id: "sub_test_1",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-05-01T00:00:00Z"),
    });
    const { provider } = createFakeProvider();
    provider.reactivateSubscription = reactivateMock;
    const deps = makeDeps({ db: db as never, providerClient: provider });

    await reactivateSubscription(deps, { subscriptionId: "sub-row-1" });

    expect(reactivateMock).toHaveBeenCalledWith({ providerSubscriptionId: "sub_test_1" });
    const setArgs = calls.find((c) => c.mode === "set")?.args[0] as Record<string, unknown>;
    expect(setArgs.cancelAtPeriodEnd).toBeNull();
    expect(setArgs.pendingProductId).toBeNull();
    expect(setArgs.pendingPriceId).toBeNull();
  });

  it("throws BillingError when provider does not implement reactivateSubscription", async () => {
    const { db } = createFakeDb({ selectQueue: [[baseSubRow]] });
    const { provider } = createFakeProvider();
    delete provider.reactivateSubscription;
    const deps = makeDeps({ db: db as never, providerClient: provider });
    await expect(
      reactivateSubscription(deps, { subscriptionId: "sub-row-1" }),
    ).rejects.toBeInstanceOf(BillingError);
  });
});

describe("previewPlanChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns subtotal, proration credit, and amount due from the provider preview", async () => {
    const previewMock = vi.fn().mockResolvedValue({
      subtotalCents: 18_000, // R$ 180,00 — full annual price
      prorationCreditCents: -5_700, // R$ -57,00 — credit for unused monthly time
      amountDueCents: 12_300, // R$ 123,00 net
      currency: "BRL",
      nextChargeAt: new Date("2027-04-01T00:00:00Z"),
    });
    const { provider } = createFakeProvider();
    provider.previewInvoice = previewMock;
    const { db } = createFakeDb({
      selectQueue: [[baseSubRow], [{ providerCustomerId: "cus_test_1" }]],
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });

    const result = await previewPlanChange(deps, {
      subject: { type: "user", id: "user-1" },
      subscriptionId: "sub-row-1",
      newProductId: "cozya_pro_annual",
    });

    expect(result.subtotalCents).toBe(18_000);
    expect(result.prorationCreditCents).toBe(-5_700);
    expect(result.amountDueCents).toBe(12_300);
    expect(previewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_test_1",
        providerSubscriptionId: "sub_test_1",
        newPriceId: "price_dev_annual",
        prorationBehavior: "always_invoice",
      }),
    );
  });

  it("throws CustomerNotFoundError when no customer row matches the subject", async () => {
    const { provider } = createFakeProvider();
    provider.previewInvoice = vi.fn();
    const { db } = createFakeDb({
      selectQueue: [[baseSubRow], []],
    });
    const deps = makeDeps({ db: db as never, providerClient: provider });
    await expect(
      previewPlanChange(deps, {
        subject: { type: "user", id: "user-1" },
        subscriptionId: "sub-row-1",
        newProductId: "cozya_pro_annual",
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });
});
