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
  /**
   * Snapshot of the subscription's latest invoice when the provider was able
   * to expand it (Stripe `expand: ["latest_invoice"]`). `null` when the
   * provider doesn't return this — callers MUST treat it as "no information"
   * rather than "no invoice exists".
   *
   * Used by `switchPlan(immediate)` to detect when an upgrade did not collect
   * payment automatically (default payment method missing, SCA required, card
   * declined, etc.) and redirect the user to the Stripe-hosted invoice page
   * to complete it.
   */
  latestInvoice?: ProviderInvoiceSummary | null;
};

export type ProviderInvoiceSummary = {
  id: string;
  /** Stripe invoice statuses: draft | open | paid | uncollectible | void. */
  status: string;
  /** Hosted Stripe invoice page where the user can pay. Always available. */
  hostedUrl: string | null;
  amountDueCents: number;
  currency: string;
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
  /**
   * Stripe payment behavior for updates that generate an invoice. `pending_if_incomplete`
   * keeps the existing subscription items in force until the invoice is paid.
   */
  paymentBehavior?:
    | "allow_incomplete"
    | "default_incomplete"
    | "pending_if_incomplete"
    | "error_if_incomplete";
};

export type ProviderCreateSubscriptionInput = {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
  /** Stripe idempotency key. */
  idempotencyKey?: string;
};

export type ProviderReactivateSubscriptionInput = {
  providerSubscriptionId: string;
};

export type ProviderPreviewInvoiceInput = {
  customerId: string;
  /** Existing subscription to preview against. Required for plan-change preview. */
  providerSubscriptionId: string;
  /** New price to swap in for the existing first item. */
  newPriceId: string;
  /** Default `always_invoice` to surface charge-now behavior in the UI. */
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
};

export type ProviderInvoicePreview = {
  /**
   * Sum of POSITIVE line items in cents — the gross price of the new plan
   * (typically the full annual subscription, plus any add-ons). The UI shows
   * this so the user sees what the new plan actually costs before discounts.
   */
  subtotalCents: number;
  /** Sum of NEGATIVE line items (proration credits from the old plan) in cents. Always <= 0. */
  prorationCreditCents: number;
  /**
   * Net amount the user will be charged NOW: `subtotalCents + prorationCreditCents`,
   * adjusted by Stripe for taxes and previous customer balance. May be 0 or
   * negative when the proration credit covers the new plan.
   */
  amountDueCents: number;
  currency: string;
  /** When the next regular charge will land (period end of the new plan). */
  nextChargeAt: Date | null;
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

  /**
   * Creates a new subscription on the provider for an existing customer using
   * their default payment method. Used by the scheduled-downgrade flow when a
   * pending plan intent must be applied after the previous subscription is
   * canceled (webhook `customer.subscription.deleted`).
   */
  createSubscription?(input: ProviderCreateSubscriptionInput): Promise<ProviderSubscriptionDetails>;

  /**
   * Clears the cancel_at_period_end flag on the provider so the subscription
   * keeps renewing. Returns the updated summary so callers can update locally.
   */
  reactivateSubscription?(
    input: ProviderReactivateSubscriptionInput,
  ): Promise<ProviderSubscriptionSummary>;

  /**
   * Previews the invoice that would be generated by swapping the first item's
   * price on a subscription. Used to show the user "you will be charged X now"
   * before confirming an upgrade.
   */
  previewInvoice?(input: ProviderPreviewInvoiceInput): Promise<ProviderInvoicePreview>;

  verifyWebhookSignature(rawBody: string, signature: string | null): ProviderWebhookEvent;
}
