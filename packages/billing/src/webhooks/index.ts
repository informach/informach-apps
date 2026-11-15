import type { Product } from "@informach/config";
import { getAppCollection, getCollectionApps } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  customers,
  legacyContractAcceptances,
  subscriptions,
  webhookEvents,
} from "@informach/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { BillingEmailDeps } from "./../billing-emails";
import {
  isLegacyBillingEvent,
  legacyPaymentReference,
  refreshLegacyCreditPayment,
  resolveLegacyFinancialCustomer,
  withLegacyFinancialEventLock,
} from "../credits/legacy-payments";
import {
  refreshLegacyCustomerSubscriptionFunding,
  refreshLegacySubscriptionFunding,
} from "../credits/legacy-subscriptions";
import { INVOICE_VERIFICATION_PENDING } from "../errors";
import { type Logger, safeLog } from "./../logger";
import type { BillingProviderClient } from "./../providers";
import type { BillingAuditEvent, BillingProvider } from "./../types";
import { handleCheckoutSessionCompleted } from "./checkout";
import { extractSubscriptionId, handleInvoicePaid, handleInvoicePaymentFailed } from "./invoice";
import { handlePaymentIntentSucceeded } from "./payment";
import { handleSubscriptionLifecycle } from "./subscription";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

export type ParsedWebhookEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

function providerEventCreatedAt(payload: Record<string, unknown>): Date | undefined {
  const seconds = payload.created;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : undefined;
}

export type StripeWebhookDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  /**
   * App slug usado em `customers.app`/`credit_ledger.app`. Cada app tem seu
   * próprio endpoint de webhook, então essa instância recebe SÓ eventos do
   * próprio app.
   */
  app: string;
  /**
   * Dedupe scope for this app/webhook endpoint. Stripe event IDs are global to
   * the Stripe account, but this monorepo has one endpoint per app.
   */
  webhookScope?: string;
  guardClosedBilling?: boolean;
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

const WEBHOOK_PROCESSING_STALE_MS = 5 * 60_000;

export function verifyStripeSignature(
  providerClient: BillingProviderClient,
  rawBody: string,
  signature: string | null,
): ParsedWebhookEvent {
  return providerClient.verifyWebhookSignature(rawBody, signature);
}

/**
 * Idempotently handles a Stripe webhook event. The row in `webhook_events` is
 * claimed before dispatch so duplicate deliveries cannot process concurrently.
 * Processed rows are deduped; failed or stale in-progress rows are retried. On
 * success, updates processedAt; on error, clears the claim, records the error,
 * and rethrows so Stripe retries.
 */
