import type { BillingProvider, SubjectRef } from "../types";

export type ProviderCustomer = {
  id: string;
  email: string;
  metadata: Record<string, string>;
};

export type ProviderCheckoutMode = "subscription" | "payment";

export type ProviderCheckoutInput = {
  mode: ProviderCheckoutMode;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  trialDays?: number;
  idempotencyKey?: string;
};

export type ProviderCheckoutSession = {
  id: string;
  url: string;
};

export type ProviderPortalInput = {
  customerId: string;
  returnUrl: string;
};

export type ProviderPortalSession = {
  url: string;
};

export type ProviderWebhookEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type ProviderSubscriptionSummary = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
};

export type ProviderSubscriptionDetails = ProviderSubscriptionSummary & {
  providerCustomerId: string;
  providerPriceId: string | null;
  productId: string | null;
  currentPeriodStart: Date | null;
  canceledAt: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, string>;
};

export type ProviderCancelSubscriptionInput = {
  providerSubscriptionId: string;
  /** When true, schedules cancel at period end (default). False = immediate cancel. */
  atPeriodEnd?: boolean;
};

export type ProviderUpdateSubscriptionInput = {
  providerSubscriptionId: string;
  newPriceId: string;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
};

/**
 * Abstraction over a billing provider (Stripe today, Asaas future).
 * All implementations must be idempotent on the provider side.
 */
export interface BillingProviderClient {
  readonly name: BillingProvider;

  createCustomer(input: {
    email: string;
    subject: SubjectRef;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<ProviderCustomer>;

  retrieveCustomer(customerId: string): Promise<ProviderCustomer | null>;

  createCheckoutSession(input: ProviderCheckoutInput): Promise<ProviderCheckoutSession>;

  createPortalSession(input: ProviderPortalInput): Promise<ProviderPortalSession>;

  cancelSubscription(input: ProviderCancelSubscriptionInput): Promise<ProviderSubscriptionSummary>;

  updateSubscription(input: ProviderUpdateSubscriptionInput): Promise<ProviderSubscriptionSummary>;

  /**
   * Returns the current subscription state from the provider, or null if it
   * was deleted/never existed. Used by reconcile sweeper to detect drift.
   */
  retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSummary | null>;

  /**
   * Returns enough provider state to reconstruct a missing local subscription row
   * when Stripe delivers invoice events before subscription events.
   */
  retrieveSubscriptionDetails?(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionDetails | null>;

  verifyWebhookSignature(rawBody: string, signature: string | null): ProviderWebhookEvent;
}
