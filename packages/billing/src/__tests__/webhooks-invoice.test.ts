import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { handleInvoicePaid, handleInvoicePaymentFailed } from "../webhooks/invoice";
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

const ANNUAL_SUBSCRIPTION_PRODUCT: Product = {
  ...SUBSCRIPTION_PRODUCT,
  id: "agenda_pro_annual",
  name: "Agenda Pro Anual",
  interval: "year",
  stripePriceId: { dev: "price_dev_annual", prod: "price_prod_annual" },
};

const NO_BONUS_PRODUCT: Product = {
  ...SUBSCRIPTION_PRODUCT,
  id: "agenda_starter",
  bonusCreditsPerMonth: undefined,
};

function paidInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_test_1",
    customer: "cus_test_1",
    billing_reason: "subscription_cycle",
    parent: {
      subscription_details: { subscription: "sub_test_1" },
    },
    ...overrides,
  };
}

function providerClient() {
  return createFakeProvider().provider;
}

describe("handleInvoicePaid", () => {
  it("grants monthly bonus on a fresh subscription_cycle invoice", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      // join SELECT returns local sub + customer subject
      selectQueue: [
        [
          {
            id: "sub-row-1",
            productId: "agenda_pro_monthly",
            metadata: {},
            subjectType: "organization",
            subjectId: "org-1",
          },
        ],
      ],
      // INSERT credit_ledger returning row id
      insertResult: [{ id: "ledger-bonus-1" }],
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
        onAudit,
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: true, reason: "bonus_granted" });
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credits_granted",
        payload: expect.objectContaining({
          ledgerEntryId: "ledger-bonus-1",
          amount: 1000,
          reason: "subscription_monthly",
        }),
      }),
    );
  });

  it("returns bonus_already_granted when ledger conflict (replay)", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [
          {
            id: "sub-row-1",
            productId: "agenda_pro_monthly",
            metadata: {},
            subjectType: "organization",
            subjectId: "org-1",
          },
        ],
        // grantBonusCredits re-reads ledger after conflict
        [{ id: "ledger-existing-1" }],
      ],
      insertResult: [], // ON CONFLICT DO NOTHING → 0 rows
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: true, reason: "bonus_already_granted" });
  });

  it("skips when billing_reason is not a cycle/create/update", async () => {
    const { db, calls } = createFakeDb();
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice({ billing_reason: "manual" }),
      "evt_invoice_1",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toContain("non_cycle:manual");
    expect(calls.find((c) => c.mode === "select")).toBeUndefined();
  });

  it("skips when invoice has no subscription parent", async () => {
    const { db } = createFakeDb();
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice({ parent: null }),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: false, reason: "no_subscription" });
  });

  it("skips when product has no bonusCreditsPerMonth", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [
          {
            id: "sub-row-1",
            productId: "agenda_starter",
            metadata: {},
            subjectType: "user",
            subjectId: "user-1",
          },
        ],
      ],
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [NO_BONUS_PRODUCT],
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: false, reason: "no_bonus_for_product" });
  });

  it("skips when product is not in the catalog", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [
          {
            id: "sub-row-1",
            productId: "missing_product",
            metadata: {},
            subjectType: "user",
            subjectId: "user-1",
          },
        ],
      ],
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: false, reason: "product_not_in_catalog" });
  });

  it("recovers a missing local subscription before granting invoice credits", async () => {
    const { provider } = createFakeProvider({
      subscriptionDetails: {
        id: "sub_test_1",
        providerCustomerId: "cus_test_1",
        providerPriceId: "price_dev_sub",
        productId: "agenda_pro_monthly",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date("2026-01-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00Z"),
        canceledAt: null,
        trialEnd: null,
        metadata: { product_id: "agenda_pro_monthly" },
      },
    });
    const recoveredCurrentPeriodEnd = new Date("2026-02-01T00:00:00Z");
    const { db } = createFakeDb({
      selectQueue: [
        [], // initial local subscription lookup
        [
          {
            id: "customer-row-1",
            email: "owner@example.com",
            subjectType: "organization",
            subjectId: "org-1",
          },
        ],
      ],
      insertQueue: [
        [
          {
            id: "sub-row-recovered",
            currentPeriodEnd: recoveredCurrentPeriodEnd,
            metadata: { product_id: "agenda_pro_monthly" },
          },
        ], // recovered subscription upsert
        [{ id: "ledger-bonus-1" }],
      ],
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: provider,
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: true, reason: "bonus_granted" });
  });

  it("recovers missing local subscription using provider priceId before stale productId", async () => {
    const { provider } = createFakeProvider({
      subscriptionDetails: {
        id: "sub_test_1",
        providerCustomerId: "cus_test_1",
        providerPriceId: "price_dev_annual",
        productId: "agenda_pro_monthly",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date("2026-01-01T00:00:00Z"),
        currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
        canceledAt: null,
        trialEnd: null,
        metadata: { product_id: "agenda_pro_monthly" },
      },
    });
    const { db, calls } = createFakeDb({
      selectQueue: [
        [], // initial local subscription lookup
        [
          {
            id: "customer-row-1",
            email: "owner@example.com",
            subjectType: "organization",
            subjectId: "org-1",
          },
        ],
      ],
      insertQueue: [
        [
          {
            id: "sub-row-recovered",
            currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
            metadata: { product_id: "agenda_pro_monthly" },
          },
        ],
      ],
    });

    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: provider,
        products: [SUBSCRIPTION_PRODUCT, ANNUAL_SUBSCRIPTION_PRODUCT],
      },
      paidInvoice({ billing_reason: "subscription_cycle" }),
      "evt_invoice_annual_cycle",
    );

    expect(result).toEqual({ processed: true, reason: "annual_renewal_anchor_reset" });
    const subscriptionValues = calls.find((c) => {
      const values = c.args[0] as Record<string, unknown> | undefined;
      return c.mode === "values" && values?.providerSubscriptionId === "sub_test_1";
    })?.args[0] as Record<string, unknown>;
    expect(subscriptionValues.productId).toBe("agenda_pro_annual");
  });

  it("skips when local subscription row is missing", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: false, reason: "subscription_not_local" });
  });
});

describe("handleInvoicePaymentFailed", () => {
  it("marks subscription past_due and writes dunning metadata", async () => {
    const onAudit = vi.fn();
    const { db, calls } = createFakeDb({
      selectQueue: [
        [
          {
            id: "sub-row-1",
            productId: "agenda_pro_monthly",
            metadata: {},
            subjectType: "organization",
            subjectId: "org-1",
          },
        ],
      ],
    });
    const result = await handleInvoicePaymentFailed(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
        onAudit,
      },
      paidInvoice({ billing_reason: undefined }),
      "evt_invoice_failed_1",
    );
    expect(result).toEqual({ processed: true, reason: "subscription_past_due" });
    expect(calls.some((c) => c.mode === "update")).toBe(true);
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.payment_failed",
        payload: expect.objectContaining({ subscriptionId: "sub-row-1" }),
      }),
    );
  });

  it("skips when invoice has no subscription", async () => {
    const { db, calls } = createFakeDb();
    const result = await handleInvoicePaymentFailed(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: providerClient(),
        products: [SUBSCRIPTION_PRODUCT],
      },
      paidInvoice({ parent: null }),
      "evt_invoice_failed_1",
    );
    expect(result).toEqual({ processed: false, reason: "no_subscription" });
    expect(calls.find((c) => c.mode === "update")).toBeUndefined();
  });
});
