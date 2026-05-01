export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`@informach/billing: ${feature} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export type ProductId = string;
export type BillingProvider = "stripe" | "asaas";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type CheckoutInput = {
  userId: string;
  productId: ProductId;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = {
  url: string;
  sessionId: string;
};

export type Subscription = {
  id: string;
  userId: string;
  productId: ProductId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
};

export async function createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
  throw new NotImplementedError("createCheckout");
}

export async function handleBillingWebhook(
  _provider: BillingProvider,
  _payload: unknown,
  _signature: string,
): Promise<void> {
  throw new NotImplementedError("handleBillingWebhook");
}

export async function getUserSubscription(_userId: string): Promise<Subscription | null> {
  throw new NotImplementedError("getUserSubscription");
}

export async function grantProductAccess(_userId: string, _productId: ProductId): Promise<void> {
  throw new NotImplementedError("grantProductAccess");
}

export async function revokeProductAccess(_userId: string, _productId: ProductId): Promise<void> {
  throw new NotImplementedError("revokeProductAccess");
}

export async function syncBillingCustomer(_userId: string): Promise<void> {
  throw new NotImplementedError("syncBillingCustomer");
}
