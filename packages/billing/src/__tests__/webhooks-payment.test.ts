import { describe, expect, it, vi } from "vitest";
import { handlePaymentIntentSucceeded } from "../webhooks/payment";
import { createFakeDb } from "./_fake-db";

const CREDIT_PRODUCT = {
  id: "cozya_credits_5000",
  app: "cozya",
  kind: "credit_pack" as const,
  name: "Pacote 5000 Créditos",
  creditAmount: 5000,
  stripePriceId: { dev: "price_dev_credits", prod: "price_prod_credits" },
};

const SUBSCRIPTION_PRODUCT = {
  id: "cozya_subscription",
  app: "cozya",
  kind: "subscription" as const,
  name: "Cozya Pro",
  tier: "pro",
  interval: "month" as const,
  stripePriceId: { dev: "price_dev_sub", prod: "price_prod_sub" },
};

function depsWithProducts(db: unknown, overrides: Record<string, unknown> = {}) {
  return { db: db as never, provider: "stripe" as const, products: [CREDIT_PRODUCT], ...overrides };
}

const baseIntent = {
  id: "pi_test_1",
  customer: "cus_test_1",
  amount: 5000,
  currency: "brl",
  latest_charge: "ch_test_1",
  metadata: {
    subject_type: "user",
    subject_id: "user-1",
    product_id: "cozya_credits_5000",
    credit_amount: "5000",
  },
};

describe("handlePaymentIntentSucceeded", () => {
  it("grants credits on a fresh credit-pack payment", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      // SELECT customer
      selectQueue: [[{ id: "customer-row-1", subjectType: "user", subjectId: "user-1" }]],
      // INSERT one_time_payments → returning row
      // INSERT credit_ledger → returning row
      insertQueue: [[{ id: "payment-row-1" }], [{ id: "ledger-row-1" }]],
    });
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db, { onAudit }),
      baseIntent,
      "evt_payment_1",
    );
    expect(result).toEqual({ processed: true, reason: "credit_pack_granted" });
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.payment_succeeded",
        payload: expect.objectContaining({
          subjectType: "user",
          subjectId: "user-1",
          creditAmount: 5000,
          replay: false,
        }),
      }),
    );
  });

  it("returns 'already_granted' when ledger conflict (idempotent replay)", async () => {
    const onAudit = vi.fn();
    const { db } = createFakeDb({
      selectQueue: [
        [{ id: "customer-row-1", subjectType: "user", subjectId: "user-1" }],
        // re-read ledger after conflict
        [{ id: "ledger-existing-1" }],
      ],
      insertQueue: [
        // payment insert succeeds (or conflicts; we test both later)
        [{ id: "payment-row-1" }],
        // ledger insert returns 0 rows (conflict)
        [],
      ],
    });
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db, { onAudit }),
      baseIntent,
      "evt_payment_1",
    );
    expect(result).toEqual({ processed: true, reason: "already_granted" });
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ replay: true, ledgerEntryId: "ledger-existing-1" }),
      }),
    );
  });

  it("re-reads payment row when both inserts conflict (full replay)", async () => {
    const { db } = createFakeDb({
      selectQueue: [
        [{ id: "customer-row-1", subjectType: "user", subjectId: "user-1" }],
        // re-read payment row after conflict
        [{ id: "payment-existing-1" }],
        // re-read ledger row after conflict
        [{ id: "ledger-existing-1" }],
      ],
      insertQueue: [[], []],
    });
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      baseIntent,
      "evt_payment_1",
    );
    expect(result.reason).toBe("already_granted");
  });

  it("skips when subject metadata is missing", async () => {
    const { db, calls } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      { ...baseIntent, metadata: {} },
      "evt_payment_2",
    );
    expect(result).toEqual({ processed: false, reason: "missing_subject_metadata" });
    expect(calls.find((c) => c.mode === "select")).toBeUndefined();
  });

  it("skips when product is not a credit pack (no credit_amount)", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db, { products: [SUBSCRIPTION_PRODUCT] }),
      {
        ...baseIntent,
        metadata: {
          subject_type: "user",
          subject_id: "user-1",
          product_id: "some_other_product",
        },
      },
      "evt_payment_3",
    );
    expect(result).toEqual({ processed: false, reason: "product_not_in_catalog" });
  });

  it("skips when product exists but is not a credit pack", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db, { products: [SUBSCRIPTION_PRODUCT] }),
      {
        ...baseIntent,
        metadata: {
          ...baseIntent.metadata,
          product_id: "cozya_subscription",
        },
      },
      "evt_payment_3b",
    );
    expect(result).toEqual({ processed: false, reason: "not_a_credit_pack" });
  });

  it("rejects invalid credit_amount metadata", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      { ...baseIntent, metadata: { ...baseIntent.metadata, credit_amount: "not-a-number" } },
      "evt_payment_4",
    );
    expect(result).toEqual({ processed: false, reason: "invalid_credit_amount" });
  });

  it("rejects partially numeric credit_amount metadata", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      { ...baseIntent, metadata: { ...baseIntent.metadata, credit_amount: "5000abc" } },
      "evt_payment_4b",
    );
    expect(result).toEqual({ processed: false, reason: "invalid_credit_amount" });
  });

  it("rejects invalid subject_type", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      { ...baseIntent, metadata: { ...baseIntent.metadata, subject_type: "team" } },
      "evt_payment_5",
    );
    expect(result).toEqual({ processed: false, reason: "invalid_subject_type" });
  });

  it("returns 'customer_not_found' when local customer is missing", async () => {
    const { db } = createFakeDb({
      selectQueue: [[]], // customer lookup empty
    });
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      baseIntent,
      "evt_payment_6",
    );
    expect(result).toEqual({ processed: false, reason: "customer_not_found" });
  });

  it("rejects payment metadata that points to a different subject than the customer row", async () => {
    const { db } = createFakeDb({
      selectQueue: [[{ id: "customer-row-1", subjectType: "user", subjectId: "user-2" }]],
    });
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      baseIntent,
      "evt_payment_6b",
    );
    expect(result).toEqual({ processed: false, reason: "customer_subject_mismatch" });
  });

  it("returns 'missing_customer' when payment intent has no customer", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      depsWithProducts(db),
      { ...baseIntent, customer: null },
      "evt_payment_7",
    );
    expect(result).toEqual({ processed: false, reason: "missing_customer" });
  });
});
