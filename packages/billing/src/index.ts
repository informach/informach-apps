import type { Subscription as SubscriptionRow } from "@informach/db/schema";
import { hasProSubscription } from "./access";
import { createCreditPackCheckout, createSubscriptionCheckout } from "./checkout";
import type { BillingServiceConfig } from "./config";
import {
  type CommitReservationInput,
  type CommitReservationResult,
  type ConsumeCreditsInput,
  type ConsumeCreditsResult,
  commitReservation,
  consumeCredits,
  type GrantBonusCreditsInput,
  type GrantBonusCreditsResult,
  getBalance,
  getCreditHistory,
  grantBonusCredits,
  type LedgerHistoryFilters,
  type LedgerHistoryPage,
  type RefundCreditsInput,
  type RefundCreditsResult,
  type ReleaseReservationInput,
  type ReserveCreditsInput,
  refundCredits,
  releaseReservation,
  reserveCredits,
} from "./credits";
import {
  type GetOrCreateCustomerInput,
  type GetOrCreateCustomerResult,
  getOrCreateCustomer,
} from "./customers";
import { BillingError } from "./errors";
import {
  type PreviewPlanChangeInput,
  type PreviewPlanChangeResult,
  previewPlanChange,
  type ReactivateSubscriptionInput,
  reactivateSubscription,
  type SwitchPlanInput,
  type SwitchPlanResult,
  switchPlan,
} from "./plan-changes";
import { createPortalSession } from "./portal";
import { createStripeProvider } from "./providers/stripe";
import type { BillingProviderClient } from "./providers/types";
import {
  type CancelSubscriptionInput,
  cancelBillingForSubject,
  cancelSubscription,
  getSubscription,
  listSubscriptions,
  type UpdateSubscriptionInput,
  updateSubscription,
} from "./subscriptions";
import {
  type DunningSendFn,
  type ExpireMonthlyBonusResult,
  expireMonthlyBonusCredits,
  type GrantMonthlyBonusResult,
  grantPendingMonthlyBonusCredits,
  type ReconcileSubscriptionsResult,
  type ReleaseExpiredReservationsResult,
  type RetryDunningEmailsResult,
  reconcileSubscriptionStatuses,
  releaseExpiredReservations,
  retryFailedDunningEmails,
} from "./sweepers";
import type {
  CheckoutResult,
  CreditBalance,
  CreditOwner,
  CreditPackCheckoutInput,
  PortalSessionInput,
  SubjectRef,
  SubscriptionCheckoutInput,
} from "./types";
import {
  handleStripeEvent,
  type ParsedWebhookEvent,
  verifyStripeSignature,
  type WebhookHandlerResult,
} from "./webhooks";

export { getProSubscription, hasProSubscription, PRO_STATUSES } from "./access";
export type { BillingServiceConfig } from "./config";
export type {
  CommitReservationInput,
  CommitReservationResult,
  ConsumeCreditsInput,
  ConsumeCreditsResult,
  GrantBonusCreditsInput,
  GrantBonusCreditsResult,
  LedgerHistoryFilters,
  LedgerHistoryPage,
  RefundCreditsInput,
  RefundCreditsResult,
  ReleaseReservationInput,
  ReserveCreditsInput,
} from "./credits";
export type {
  GetOrCreateCustomerInput,
  GetOrCreateCustomerResult,
} from "./customers";
export {
  AlreadySubscribedError,
  BillingError,
  CustomerNotFoundError,
  InsufficientCreditsError,
  InvalidProductError,
  NotImplementedError,
  OrganizationsDisabledError,
  ReservationAlreadyResolvedError,
  ReservationExpiredError,
  ReservationNotFoundError,
  SubscriptionRequiredError,
  WebhookSignatureError,
} from "./errors";
export type { Logger } from "./logger";
export type {
  PlanChangeMode,
  PreviewPlanChangeInput,
  PreviewPlanChangeResult,
  ReactivateSubscriptionInput,
  SwitchPlanInput,
  SwitchPlanResult,
} from "./plan-changes";
export type { BillingProviderClient } from "./providers/types";
export type { CancelSubscriptionInput, UpdateSubscriptionInput } from "./subscriptions";
export type {
  DunningPayload,
  DunningSendFn,
  ExpireMonthlyBonusResult,
  GrantMonthlyBonusResult,
  ReconcileSubscriptionsResult,
  ReleaseExpiredReservationsResult,
  RetryDunningEmailsResult,
} from "./sweepers";
export type {
  BillingAuditEvent,
  BillingAuditEventType,
  BillingProvider,
  CheckoutResult,
  CreditBalance,
  CreditOwner,
  CreditPackCheckoutInput,
  LedgerEntryType,
  PaymentStatus,
  PortalSessionInput,
  Product,
  ProductKind,
  ProductPriceMap,
  ReservationHandle,
  ReservationReleaseReason,
  ReservationStatus,
  SubjectRef,
  SubjectType,
  SubscriptionCheckoutInput,
  SubscriptionStatus,
} from "./types";
export type { ParsedWebhookEvent, WebhookHandlerResult } from "./webhooks";
export { STRIPE_SIGNATURE_HEADER } from "./webhooks";

