import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import Stripe from "stripe";
import { BillingError } from "../errors";
import type { PaymentReadBudget } from "../payment-facts";

/** Persisted native consent, assembled by the server. Never browser input. */
export type RecreioRenewalScope = {
  intentId: string;
  customerId: string;
  subscriptionId: string;
  origin: { authorizationId: string; productId: string; payerId: string };
  budget?: PaymentReadBudget;
};
export type RecreioRenewalObservation = {
  outcome: "scheduled" | "terminal";
  stopsAt: Date | null;
  sha256: string;
};
type VerifiedObservation = Readonly<{
  outcome: RecreioRenewalObservation["outcome"];
  stopsAtMs: number | null;
  sha256: string;
}>;
const verified = new WeakMap<
  RecreioRenewalObservation,
  { scope: string; expiresAt: number; snapshot: VerifiedObservation }
>();
function scopeKey(input: RecreioRenewalScope, mode: "dev" | "prod") {
  return JSON.stringify([
    mode,
    input.intentId,
    input.customerId,
    input.subscriptionId,
    input.origin.authorizationId,
    input.origin.productId,
    input.origin.payerId,
  ]);
}

/** Only observations emitted in this process by the SDK adapter can confirm a
 * receipt. The returned primitives remain safe across subsequent awaits, even
 * if a caller changes the Date carried by the public observation. */
export function assertRecreioRenewalObservation(
  observation: RecreioRenewalObservation,
  input: RecreioRenewalScope,
  mode: "dev" | "prod",
): VerifiedObservation {
  const proof = verified.get(observation);
  if (
    !proof ||
    performance.now() >= proof.expiresAt ||
    proof.scope !== scopeKey(input, mode) ||
    observation.outcome !== proof.snapshot.outcome ||
    observation.sha256 !== proof.snapshot.sha256 ||
    (observation.stopsAt === null
      ? proof.snapshot.stopsAtMs !== null
      : Date.prototype.getTime.call(observation.stopsAt) !== proof.snapshot.stopsAtMs)
  )
    review("invalid_evidence");
  return proof.snapshot;
}
export type RecreioRenewalReviewCode =
  | "provider_unavailable"
  | "scope_changed"
  | "foreign_contract"
  | "namespace_mismatch"
  | "invalid_evidence";
export class RecreioRenewalReviewError extends BillingError {
  constructor(readonly code: RecreioRenewalReviewCode) {
    super("Renewal cancellation requires reconciliation");
    this.name = "RecreioRenewalReviewError";
  }
}
export type RecreioRenewalProvider = {
  stop(input: RecreioRenewalScope): Promise<RecreioRenewalObservation>;
};
export const recreioRenewalKey = (intentId: string) => `recreio:renewal:${intentId}:stop`;
const resourceId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;
function review(code: RecreioRenewalReviewCode): never {
  throw new RecreioRenewalReviewError(code);
}
const opaque = (value: string, prefix: string) =>
  new RegExp(`^${prefix}_[A-Za-z0-9_]{3,124}$`).test(value);

/** Only stops renewal of the original owned native contract. It neither
 * creates invoices nor grants access, refunds, credits or a paid period.
 * A fresh GET precedes every retry and another GET verifies every mutation. */
