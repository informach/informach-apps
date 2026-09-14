import type { Database } from "@informach/db";
import {
  checkoutIntents,
  customers as customersTable,
  type Subscription as SubscriptionRow,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { recoverPendingCheckout } from "./checkout-lifecycle";
import { BillingError, CustomerNotFoundError, OrganizationsDisabledError } from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingAuditEvent, BillingProvider, SubjectRef } from "./types";

export type SubscriptionsDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  organizationsEnabled: boolean;
  managedCheckout?: boolean;
  /** App slug — escopo de isolamento usado para casar customers do mesmo subject. */
  app: string;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};

export type CancelSubscriptionInput = {
  /** Local subscription row id (uuid PK in `billing.subscriptions`). */
  subscriptionId: string;
  actorId?: string | null;
  reason?: string;
  /** Default true (graceful at-period-end). False = immediate cancel. */
  atPeriodEnd?: boolean;
};

export type UpdateSubscriptionInput = {
  subscriptionId: string;
  actorId?: string | null;
  newPriceId: string;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
};

/**
 * Returns the FIRST active-ish subscription row for an owner subject. Owners
 * with multiple historical subscriptions still get the most recent active one
 * (heuristic: status IN active|trialing|past_due, then ordered by createdAt desc).
 * Use {@link listSubscriptions} for the full list.
 */
export async function getSubscription(
  deps: SubscriptionsDeps,
  subject: SubjectRef,
): Promise<SubscriptionRow | null> {
  assertSubjectAllowed(deps, subject);
  const customer = await findCustomerForSubject(deps, subject);
  if (!customer) return null;
  const rows = await deps.db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.customerId, customer.id),
        inArray(subscriptionsTable.status, ["active", "trialing", "past_due"]),
      ),
    )
    .orderBy(desc(subscriptionsTable.createdAt), desc(subscriptionsTable.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSubscriptions(
  deps: SubscriptionsDeps,
  subject: SubjectRef,
): Promise<SubscriptionRow[]> {
  assertSubjectAllowed(deps, subject);
  const customer = await findCustomerForSubject(deps, subject);
  if (!customer) return [];
  return deps.db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.customerId, customer.id));
}

/**
 * Calls the provider to cancel the subscription. Stripe is the source of truth:
 * the webhook (`customer.subscription.updated` for atPeriodEnd, `deleted` for
 * immediate) will reconcile the local row. We update locally optimistically to
 * keep the UI in sync, but a missed webhook is recovered by reconcile sweepers.
 */
export async function cancelSubscription(
  deps: SubscriptionsDeps,
  input: CancelSubscriptionInput,
): Promise<SubscriptionRow> {
  const row = await loadSubscriptionRow(deps, input.subscriptionId);
  const summary = await deps.providerClient.cancelSubscription({
    providerSubscriptionId: row.providerSubscriptionId,
    atPeriodEnd: input.atPeriodEnd,
  });

  const isImmediate = input.atPeriodEnd === false;
  const updated = await deps.db
    .update(subscriptionsTable)
    .set({
      status: isImmediate ? "canceled" : row.status,
      cancelAtPeriodEnd: summary.cancelAtPeriodEnd ? summary.currentPeriodEnd : null,
      canceledAt: isImmediate ? new Date() : row.canceledAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, row.id))
    .returning();
  const updatedRow = updated[0] ?? row;

  emitAudit(deps, input.actorId ?? null, "billing.subscription_canceled", {
    subscriptionId: row.id,
    providerSubscriptionId: row.providerSubscriptionId,
    atPeriodEnd: !isImmediate,
    ...(input.reason ? { reason: input.reason } : {}),
  });
  safeLog(deps.logger, "info", "billing.subscription.cancel", {
    subscriptionId: row.id,
    atPeriodEnd: !isImmediate,
  });
  return updatedRow;
}

export async function updateSubscription(
  deps: SubscriptionsDeps,
  input: UpdateSubscriptionInput,
): Promise<SubscriptionRow> {
  const row = await loadSubscriptionRow(deps, input.subscriptionId);
  const summary = await deps.providerClient.updateSubscription({
    providerSubscriptionId: row.providerSubscriptionId,
    newPriceId: input.newPriceId,
    prorationBehavior: input.prorationBehavior,
  });

  const updated = await deps.db
    .update(subscriptionsTable)
    .set({
      providerPriceId: input.newPriceId,
      status: normalizeStatus(summary.status),
      confirmedAt:
        summary.status === "active" || summary.status === "trialing"
          ? (row.confirmedAt ?? new Date())
          : row.confirmedAt,
      currentPeriodEnd: summary.currentPeriodEnd ?? row.currentPeriodEnd,
      cancelAtPeriodEnd: summary.cancelAtPeriodEnd ? summary.currentPeriodEnd : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, row.id))
    .returning();
  const updatedRow = updated[0] ?? row;

  emitAudit(deps, input.actorId ?? null, "billing.subscription_updated", {
    subscriptionId: row.id,
    providerSubscriptionId: row.providerSubscriptionId,
    oldPriceId: row.providerPriceId,
    newPriceId: input.newPriceId,
    prorationBehavior: input.prorationBehavior ?? "create_prorations",
  });
  safeLog(deps.logger, "info", "billing.subscription.update", {
    subscriptionId: row.id,
    newPriceId: input.newPriceId,
  });
  return updatedRow;
}

