import { createHash } from "node:crypto";
import Stripe from "stripe";
import type { PaymentReadBudget } from "../payment-facts";
import { RecreioRenewalReviewError } from "./stripe-recreio-renewals";

export type RecreioClosureInventoryScope = {
  operationId: string;
  customerId: string;
  payerId: string;
  purchases: readonly { authorizationId: string; productId: string }[];
  contracts: readonly { subscriptionId: string; authorizationId: string; productId: string }[];
  budget: PaymentReadBudget;
};
export type RecreioClosureInventory = {
  subscriptions: { id: string; terminal: boolean; stopsAt: Date | null }[];
  checkouts: {
    id: string;
    authorizationId: string;
    status: "open" | "complete" | "expired";
    settled: boolean;
  }[];
  sha256: string;
};
export type RecreioClosureInventoryReader = {
  inspect(input: RecreioClosureInventoryScope): Promise<RecreioClosureInventory>;
};
const MAX_OBJECTS = 600;
const opaque = (value: string, prefix: string) =>
  new RegExp(`^${prefix}_[A-Za-z0-9_]{3,124}$`).test(value);
const identifier = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;
function reject(code: ConstructorParameters<typeof RecreioRenewalReviewError>[0]): never {
  throw new RecreioRenewalReviewError(code);
}

/** Read-only, complete bounded inventory of an exclusive native customer.
 * Unknown origin, missing pages/contracts or unsettled Checkout never become
 * proof of absence. It cannot expire, cancel, refund or create anything. */
