import {
  getStripePriceId,
  isStripePriceIdConfigured,
  type Product,
  type StripeMode,
} from "@informach/config";
import {
  customers as customersTable,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getProSubscription } from "./access";
import { getOrCreateCustomer } from "./customers";
import { AlreadySubscribedError, InvalidProductError, SubscriptionRequiredError } from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type {
  BillingAuditEvent,
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
  onAudit?: (event: BillingAuditEvent) => void;
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

  // Single-subscription invariant: refuse to start a checkout when the subject
  // already has an active-ish row. Apps should route the user to the plan
  // management screen (switchPlan) instead of creating a parallel sub. Without
  // this guard, a stray double-click on "Subscribe" creates two paid subs.
  const existing = await findActiveSubscriptionForSubject(deps, input.subject);
  if (existing) {
    safeLog(deps.logger, "warn", "billing.checkout.subscription.already_subscribed", {
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      existingSubscriptionId: existing.id,
      existingProductId: existing.productId,
      attemptedProductId: input.productId,
    });
    throw new AlreadySubscribedError({
      subscriptionId: existing.id,
      productId: existing.productId,
    });
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
  emitAudit(deps, input.actorId ?? null, {
    checkoutSessionId: session.id,
    productId: product.id,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    mode: "subscription",
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

  // Pro-only entitlement gate. Credit packs are top-ups for users who already
  // have an active Pro plan and are running low on monthly bonus credits —
  // there's no point letting a Free user buy them, since the AI features that
  // consume credits are themselves gated behind Pro. The single source of
  // truth is `PRO_STATUSES` in `./access.ts`.
  const proSub = await getProSubscription({ db: deps.db, provider: deps.provider }, input.subject);
  if (!proSub) {
    safeLog(deps.logger, "warn", "billing.checkout.credit_pack.no_pro_sub", {
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      productId: input.productId,
    });
    throw new SubscriptionRequiredError("credit packs");
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
  emitAudit(deps, input.actorId ?? null, {
    checkoutSessionId: session.id,
    productId: product.id,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    creditAmount: product.creditAmount,
    mode: "payment",
  });

  return { url: session.url, sessionId: session.id };
}

function emitAudit(
  deps: CheckoutDeps,
  actorId: string | null,
  payload: Record<string, unknown>,
): void {
  if (!deps.onAudit) return;
  try {
    deps.onAudit({
      eventType: "billing.checkout_started",
      actorId,
      payload,
      timestamp: new Date(),
    });
  } catch {
    // audit must never break checkout
  }
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
  // When no caller-supplied nonce is provided, derive a deterministic 5-minute
  // window key. Stripe's idempotency window is 24h; this short window catches
  // double-click / page-refresh duplicates without permanently locking out a
  // legitimate retry from the next session.
  const nonce = input.nonce ?? `auto:${Math.floor(Date.now() / 300_000)}`;
  return `${input.operation}:${input.subject.type}:${input.subject.id}:${input.productId}:${nonce}`;
}

async function findActiveSubscriptionForSubject(
  deps: Pick<CheckoutDeps, "db" | "provider">,
  subject: SubjectRef,
): Promise<{ id: string; productId: string } | null> {
  const rows = await deps.db
    .select({
      id: subscriptionsTable.id,
      productId: subscriptionsTable.productId,
    })
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.subjectType, subject.type),
        eq(customersTable.subjectId, subject.id),
        inArray(subscriptionsTable.status, ["active", "trialing", "past_due"]),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
