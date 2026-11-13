import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  createStripePlanSchedules,
  type PlanScheduleInput,
  planScheduleKey,
} from "../providers/stripe-plans";

function fixture() {
  let clock = new Date("2026-11-09T12:00:00Z");
  const input: PlanScheduleInput = {
    intentId: "5db21749-7d86-48c6-8532-1c4f13aca658",
    customerId: "cus_payer",
    subscriptionId: "sub_paid",
    fromPriceId: "price_month",
    toPriceId: "price_year",
    toProductId: "compasso_annual",
    interval: "year",
    effectiveAt: new Date("2026-12-09T12:00:00Z"),
    requestStartedAt: clock,
  };
  const start = clock.getTime() / 1000;
  const end = input.effectiveAt.getTime() / 1000;
  const phase = {
    start_date: start,
    end_date: end,
    items: [
      {
        price: "price_month",
        quantity: 1,
        metadata: { preserved: "item" },
        discounts: [],
        tax_rates: [{ id: "txr_original" }],
        billing_thresholds: null,
      },
    ],
    add_invoice_items: [],
    application_fee_percent: null,
    on_behalf_of: null,
    transfer_data: null,
    billing_thresholds: null,
    trial_end: null,
    currency: "brl",
    billing_cycle_anchor: null,
    collection_method: "charge_automatically",
    default_payment_method: "pm_original",
    default_tax_rates: [{ id: "txr_original" }],
    description: "Original contract",
    discounts: [],
    metadata: { retained: "yes" },
    proration_behavior: "create_prorations",
    invoice_settings: null,
  } as unknown as Stripe.SubscriptionSchedule.Phase;
  const sub = {
    id: "sub_paid",
    customer: "cus_payer",
    schedule: null,
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    pause_collection: null,
    discounts: [],
    items: {
      has_more: false,
      data: [
        {
          id: "si_original",
          price: { id: "price_month" },
          quantity: 1,
          current_period_start: start,
          current_period_end: end,
          discounts: [],
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  const schedule = {
    id: "sub_sched_owned",
    customer: "cus_payer",
    subscription: "sub_paid",
    released_subscription: null,
    status: "active",
    metadata: {},
    phases: [phase],
    end_behavior: "release",
  } as unknown as Stripe.SubscriptionSchedule;
  const events: { request: { idempotency_key: string }; data: { object: { id: string } } }[] = [];
  const writes: Stripe.SubscriptionScheduleUpdateParams[] = [];
  const releases: unknown[] = [];
  let creates = 0;
  let loseCreate = false;
  let loseUpdate = false;
  let loseRelease = false;
  const api = {
    subscriptions: { retrieve: async () => structuredClone(sub) },
    events: {
      list: () =>
        (async function* () {
          yield* events;
        })(),
    },
    subscriptionSchedules: {
      retrieve: async () => structuredClone(schedule),
      create: async (_params: unknown, options: { idempotencyKey: string }) => {
        if (!creates) {
          creates++;
          sub.schedule = schedule.id;
          events.push({
            request: { idempotency_key: options.idempotencyKey },
            data: { object: { id: schedule.id } },
          });
        }
        if (loseCreate) {
          loseCreate = false;
          throw new Error("Lost creation response");
        }
        return structuredClone(schedule);
      },
      update: async (_id: string, params: Stripe.SubscriptionScheduleUpdateParams) => {
        writes.push(structuredClone(params));
        schedule.metadata = params.metadata as Stripe.Metadata;
        schedule.phases = params.phases as unknown as Stripe.SubscriptionSchedule.Phase[];
        if (loseUpdate) {
          loseUpdate = false;
          throw new Error("Lost update response");
        }
        return structuredClone(schedule);
      },
      release: async (_id: string, params: unknown) => {
        releases.push(params);
        schedule.status = "released";
        schedule.subscription = null;
        schedule.released_subscription = sub.id;
        sub.schedule = null;
        if (loseRelease) {
          loseRelease = false;
          throw new Error("Lost release response");
        }
        return structuredClone(schedule);
      },
    },
  };
  const adapter = createStripePlanSchedules({
    secretKey: "unused",
    client: api as unknown as Stripe,
    now: () => clock,
  });
  return {
    input,
    sub,
    schedule,
    phase,
    events,
    writes,
    releases,
    adapter,
    creates: () => creates,
    setNow: (date: Date) => {
      clock = date;
    },
    lose: (operation: "create" | "update" | "release") => {
      if (operation === "create") loseCreate = true;
      if (operation === "update") loseUpdate = true;
      if (operation === "release") loseRelease = true;
    },
    reconcile: (cancel = false) => adapter.reconcile({ ...input, scheduleId: schedule.id, cancel }),
  };
}

describe("Stripe native plan scheduling boundary", () => {
  it("recovers lost creation and update responses while preserving current settings and charging only in the future", async () => {
    const f = fixture();
    f.lose("create");
    await expect(f.adapter.create(f.input)).rejects.toThrow("Lost creation");
    expect(await f.adapter.create(f.input)).toBe(f.schedule.id);
    expect(f.creates()).toBe(1);
    f.lose("update");
    await expect(f.reconcile()).rejects.toThrow("Lost update");
    expect(await f.reconcile()).toBe("scheduled");
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          start_date: f.phase.start_date,
          end_date: f.phase.end_date,
          default_payment_method: "pm_original",
          default_tax_rates: ["txr_original"],
          metadata: { retained: "yes" },
          items: [{ price: "price_month", quantity: 1, metadata: { preserved: "item" } }],
        },
        {
          start_date: f.phase.end_date,
          duration: { interval: "year", interval_count: 1 },
          billing_cycle_anchor: "phase_start",
          proration_behavior: "none",
          items: [{ price: "price_year", quantity: 1 }],
        },
      ],
    });
    expect(f.sub.items.data[0]?.price.id).toBe("price_month");
  });

  it("never adopts another request's schedule or touches another customer's subscription", async () => {
    const f = fixture();
    f.sub.schedule = f.schedule.id;
    f.schedule.metadata = { compasso_plan_intent: "foreign" };
    await expect(f.adapter.create(f.input)).rejects.toThrow("another request");
    expect(f.creates()).toBe(0);
    f.schedule.metadata = {};
    f.schedule.customer = "cus_foreign";
    await expect(f.reconcile()).rejects.toThrow("another request");
    f.sub.customer = "cus_foreign";
    await expect(f.adapter.create(f.input)).rejects.toThrow("scope");
    expect(f.writes).toHaveLength(0);
    expect(f.releases).toHaveLength(0);
  });

  it("refuses an uncertain creation after retention but can recover the exact request from event history", async () => {
    const f = fixture();
    f.setNow(new Date(f.input.requestStartedAt.getTime() + 24 * 3600_000));
    await expect(f.adapter.create(f.input)).rejects.toThrow("idempotency window elapsed");
    expect(f.creates()).toBe(0);
    f.events.push({
      request: { idempotency_key: planScheduleKey(f.input.intentId) },
      data: { object: { id: f.schedule.id } },
    });
    expect(await f.adapter.create(f.input)).toBe(f.schedule.id);
    expect(f.creates()).toBe(0);
  });

  it("does not apply a delayed request to a newly started period", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    f.setNow(new Date(f.input.effectiveAt.getTime() + 1000));
    expect(await f.reconcile()).toBe("failed");
    expect(f.writes).toHaveLength(0);
    expect(f.releases).toEqual([{ preserve_cancel_date: true }]);
    expect(f.sub.items.data[0]?.price.id).toBe("price_month");
  });

  it("recovers a lost undo response without canceling or reconfiguring the subscription", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    await f.reconcile();
    f.lose("release");
    await expect(f.reconcile(true)).rejects.toThrow("Lost release");
    expect(await f.reconcile(true)).toBe("canceled");
    expect(f.releases).toHaveLength(1);
    expect(f.sub.status).toBe("active");
    expect(f.sub.items.data[0]?.price.id).toBe("price_month");
  });

  it("rejects drift instead of overwriting a modified schedule", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    await f.reconcile();
    const future = f.schedule.phases[1];
    if (!future?.items[0]) throw new Error("Missing phase");
    future.items[0].price = "price_foreign";
    await expect(f.reconcile()).rejects.toThrow("drifted");
    expect(f.writes).toHaveLength(1);
  });

  it.each(["once", "repeating"] as const)(
    "does not extend a %s discount into a phase where it is no longer valid",
    async (duration) => {
      const f = fixture();
      const coupon = { id: "coupon_original", duration } as Stripe.Coupon;
      const redemption = {
        id: "di_original",
        source: { type: "coupon", coupon },
        end: duration === "once" ? null : f.phase.end_date - 1,
      } as Stripe.Discount;
      f.sub.discounts = [redemption];
      f.phase.discounts = [{ coupon: coupon.id, discount: null, promotion_code: null }];
      await f.adapter.create(f.input);
      await f.reconcile();
      expect(f.writes[0]?.phases?.[0]?.discounts).toEqual([{ discount: "di_original" }]);
      expect(f.writes[0]?.phases?.[1]?.discounts).toBe("");
    },
  );

  it("releases the scheduling envelope after the native transition while keeping the new price", async () => {
    const f = fixture();
    await f.adapter.create(f.input);
    await f.reconcile();
    const item = f.sub.items.data[0];
    if (!item) throw new Error("Missing item");
    item.price.id = "price_year";
    item.current_period_start = f.phase.end_date;
    expect(await f.reconcile()).toBe("applied");
    expect(f.sub.schedule).toBeNull();
    expect(item.price.id).toBe("price_year");
    expect(await f.reconcile()).toBe("applied");
    expect(f.releases).toHaveLength(1);
  });
});
