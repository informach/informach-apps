import type { Database } from "@informach/db";
import { webhookEvents } from "@informach/db/schema";
import type { Product } from "@informach/config";
import { and, eq, sql } from "drizzle-orm";
import type { BillingEmailDeps } from "./../billing-emails";
import { safeLog, type Logger } from "./../logger";
import type { BillingProviderClient } from "./../providers";
import type { BillingAuditEvent, BillingProvider } from "./../types";
import { handleCheckoutSessionCompleted } from "./checkout";
import { handleInvoicePaid, handleInvoicePaymentFailed } from "./invoice";
import { handlePaymentIntentSucceeded } from "./payment";
import { handleSubscriptionLifecycle } from "./subscription";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

export type ParsedWebhookEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type StripeWebhookDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  /** Catalog for THIS app — used by invoice handler to look up bonusCreditsPerMonth. */
  products: readonly Product[];
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  /** Optional email integration. When omitted, billing emails are no-ops. */
  emails?: BillingEmailDeps;
};

export type WebhookHandlerResult = {
  processed: boolean;
  deduped: boolean;
  reason?: string;
};

export function verifyStripeSignature(
  providerClient: BillingProviderClient,
  rawBody: string,
  signature: string | null,
): ParsedWebhookEvent {
  return providerClient.verifyWebhookSignature(rawBody, signature);
}

/**
 * Idempotently handles a Stripe webhook event. Inserts in `webhook_events` first
 * (UNIQUE on provider+providerEventId); if conflict, returns deduped=true.
 * Otherwise dispatches to the appropriate handler. On success, updates
 * processedAt; on error, updates error+attempts and rethrows so Stripe retries.
 */
export async function handleStripeEvent(
  deps: StripeWebhookDeps,
  event: ParsedWebhookEvent,
): Promise<WebhookHandlerResult> {
  const inserted = await deps.db
    .insert(webhookEvents)
    .values({
      provider: deps.provider,
      providerEventId: event.id,
      eventType: event.type,
      payload: event.payload,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.providerEventId],
    })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    safeLog(deps.logger, "debug", "billing.webhook.deduped", {
      providerEventId: event.id,
      eventType: event.type,
    });
    return { processed: false, deduped: true, reason: "already_processed" };
  }

  try {
    const reason = await dispatchEvent(deps, event);
    await deps.db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(
        and(
          eq(webhookEvents.provider, deps.provider),
          eq(webhookEvents.providerEventId, event.id),
        ),
      );
    return { processed: true, deduped: false, reason };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db
      .update(webhookEvents)
      .set({
        error: message,
        attempts: sql`${webhookEvents.attempts} + 1`,
      })
      .where(
        and(
          eq(webhookEvents.provider, deps.provider),
          eq(webhookEvents.providerEventId, event.id),
        ),
      );
    safeLog(deps.logger, "error", "billing.webhook.dispatch_error", {
      providerEventId: event.id,
      eventType: event.type,
      error: message,
    });
    throw err;
  }
}

async function dispatchEvent(deps: StripeWebhookDeps, event: ParsedWebhookEvent): Promise<string> {
  const subscriptionDeps = {
    db: deps.db,
    provider: deps.provider,
    logger: deps.logger,
    onAudit: deps.onAudit,
    emails: deps.emails,
  };
  const data = (event.payload as { data?: { object?: unknown } }).data;
  const obj = data?.object;

  switch (event.type) {
    case "checkout.session.completed": {
      if (!obj) return "no_object";
      const result = await handleCheckoutSessionCompleted(
        subscriptionDeps,
        obj as Parameters<typeof handleCheckoutSessionCompleted>[1],
      );
      return result.handled ? `checkout.${result.mode}` : `checkout.unhandled`;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!obj) return "no_object";
      const result = await handleSubscriptionLifecycle(
        subscriptionDeps,
        obj as Parameters<typeof handleSubscriptionLifecycle>[1],
        event.type,
        { products: deps.products },
      );
      return result.upserted ? "subscription_upserted" : `subscription_skipped:${result.reason}`;
    }
    case "payment_intent.succeeded": {
      if (!obj) return "no_object";
      const result = await handlePaymentIntentSucceeded(
        {
          db: deps.db,
          provider: deps.provider,
          logger: deps.logger,
          onAudit: deps.onAudit,
          emails: deps.emails,
          products: deps.products,
        },
        obj as Parameters<typeof handlePaymentIntentSucceeded>[1],
        event.id,
      );
      return result.processed ? `payment.${result.reason}` : `payment_skipped:${result.reason}`;
    }
    case "invoice.paid": {
      if (!obj) return "no_object";
      const result = await handleInvoicePaid(
        {
          db: deps.db,
          provider: deps.provider,
          products: deps.products,
          logger: deps.logger,
          onAudit: deps.onAudit,
          emails: deps.emails,
        },
        obj as Parameters<typeof handleInvoicePaid>[1],
        event.id,
      );
      return result.processed
        ? `invoice_paid.${result.reason}`
        : `invoice_paid_skipped:${result.reason}`;
    }
    case "invoice.payment_failed": {
      if (!obj) return "no_object";
      const result = await handleInvoicePaymentFailed(
        {
          db: deps.db,
          provider: deps.provider,
          products: deps.products,
          logger: deps.logger,
          onAudit: deps.onAudit,
        },
        obj as Parameters<typeof handleInvoicePaymentFailed>[1],
        event.id,
      );
      return result.processed
        ? `invoice_failed.${result.reason}`
        : `invoice_failed_skipped:${result.reason}`;
    }
    default:
      safeLog(deps.logger, "debug", "billing.webhook.event_ignored", {
        eventType: event.type,
        providerEventId: event.id,
      });
      return "ignored";
  }
}
