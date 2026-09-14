import type { Product } from "@informach/config";
import { getStripePriceId, type StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import {
  customers as customersTable,
  type Subscription as SubscriptionRow,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import {
  BillingError,
  CustomerNotFoundError,
  InvalidProductError,
  OrganizationsDisabledError,
} from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingAuditEvent, BillingProvider, SubjectRef } from "./types";

const MONTHLY_DRIP_INTERVAL_MS = 30 * 86_400_000;

export type PlanChangesDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  organizationsEnabled: boolean;
  /** App slug — escopo de isolamento de customers. */
  app: string;
  products: readonly Product[];
  stripeMode: StripeMode;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};

export type PlanChangeMode = "immediate" | "schedule_at_period_end";

export type SwitchPlanInput = {
  subscriptionId: string;
  actorId?: string | null;
  /** Catalog product the user wants to move to. */
  newProductId: string;
  /**
   * `immediate` calls Stripe with `proration_behavior: 'always_invoice'` so the
   * customer is charged the proration now (the right call for upgrades, e.g.
   * monthly→annual).
   *
   * `schedule_at_period_end` flags the existing subscription with
   * `cancel_at_period_end` and stores the desired product/price as a pending
   * intent. The webhook handler for `customer.subscription.deleted` then
   * creates the new subscription using the customer's default payment method.
   * Used for downgrades (annual→monthly) where charging now would be unfair.
   */
  mode: PlanChangeMode;
};

export type SwitchPlanResult = {
  subscription: SubscriptionRow;
  /** True when a new subscription was created immediately (mode='immediate'). */
  appliedImmediately: boolean;
  /**
   * Set when an `immediate` upgrade landed on an unpaid invoice (no default
   * payment method, SCA required, declined card, etc.). The caller should
   * redirect the user to this Stripe-hosted page to complete payment.
   * Null when the invoice is paid OR the provider couldn't tell us.
   */
  paymentActionUrl: string | null;
};

export async function switchPlan(
  deps: PlanChangesDeps,
  input: SwitchPlanInput,
): Promise<SwitchPlanResult> {
  const row = await loadSubscriptionRow(deps, input.subscriptionId);
  const newProduct = deps.products.find((p) => p.id === input.newProductId);
  if (!newProduct) {
    throw new InvalidProductError(input.newProductId);
  }
  if (newProduct.kind !== "subscription") {
    throw new InvalidProductError(
      `${input.newProductId} (kind=${newProduct.kind}, expected subscription)`,
    );
  }
  const newPriceId = getStripePriceId(newProduct, deps.stripeMode);

  const retriesSameSchedule =
    input.mode === "schedule_at_period_end" &&
    !row.cancelAtPeriodEnd &&
    row.pendingProductId === newProduct.id &&
    row.pendingPriceId === newPriceId;
  if (
    (row.pendingProductId || row.pendingPriceId || row.cancelAtPeriodEnd) &&
    !retriesSameSchedule
  ) {
    throw new BillingError("Desfaça a alteração agendada antes de escolher outro plano.");
  }

  if (input.mode === "immediate") {
    const summary = await deps.providerClient.updateSubscription({
      providerSubscriptionId: row.providerSubscriptionId,
      newPriceId,
      // For upgrades we want Stripe to invoice the proration immediately so the
      // user is charged the difference now, matching the UX of "switch to annual".
      prorationBehavior: "always_invoice",
      // Keep the current Stripe subscription item active until the invoice is
      // paid. Without this, local/webhook state can grant the new plan while the
      // hosted invoice is still open.
      paymentBehavior: "pending_if_incomplete",
    });
    const invoice = summary.latestInvoice;
    const needsAction = invoice ? invoice.status !== "paid" && invoice.status !== "void" : false;
    if (needsAction) {
      if (!invoice?.hostedUrl) {
        throw new BillingError(
          `payment action is required for subscription '${row.providerSubscriptionId}' but provider did not return a hosted invoice URL`,
        );
      }
      safeLog(deps.logger, "info", "billing.plan_change.payment_required", {
        subscriptionId: row.id,
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
      });
      return {
        subscription: row,
        appliedImmediately: true,
        paymentActionUrl: invoice.hostedUrl,
      };
    }

    const periodEnd = summary.currentPeriodEnd ?? row.currentPeriodEnd;
    const updated = await deps.db
      .update(subscriptionsTable)
      .set({
        productId: newProduct.id,
        providerPriceId: newPriceId,
        status: row.status === "canceled" ? "active" : row.status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: summary.cancelAtPeriodEnd ? periodEnd : null,
        // Clear any previously pending downgrade — the user just upgraded.
        pendingProductId: null,
        pendingPriceId: null,
        // If switching INTO an annual plan, anchor the drip to start in 30 days.
        // For monthly, drip is not used (clear it).
        nextCreditGrantAt:
          newProduct.interval === "year" && (newProduct.bonusCreditsPerMonth ?? 0) > 0
            ? new Date(Date.now() + MONTHLY_DRIP_INTERVAL_MS)
            : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, row.id))
      .returning();
    const updatedRow = updated[0] ?? row;

    emitAudit(deps, input.actorId ?? null, "billing.subscription_updated", {
      subscriptionId: row.id,
      providerSubscriptionId: row.providerSubscriptionId,
      oldProductId: row.productId,
      newProductId: newProduct.id,
      mode: "immediate",
    });
    safeLog(deps.logger, "info", "billing.plan_change.immediate", {
      subscriptionId: row.id,
      newProductId: newProduct.id,
    });

    return { subscription: updatedRow, appliedImmediately: true, paymentActionUrl: null };
  }

  // Persist the durable intent before the remote call. If the process stops or
  // Stripe times out, retrying is safe and the deletion webhook can still
  // finish the requested plan change.
  await deps.db
    .update(subscriptionsTable)
    .set({
      pendingProductId: newProduct.id,
      pendingPriceId: newPriceId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, row.id));
  const summary = await deps.providerClient.cancelSubscription({
    providerSubscriptionId: row.providerSubscriptionId,
    atPeriodEnd: true,
  });
  const periodEnd = summary.currentPeriodEnd ?? row.currentPeriodEnd;
  const updated = await deps.db
    .update(subscriptionsTable)
    .set({ cancelAtPeriodEnd: periodEnd, updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, row.id))
    .returning();
  const updatedRow = updated[0] ?? row;

  emitAudit(deps, input.actorId ?? null, "billing.subscription_updated", {
    subscriptionId: row.id,
    providerSubscriptionId: row.providerSubscriptionId,
    oldProductId: row.productId,
    newProductId: newProduct.id,
    mode: "schedule_at_period_end",
    appliesAt: periodEnd?.toISOString() ?? null,
  });
  safeLog(deps.logger, "info", "billing.plan_change.scheduled", {
    subscriptionId: row.id,
    newProductId: newProduct.id,
    appliesAt: periodEnd?.toISOString() ?? null,
  });
  return { subscription: updatedRow, appliedImmediately: false, paymentActionUrl: null };
}

