import {
  getStripePriceId,
  isStripePriceIdConfigured,
  type Product,
  type StripeMode,
} from "@informach/config";
import { getOrCreateCustomer } from "./customers";
import { InvalidProductError } from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type {
  BillingProvider,
  CheckoutResult,
  CreditPackCheckoutInput,
  SubjectRef,
  SubscriptionCheckoutInput,
} from "./types";

export type CheckoutDeps = {
  db: import("@informach/db").Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  organizationsEnabled: boolean;
  products: readonly Product[];
  publicAppUrl: string;
  stripeMode: StripeMode;
  logger?: Logger;
  /** Resolves the customer's email from a subject. Provided by the app. */
  resolveSubjectEmail: (subject: SubjectRef) => Promise<string>;
};

/**
 * Creates a Stripe Checkout session for a subscription product.
 * Idempotency: `idempotencyKey` is derived from `op:subjectType:subjectId:productId:nonce`
 * — Stripe stores it for 24h. Caller passes a stable `nonce` (e.g., a UUID per click).
 */
export async function createSubscriptionCheckout(
  deps: CheckoutDeps,
  input: SubscriptionCheckoutInput & { idempotencyNonce?: string },
): Promise<CheckoutResult> {
  const product = resolveProduct(deps.products, input.productId);
  if (product.kind !== "subscription") {
    throw new InvalidProductError(
      input.productId,
      `expected kind='subscription', got '${product.kind}'`,
    );
  }

  const email = await deps.resolveSubjectEmail(input.subject);
  const customer = await getOrCreateCustomer(
    {
      db: deps.db,
      provider: deps.provider,
      providerClient: deps.providerClient,
      organizationsEnabled: deps.organizationsEnabled,
      logger: deps.logger,
    },
    {
      subject: input.subject,
      email,
    },
  );

  const priceId = getStripePriceId(product, deps.stripeMode);
  if (!isStripePriceIdConfigured(priceId)) {
    throw new InvalidProductError(
      input.productId,
      `stripe price id for mode '${deps.stripeMode}' is not configured`,
    );
  }
  const idempotencyKey = buildIdempotencyKey({
    operation: "checkout_sub",
    subject: input.subject,
    productId: input.productId,
    nonce: input.idempotencyNonce,
  });

  const session = await deps.providerClient.createCheckoutSession({
    mode: "subscription",
    customerId: customer.providerCustomerId,
    priceId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      subject_type: input.subject.type,
      subject_id: input.subject.id,
      product_id: product.id,
    },
    trialDays: input.trialDays,
    idempotencyKey,
  });

  safeLog(deps.logger, "info", "billing.checkout.subscription.created", {
    productId: product.id,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    sessionId: session.id,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Creates a Stripe Checkout session for a one-time credit pack purchase.
 */
export async function createCreditPackCheckout(
  deps: CheckoutDeps,
  input: CreditPackCheckoutInput & { idempotencyNonce?: string },
): Promise<CheckoutResult> {
  const product = resolveProduct(deps.products, input.productId);
  if (product.kind !== "credit_pack") {
    throw new InvalidProductError(
      input.productId,
      `expected kind='credit_pack', got '${product.kind}'`,
    );
  }
  if (!product.creditAmount || product.creditAmount <= 0) {
    throw new InvalidProductError(input.productId, "credit_pack must define creditAmount > 0");
  }

  const email = await deps.resolveSubjectEmail(input.subject);
  const customer = await getOrCreateCustomer(
    {
      db: deps.db,
      provider: deps.provider,
      providerClient: deps.providerClient,
      organizationsEnabled: deps.organizationsEnabled,
      logger: deps.logger,
    },
    {
      subject: input.subject,
      email,
    },
  );

  const priceId = getStripePriceId(product, deps.stripeMode);
  if (!isStripePriceIdConfigured(priceId)) {
    throw new InvalidProductError(
      input.productId,
      `stripe price id for mode '${deps.stripeMode}' is not configured`,
    );
  }
  const idempotencyKey = buildIdempotencyKey({
    operation: "checkout_credit",
    subject: input.subject,
    productId: input.productId,
    nonce: input.idempotencyNonce,
  });

  const session = await deps.providerClient.createCheckoutSession({
    mode: "payment",
    customerId: customer.providerCustomerId,
    priceId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      subject_type: input.subject.type,
      subject_id: input.subject.id,
      product_id: product.id,
      credit_amount: String(product.creditAmount),
    },
    idempotencyKey,
  });

  safeLog(deps.logger, "info", "billing.checkout.credit_pack.created", {
    productId: product.id,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    creditAmount: product.creditAmount,
    sessionId: session.id,
  });

  return { url: session.url, sessionId: session.id };
}

function resolveProduct(products: readonly Product[], productId: string): Product {
  const product = products.find((p) => p.id === productId);
  if (!product) {
    throw new InvalidProductError(productId, "product not in this app's catalog");
  }
  return product;
}

function buildIdempotencyKey(input: {
  operation: string;
  subject: SubjectRef;
  productId: string;
  nonce?: string;
}): string {
  const nonce = input.nonce ?? crypto.randomUUID();
  return `${input.operation}:${input.subject.type}:${input.subject.id}:${input.productId}:${nonce}`;
}
