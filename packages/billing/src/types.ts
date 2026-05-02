export type { Product, ProductId, ProductKind, ProductPriceMap, StripeMode } from "@informach/config";

export type BillingProvider = "stripe" | "asaas";

export type SubjectType = "user" | "organization";

export type SubjectRef = {
  type: SubjectType;
  id: string;
};

export type CreditOwner = SubjectRef;

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type LedgerEntryType =
  | "purchase"
  | "bonus_grant"
  | "promo_grant"
  | "consumption"
  | "refund"
  | "expiration"
  | "adjustment";

export type ReservationStatus = "active" | "committed" | "released" | "expired";

export type CheckoutResult = {
  url: string;
  sessionId: string;
};

export type SubscriptionCheckoutInput = {
  subject: SubjectRef;
  productId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
};

export type CreditPackCheckoutInput = {
  subject: SubjectRef;
  productId: string;
  successUrl: string;
  cancelUrl: string;
};

export type PortalSessionInput = {
  subject: SubjectRef;
  returnUrl: string;
};

export type BillingAuditEventType =
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_canceled"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.credits_granted"
  | "billing.credits_consumed"
  | "billing.credits_refunded";

export type BillingAuditEvent = {
  eventType: BillingAuditEventType;
  actorId: string | null;
  payload: Record<string, unknown>;
  timestamp: Date;
};

export type CreditBalance = {
  total: number;
  reserved: number;
  available: number;
  expiringSoon: {
    amount: number;
    firstExpiresAt: Date | null;
  };
};

export type ReservationHandle = {
  id: string;
  ownerType: SubjectType;
  ownerId: string;
  estimatedAmount: number;
  expiresAt: Date;
};

export type ReservationReleaseReason =
  | "user_cancel"
  | "llm_error"
  | "timeout"
  | "validation_failed";