export function createStripeRecreioClosureInventory(config: {
  secretKey: string;
  mode: "dev" | "prod";
  client?: Stripe;
  now?: () => Date;
}): RecreioClosureInventoryReader {
  if (
    !new RegExp(`^(?:sk|rk)_${config.mode === "prod" ? "live" : "test"}_[A-Za-z0-9_]+$`).test(
      config.secretKey,
    )
  )
    reject("namespace_mismatch");
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      timeout: 10_000,
      maxNetworkRetries: 0,
      appInfo: { name: "informach-platform/recreio-closure-inventory" },
    });
  function options(input: RecreioClosureInventoryScope): Stripe.RequestOptions {
    const remaining = input.budget.deadlineMs - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) reject("provider_unavailable");
    return { timeout: Math.max(1, Math.min(10_000, remaining)), maxNetworkRetries: 0 };
  }
  return {
    async inspect(input) {
      try {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            input.operationId,
          ) ||
          !opaque(input.customerId, "cus") ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(input.payerId) ||
          input.contracts.length > MAX_OBJECTS ||
          input.purchases.length > MAX_OBJECTS
        )
          reject("invalid_evidence");
        const purchases = new Map(input.purchases.map((p) => [p.authorizationId, p.productId]));
        const contracts = new Map(input.contracts.map((p) => [p.subscriptionId, p]));
        if (
          purchases.size !== input.purchases.length ||
          contracts.size !== input.contracts.length ||
          new Set(input.contracts.map((p) => p.authorizationId)).size !== input.contracts.length ||
          input.purchases.some(
            (p) =>
              !/^[A-Za-z0-9_-]{1,128}$/.test(p.authorizationId) ||
              !/^[A-Za-z0-9_-]{1,80}$/.test(p.productId),
          ) ||
          input.contracts.some(
            (p) =>
              !opaque(p.subscriptionId, "sub") || purchases.get(p.authorizationId) !== p.productId,
          )
        )
          reject("invalid_evidence");
        const customer = await stripe.customers.retrieve(input.customerId, {}, options(input));
        if (customer.deleted) reject("foreign_contract");
        if (customer.livemode !== (config.mode === "prod")) reject("namespace_mismatch");
        if (
          customer.id !== input.customerId ||
          customer.metadata.subject_type !== "user" ||
          customer.metadata.subject_id !== input.payerId
        )
          reject("foreign_contract");
        const subscriptions: RecreioClosureInventory["subscriptions"] = [];
        const seen = new Set<string>();
        let cursor: string | undefined;
        for (;;) {
          const page = await stripe.subscriptions.list(
            {
              customer: input.customerId,
              status: "all",
              limit: 100,
              ...(cursor ? { starting_after: cursor } : {}),
            },
            options(input),
          );
          options(input);
          if (
            typeof page.has_more !== "boolean" ||
            page.data.length > 100 ||
            ((page.has_more || cursor) && !page.data.length)
          )
            reject("invalid_evidence");
          for (const sub of page.data) {
            const origin = contracts.get(sub.id);
            if (seen.has(sub.id) || seen.size >= MAX_OBJECTS) reject("invalid_evidence");
            seen.add(sub.id);
            if (sub.livemode !== (config.mode === "prod")) reject("namespace_mismatch");
            if (
              !origin ||
              identifier(sub.customer) !== input.customerId ||
              sub.metadata.subject_type !== "user" ||
              sub.metadata.subject_id !== input.payerId ||
              sub.metadata.checkout_intent_id !== origin.authorizationId ||
              sub.metadata.product_id !== origin.productId
            )
              reject("foreign_contract");
            const terminal = sub.status === "canceled" || sub.status === "incomplete_expired";
            let stopsAt: Date | null = null;
            if (!terminal) {
              const item = sub.items.data[0];
              if (
                !["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(
                  sub.status,
                ) ||
                sub.schedule ||
                sub.pending_update ||
                sub.pause_collection ||
                sub.items.has_more ||
                sub.items.data.length !== 1 ||
                item?.quantity !== 1 ||
                !Number.isSafeInteger(item.current_period_end) ||
                item.current_period_end <= 0
              )
                reject("scope_changed");
              if (item.current_period_end * 1000 > 8_640_000_000_000_000)
                reject("invalid_evidence");
              const stop =
                sub.cancel_at ?? (sub.cancel_at_period_end ? item.current_period_end : null);
              if (stop !== null) {
                const now = (config.now?.() ?? new Date()).getTime();
                if (
                  !Number.isSafeInteger(stop) ||
                  stop <= 0 ||
                  stop * 1000 > 8_640_000_000_000_000 ||
                  !Number.isFinite(now)
                )
                  reject("invalid_evidence");
                if (stop <= item.current_period_end && stop * 1000 > now)
                  stopsAt = new Date(stop * 1000);
              }
            }
            subscriptions.push({ id: sub.id, terminal, stopsAt });
          }
          if (!page.has_more) break;
          cursor = page.data.at(-1)?.id;
        }
        if (seen.size !== contracts.size) reject("invalid_evidence");
        const checkouts: RecreioClosureInventory["checkouts"] = [];
        seen.clear();
        cursor = undefined;
        for (;;) {
          const page = await stripe.checkout.sessions.list(
            {
              customer: input.customerId,
              limit: 100,
              ...(cursor ? { starting_after: cursor } : {}),
            },
            options(input),
          );
          options(input);
          if (
            typeof page.has_more !== "boolean" ||
            page.data.length > 100 ||
            ((page.has_more || cursor) && !page.data.length)
          )
            reject("invalid_evidence");
          for (const session of page.data) {
            if (seen.has(session.id) || seen.size >= MAX_OBJECTS || !opaque(session.id, "cs"))
              reject("invalid_evidence");
            seen.add(session.id);
            if (session.livemode !== (config.mode === "prod")) reject("namespace_mismatch");
            const authorizationId = session.metadata?.checkout_intent_id,
              product = authorizationId ? purchases.get(authorizationId) : undefined;
            if (
              identifier(session.customer) !== input.customerId ||
              session.mode !== "subscription" ||
              session.metadata?.subject_type !== "user" ||
              session.metadata?.subject_id !== input.payerId ||
              !authorizationId ||
              !product ||
              session.metadata?.product_id !== product
            )
              reject("foreign_contract");
            if (
              session.status !== "open" &&
              session.status !== "complete" &&
              session.status !== "expired"
            )
              reject("invalid_evidence");
            const subId = identifier(session.subscription);
            if (
              (subId && contracts.get(subId)?.authorizationId !== authorizationId) ||
              (session.status === "complete" && !subId)
            )
              reject("scope_changed");
            checkouts.push({
              id: session.id,
              authorizationId,
              status: session.status,
              settled:
                session.status === "expired" ||
                (session.status === "complete" &&
                  (session.payment_status === "paid" ||
                    session.payment_status === "no_payment_required")),
            });
          }
          if (!page.has_more) break;
          cursor = page.data.at(-1)?.id;
        }
        const byId = (a: { id: string }, b: { id: string }) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        subscriptions.sort(byId);
        checkouts.sort(byId);
        const sha256 = createHash("sha256")
          .update(
            JSON.stringify({
              format: "recreio-closure-inventory-v1",
              mode: config.mode,
              operationId: input.operationId,
              customerId: input.customerId,
              payerId: input.payerId,
              origins: input.contracts
                .map((p) => ({
                  id: p.subscriptionId,
                  authorizationId: p.authorizationId,
                  productId: p.productId,
                }))
                .sort(byId),
              purchases: input.purchases
                .map((p) => ({ id: p.authorizationId, productId: p.productId }))
                .sort(byId),
              subscriptions,
              checkouts,
            }),
          )
          .digest("hex");
        return { subscriptions, checkouts, sha256 };
      } catch (error) {
        if (error instanceof RecreioRenewalReviewError) throw error;
        throw new RecreioRenewalReviewError("provider_unavailable");
      }
    },
  };
}
