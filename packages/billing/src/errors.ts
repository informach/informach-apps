export class BillingError extends Error {
  constructor(message: string) {
    super(`@informach/billing: ${message}`);
    this.name = "BillingError";
  }
}

export class CheckoutPendingError extends BillingError {
  constructor() {
    super(
      "A confirmação do pagamento anterior ainda está pendente. Aguarde a atualização da assinatura ou encerre a cobrança em Minha família.",
    );
    this.name = "CheckoutPendingError";
  }
}

export class NotImplementedError extends BillingError {
  constructor(feature: string) {
    super(`${feature} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export class InvalidProductError extends BillingError {
  constructor(productId: string, reason?: string) {
    super(reason ? `invalid product '${productId}': ${reason}` : `invalid product '${productId}'`);
    this.name = "InvalidProductError";
  }
}

export class WebhookSignatureError extends BillingError {
  constructor(reason: string) {
    super(`webhook signature verification failed: ${reason}`);
    this.name = "WebhookSignatureError";
  }
}

export class InsufficientCreditsError extends BillingError {
  readonly available: number;
  readonly requested: number;
  constructor(available: number, requested: number) {
    super(`insufficient credits: requested ${requested}, available ${available}`);
    this.name = "InsufficientCreditsError";
    this.available = available;
    this.requested = requested;
  }
}

export class ReservationNotFoundError extends BillingError {
  constructor(reservationId: string) {
    super(`reservation '${reservationId}' not found`);
    this.name = "ReservationNotFoundError";
  }
}

export class ReservationExpiredError extends BillingError {
  constructor(reservationId: string) {
    super(`reservation '${reservationId}' is expired`);
    this.name = "ReservationExpiredError";
  }
}

export class ReservationAlreadyResolvedError extends BillingError {
  constructor(reservationId: string, currentStatus: string) {
    super(`reservation '${reservationId}' already resolved (status=${currentStatus})`);
    this.name = "ReservationAlreadyResolvedError";
  }
}

export class OrganizationsDisabledError extends BillingError {
  constructor() {
    super("subject of type 'organization' is not allowed when organizationsEnabled is false");
    this.name = "OrganizationsDisabledError";
  }
}

export class CustomerNotFoundError extends BillingError {
  constructor(subjectType: string, subjectId: string) {
    super(`customer not found for subject ${subjectType}:${subjectId}`);
    this.name = "CustomerNotFoundError";
  }
}

/**
 * Thrown by `createSubscriptionCheckout` when the subject already has an
 * active-ish subscription (active, trialing, or past_due). Apps should catch
 * this and route the user to the in-app plan management screen (where they
 * can switch plans via `switchPlan` instead of creating a new subscription).
 *
 * Stripe technically allows multiple subscriptions per customer, but our
 * domain model is "one subscription per subject" — concurrent subs lead to
 * double billing and confused state in our local row.
 */
export class AlreadySubscribedError extends BillingError {
  readonly existingSubscriptionId: string;
  readonly existingProductId: string;
  constructor(input: { subscriptionId: string; productId: string }) {
    super(
      `subject already has an active subscription (id=${input.subscriptionId}, productId=${input.productId})`,
    );
    this.name = "AlreadySubscribedError";
    this.existingSubscriptionId = input.subscriptionId;
    this.existingProductId = input.productId;
  }
}

/**
 * Thrown when an action requires an active Pro subscription but the subject
 * doesn't have one. Used by `createCreditPackCheckout` and any future feature
 * gate that checks `hasProSubscription`. The `feature` field carries a
 * human-readable label for the UI to surface ("credit packs", etc).
 */
export class SubscriptionRequiredError extends BillingError {
  readonly feature: string;
  constructor(feature = "this feature") {
    super(`an active Pro subscription is required to use ${feature}`);
    this.name = "SubscriptionRequiredError";
    this.feature = feature;
  }
}
