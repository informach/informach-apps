import Stripe from "stripe";
import { BillingError } from "../errors";

export type PlanScheduleInput = {
  intentId: string;
  customerId: string;
  subscriptionId: string;
  fromPriceId: string;
  toPriceId: string;
  toProductId: string;
  interval: "month" | "year";
  effectiveAt: Date;
  requestStartedAt: Date;
};
export type PlanScheduleOutcome = "scheduled" | "applied" | "canceled" | "failed";
export interface PlanScheduleProvider {
  create(input: PlanScheduleInput): Promise<string>;
  reconcile(
    input: PlanScheduleInput & { scheduleId: string; cancel: boolean },
  ): Promise<PlanScheduleOutcome>;
}
export const planScheduleKey = (id: string) => `compasso:plan:${id}:create`;
const id = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value && typeof value.id === "string"
      ? value.id
      : undefined;
type Phase = Stripe.SubscriptionSchedule.Phase;
type PhaseInput = Stripe.SubscriptionScheduleUpdateParams.Phase;

/** Keep existing discounts by their discount ID: redeeming the coupon again could reset its term. */
function discounts(
  values: Phase["discounts"],
  existing: Array<string | Stripe.Discount>,
  future?: { startsAt: number; durations: Map<string, Stripe.Coupon.Duration> },
): PhaseInput["discounts"] {
  if (!values?.length) return undefined;
  const result = values.flatMap((value) => {
    const matching = existing.filter(
      (entry): entry is Stripe.Discount =>
        typeof entry !== "string" &&
        (id(value.discount)
          ? entry.id === id(value.discount)
          : value.promotion_code
            ? id(entry.promotion_code) === id(value.promotion_code)
            : !!value.coupon && id(entry.source.coupon) === id(value.coupon)),
    );
    const redemption = matching.length === 1 ? matching[0] : undefined;
    if (!redemption) throw new BillingError("Schedule discount has no existing redemption");
    if (future) {
      const couponId = id(redemption.source.coupon);
      const duration = couponId && future.durations.get(couponId);
      if (!duration) throw new BillingError("Discount duration could not be verified");
      if (duration === "once" || (redemption.end !== null && redemption.end <= future.startsAt))
        return [];
    }
    return [{ discount: redemption.id }];
  });
  return result.length ? result : "";
}
function phaseInput(phase: Phase, sub: Stripe.Subscription): PhaseInput {
  // These configurations are outside the one-seat Compasso checkout contract. Never silently erase them.
  if (
    phase.add_invoice_items.length ||
    phase.application_fee_percent != null ||
    phase.on_behalf_of ||
    phase.transfer_data ||
    phase.billing_thresholds ||
    phase.trial_end ||
    phase.items.length !== 1
  )
    throw new BillingError("Schedule contains unsupported commercial settings");
  const item = phase.items[0];
  if (item?.quantity !== 1 || item.billing_thresholds)
    throw new BillingError("Schedule is not a single fixed-price subscription");
  const price = id(item.price);
  if (!price) throw new BillingError("Schedule price is missing");
  return {
    start_date: phase.start_date,
    end_date: phase.end_date,
    items: [
      {
        price,
        quantity: 1,
        metadata: item.metadata ?? {},
        discounts: discounts(item.discounts, sub.items.data[0]?.discounts ?? []),
        tax_rates: item.tax_rates?.map((rate) => rate.id) ?? [],
      },
    ],
    currency: phase.currency,
    ...(phase.billing_cycle_anchor ? { billing_cycle_anchor: phase.billing_cycle_anchor } : {}),
    ...(phase.collection_method ? { collection_method: phase.collection_method } : {}),
    ...(id(phase.default_payment_method)
      ? { default_payment_method: id(phase.default_payment_method) }
      : {}),
    default_tax_rates: phase.default_tax_rates?.map((rate) => rate.id) ?? [],
    description: phase.description ?? "",
    discounts: discounts(phase.discounts, sub.discounts),
    metadata: phase.metadata ?? {},
    proration_behavior: phase.proration_behavior,
    ...(phase.automatic_tax
      ? {
          automatic_tax: {
            enabled: phase.automatic_tax.enabled,
            ...(phase.automatic_tax.liability
              ? {
                  liability: {
                    type: phase.automatic_tax.liability.type,
                    account: id(phase.automatic_tax.liability.account),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(phase.invoice_settings
      ? {
          invoice_settings: {
            account_tax_ids: phase.invoice_settings.account_tax_ids?.map(
              (tax) => id(tax) as string,
            ),
            days_until_due: phase.invoice_settings.days_until_due ?? undefined,
            ...(phase.invoice_settings.issuer
              ? {
                  issuer: {
                    type: phase.invoice_settings.issuer.type,
                    account: id(phase.invoice_settings.issuer.account),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

export function createStripePlanSchedules(config: {
  secretKey: string;
  client?: Stripe;
  now?: () => Date;
}): PlanScheduleProvider {
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 30_000,
      maxNetworkRetries: 2,
      appInfo: { name: "informach-platform/compasso-plans" },
    });
  const now = () => (config.now?.() ?? new Date()).getTime();
  async function subscription(input: PlanScheduleInput) {
    const sub = await stripe.subscriptions.retrieve(input.subscriptionId, {
      expand: ["discounts", "items.data.discounts"],
    });
    if (
      id(sub.customer) !== input.customerId ||
      sub.items.has_more ||
      sub.items.data.length !== 1 ||
      sub.items.data[0]?.quantity !== 1
    )
      throw new BillingError("Plan change subscription scope is invalid");
    return sub;
  }
  function validateSchedule(schedule: Stripe.SubscriptionSchedule, input: PlanScheduleInput) {
    if (
      id(schedule.customer) !== input.customerId ||
      ![id(schedule.subscription), id(schedule.released_subscription)].includes(
        input.subscriptionId,
      ) ||
      (schedule.metadata?.compasso_plan_intent &&
        schedule.metadata.compasso_plan_intent !== input.intentId)
    )
      throw new BillingError("Plan change schedule belongs to another request");
  }
  async function release(schedule: Stripe.SubscriptionSchedule) {
    if (schedule.status === "active" || schedule.status === "not_started")
      await stripe.subscriptionSchedules.release(schedule.id, { preserve_cancel_date: true });
  }
  return {
    async create(input) {
      const sub = await subscription(input);
      const attached = id(sub.schedule);
      if (attached) {
        const schedule = await stripe.subscriptionSchedules.retrieve(attached);
        validateSchedule(schedule, input);
        if (schedule.metadata?.compasso_plan_intent === input.intentId) return schedule.id;
      }
      // Recover the exact request, including a schedule released before our response arrived.
      // A customer/similar phase alone is not evidence that this request created the schedule.
      let count = 0;
      for await (const event of stripe.events.list({
        type: "subscription_schedule.created",
        limit: 100,
        created: { gte: Math.floor(input.requestStartedAt.getTime() / 1000) - 60 },
      })) {
        if (++count > 1000)
          throw new BillingError("Schedule recovery event history exceeded its bound");
        if (event.request?.idempotency_key !== planScheduleKey(input.intentId)) continue;
        const scheduleId = id(event.data.object);
        if (!scheduleId) throw new BillingError("Schedule recovery event has no resource identity");
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        validateSchedule(schedule, input);
        return schedule.id;
      }
      // Never recreate an uncertain request after Stripe's minimum idempotency retention.
      if (now() - input.requestStartedAt.getTime() >= 23 * 60 * 60 * 1000)
        throw new BillingError(
          "Schedule creation needs reconciliation; idempotency window elapsed",
        );
      const item = sub.items.data[0];
      if (
        !attached &&
        (sub.status !== "active" ||
          sub.cancel_at_period_end ||
          sub.cancel_at ||
          sub.pending_update ||
          sub.pause_collection ||
          item?.price.id !== input.fromPriceId ||
          item.current_period_end * 1000 !== input.effectiveAt.getTime() ||
          input.effectiveAt.getTime() <= now() + 60_000)
      )
        throw new BillingError("The paid subscription changed before scheduling");
      const schedule = await stripe.subscriptionSchedules.create(
        { from_subscription: input.subscriptionId },
        { idempotencyKey: planScheduleKey(input.intentId) },
      );
      validateSchedule(schedule, input);
      return schedule.id;
    },
    async reconcile(input) {
      let schedule = await stripe.subscriptionSchedules.retrieve(input.scheduleId);
      validateSchedule(schedule, input);
      const sub = await subscription(input);
      const item = sub.items.data[0];
      const applied =
        item?.price.id === input.toPriceId &&
        item.current_period_start * 1000 >= input.effectiveAt.getTime();
      if (applied) {
        if (schedule.metadata?.compasso_plan_intent !== input.intentId)
          throw new BillingError("Changed price has no matching schedule receipt");
        // Keep the new price; remove the completed scheduling envelope so future changes are possible.
        await release(schedule);
        return "applied";
      }
      if (
        ["canceled", "incomplete_expired"].includes(sub.status) ||
        ["released", "canceled", "completed"].includes(schedule.status)
      )
        return "canceled";
      if (id(sub.schedule) !== schedule.id) throw new BillingError("Subscription schedule changed");
      if (input.cancel || sub.cancel_at_period_end || sub.cancel_at) {
        await release(schedule);
        return "canceled";
      }
      const end = Math.floor(input.effectiveAt.getTime() / 1000);
      const configured = schedule.metadata?.compasso_plan_intent === input.intentId;
      if (configured) {
        const future = schedule.phases.find((phase) => phase.start_date === end);
        if (
          item?.price.id !== input.fromPriceId ||
          item.current_period_end !== end ||
          !future ||
          future.items.length !== 1 ||
          id(future.items[0]?.price) !== input.toPriceId ||
          future.items[0]?.quantity !== 1 ||
          future.proration_behavior !== "none" ||
          schedule.end_behavior !== "release"
        )
          throw new BillingError("Scheduled plan drifted from the accepted change");
        return "scheduled";
      }
      if (input.effectiveAt.getTime() <= now() + 60_000 || item?.current_period_end !== end) {
        await release(schedule);
        return "failed"; // Never apply a late request to a new paid period.
      }
      const current = schedule.phases[0];
      if (
        !current ||
        schedule.phases.length !== 1 ||
        schedule.status !== "active" ||
        current.end_date !== end ||
        id(current.items[0]?.price) !== input.fromPriceId ||
        item.price.id !== input.fromPriceId
      )
        throw new BillingError("Unconfigured schedule no longer matches the original period");
      const preserved = phaseInput(current, sub);
      const durations = new Map<string, Stripe.Coupon.Duration>();
      for (const redemption of [...sub.discounts, ...(item.discounts ?? [])]) {
        if (typeof redemption === "string") throw new BillingError("Discount expansion is missing");
        const couponId = id(redemption.source.coupon);
        if (!couponId) throw new BillingError("Discount coupon is missing");
        if (!durations.has(couponId)) {
          const coupon =
            typeof redemption.source.coupon === "object" && redemption.source.coupon
              ? redemption.source.coupon
              : await stripe.coupons.retrieve(couponId);
          durations.set(couponId, coupon.duration);
        }
      }
      const futureDiscounts = { startsAt: end, durations };
      const { end_date: _end, ...next } = preserved;
      schedule = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        proration_behavior: "none",
        metadata: { compasso_plan_intent: input.intentId },
        phases: [
          preserved,
          {
            ...next,
            start_date: end,
            duration: { interval: input.interval, interval_count: 1 },
            billing_cycle_anchor: "phase_start",
            proration_behavior: "none",
            discounts: discounts(current.discounts, sub.discounts, futureDiscounts),
            items: [
              {
                ...preserved.items[0],
                price: input.toPriceId,
                quantity: 1,
                discounts: discounts(
                  current.items[0]?.discounts ?? [],
                  item.discounts,
                  futureDiscounts,
                ),
              },
            ],
            metadata: { ...current.metadata, product_id: input.toProductId },
          },
        ],
      });
      validateSchedule(schedule, input);
      const future = schedule.phases.find((phase) => phase.start_date === end);
      if (
        schedule.metadata?.compasso_plan_intent !== input.intentId ||
        id(future?.items[0]?.price) !== input.toPriceId ||
        schedule.end_behavior !== "release"
      )
        throw new BillingError("Provider did not confirm the scheduled plan");
      return "scheduled";
    },
  };
}
