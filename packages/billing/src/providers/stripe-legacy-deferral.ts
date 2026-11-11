import Stripe from "stripe";
import { BillingError } from "../errors";
import { createStripePaymentFactReader } from "../payment-facts";

type DeferralInput = {
  intentId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  interval: "month" | "year";
  amountCents: number;
  expectedPeriodEnd: number;
  deferUntil: number;
};
const objectId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : (value?.id ?? null);

/** The deferral is in force, but a positive invoice appeared for the deferred
 * period. The caller must hold the coordination for financial review. */
export class LegacyDeferralChargeError extends BillingError {
  override name = "LegacyDeferralChargeError";
}

/** Stripe boundary only. Callers must obtain both payers' consent, serialize
 * the family's billing and persist a recoverable intent before invoking it. */
export function createStripeLegacyDeferralProvider(config: {
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
  const reader = createStripePaymentFactReader({ secretKey: config.secretKey, client: stripe });
  const live = config.mode === "prod";
  const marker = "compasso_legacy_deferral";
  async function inspect(input: DeferralInput) {
    if (
      !input.intentId ||
      !Number.isSafeInteger(input.expectedPeriodEnd) ||
      !Number.isSafeInteger(input.deferUntil) ||
      input.deferUntil <= input.expectedPeriodEnd ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0
    )
      throw new BillingError("Invalid existing subscription deferral terms");
    const [sub, price, facts] = await Promise.all([
      stripe.subscriptions.retrieve(input.subscriptionId),
      stripe.prices.retrieve(input.priceId),
      reader.read(input.subscriptionId, new Set([input.priceId])),
    ]);
    const item = sub.items.data[0];
    if (
      sub.livemode !== live ||
      objectId(sub.customer) !== input.customerId ||
      sub.items.data.length !== 1 ||
      item?.price.id !== input.priceId ||
      sub.collection_method !== "charge_automatically" ||
      sub.cancel_at_period_end ||
      sub.cancel_at !== null ||
      sub.schedule !== null ||
      sub.pending_update !== null ||
      sub.pause_collection !== null ||
      price.livemode !== live ||
      price.type !== "recurring" ||
      price.billing_scheme !== "per_unit" ||
      price.currency !== "brl" ||
      price.unit_amount !== input.amountCents ||
      price.recurring?.interval !== input.interval ||
      price.recurring.interval_count !== 1 ||
      !facts ||
      facts.customerId !== input.customerId ||
      facts.subscriptionId !== input.subscriptionId ||
      !facts.periods.some(
        (period) =>
          period.priceId === input.priceId &&
          period.end.getTime() === input.expectedPeriodEnd * 1000 &&
          !period.fullyRefunded &&
          !period.disputed,
      )
    )
      throw new BillingError("Existing subscription facts conflict with the accepted deferral");
    return { sub, item };
  }
  async function outstanding(input: DeferralInput) {
    for (const status of ["open", "draft"] as const) {
      const invoices = await stripe.invoices.list({
        subscription: input.subscriptionId,
        status,
        limit: 100,
      });
      if (invoices.has_more || invoices.data.length)
        throw new BillingError("Existing subscription has an invoice requiring reconciliation");
    }
  }
  const isDeferred = (
    sub: Stripe.Subscription,
    item: Stripe.SubscriptionItem,
    input: DeferralInput,
  ) =>
    sub.status === "trialing" &&
    sub.trial_end === input.deferUntil &&
    item.current_period_end === input.deferUntil &&
    sub.metadata[marker] === input.intentId;
  return {
    /** Read-only. Tells a recovering caller whether the accepted deferral is
     * already in force, was never applied, or contradicts the provider. */
    async classify(input: DeferralInput) {
      const sub = await stripe.subscriptions.retrieve(input.subscriptionId);
      const item = sub.items.data[0];
      if (
        sub.livemode !== live ||
        objectId(sub.customer) !== input.customerId ||
        sub.items.data.length !== 1 ||
        !item ||
        item.price.id !== input.priceId
      )
        return "conflict" as const;
      if (isDeferred(sub, item, input)) return "deferred" as const;
      if (
        sub.status === "active" &&
        !sub.metadata[marker] &&
        (sub.trial_end === null || sub.trial_end <= Math.floor(Date.now() / 1000)) &&
        item.current_period_end === input.expectedPeriodEnd
      )
        return "not_deferred" as const;
      return "conflict" as const;
    },
    async defer(input: DeferralInput) {
      const { sub, item } = await inspect(input);
      if (isDeferred(sub, item, input))
        return { status: "deferred" as const, until: input.deferUntil };
      const now = Math.floor(Date.now() / 1000);
      // Stripe drafts the renewal invoice around the period boundary. Leaving
      // this margin keeps the payer from paying the new period and also being
      // put on trial; Stripe also rejects a trial end beyond two years.
      if (
        sub.status !== "active" ||
        (sub.trial_end !== null && sub.trial_end > now) ||
        sub.metadata[marker] ||
        item.current_period_end !== input.expectedPeriodEnd ||
        input.expectedPeriodEnd <= now + 900 ||
        input.deferUntil > now + 730 * 86_400
      )
        throw new BillingError("Existing subscription changed before deferral");
      await outstanding(input);
      const updated = await stripe.subscriptions.update(
        input.subscriptionId,
        {
          trial_end: input.deferUntil,
          proration_behavior: "none",
          metadata: { [marker]: input.intentId },
        },
        { idempotencyKey: `compasso:legacy-deferral:${input.intentId}` },
      );
      if (
        updated.livemode !== live ||
        updated.status !== "trialing" ||
        updated.trial_end !== input.deferUntil ||
        objectId(updated.customer) !== input.customerId ||
        updated.metadata[marker] !== input.intentId ||
        updated.items.data.length !== 1 ||
        updated.items.data[0]?.price.id !== input.priceId ||
        updated.items.data[0]?.current_period_end !== input.deferUntil
      )
        throw new BillingError("Provider did not confirm the accepted deferral");
      // An invoice drafted while the update was in flight would charge the
      // period that was just deferred; the caller must send it to review. The
      // zero-value invoice Stripe issues for the trial itself is not a charge.
      for (const status of ["open", "draft"] as const) {
        const invoices = await stripe.invoices.list({
          subscription: input.subscriptionId,
          status,
          limit: 100,
        });
        if (invoices.has_more || invoices.data.some((invoice) => invoice.amount_due > 0))
          throw new LegacyDeferralChargeError(
            "Deferred subscription has a charge requiring reconciliation",
          );
      }
      return { status: "deferred" as const, until: input.deferUntil };
    },
  };
}
