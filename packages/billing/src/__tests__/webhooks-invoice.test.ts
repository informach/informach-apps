import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { handleInvoicePaid, handleInvoicePaymentFailed } from "../webhooks/invoice";
import { createFakeDb } from "./_fake-db";

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
      { db: db as never, provider: "stripe", products: [SUBSCRIPTION_PRODUCT] },
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
      { db: db as never, provider: "stripe", products: [NO_BONUS_PRODUCT] },
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
      { db: db as never, provider: "stripe", products: [SUBSCRIPTION_PRODUCT] },
      paidInvoice(),
      "evt_invoice_1",
    );
    expect(result).toEqual({ processed: false, reason: "product_not_in_catalog" });
  });

  it("skips when local subscription row is missing", async () => {
    const { db } = createFakeDb({ selectQueue: [[]] });
    const result = await handleInvoicePaid(
      { db: db as never, provider: "stripe", products: [SUBSCRIPTION_PRODUCT] },
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
      { db: db as never, provider: "stripe", products: [SUBSCRIPTION_PRODUCT] },
      paidInvoice({ parent: null }),
      "evt_invoice_failed_1",
    );
    expect(result).toEqual({ processed: false, reason: "no_subscription" });
    expect(calls.find((c) => c.mode === "update")).toBeUndefined();
  });
});
