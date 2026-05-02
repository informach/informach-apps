export class BillingError extends Error {
  constructor(message: string) {
    super(`@informach/billing: ${message}`);
    this.name = "BillingError";
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
