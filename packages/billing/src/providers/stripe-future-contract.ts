import Stripe from "stripe";
import { BillingError } from "../errors";

type SetupInput = {
  intentId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
};
type FutureInput = {
  intentId: string;
  customerId: string;
  paymentMethodId: string;
  priceId: string;
  interval: "month" | "year";
  startsAt: number;
  paidThroughMs: number;
  amountCents: number;
};
const objectId = (value: unknown): string | null =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value && typeof value.id === "string"
      ? value.id
      : null;

/** Stripe adapter only. The domain must authorize the payer, fix the commercial
 * terms and serialize competing purchases before calling it. */
export function createStripeFutureContractProvider(config: {
  secretKey: string;
  mode: "dev" | "prod";
  client?: Stripe;
}) {
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 30_000,
      maxNetworkRetries: 2,
    });
  const live = config.mode === "prod";
  function verifySession(session: Stripe.Checkout.Session, input: SetupInput) {
    if (
      session.livemode !== live ||
      session.mode !== "setup" ||
      objectId(session.customer) !== input.customerId ||
      session.metadata?.compasso_future_intent !== input.intentId ||
      session.expires_at !== input.expiresAt ||
      session.success_url !== input.successUrl ||
      session.cancel_url !== input.cancelUrl
    )
      throw new BillingError("Setup session conflicts with its commercial intent");
    return session;
  }
  async function findSetup(input: SetupInput) {
    let found: Stripe.Checkout.Session | undefined;
    let count = 0;
    for await (const session of stripe.checkout.sessions.list({
      customer: input.customerId,
      limit: 100,
    })) {
      if (++count > 2000) throw new BillingError("Setup history requires review");
      if (session.metadata?.compasso_future_intent !== input.intentId) continue;
      if (found) throw new BillingError("Multiple setup sessions require review");
      found = verifySession(session, input);
    }
    return found ?? null;
  }
  function verifySchedule(
    schedule: Stripe.SubscriptionSchedule,
    input: FutureInput,
    alternativeStart?: number,
  ) {
    const phase = schedule.phases[0];
    if (
      schedule.livemode !== live ||
      objectId(schedule.customer) !== input.customerId ||
      schedule.metadata?.compasso_future_intent !== input.intentId ||
      schedule.end_behavior !== "release" ||
      schedule.phases.length !== 1 ||
      (phase?.start_date !== input.startsAt && phase?.start_date !== alternativeStart) ||
      phase === undefined ||
      phase.items.length !== 1 ||
      phase.items[0]?.quantity !== 1 ||
      objectId(phase.items[0]?.price) !== input.priceId ||
      schedule.default_settings.automatic_tax?.enabled !== false ||
      objectId(schedule.default_settings.default_payment_method) !== input.paymentMethodId
    )
      throw new BillingError("Existing schedule conflicts with the accepted terms");
    return schedule;
  }
  function validateFuture(input: FutureInput) {
    if (
      !Number.isSafeInteger(input.startsAt) ||
      !Number.isSafeInteger(input.startsAt * 1000) ||
      !Number.isSafeInteger(input.paidThroughMs) ||
      input.startsAt * 1000 < input.paidThroughMs ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0
    )
      throw new BillingError("Invalid future subscription terms");
  }
  async function findSchedule(input: FutureInput) {
    validateFuture(input);
    let existing: Stripe.SubscriptionSchedule | undefined;
    let count = 0;
    for await (const schedule of stripe.subscriptionSchedules.list({
      customer: input.customerId,
      limit: 100,
    })) {
      if (++count > 2000) throw new BillingError("Schedule history requires review");
      if (schedule.metadata?.compasso_future_intent !== input.intentId) continue;
      if (existing) throw new BillingError("Multiple schedules require review");
      existing = verifySchedule(schedule, input);
    }
    if (!existing) return null;
    const price = await stripe.prices.retrieve(input.priceId);
    if (
      price.livemode !== live ||
      price.type !== "recurring" ||
      price.billing_scheme !== "per_unit" ||
      price.currency !== "brl" ||
      price.unit_amount !== input.amountCents ||
      price.recurring?.interval !== input.interval ||
      price.recurring.interval_count !== 1
    )
      throw new BillingError("Existing schedule price conflicts with the accepted terms");
    return { id: existing.id, status: existing.status };
  }
  return {
    findSchedule,
    async findSetupSession(input: SetupInput) {
      const session = await findSetup(input);
      return session ? { id: session.id, status: session.status } : null;
    },
    async readSchedule(input: FutureInput, scheduleId: string) {
      validateFuture(input);
      const schedule = verifySchedule(
        await stripe.subscriptionSchedules.retrieve(scheduleId),
        input,
      );
      if (schedule.id !== scheduleId) throw new BillingError("Future schedule identity conflicts");
      return {
        id: schedule.id,
        status: schedule.status,
        subscriptionId: objectId(schedule.subscription) ?? schedule.released_subscription ?? null,
      };
    },
    async setup(input: SetupInput) {
      const existing = await findSetup(input);
      if (existing) return { id: existing.id, status: existing.status, url: existing.url };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "setup",
          customer: input.customerId,
          payment_method_types: ["card"],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: input.expiresAt,
          metadata: { compasso_future_intent: input.intentId },
          setup_intent_data: { metadata: { compasso_future_intent: input.intentId } },
        },
        { idempotencyKey: `compasso:future:${input.intentId}:setup` },
      );
      verifySession(session, input);
      if (!session.url) throw new BillingError("Setup session has no hosted URL");
      return { id: session.id, status: session.status, url: session.url };
    },
    async readSetup(input: SetupInput, sessionId: string) {
      const session = verifySession(await stripe.checkout.sessions.retrieve(sessionId), input);
      if (session.status !== "complete") return { status: session.status, paymentMethodId: null };
      const setupId = objectId(session.setup_intent);
      if (!setupId) throw new BillingError("Completed setup has no setup intent");
      const setup = await stripe.setupIntents.retrieve(setupId);
      if (
        setup.livemode !== live ||
        setup.status !== "succeeded" ||
        setup.usage !== "off_session" ||
        objectId(setup.customer) !== input.customerId ||
        setup.metadata?.compasso_future_intent !== input.intentId
      )
        throw new BillingError("Setup authorization is incomplete or belongs to another intent");
      const methodId = objectId(setup.payment_method);
      if (!methodId) throw new BillingError("Setup authorization has no payment method");
      const method = await stripe.paymentMethods.retrieve(methodId);
      if (method.livemode !== live || objectId(method.customer) !== input.customerId)
        throw new BillingError("Payment method belongs to another customer");
      return { status: "complete" as const, paymentMethodId: methodId };
    },
    async expireSetup(input: SetupInput, sessionId: string) {
      const current = verifySession(await stripe.checkout.sessions.retrieve(sessionId), input);
      if (current.status !== "open") return { id: current.id, status: current.status };
      const expired = verifySession(await stripe.checkout.sessions.expire(sessionId), input);
      if (expired.status !== "expired")
        throw new BillingError("Setup session expiration was not confirmed");
      return { id: expired.id, status: expired.status };
    },
    async schedule(input: FutureInput) {
      const existing = await findSchedule(input);
      if (existing) return existing;
      if (input.startsAt < Math.floor(Date.now() / 1000) + 300)
        throw new BillingError("Future subscription start is too close to schedule safely");
      const [method, price] = await Promise.all([
        stripe.paymentMethods.retrieve(input.paymentMethodId),
        stripe.prices.retrieve(input.priceId),
      ]);
      if (
        method.livemode !== live ||
        objectId(method.customer) !== input.customerId ||
        price.livemode !== live ||
        !price.active ||
        price.type !== "recurring" ||
        price.billing_scheme !== "per_unit" ||
        price.currency !== "brl" ||
        price.unit_amount !== input.amountCents ||
        price.recurring?.interval !== input.interval ||
        price.recurring.interval_count !== 1
      )
        throw new BillingError("Future payment method or price conflicts with the accepted terms");
      const schedule = await stripe.subscriptionSchedules.create(
        {
          customer: input.customerId,
          start_date: input.startsAt,
          end_behavior: "release",
          default_settings: {
            default_payment_method: input.paymentMethodId,
            collection_method: "charge_automatically",
            automatic_tax: { enabled: false },
          },
          phases: [
            {
              items: [{ price: input.priceId, quantity: 1 }],
              duration: { interval: input.interval, interval_count: 1 },
              proration_behavior: "none",
              metadata: { compasso_future_intent: input.intentId },
            },
          ],
          metadata: { compasso_future_intent: input.intentId },
        },
        { idempotencyKey: `compasso:future:${input.intentId}:schedule` },
      );
      verifySchedule(schedule, input);
      return { id: schedule.id, status: schedule.status };
    },
    /** Moves the first charge of a schedule that has not started to a later
     * date, in place. `input` carries the terms currently recorded for the
     * intent; the schedule is never canceled and recreated, so there is no
     * window without a schedule and a started subscription cannot be canceled
     * by a late request. A lost response is recognized by the new start date
     * together with the coordination marker. */
    async moveScheduleStart(
      input: FutureInput,
      move: { scheduleId: string; coordinationId: string; newStartsAt: number },
    ) {
      validateFuture(input);
      if (
        !move.coordinationId ||
        !Number.isSafeInteger(move.newStartsAt) ||
        move.newStartsAt <= input.startsAt
      )
        throw new BillingError("Invalid future schedule move");
      const marker = "compasso_future_coordination";
      const current = verifySchedule(
        await stripe.subscriptionSchedules.retrieve(move.scheduleId),
        input,
        move.newStartsAt,
      );
      if (current.id !== move.scheduleId)
        throw new BillingError("Future schedule identity conflicts");
      if (current.status !== "not_started")
        return { id: current.id, status: current.status, moved: false };
      const start = current.phases[0]?.start_date;
      if (start === move.newStartsAt) {
        if (current.metadata?.[marker] !== move.coordinationId)
          throw new BillingError("Future schedule was moved by another coordination");
        return { id: current.id, status: current.status, moved: true };
      }
      if (current.metadata?.[marker])
        throw new BillingError("Future schedule already carries another coordination");
      if (input.startsAt < Math.floor(Date.now() / 1000) + 900)
        throw new BillingError("Future subscription start is too close to move safely");
      const updated = await stripe.subscriptionSchedules.update(
        move.scheduleId,
        {
          end_behavior: "release",
          proration_behavior: "none",
          phases: [
            {
              start_date: move.newStartsAt,
              items: [{ price: input.priceId, quantity: 1 }],
              duration: { interval: input.interval, interval_count: 1 },
              proration_behavior: "none",
              metadata: { compasso_future_intent: input.intentId },
            },
          ],
          metadata: { compasso_future_intent: input.intentId, [marker]: move.coordinationId },
        },
        {
          idempotencyKey: `compasso:future:${input.intentId}:move:${move.coordinationId}`,
        },
      );
      verifySchedule(updated, { ...input, startsAt: move.newStartsAt });
      if (
        updated.id !== move.scheduleId ||
        updated.status !== "not_started" ||
        updated.metadata?.[marker] !== move.coordinationId
      )
        throw new BillingError("Provider did not confirm the future schedule move");
      return { id: updated.id, status: updated.status, moved: true };
    },
    async cancelSchedule(input: FutureInput, scheduleId: string) {
      const current = verifySchedule(
        await stripe.subscriptionSchedules.retrieve(scheduleId),
        input,
      );
      if (current.status === "canceled") return { id: current.id, status: current.status };
      if (current.status !== "not_started")
        throw new BillingError("Started subscription must use the normal cancellation flow");
      const canceled = verifySchedule(
        await stripe.subscriptionSchedules.cancel(scheduleId, {
          invoice_now: false,
          prorate: false,
        }),
        input,
      );
      if (canceled.status !== "canceled")
        throw new BillingError("Future cancellation was not confirmed");
      return { id: canceled.id, status: canceled.status };
    },
  };
}