export function createStripeRecreioRenewals(config: {
  secretKey: string;
  mode: "dev" | "prod";
  client?: Stripe;
  now?: () => Date;
}): RecreioRenewalProvider {
  const mode = config.mode;
  if (
    !new RegExp(`^(?:sk|rk)_${mode === "prod" ? "live" : "test"}_[A-Za-z0-9_]+$`).test(
      config.secretKey,
    )
  )
    review("namespace_mismatch");
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 10_000,
      maxNetworkRetries: 0,
      appInfo: { name: "informach-platform/recreio-renewals" },
    });
  function options(input: RecreioRenewalScope): Stripe.RequestOptions {
    const remaining = input.budget ? input.budget.deadlineMs - Date.now() : 10_000;
    if (!Number.isFinite(remaining) || remaining <= 0) review("provider_unavailable");
    return { timeout: Math.max(1, Math.min(10_000, remaining)), maxNetworkRetries: 0 };
  }
  function validate(input: RecreioRenewalScope) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.intentId,
      ) ||
      !opaque(input.customerId, "cus") ||
      !opaque(input.subscriptionId, "sub") ||
      !Object.values(input.origin).every(
        (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value),
      )
    )
      review("invalid_evidence");
    options(input);
  }
  async function read(input: RecreioRenewalScope) {
    const customer = await stripe.customers.retrieve(input.customerId, {}, options(input));
    if (customer.deleted) review("foreign_contract");
    if (customer.livemode !== (mode === "prod")) review("namespace_mismatch");
    if (
      customer.id !== input.customerId ||
      customer.metadata.subject_type !== "user" ||
      customer.metadata.subject_id !== input.origin.payerId
    )
      review("foreign_contract");
    const sub = await stripe.subscriptions.retrieve(input.subscriptionId, {}, options(input));
    if (sub.livemode !== (mode === "prod")) review("namespace_mismatch");
    if (
      sub.id !== input.subscriptionId ||
      resourceId(sub.customer) !== input.customerId ||
      sub.metadata.subject_type !== "user" ||
      sub.metadata.subject_id !== input.origin.payerId ||
      sub.metadata.checkout_intent_id !== input.origin.authorizationId ||
      sub.metadata.product_id !== input.origin.productId
    )
      review("foreign_contract");
    return sub;
  }
  function observe(input: RecreioRenewalScope, sub: Stripe.Subscription, expiresAt: number) {
    if (performance.now() >= expiresAt) review("provider_unavailable");
    const terminal = sub.status === "canceled" || sub.status === "incomplete_expired";
    let stopsAt: Date | null = null;
    let price: string | null = null;
    let end: number | null = null;
    if (!terminal) {
      const item = sub.items.data[0];
      // An attached schedule must be recovered by its original plan operation;
      // blindly canceling it can immediately terminate already-paid time.
      if (
        sub.schedule ||
        sub.pending_update ||
        sub.pause_collection ||
        sub.collection_method !== "charge_automatically" ||
        !["active", "trialing", "past_due", "unpaid"].includes(sub.status) ||
        sub.items.has_more ||
        sub.items.data.length !== 1 ||
        item?.quantity !== 1 ||
        !opaque(item?.price.id ?? "", "price")
      )
        review("scope_changed");
      if (
        !Number.isSafeInteger(item.current_period_start) ||
        !Number.isSafeInteger(item.current_period_end) ||
        item.current_period_start <= 0 ||
        item.current_period_end <= item.current_period_start
      )
        review("invalid_evidence");
      price = item.price.id;
      end = item.current_period_end;
      const stop = sub.cancel_at ?? (sub.cancel_at_period_end ? end : null);
      if (stop !== null) {
        if (!Number.isSafeInteger(stop) || stop <= 0) review("invalid_evidence");
        if (stop <= end) {
          if (stop * 1000 <= (config.now?.() ?? new Date()).getTime()) review("scope_changed");
          stopsAt = new Date(stop * 1000);
        }
      }
      if (!stopsAt) return null;
    }
    const outcome = terminal ? "terminal" : "scheduled";
    const sha256 = createHash("sha256")
      .update(
        JSON.stringify({
          format: "recreio-renewal-observation-v1",
          mode,
          intentId: input.intentId,
          customerId: input.customerId,
          subscriptionId: input.subscriptionId,
          origin: input.origin,
          outcome,
          status: sub.status,
          stopsAt: stopsAt?.toISOString() ?? null,
          price,
          periodEnd: end,
        }),
      )
      .digest("hex");
    const observation: RecreioRenewalObservation = Object.freeze({ outcome, stopsAt, sha256 });
    verified.set(observation, {
      scope: scopeKey(input, mode),
      expiresAt,
      snapshot: Object.freeze({ outcome, stopsAtMs: stopsAt?.getTime() ?? null, sha256 }),
    });
    return observation;
  }
  return {
    async stop(supplied) {
      try {
        const wallNow = Date.now();
        const deadlineMs = Math.min(
          supplied.budget?.deadlineMs ?? wallNow + 90_000,
          wallNow + 90_000,
        );
        const expiresAt = performance.now() + deadlineMs - wallNow;
        const input: RecreioRenewalScope = Object.freeze({
          intentId: supplied.intentId,
          customerId: supplied.customerId,
          subscriptionId: supplied.subscriptionId,
          origin: Object.freeze({
            authorizationId: supplied.origin.authorizationId,
            productId: supplied.origin.productId,
            payerId: supplied.origin.payerId,
          }),
          budget: Object.freeze({ deadlineMs }),
        });
        validate(input);
        const existing = observe(input, await read(input), expiresAt);
        if (existing) return existing;
        await stripe.subscriptions.update(
          input.subscriptionId,
          { cancel_at_period_end: true },
          { ...options(input), idempotencyKey: recreioRenewalKey(input.intentId) },
        );
        const observed = observe(input, await read(input), expiresAt);
        if (!observed) review("invalid_evidence");
        return observed;
      } catch (error) {
        if (error instanceof RecreioRenewalReviewError) throw error;
        // Provider bodies/URLs and transport errors never become public/audit text.
        throw new RecreioRenewalReviewError("provider_unavailable");
      }
    },
  };
}