export type ReactivateSubscriptionInput = {
  subscriptionId: string;
  actorId?: string | null;
};

export async function reactivateSubscription(
  deps: PlanChangesDeps,
  input: ReactivateSubscriptionInput,
): Promise<SubscriptionRow> {
  const row = await loadSubscriptionRow(deps, input.subscriptionId);
  if (!deps.providerClient.reactivateSubscription) {
    throw new BillingError("provider does not implement reactivateSubscription");
  }
  const summary = await deps.providerClient.reactivateSubscription({
    providerSubscriptionId: row.providerSubscriptionId,
  });
  const updated = await deps.db
    .update(subscriptionsTable)
    .set({
      cancelAtPeriodEnd: null,
      // Reactivation also clears any pending plan intent — the user is staying.
      pendingProductId: null,
      pendingPriceId: null,
      status: summary.status === "canceled" ? row.status : (summary.status as typeof row.status),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, row.id))
    .returning();
  const updatedRow = updated[0] ?? row;

  emitAudit(deps, input.actorId ?? null, "billing.subscription_updated", {
    subscriptionId: row.id,
    providerSubscriptionId: row.providerSubscriptionId,
    reason: "reactivated",
  });
  safeLog(deps.logger, "info", "billing.plan_change.reactivate", {
    subscriptionId: row.id,
  });
  return updatedRow;
}

export type PreviewPlanChangeInput = {
  subject: SubjectRef;
  subscriptionId: string;
  newProductId: string;
};

export type PreviewPlanChangeResult = {
  /** Gross price of the new plan (positive line items in the preview). */
  subtotalCents: number;
  /** Negative line items (proration credits from the old plan). Always <= 0. */
  prorationCreditCents: number;
  /** Net amount to be charged now: subtotal + proration credit, after taxes/balance. */
  amountDueCents: number;
  currency: string;
  nextChargeAt: Date | null;
};

export async function previewPlanChange(
  deps: PlanChangesDeps,
  input: PreviewPlanChangeInput,
): Promise<PreviewPlanChangeResult> {
  if (input.subject.type === "organization" && !deps.organizationsEnabled) {
    throw new OrganizationsDisabledError();
  }
  if (!deps.providerClient.previewInvoice) {
    throw new BillingError("provider does not implement previewInvoice");
  }
  const row = await loadSubscriptionRow(deps, input.subscriptionId);
  const newProduct = deps.products.find((p) => p.id === input.newProductId);
  if (!newProduct) {
    throw new InvalidProductError(input.newProductId);
  }
  if (newProduct.kind !== "subscription") {
    throw new InvalidProductError(
      `${input.newProductId} (kind=${newProduct.kind}, expected subscription)`,
    );
  }
  const newPriceId = getStripePriceId(newProduct, deps.stripeMode);

  const customerRows = await deps.db
    .select({ providerCustomerId: customersTable.providerCustomerId })
    .from(customersTable)
    .innerJoin(subscriptionsTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(subscriptionsTable.id, row.id),
        eq(customersTable.provider, deps.provider),
        eq(customersTable.subjectType, input.subject.type),
        eq(customersTable.subjectId, input.subject.id),
        eq(customersTable.app, deps.app),
      ),
    )
    .limit(1);
  const customer = customerRows[0];
  if (!customer) {
    throw new CustomerNotFoundError("subject", `${input.subject.type}:${input.subject.id}`);
  }

  return deps.providerClient.previewInvoice({
    customerId: customer.providerCustomerId,
    providerSubscriptionId: row.providerSubscriptionId,
    newPriceId,
    prorationBehavior: "always_invoice",
  });
}

async function loadSubscriptionRow(
  deps: Pick<PlanChangesDeps, "db">,
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

function emitAudit(
  deps: PlanChangesDeps,
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