/**
 * LGPD/account-deletion hook. Cancels every active subscription for the subject
 * IMMEDIATELY (not at-period-end) and returns counts. Rows are NOT deleted —
 * Stripe webhook will mark them canceled, and we retain `subjectId` for fiscal
 * audit retention (NF-e). Caller is expected to anonymize PII separately.
 */
export async function cancelBillingForSubject(
  deps: SubscriptionsDeps,
  subject: SubjectRef,
): Promise<{ canceled: number; failed: number }> {
  assertSubjectAllowed(deps, subject);
  const customer = await findCustomerForSubject(deps, subject);
  if (!customer) {
    return { canceled: 0, failed: 0 };
  }
  const active = await deps.db
    .select({
      id: subscriptionsTable.id,
      providerSubscriptionId: subscriptionsTable.providerSubscriptionId,
    })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.customerId, customer.id),
        inArray(subscriptionsTable.status, [
          "active",
          "trialing",
          "past_due",
          "unpaid",
          "incomplete",
          "paused",
        ]),
      ),
    );

  let canceled = 0;
  let failed = 0;
  for (const sub of active) {
    try {
      await deps.providerClient.cancelSubscription({
        providerSubscriptionId: sub.providerSubscriptionId,
        atPeriodEnd: false,
      });
      await deps.db
        .update(subscriptionsTable)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.id, sub.id));
      canceled++;
    } catch (err) {
      failed++;
      safeLog(deps.logger, "error", "billing.subscription.lgpd_cancel_error", {
        subscriptionId: sub.id,
        providerSubscriptionId: sub.providerSubscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  emitAudit(deps, null, "billing.subscription_canceled", {
    reason: "lgpd_account_deletion",
    subjectType: subject.type,
    subjectId: subject.id,
    canceled,
    failed,
  });
  return { canceled, failed };
}

function assertSubjectAllowed(deps: SubscriptionsDeps, subject: SubjectRef): void {
  if (subject.type === "organization" && !deps.organizationsEnabled) {
    throw new OrganizationsDisabledError();
  }
}

/** Stronger opt-in closure. Callers must serialize checkout creation and closure
 * for this subject until their app data deletion is complete. Never infer remote
 * state from local webhook projections when terminating a customer's billing. */
export async function closeRemoteBillingForSubject(deps: SubscriptionsDeps, subject: SubjectRef) {
  assertSubjectAllowed(deps, subject);
  const [customer] = await deps.db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.app, deps.app),
        eq(customersTable.subjectType, subject.type),
        eq(customersTable.subjectId, subject.id),
      ),
    );
  if (!customer) return { expired: 0, canceled: 0 };
  if (!deps.providerClient.closeCustomerSubscriptions)
    throw new BillingError("Provider cannot safely close pending checkouts");
  if (deps.managedCheckout) await recoverPendingCheckout(deps, customer);
  // Clear scheduled replacements before cancellation can emit deletion events.
  await deps.db
    .update(subscriptionsTable)
    .set({ pendingProductId: null, pendingPriceId: null })
    .where(eq(subscriptionsTable.customerId, customer.id));
  const result = await deps.providerClient.closeCustomerSubscriptions(customer.providerCustomerId);
  const local = await deps.db
    .select({ id: subscriptionsTable.providerSubscriptionId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.customerId, customer.id));
  const previous = Array.isArray(customer.metadata.closedSubscriptionIds)
    ? customer.metadata.closedSubscriptionIds.filter((id): id is string => typeof id === "string")
    : [];
  await deps.db
    .update(customersTable)
    .set({
      metadata: {
        ...customer.metadata,
        closedSubscriptionIds: [
          ...new Set([...previous, ...result.subscriptionIds, ...local.map((row) => row.id)]),
        ],
      },
    })
    .where(eq(customersTable.id, customer.id));
  await deps.db
    .update(subscriptionsTable)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      cancelAtPeriodEnd: null,
      pendingProductId: null,
      pendingPriceId: null,
      nextCreditGrantAt: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.customerId, customer.id));
  if (deps.managedCheckout)
    await deps.db.delete(checkoutIntents).where(eq(checkoutIntents.customerId, customer.id));
  return { expired: result.expired, canceled: result.canceled };
}

async function findCustomerForSubject(
  deps: SubscriptionsDeps,
  subject: SubjectRef,
): Promise<{ id: string } | null> {
  const rows = await deps.db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.subjectType, subject.type),
        eq(customersTable.subjectId, subject.id),
        eq(customersTable.app, deps.app),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadSubscriptionRow(
  deps: SubscriptionsDeps,
  subscriptionId: string,
): Promise<SubscriptionRow> {
  const rows = await deps.db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new CustomerNotFoundError("subscription", subscriptionId);
  }
  return row;
}

function normalizeStatus(raw: string): SubscriptionRow["status"] {
  const valid: ReadonlyArray<SubscriptionRow["status"]> = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ];
  return (valid as ReadonlyArray<string>).includes(raw)
    ? (raw as SubscriptionRow["status"])
    : "incomplete";
}

function emitAudit(
  deps: SubscriptionsDeps,
  actorId: string | null,
  eventType: BillingAuditEvent["eventType"],
  payload: Record<string, unknown>,
): void {
  if (!deps.onAudit) return;
  try {
    deps.onAudit({
      eventType,
      actorId,
      payload,
      timestamp: new Date(),
    });
  } catch {
    // audit must never break the flow
  }
}
