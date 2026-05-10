import type { Product } from "@informach/config";
import { describe, expect, it, vi } from "vitest";
import { handleInvoicePaid } from "../webhooks/invoice";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const ANNUAL_PRODUCT: Product = {
  id: "cozya_pro_annual",
  app: "cozya",
  kind: "subscription",
  name: "Cozya Pro (Anual)",
  tier: "pro",
  interval: "year",
  bonusCreditsPerMonth: 100,
  stripePriceId: { dev: "price_dev_annual", prod: "price_prod_annual" },
};

const MONTHLY_PRODUCT: Product = {
  ...ANNUAL_PRODUCT,
  id: "cozya_pro_monthly",
  name: "Cozya Pro",
  interval: "month",
  stripePriceId: { dev: "price_dev_monthly", prod: "price_prod_monthly" },
};

function annualInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_annual_1",
    customer: "cus_annual_1",
    billing_reason: "subscription_create",
    amount_paid: 1_800_00,
    currency: "brl",
    parent: { subscription_details: { subscription: "sub_annual_1" } },
    ...overrides,
  };
}

const localSubRow = {
  id: "sub-row-annual",
  productId: "cozya_pro_annual",
  providerPriceId: "price_dev_annual",
  metadata: {},
  subjectType: "user",
  subjectId: "user-1",
  customerEmail: "user@cozya.app",
  currentPeriodEnd: new Date("2027-04-01T00:00:00Z"),
};

describe("handleInvoicePaid (annual)", () => {
  it("on subscription_create: grants bonus AND seeds next_credit_grant_at", async () => {
    const onAudit = vi.fn();
    const { db, calls } = createFakeDb({
      selectQueue: [[localSubRow]],
      insertResult: [{ id: "ledger-annual-initial" }],
    });

    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: createFakeProvider().provider,
        products: [ANNUAL_PRODUCT],
        onAudit,
      },
      annualInvoice(),
      "evt_annual_1",
    );

    expect(result).toEqual({
      processed: true,
      reason: "annual_initial_granted",
    });
    // The handler updates the subscription row to set nextCreditGrantAt.
    const updateSet = calls.find((c) => c.mode === "set")?.args[0] as Record<string, unknown>;
    expect(updateSet.nextCreditGrantAt).toBeInstanceOf(Date);
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credits_granted",
        payload: expect.objectContaining({ amount: 100 }),
      }),
    );
  });

  it("on subscription_cycle (annual renewal): resets anchor WITHOUT granting", async () => {
    const onAudit = vi.fn();
    const { db, calls } = createFakeDb({
      selectQueue: [[localSubRow]],
    });

    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: createFakeProvider().provider,
        products: [ANNUAL_PRODUCT],
        onAudit,
      },
      annualInvoice({ billing_reason: "subscription_cycle", id: "in_annual_renewal" }),
      "evt_annual_renewal",
    );

    expect(result).toEqual({ processed: true, reason: "annual_renewal_anchor_reset" });
    // No INSERT into credit_ledger (no grant on annual renewal).
    const insertCalls = calls.filter((c) => c.mode === "insert");
    expect(insertCalls).toHaveLength(0);
    // Anchor was reset.
    const updateSet = calls.find((c) => c.mode === "set")?.args[0] as Record<string, unknown>;
    expect(updateSet.nextCreditGrantAt).toBeInstanceOf(Date);
    // billing.credits_granted should NOT be emitted.
    expect(onAudit).not.toHaveBeenCalled();
  });

  it("on subscription_update: short-circuits as non_cycle (no grant, no DB writes)", async () => {
    // subscription_update is a mid-cycle change (plan swap, quantity, proration).
    // It is NOT a renewal — granting here would double-credit the same month
    // (monthly→monthly) or hand out an undue bonus (monthly→annual upgrade).
    // The handler bails out before even loading the local sub row.
    const { db, calls } = createFakeDb();

    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: createFakeProvider().provider,
        products: [ANNUAL_PRODUCT],
      },
      annualInvoice({ billing_reason: "subscription_update", id: "in_annual_upd" }),
      "evt_annual_upd",
    );

    expect(result).toEqual({ processed: false, reason: "non_cycle:subscription_update" });
    // Filtered before any DB work.
    expect(calls.find((c) => c.mode === "select")).toBeUndefined();
    expect(calls.find((c) => c.mode === "insert")).toBeUndefined();
    expect(calls.find((c) => c.mode === "set")).toBeUndefined();
  });

  it("uses priceId to resolve product even when local.productId is stale (race guard)", async () => {
    // Race scenario: switchPlan upgraded mensal→anual; Stripe processed the
    // update; `invoice.paid` arrived BEFORE `customer.subscription.updated`
    // got applied to our local DB. So local row reads productId='monthly'
    // while providerPriceId is already the annual price. The handler must
    // resolve via priceId (annual) so we DON'T grant (subscription_update is
    // already filtered, but this test fixes a separate failure mode where
    // billingReason was subscription_create on the freshly-stitched annual
    // line — which would have led to "annual_initial_granted" of 100 again).
    const staleLocal = {
      ...localSubRow,
      productId: "cozya_pro_monthly", // stale
      providerPriceId: "price_dev_annual", // truth
    };
    const { db, calls } = createFakeDb({
      selectQueue: [[staleLocal]],
      insertResult: [{ id: "ledger-1" }],
    });

    await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: createFakeProvider().provider,
        products: [MONTHLY_PRODUCT, ANNUAL_PRODUCT],
      },
      annualInvoice({ billing_reason: "subscription_create", id: "in_annual_first" }),
      "evt_annual_first",
    );

    // Should use the annual catalog entry — not the monthly fallback. We can
    // tell because the grant metadata will say productId=cozya_pro_annual.
    const insertedValues = calls.find((c) => c.mode === "values")?.args[0] as Record<
      string,
      unknown
    >;
    const meta = insertedValues?.metadata as Record<string, unknown> | undefined;
    expect(meta?.productId).toBe("cozya_pro_annual");
  });

  it("monthly path remains: grants on subscription_cycle (regression guard)", async () => {
    const monthlySubRow = { ...localSubRow, productId: "cozya_pro_monthly" };
    const { db } = createFakeDb({
      selectQueue: [[monthlySubRow]],
      insertResult: [{ id: "ledger-monthly-1" }],
    });
    const result = await handleInvoicePaid(
      {
        db: db as never,
        provider: "stripe",
        app: "test-app",
        providerClient: createFakeProvider().provider,
        products: [MONTHLY_PRODUCT],
      },
      annualInvoice({
        billing_reason: "subscription_cycle",
        id: "in_monthly_renewal",
      }),
      "evt_monthly_1",
    );
    expect(result.reason).toBe("bonus_granted");
  });
});
