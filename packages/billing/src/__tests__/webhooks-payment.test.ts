import { describe, expect, it, vi } from "vitest";
import { handlePaymentIntentSucceeded } from "../webhooks/payment";
import { createFakeDb } from "./_fake-db";

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
      selectQueue: [[{ id: "customer-row-1" }]],
      // INSERT one_time_payments → returning row
      // INSERT credit_ledger → returning row
      insertQueue: [[{ id: "payment-row-1" }], [{ id: "ledger-row-1" }]],
    });
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe", onAudit },
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
        [{ id: "customer-row-1" }],
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
      { db: db as never, provider: "stripe", onAudit },
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
        [{ id: "customer-row-1" }],
        // re-read payment row after conflict
        [{ id: "payment-existing-1" }],
        // re-read ledger row after conflict
        [{ id: "ledger-existing-1" }],
      ],
      insertQueue: [[], []],
    });
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
      baseIntent,
      "evt_payment_1",
    );
    expect(result.reason).toBe("already_granted");
  });

  it("skips when subject metadata is missing", async () => {
    const { db, calls } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
      { ...baseIntent, metadata: {} },
      "evt_payment_2",
    );
    expect(result).toEqual({ processed: false, reason: "missing_subject_metadata" });
    expect(calls.find((c) => c.mode === "select")).toBeUndefined();
  });

  it("skips when product is not a credit pack (no credit_amount)", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
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
    expect(result).toEqual({ processed: false, reason: "not_a_credit_pack" });
  });

  it("rejects invalid credit_amount metadata", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
      { ...baseIntent, metadata: { ...baseIntent.metadata, credit_amount: "not-a-number" } },
      "evt_payment_4",
    );
    expect(result).toEqual({ processed: false, reason: "invalid_credit_amount" });
  });

  it("rejects invalid subject_type", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
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
      { db: db as never, provider: "stripe" },
      baseIntent,
      "evt_payment_6",
    );
    expect(result).toEqual({ processed: false, reason: "customer_not_found" });
  });

  it("returns 'missing_customer' when payment intent has no customer", async () => {
    const { db } = createFakeDb();
    const result = await handlePaymentIntentSucceeded(
      { db: db as never, provider: "stripe" },
      { ...baseIntent, customer: null },
      "evt_payment_7",
    );
    expect(result).toEqual({ processed: false, reason: "missing_customer" });
  });
});
