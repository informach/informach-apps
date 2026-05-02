import { safeLog } from "./../logger";
import { handleSubscriptionLifecycle, type SubscriptionWebhookDeps } from "./subscription";

type StripeCheckoutSessionLike = {
  id: string;
  mode: "subscription" | "payment" | "setup";
  customer: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string>;
};

/**
 * Handles `checkout.session.completed`. For mode=subscription, the actual
 * subscription row is upserted via `customer.subscription.created` handler
 * (Stripe emits both). For mode=payment (credit packs), we'd handle here in
 * Phase 5. Currently logs both modes for traceability.
 */
export async function handleCheckoutSessionCompleted(
  deps: SubscriptionWebhookDeps,
  session: StripeCheckoutSessionLike,
): Promise<{ handled: boolean; mode: string }> {
  if (session.mode === "subscription") {
    safeLog(deps.logger, "info", "billing.webhook.checkout.subscription_completed", {
      sessionId: session.id,
      subscriptionRef:
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
    });
    // The subscription row will be upserted by `customer.subscription.created`
    // (or `customer.subscription.updated`) which Stripe emits in the same flow.
    // We do nothing here to avoid duplicating logic — both paths must converge.
    return { handled: true, mode: "subscription" };
  }

  if (session.mode === "payment") {
    safeLog(deps.logger, "info", "billing.webhook.checkout.payment_completed", {
      sessionId: session.id,
      paymentIntentRef:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
    });
    // Credit pack grant happens in Phase 5 via `payment_intent.succeeded` handler.
    return { handled: true, mode: "payment" };
  }

  safeLog(deps.logger, "debug", "billing.webhook.checkout.unhandled_mode", {
    sessionId: session.id,
    mode: session.mode,
  });
  return { handled: false, mode: session.mode };
}

/** Re-export for explicit dispatcher import. */
export { handleSubscriptionLifecycle };