export type SubscriptionCheckoutOptions = SubscriptionCheckoutInput & {
  idempotencyNonce?: string;
};

export type CreditPackCheckoutOptions = CreditPackCheckoutInput & {
  idempotencyNonce?: string;
};

export type BillingService = {
  /**
   * Returns or creates the (provider, subject) customer row in `billing.customers`,
   * idempotently. Calls the provider when a new row is needed.
   */
  getOrCreateCustomer(input: GetOrCreateCustomerInput): Promise<GetOrCreateCustomerResult>;
  /**
   * Creates a Stripe Checkout session for a subscription product.
   */
  createSubscriptionCheckout(input: SubscriptionCheckoutOptions): Promise<CheckoutResult>;
  /**
   * Creates a Stripe Checkout session for a one-time credit pack purchase.
   */
  createCreditPackCheckout(input: CreditPackCheckoutOptions): Promise<CheckoutResult>;
  /**
   * Returns the current credit balance for an owner (single round-trip).
   */
  getBalance(owner: CreditOwner): Promise<CreditBalance>;
  /**
   * Keyset-paginated history of credit ledger entries for an owner.
   */
  getCreditHistory(owner: CreditOwner, filters?: LedgerHistoryFilters): Promise<LedgerHistoryPage>;
  /**
   * Idempotent grant of bonus credits (subscription_monthly / promo / compensation).
   * Idempotency via `stripeEventId` UNIQUE when set.
   */
  grantBonusCredits(input: GrantBonusCreditsInput): Promise<GrantBonusCreditsResult>;
  /**
   * Refunds credits as a negative ledger entry. Idempotent via `stripeEventId` UNIQUE.
   */
  refundCredits(input: RefundCreditsInput): Promise<RefundCreditsResult>;
  /**
   * Reserves credits before a (likely LLM) call. Throws InsufficientCreditsError
   * if available < estimatedAmount. Use `commitReservation` after the call to
   * settle, or `releaseReservation` on failure.
   */
  reserveCredits(input: ReserveCreditsInput): Promise<import("./types").ReservationHandle>;
  /**
   * Settles a reservation: writes the actual cost to the ledger, marks the
   * reservation as committed, and returns the new available balance.
   */
  commitReservation(input: CommitReservationInput): Promise<CommitReservationResult>;
  /**
   * Idempotently releases a reservation without consuming any credits.
   * Already-resolved reservations become a silent no-op.
   */
  releaseReservation(input: ReleaseReservationInput): Promise<void>;
  /**
   * Reserve+commit shortcut for cases where the actual cost is known up-front.
   * Returns a discriminated union: success carries the ledger row id and
   * post-debit balance; failure carries the available balance.
   */
  consumeCredits(input: ConsumeCreditsInput): Promise<ConsumeCreditsResult>;
  /**
   * Verifies the raw webhook signature and returns the parsed event.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): ParsedWebhookEvent;
  /**
   * Idempotently handles a Stripe webhook event. Inserts in `webhook_events` first
   * (UNIQUE on provider+providerEventId); deduped if conflict, otherwise dispatches.
   */
  handleStripeEvent(event: ParsedWebhookEvent): Promise<WebhookHandlerResult>;
  /**
   * Returns the first active-ish (active|trialing|past_due) subscription row
   * for the subject, or null if none. Used for UI display (status badge,
   * "Pagamento pendente" label, etc) — NOT for feature gating.
   */
  getSubscription(subject: SubjectRef): Promise<SubscriptionRow | null>;
  /**
   * Single source of truth for "is this subject Pro right now?" — `true`
   * only when status ∈ PRO_STATUSES (`active` or `trialing`). Use this for
   * EVERY feature gate (credit pack purchase, AI feature unlock, etc.) so
   * the rule lives in one place (`access.ts`).
   */
  hasProSubscription(subject: SubjectRef): Promise<boolean>;
  /** All subscription rows (any status) for the subject. */
  listSubscriptions(subject: SubjectRef): Promise<SubscriptionRow[]>;
  /**
   * Cancels a subscription via the provider. Default `atPeriodEnd: true`
   * (graceful); pass false for immediate cancel. Stripe is the source of truth
   * — webhook will reconcile, this method updates locally optimistically.
   */
  cancelSubscription(input: CancelSubscriptionInput): Promise<SubscriptionRow>;
  /**
   * Swaps the subscription's price item. Default `prorationBehavior:
   * "create_prorations"` (Stripe default).
   */
  updateSubscription(input: UpdateSubscriptionInput): Promise<SubscriptionRow>;
  /**
   * Switch the subscription's plan, immediately (with proration invoice) or
   * scheduled at the period end (downgrade flow).
   */
  switchPlan(input: SwitchPlanInput): Promise<SwitchPlanResult>;
  /**
   * Clears `cancel_at_period_end` so the subscription continues renewing.
   */
  reactivateSubscription(input: ReactivateSubscriptionInput): Promise<SubscriptionRow>;
  /**
   * Returns a Stripe invoice preview for the proration that would result from
   * switching to a new plan. Used by UI to show "you'll be charged X now".
   */
  previewPlanChange(input: PreviewPlanChangeInput): Promise<PreviewPlanChangeResult>;
  /**
   * Generates a Stripe Billing Portal session URL for the subject.
   */
  createPortalSession(input: PortalSessionInput): Promise<{ url: string }>;
  /**
   * LGPD/account-deletion: cancels every active subscription for the subject
   * IMMEDIATELY. Returns counts. Does NOT delete rows — fiscal retention.
   */
  cancelBillingForSubject(subject: SubjectRef): Promise<{ canceled: number; failed: number }>;
  /** Cron sweeper: reconcile local subscription rows with provider state. */
  reconcileSubscriptions(opts?: { batchSize?: number }): Promise<ReconcileSubscriptionsResult>;
  /** Cron sweeper: insert `expiration` ledger entries for vencidos. */
  expireMonthlyBonusCredits(opts?: {
    now?: Date;
    batchSize?: number;
  }): Promise<ExpireMonthlyBonusResult>;
  /**
   * Cron sweeper: drips monthly bonus credits to annual subscriptions whose
   * `next_credit_grant_at` has arrived. Idempotent via synthetic event id.
   */
  grantPendingMonthlyBonusCredits(opts?: {
    now?: Date;
    batchSize?: number;
  }): Promise<GrantMonthlyBonusResult>;
  /** Cron sweeper: free reservation rows whose `expiresAt` passed. */
  releaseExpiredReservations(opts?: {
    now?: Date;
    batchSize?: number;
  }): Promise<ReleaseExpiredReservationsResult>;
  /**
   * Cron sweeper: re-attempt dunning emails for `past_due` subs. `send` is
   * required to actually deliver — when omitted, the run is a dry-run.
   */
  retryDunningEmails(opts: {
    send?: DunningSendFn;
    maxAttempts?: number;
    cooldownHours?: number;
    now?: Date;
    batchSize?: number;
  }): Promise<RetryDunningEmailsResult>;
};

