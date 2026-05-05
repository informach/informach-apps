import { describe, expect, it, vi } from "vitest";
import { handleStripeEvent, type StripeWebhookDeps } from "../webhooks";
import { createFakeDb } from "./_fake-db";
import { createFakeProvider } from "./_fake-provider";

const SUBSCRIPTION_PRODUCT = {
  id: "agenda_pro_monthly",
  app: "agenda-da-turma",
  kind: "subscription" as const,
  name: "Agenda Pro Mensal",
  tier: "pro",
  interval: "month" as const,
  bonusCreditsPerMonth: 1000,
  stripePriceId: { dev: "price_dev_sub", prod: "price_prod_sub" },
};

function makeDeps(
  overrides: Partial<StripeWebhookDeps> & { dbConfig?: Parameters<typeof createFakeDb>[0] } = {},
) {
  const { dbConfig, ...rest } = overrides;
  const fake = createFakeDb(dbConfig);
  const { provider } = createFakeProvider();
  const onAudit = vi.fn();
  const deps: StripeWebhookDeps = {
    db: fake.db as never,
    provider: "stripe",
    providerClient: provider,
    webhookScope: "test-app",
    products: [SUBSCRIPTION_PRODUCT],
    onAudit,
    ...rest,
  };
  return { deps, db: fake.db, calls: fake.calls, onAudit };
}

const SUBSCRIPTION_PAYLOAD = {
  id: "sub_test_1",
  customer: "cus_test_1",
  status: "active",
  cancel_at_period_end: false,
  cancel_at: null,
  canceled_at: null,
  trial_end: null,
  items: {
    data: [
      {
        price: { id: "price_dev_sub" },
        // Basil API (2025-03-31+) puts the billing period on the item, not the root.
        current_period_start: 1700000000,
        current_period_end: 1702592000,
      },
    ],
  },
  metadata: { product_id: "agenda_pro_monthly" },
};

describe("handleStripeEvent (idempotency)", () => {
  it("returns deduped=true when an existing webhook row is already processed", async () => {
    const { deps } = makeDeps({
      dbConfig: {
        insertQueue: [[]],
        selectQueue: [
          [
            {
              processedAt: new Date("2026-01-01T00:00:00Z"),
              processingStartedAt: null,
              error: null,
              attempts: 0,
            },
          ],
        ],
      },
    });
    const event = {
      id: "evt_dup",
      type: "customer.subscription.created",
      payload: { data: { object: SUBSCRIPTION_PAYLOAD } },
    };
    const out = await handleStripeEvent(deps, event);
    expect(out).toEqual({ processed: false, deduped: true, reason: "already_processed" });
  });

  it("returns deduped=true when an existing webhook row is already being processed", async () => {
    const { deps, onAudit } = makeDeps({
      dbConfig: {
        insertQueue: [[]],
        selectQueue: [
          [
            {
              processedAt: null,
              processingStartedAt: new Date(),
              error: null,
              attempts: 1,
            },
          ],
        ],
      },
    });
    const event = {
      id: "evt_processing",
      type: "customer.subscription.created",
      payload: { data: { object: SUBSCRIPTION_PAYLOAD } },
    };
    const out = await handleStripeEvent(deps, event);
    expect(out).toEqual({ processed: false, deduped: true, reason: "already_processing" });
    expect(onAudit).not.toHaveBeenCalled();
  });

  it("retries an existing webhook row that failed before processedAt was set", async () => {
    const { deps } = makeDeps({
      dbConfig: {
        insertQueue: [
          [], // webhook_events conflict
          [{ id: "sub-row" }], // subscription upsert
        ],
        selectQueue: [
          [
            {
              processedAt: null,
              processingStartedAt: null,
              error: "transient db error",
              attempts: 1,
            },
          ],
          [{ id: "customer-row-1", email: "buyer@example.com" }],
        ],
        updateQueue: [
          [{ id: "wh-row-claim" }], // claim failed webhook for retry
        ],
      },
    });
    const event = {
      id: "evt_retry",
      type: "customer.subscription.created",
      payload: { data: { object: SUBSCRIPTION_PAYLOAD } },
    };
    const out = await handleStripeEvent(deps, event);
    expect(out).toEqual({
      processed: true,
      deduped: false,
      reason: "subscription_upserted",
    });
  });

  it("processes a customer.subscription.created event and dispatches", async () => {
    const { deps, db, onAudit } = makeDeps({
      dbConfig: {
        // 1st insert: webhook_events succeeds
        // 2nd select: customer lookup returns row
        // 3rd insert: subscription upsert succeeds
        // 4th update: webhook_events processedAt
        insertQueue: [
          [{ id: "wh-row-1" }], // webhook_events insert
          [{ id: "sub-row" }], // subscriptions upsert returning (drizzle insert result)
        ],
        selectQueue: [[{ id: "customer-row-1", email: "buyer@example.com" }]],
      },
    });
    const event = {
      id: "evt_test_1",
      type: "customer.subscription.created",
      payload: { data: { object: SUBSCRIPTION_PAYLOAD } },
    };
    const out = await handleStripeEvent(deps, event);
    expect(out.processed).toBe(true);
    expect(out.deduped).toBe(false);
    expect(out.reason).toBe("subscription_upserted");
    // onAudit should fire
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.subscription_created",
        payload: expect.objectContaining({ subscriptionId: "sub_test_1" }),
      }),
    );
    // ensure update for processedAt was called
    expect(db.update).toHaveBeenCalled();
  });

  it("dispatches subscription.deleted as canceled", async () => {
    const { deps, onAudit } = makeDeps({
      dbConfig: {
        insertQueue: [[{ id: "wh-row-1" }], [{ id: "sub-row" }]],
        selectQueue: [[{ id: "customer-row-1", email: "buyer@example.com" }]],
      },
    });
    const event = {
      id: "evt_del_1",
      type: "customer.subscription.deleted",
      payload: {
        data: { object: { ...SUBSCRIPTION_PAYLOAD, status: "active", canceled_at: 1702592000 } },
      },
    };
    await handleStripeEvent(deps, event);
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "billing.subscription_canceled" }),
    );
  });

  it("ignores unknown event types but still inserts webhook_events", async () => {
    const { deps } = makeDeps({
      dbConfig: { insertResult: [{ id: "wh-row-1" }] },
    });
    const event = {
      id: "evt_unknown_1",
      type: "some.unknown.event",
      payload: {},
    };
    const out = await handleStripeEvent(deps, event);
    expect(out.processed).toBe(true);
    expect(out.deduped).toBe(false);
    expect(out.reason).toBe("ignored");
  });

  it("logs handleCheckoutSessionCompleted for mode=subscription without re-upserting", async () => {
    const { deps } = makeDeps({
      dbConfig: { insertResult: [{ id: "wh-row-1" }] },
    });
    const event = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      payload: {
        data: {
          object: {
            id: "cs_test_1",
            mode: "subscription",
            customer: "cus_test_1",
            subscription: "sub_test_1",
            metadata: {},
          },
        },
      },
    };
    const out = await handleStripeEvent(deps, event);
    expect(out.processed).toBe(true);
    expect(out.reason).toBe("checkout.subscription");
  });
});