export async function handleStripeEvent(
  deps: StripeWebhookDeps,
  event: ParsedWebhookEvent,
): Promise<WebhookHandlerResult> {
  const providerEventKey = buildProviderEventKey(deps, event.id);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - WEBHOOK_PROCESSING_STALE_MS);
  let providerCustomerId: string | null;
  try {
    providerCustomerId = await resolveLegacyFinancialCustomer(deps, event);
  } catch (error) {
    // Preserve the signed receipt even when the provider cannot identify its
    // customer. The app-wide family lock keeps it visible before any coverage
    // transaction can pass; retry will resolve the original signed payload.
    await withLegacyFinancialEventLock(
      deps,
      event,
      async (writer) =>
        writer
          .insert(webhookEvents)
          .values({
            provider: deps.provider,
            providerEventId: providerEventKey,
            app: deps.app,
            providerCustomerId: null,
            eventType: event.type,
            payload: event.payload,
            processingStartedAt: null,
            attempts: 1,
            error: "Financial event customer resolution failed",
          })
          .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] }),
      null,
    );
    throw error;
  }
  const inserted = await withLegacyFinancialEventLock(
    deps,
    event,
    async (writer) =>
      writer
        .insert(webhookEvents)
        .values({
          provider: deps.provider,
          providerEventId: providerEventKey,
          app: deps.app,
          providerCustomerId,
          eventType: event.type,
          payload: event.payload,
          processingStartedAt: now,
          attempts: 1,
        })
        .onConflictDoNothing({
          target: [webhookEvents.provider, webhookEvents.providerEventId],
        })
        .returning({ id: webhookEvents.id }),
    providerCustomerId,
  );

  if (inserted.length === 0) {
    const existingRows = await deps.db
      .select({
        processedAt: webhookEvents.processedAt,
        app: webhookEvents.app,
        providerCustomerId: webhookEvents.providerCustomerId,
        processingStartedAt: webhookEvents.processingStartedAt,
        error: webhookEvents.error,
        attempts: webhookEvents.attempts,
      })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, deps.provider),
          eq(webhookEvents.providerEventId, providerEventKey),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (existing?.app && existing.app !== deps.app)
      throw new Error("Webhook receipt conflicts with its application scope");
    if (existing?.providerCustomerId && existing.providerCustomerId !== providerCustomerId)
      throw new Error("Webhook receipt conflicts with its customer scope");
    if (!existing) {
      throw new Error(
        `@informach/billing: webhook_events conflict but row not found for '${providerEventKey}'`,
      );
    }
    if (existing.processedAt) {
      safeLog(deps.logger, "debug", "billing.webhook.deduped", {
        providerEventId: event.id,
        providerEventKey,
        eventType: event.type,
      });
      return { processed: false, deduped: true, reason: "already_processed" };
    }

    const isActivelyProcessing =
      !existing.error &&
      existing.processingStartedAt !== null &&
      existing.processingStartedAt > staleBefore;
    if (isActivelyProcessing) {
      safeLog(deps.logger, "debug", "billing.webhook.deduped_in_progress", {
        providerEventId: event.id,
        providerEventKey,
        eventType: event.type,
        attempts: existing.attempts,
      });
      return { processed: false, deduped: true, reason: "already_processing" };
    }

    const claimed = await withLegacyFinancialEventLock(
      deps,
      event,
      async (writer) =>
        writer
          .update(webhookEvents)
          .set({
            app: deps.app,
            providerCustomerId,
            eventType: event.type,
            payload: event.payload,
            processingStartedAt: now,
            error: null,
            attempts: sql`${webhookEvents.attempts} + 1`,
          })
          .where(
            and(
              eq(webhookEvents.provider, deps.provider),
              eq(webhookEvents.providerEventId, providerEventKey),
              isNull(webhookEvents.processedAt),
              or(
                isNotNull(webhookEvents.error),
                isNull(webhookEvents.processingStartedAt),
                lte(webhookEvents.processingStartedAt, staleBefore),
              ),
            ),
          )
          .returning({ id: webhookEvents.id }),
      providerCustomerId,
    );

    if (claimed.length === 0) {
      safeLog(deps.logger, "debug", "billing.webhook.deduped_in_progress", {
        providerEventId: event.id,
        providerEventKey,
        eventType: event.type,
        attempts: existing.attempts,
      });
      return { processed: false, deduped: true, reason: "already_processing" };
    }

    safeLog(deps.logger, "warn", "billing.webhook.retrying_unprocessed", {
      providerEventId: event.id,
      providerEventKey,
      eventType: event.type,
      attempts: existing.attempts,
      previousError: existing.error,
    });
  }

  try {
    if (
      getAppCollection(deps.app) === "compasso" &&
      isLegacyBillingEvent(event.type) &&
      !providerCustomerId
    )
      throw new Error("Legacy financial event customer requires reconciliation");
    const reason = await dispatchEvent(deps, event, providerCustomerId);
    if (
      getAppCollection(deps.app) === "compasso" &&
      providerCustomerId &&
      (event.type.startsWith("customer.subscription.") || event.type.startsWith("invoice."))
    ) {
      const [accepted] = await deps.db
        .select({ id: legacyContractAcceptances.id })
        .from(legacyContractAcceptances)
        .innerJoin(subscriptions, eq(subscriptions.id, legacyContractAcceptances.subscriptionId))
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .where(
          and(
            eq(customers.app, deps.app),
            eq(customers.provider, "stripe"),
            eq(customers.providerCustomerId, providerCustomerId),
          ),
        )
        .limit(1);
      if (accepted && !(await refreshLegacyCustomerSubscriptionFunding(deps, providerCustomerId)))
        throw new Error("Legacy subscription facts require reconciliation");
    }
    await deps.db
      .update(webhookEvents)
      .set({ processedAt: new Date(), processingStartedAt: null, error: null })
      .where(
        and(
          eq(webhookEvents.provider, deps.provider),
          eq(webhookEvents.providerEventId, providerEventKey),
        ),
      );
    return { processed: true, deduped: false, reason };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db
      .update(webhookEvents)
      .set({
        error: message,
        processingStartedAt: null,
      })
      .where(
        and(
          eq(webhookEvents.provider, deps.provider),
          eq(webhookEvents.providerEventId, providerEventKey),
        ),
      );
    safeLog(deps.logger, "error", "billing.webhook.dispatch_error", {
      providerEventId: event.id,
      providerEventKey,
      eventType: event.type,
      error: message,
    });
    throw err;
  }
}

function buildProviderEventKey(deps: StripeWebhookDeps, providerEventId: string): string {
  const scope = deps.webhookScope?.trim();
  return scope ? `${scope}:${providerEventId}` : providerEventId;
}

/** Reuses the signed-event processor and its durable claim; no second webhook engine.
 * Attempt order prevents one permanently failing receipt from starving newer work.
 */