function buildProviderClient(config: BillingServiceConfig): BillingProviderClient {
  if (config.providerClient) return config.providerClient;
  if (config.provider === "stripe") {
    if (!config.stripeSecretKey) {
      throw new BillingError("stripeSecretKey is required when provider='stripe'");
    }
    if (!config.stripeWebhookSecret) {
      throw new BillingError("stripeWebhookSecret is required when provider='stripe'");
    }
    return createStripeProvider({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
      appName: config.appName,
    });
  }
  throw new BillingError(`provider '${config.provider}' is not implemented yet`);
}

export function createBillingService(config: BillingServiceConfig): BillingService {
  const providerClient = buildProviderClient(config);

  const checkoutDeps = {
    db: config.db,
    provider: config.provider,
    providerClient,
    organizationsEnabled: config.organizationsEnabled,
    app: config.app,
    products: config.products,
    publicAppUrl: config.publicAppUrl,
    stripeMode: config.stripeMode,
    logger: config.logger,
    onAudit: config.onAudit,
    resolveSubjectEmail: config.resolveSubjectEmail,
  };

  // Email integration is opt-in: when sendEmail/renderTemplate are not
  // configured, billing emails become no-ops (webhook handlers still complete).
  const billingEmailDeps =
    config.sendEmail && config.renderTemplate
      ? {
          sendEmail: config.sendEmail,
          renderTemplate: config.renderTemplate,
          appName: config.appName,
          manageBillingUrl: config.manageBillingUrl,
          buildUnsubscribeUrl: config.buildUnsubscribeUrl,
          unsubscribeMailto: config.unsubscribeMailto,
          logger: config.logger,
        }
      : undefined;

  const webhookDeps = {
    db: config.db,
    provider: config.provider,
    providerClient,
    app: config.app,
    webhookScope: config.appName,
    products: config.products,
    logger: config.logger,
    onAudit: config.onAudit,
    emails: billingEmailDeps,
  };

  const creditDeps = {
    db: config.db,
    app: config.app,
    logger: config.logger,
    onAudit: config.onAudit,
  };

  const subscriptionsDeps = {
    db: config.db,
    provider: config.provider,
    providerClient,
    organizationsEnabled: config.organizationsEnabled,
    app: config.app,
    logger: config.logger,
    onAudit: config.onAudit,
  };

  const planChangesDeps = {
    db: config.db,
    provider: config.provider,
    providerClient,
    organizationsEnabled: config.organizationsEnabled,
    app: config.app,
    products: config.products,
    stripeMode: config.stripeMode,
    logger: config.logger,
    onAudit: config.onAudit,
  };

  return {
    getOrCreateCustomer(input) {
      return getOrCreateCustomer(
        {
          db: config.db,
          provider: config.provider,
          providerClient,
          organizationsEnabled: config.organizationsEnabled,
          app: config.app,
          logger: config.logger,
        },
        input,
      );
    },
    createSubscriptionCheckout(input) {
      return createSubscriptionCheckout(checkoutDeps, input);
    },
    createCreditPackCheckout(input) {
      return createCreditPackCheckout(checkoutDeps, input);
    },
    getBalance(owner) {
      return getBalance({ db: config.db, app: config.app }, owner);
    },
    getCreditHistory(owner, filters) {
      return getCreditHistory({ db: config.db, app: config.app }, owner, filters);
    },
    grantBonusCredits(input) {
      return grantBonusCredits(creditDeps, input);
    },
    refundCredits(input) {
      return refundCredits(creditDeps, input);
    },
    reserveCredits(input) {
      return reserveCredits(creditDeps, input);
    },
    commitReservation(input) {
      return commitReservation(creditDeps, input);
    },
    releaseReservation(input) {
      return releaseReservation(creditDeps, input);
    },
    consumeCredits(input) {
      return consumeCredits(creditDeps, input);
    },
    verifyWebhookSignature(rawBody, signature) {
      return verifyStripeSignature(providerClient, rawBody, signature);
    },
    handleStripeEvent(event) {
      return handleStripeEvent(webhookDeps, event);
    },
    getSubscription(subject) {
      return getSubscription(subscriptionsDeps, subject);
    },
    hasProSubscription(subject) {
      return hasProSubscription(
        { db: config.db, provider: config.provider, app: config.app },
        subject,
      );
    },
    listSubscriptions(subject) {
      return listSubscriptions(subscriptionsDeps, subject);
    },
    cancelSubscription(input) {
      return cancelSubscription(subscriptionsDeps, input);
    },
    updateSubscription(input) {
      return updateSubscription(subscriptionsDeps, input);
    },
    switchPlan(input) {
      return switchPlan(planChangesDeps, input);
    },
    reactivateSubscription(input) {
      return reactivateSubscription(planChangesDeps, input);
    },
    previewPlanChange(input) {
      return previewPlanChange(planChangesDeps, input);
    },
    createPortalSession(input) {
      return createPortalSession(
        {
          db: config.db,
          provider: config.provider,
          providerClient,
          organizationsEnabled: config.organizationsEnabled,
          app: config.app,
          logger: config.logger,
        },
        input,
      );
    },
    cancelBillingForSubject(subject) {
      return cancelBillingForSubject(subscriptionsDeps, subject);
    },
    reconcileSubscriptions(opts) {
      return reconcileSubscriptionStatuses({
        db: config.db,
        provider: config.provider,
        providerClient,
        app: config.app,
        logger: config.logger,
        batchSize: opts?.batchSize,
      });
    },
    expireMonthlyBonusCredits(opts) {
      return expireMonthlyBonusCredits({
        db: config.db,
        app: config.app,
        logger: config.logger,
        now: opts?.now,
        batchSize: opts?.batchSize,
      });
    },
    grantPendingMonthlyBonusCredits(opts) {
      return grantPendingMonthlyBonusCredits({
        db: config.db,
        app: config.app,
        products: config.products,
        logger: config.logger,
        onAudit: config.onAudit,
        now: opts?.now,
        batchSize: opts?.batchSize,
      });
    },
    releaseExpiredReservations(opts) {
      return releaseExpiredReservations({
        db: config.db,
        app: config.app,
        logger: config.logger,
        now: opts?.now,
        batchSize: opts?.batchSize,
      });
    },
    retryDunningEmails(opts) {
      return retryFailedDunningEmails({
        db: config.db,
        app: config.app,
        provider: config.provider,
        logger: config.logger,
        send: opts.send,
        maxAttempts: opts.maxAttempts,
        cooldownHours: opts.cooldownHours,
        now: opts.now,
        batchSize: opts.batchSize,
      });
    },
  };
}
