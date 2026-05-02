import Stripe from "stripe";
import { WebhookSignatureError } from "../errors";
import type { SubjectRef } from "../types";
import type {
  BillingProviderClient,
  ProviderCancelSubscriptionInput,
  ProviderCheckoutInput,
  ProviderCheckoutSession,
  ProviderCustomer,
  ProviderPortalInput,
  ProviderPortalSession,
  ProviderSubscriptionSummary,
  ProviderUpdateSubscriptionInput,
  ProviderWebhookEvent,
} from "./types";

export type StripeProviderConfig = {
  secretKey: string;
  webhookSecret: string;
  appName: string;
  /** Inject a Stripe client (used by tests). When omitted, a real client is built. */
  client?: Stripe;
};

export function createStripeProvider(config: StripeProviderConfig): BillingProviderClient {
  // Pin API version so behavior is reproducible across stripe-node patch upgrades.
  // Must match the LatestApiVersion literal exposed by the installed SDK
  // (stripe@22.1.0 → "2026-04-22.dahlia"). When bumping stripe-node major,
  // verify this literal still compiles and re-test webhook handlers against
  // the new payload shape — Basil/Dahlia keep current_period_* on items.data[i]
  // (not on the Subscription root).
  const stripe =
    config.client ??
    new Stripe(config.secretKey, {
      apiVersion: "2026-04-22.dahlia",
      appInfo: {
        name: `informach-platform/${config.appName}`,
      },
      typescript: true,
    });

  function buildSubjectMetadata(
    subject: SubjectRef,
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      ...(extra ?? {}),
      subject_type: subject.type,
      subject_id: subject.id,
    };
  }

  return {
    name: "stripe",

    async createCustomer(input): Promise<ProviderCustomer> {
      const customer = await stripe.customers.create({
        email: input.email,
        metadata: buildSubjectMetadata(input.subject, input.metadata),
      });
      return {
        id: customer.id,
        email: customer.email ?? input.email,
        metadata: normalizeMetadata(customer.metadata),
      };
    },

    async retrieveCustomer(customerId): Promise<ProviderCustomer | null> {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) return null;
        return {
          id: customer.id,
          email: customer.email ?? "",
          metadata: normalizeMetadata(customer.metadata),
        };
      } catch (err) {
        if (err instanceof Stripe.errors.StripeError && err.code === "resource_missing") {
          return null;
        }
        throw err;
      }
    },

    async createCheckoutSession(input: ProviderCheckoutInput): Promise<ProviderCheckoutSession> {
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: input.mode,
        customer: input.customerId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
      };
      if (input.mode === "subscription") {
        params.subscription_data = { metadata: input.metadata };
        if (input.trialDays !== undefined) {
          params.subscription_data.trial_period_days = input.trialDays;
        }
      } else {
        params.payment_intent_data = { metadata: input.metadata };
      }
      const session = await stripe.checkout.sessions.create(params, {
        idempotencyKey: input.idempotencyKey,
      });
      if (!session.url) {
        throw new Error("Stripe Checkout session missing url");
      }
      return { id: session.id, url: session.url };
    },

    async createPortalSession(input: ProviderPortalInput): Promise<ProviderPortalSession> {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      });
      return { url: session.url };
    },

    async cancelSubscription(
      input: ProviderCancelSubscriptionInput,
    ): Promise<ProviderSubscriptionSummary> {
      const atPeriodEnd = input.atPeriodEnd ?? true;
      const subscription = atPeriodEnd
        ? await stripe.subscriptions.update(input.providerSubscriptionId, {
            cancel_at_period_end: true,
          })
        : await stripe.subscriptions.cancel(input.providerSubscriptionId);
      return summarizeSubscription(subscription);
    },

    async retrieveSubscription(
      providerSubscriptionId: string,
    ): Promise<ProviderSubscriptionSummary | null> {
      try {
        const subscription = await stripe.subscriptions.retrieve(providerSubscriptionId);
        return summarizeSubscription(subscription);
      } catch (err) {
        if (
          err instanceof Stripe.errors.StripeInvalidRequestError &&
          err.code === "resource_missing"
        ) {
          return null;
        }
        throw err;
      }
    },

    async updateSubscription(
      input: ProviderUpdateSubscriptionInput,
    ): Promise<ProviderSubscriptionSummary> {
      // Stripe requires the existing item id to swap its price. Fetch first to get it.
      const current = await stripe.subscriptions.retrieve(input.providerSubscriptionId);
      const firstItem = current.items.data[0];
      if (!firstItem) {
        throw new Error(
          `@informach/billing: subscription ${input.providerSubscriptionId} has no items`,
        );
      }
      const updated = await stripe.subscriptions.update(input.providerSubscriptionId, {
        items: [{ id: firstItem.id, price: input.newPriceId }],
        proration_behavior: input.prorationBehavior ?? "create_prorations",
      });
      return summarizeSubscription(updated);
    },

    verifyWebhookSignature(rawBody, signature): ProviderWebhookEvent {
      if (!signature) {
        throw new WebhookSignatureError("missing stripe-signature header");
      }
      try {
        const event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
        return {
          id: event.id,
          type: event.type,
          payload: event as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new WebhookSignatureError(message);
      }
    },
  };
}

function normalizeMetadata(metadata: Stripe.Metadata | null): Record<string, string> {
  if (!metadata) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function summarizeSubscription(subscription: Stripe.Subscription): ProviderSubscriptionSummary {
  // Dahlia API: current_period_end lives on items, not on the Subscription root.
  const firstItem = subscription.items.data[0];
  const periodEnd = firstItem?.current_period_end ?? null;
  return {
    id: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };
}