export async function retryLegacyFinancialEvents(deps: StripeWebhookDeps) {
  if (getAppCollection(deps.app) !== "compasso") return { retried: 0 };
  const rows = await deps.db
    .select({ payload: webhookEvents.payload, type: webhookEvents.eventType })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, deps.provider),
        isNull(webhookEvents.processedAt),
        or(
          eq(webhookEvents.app, deps.app),
          and(
            isNull(webhookEvents.app),
            sql`starts_with(${webhookEvents.providerEventId}, ${`${deps.webhookScope?.trim() ?? ""}:`})`,
          ),
        ),
        or(
          eq(webhookEvents.eventType, "charge.refunded"),
          sql`${webhookEvents.eventType} like 'charge.dispute.%'`,
          sql`${webhookEvents.eventType} like 'customer.subscription.%'`,
          sql`${webhookEvents.eventType} like 'invoice.%'`,
        ),
        or(
          isNull(webhookEvents.processingStartedAt),
          lt(webhookEvents.processingStartedAt, new Date(Date.now() - WEBHOOK_PROCESSING_STALE_MS)),
        ),
      ),
    )
    .orderBy(asc(webhookEvents.attempts), asc(webhookEvents.createdAt))
    .limit(20);
  const failures: unknown[] = [];
  for (const row of rows) {
    try {
      const id = row.payload.id;
      if (typeof id !== "string" || !id.startsWith("evt_"))
        throw new Error("Financial event receipt has no original provider id");
      await handleStripeEvent(deps, { id, type: row.type, payload: row.payload });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Legacy financial events still require reconciliation");
  return { retried: rows.length };
}

const retryInvoicePayload = z.object({
  id: z.string().startsWith("evt_"),
  data: z.object({
    object: z.object({
      id: z.string().startsWith("pi_"),
      invoice: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
      customer: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
      metadata: z.record(z.string(), z.string()).nullish(),
    }),
  }),
});

/** Retry only previously admitted subscription-invoice observations. The
 * original event processor owns the durable claim and all receipt updates. */
export async function retryPendingInvoiceVerifications(deps: {
  db: Database;
  providerClient: BillingProviderClient;
}) {
  const verify = deps.providerClient.isPaidSubscriptionInvoice;
  if (!verify) throw new Error("Subscription invoice verification is unavailable");
  const rows = await deps.db
    .select({
      app: webhookEvents.app,
      key: webhookEvents.providerEventId,
      payload: webhookEvents.payload,
    })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "stripe"),
        eq(webhookEvents.eventType, "payment_intent.succeeded"),
        eq(webhookEvents.error, INVOICE_VERIFICATION_PENDING),
        inArray(
          webhookEvents.app,
          getCollectionApps("compasso").map((app) => app.slug),
        ),
        isNull(webhookEvents.processedAt),
        or(
          isNull(webhookEvents.processingStartedAt),
          lt(webhookEvents.processingStartedAt, new Date(Date.now() - WEBHOOK_PROCESSING_STALE_MS)),
        ),
      ),
    )
    .orderBy(asc(webhookEvents.attempts), asc(webhookEvents.createdAt))
    .limit(2);
  const failures: unknown[] = [];
  let retried = 0;
  for (const row of rows) {
    let admitted = false;
    try {
      const parsed = retryInvoicePayload.safeParse(row.payload);
      if (!row.app || !parsed.success) throw new Error("Invalid pending invoice receipt");
      const { id, data } = parsed.data;
      const metadata = data.object.metadata ?? {};
      if (
        [
          metadata.subject_type,
          metadata.subject_id,
          metadata.product_id,
          metadata.credit_amount,
        ].some(Boolean)
      )
        throw new Error("Pending invoice receipt contains payment metadata");
      const suffix = `:${id}`;
      if (row.key !== id && !row.key.endsWith(suffix))
        throw new Error("Invalid pending invoice scope");
      const scope = row.key === id ? undefined : row.key.slice(0, -suffix.length);
      if (row.key !== id && !scope) throw new Error("Invalid pending invoice scope");
      const providerClient = {
        ...deps.providerClient,
        async isPaidSubscriptionInvoice(invoiceId: string, customerId: string) {
          if (!(await verify.call(deps.providerClient, invoiceId, customerId)))
            throw new Error("Subscription-only invoice is not confirmed");
          return true;
        },
      };
      admitted = true;
      const result = await handleStripeEvent(
        {
          db: deps.db,
          provider: "stripe",
          providerClient,
          app: row.app,
          webhookScope: scope,
          products: [],
        },
        { id, type: "payment_intent.succeeded", payload: row.payload },
      );
      if (!result.deduped) retried++;
    } catch (error) {
      failures.push(error);
      if (!admitted) {
        try {
          await deps.db
            .update(webhookEvents)
            .set({ attempts: sql`${webhookEvents.attempts} + 1` })
            .where(
              and(
                eq(webhookEvents.provider, "stripe"),
                eq(webhookEvents.providerEventId, row.key),
                isNull(webhookEvents.processedAt),
                eq(webhookEvents.error, INVOICE_VERIFICATION_PENDING),
              ),
            );
        } catch (updateError) {
          failures.push(updateError);
        }
      }
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Subscription invoice verifications remain pending");
  return { retried };
}

async function dispatchEvent(
  deps: StripeWebhookDeps,
  event: ParsedWebhookEvent,
  providerCustomerId: string | null,
): Promise<string> {
  const subscriptionDeps = {
    db: deps.db,
    provider: deps.provider,
    providerClient: deps.providerClient,
    app: deps.app,
    logger: deps.logger,
    onAudit: deps.onAudit,
    emails: deps.emails,
  };
  const data = (event.payload as { data?: { object?: unknown } }).data;
  const obj = data?.object;

  // Stripe delivers the same account-wide events to each app's endpoint.
  // Only skip when the globally unique provider customer is already recorded
  // for another app; an unknown customer must still follow reconciliation.
  if (
    providerCustomerId &&
    (event.type.startsWith("customer.subscription.") || event.type.startsWith("invoice."))
  ) {
    const [customer] = await deps.db
      .select({ app: customers.app })
      .from(customers)
      .where(
        and(
          eq(customers.provider, deps.provider),
          eq(customers.providerCustomerId, providerCustomerId),
        ),
      )
      .limit(1);
    if (customer && customer.app !== deps.app) return "customer_other_app";
  }

  if (deps.guardClosedBilling && obj && typeof obj === "object") {
    const object = obj as {
      id?: string;
      customer?: string | { id?: string };
      subscription?: string | { id?: string };
      parent?: { subscription_details?: { subscription?: string | { id?: string } } };
    };
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const reference = event.type.startsWith("customer.subscription.")
      ? object.id
      : (object.subscription ?? object.parent?.subscription_details?.subscription);
    const subscriptionId = typeof reference === "string" ? reference : reference?.id;
    if (customerId && subscriptionId) {
      const [customer] = await deps.db
        .select({ metadata: customers.metadata })
        .from(customers)
        .where(
          and(
            eq(customers.provider, deps.provider),
            eq(customers.app, deps.app),
            eq(customers.providerCustomerId, customerId),
          ),
        );
      const closed = customer?.metadata.closedSubscriptionIds;
      if (Array.isArray(closed) && closed.includes(subscriptionId)) return "subscription_closed";
    }
  }

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
        { products: deps.products, eventCreatedAt: providerEventCreatedAt(event.payload) },
      );
      return result.upserted ? "subscription_upserted" : `subscription_skipped:${result.reason}`;
    }
    case "payment_intent.succeeded": {
      if (!obj) return "no_object";
      const result = await handlePaymentIntentSucceeded(
        {
          db: deps.db,
          provider: deps.provider,
          app: deps.app,
          logger: deps.logger,
          onAudit: deps.onAudit,
          emails: deps.emails,
          products: deps.products,
          providerClient: deps.providerClient,
        },
        obj as Parameters<typeof handlePaymentIntentSucceeded>[1],
        event.id,
      );
      return result.processed ? `payment.${result.reason}` : `payment_skipped:${result.reason}`;
    }
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated": {
      const paymentId = legacyPaymentReference(obj);
      if (paymentId && (await refreshLegacyCreditPayment(deps, paymentId)))
        return "legacy_payment_reconciled";
      return providerCustomerId &&
        (await refreshLegacyCustomerSubscriptionFunding(deps, providerCustomerId))
        ? "legacy_subscription_funding_reconciled"
        : "not_a_legacy_credit_payment";
    }
    case "invoice.paid": {
      if (!obj) return "no_object";
      const result = await handleInvoicePaid(
        {
          db: deps.db,
          provider: deps.provider,
          providerClient: deps.providerClient,
          app: deps.app,
          products: deps.products,
          logger: deps.logger,
          onAudit: deps.onAudit,
          emails: deps.emails,
        },
        obj as Parameters<typeof handleInvoicePaid>[1],
        event.id,
        providerEventCreatedAt(event.payload),
      );
      const subscriptionId = extractSubscriptionId(obj as Parameters<typeof handleInvoicePaid>[1]);
      if (subscriptionId) await refreshLegacySubscriptionFunding(deps, subscriptionId);
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
          providerClient: deps.providerClient,
          app: deps.app,
          products: deps.products,
          logger: deps.logger,
          onAudit: deps.onAudit,
        },
        obj as Parameters<typeof handleInvoicePaymentFailed>[1],
        event.id,
        providerEventCreatedAt(event.payload),
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
