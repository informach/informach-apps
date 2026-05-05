import type { Database } from "@informach/db";
import {
  customers as customersTable,
  type Subscription as SubscriptionRow,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { BillingProvider, SubjectRef, SubscriptionStatus } from "./types";

/**
 * Subscription statuses that grant Pro access — the single source of truth
 * for entitlement. Every feature gate (credit pack purchase, AI feature
 * unlock, etc.) MUST go through `getProSubscription` / `hasProSubscription`
 * instead of inlining a status check, so the rule lives in exactly one place.
 *
 *   `active`   — payment confirmed (this also covers the "canceled at period
 *                end" grace window: Stripe keeps `status='active'` until the
 *                paid period actually ends, only flipping to `canceled` on
 *                `customer.subscription.deleted`).
 *   `trialing` — explicit grant period; the product team decides duration.
 *
 * Explicitly EXCLUDED:
 *   - `past_due` — a charge failed; money has not changed hands. The dunning
 *     sweeper either recovers (status flips back to active) or gives up
 *     (status flips to canceled). No access in the meantime.
 *   - `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `canceled`.
 *
 * To change the rule (e.g., grant a grace period during dunning), edit this
 * list — every gate updates automatically.
 */
export const PRO_STATUSES = [
  "active",
  "trialing",
] as const satisfies ReadonlyArray<SubscriptionStatus>;

export type AccessDeps = {
  db: Database;
  provider: BillingProvider;
};

/**
 * Returns the Pro subscription row for a subject, or null when they don't
 * have one. Use this when callers need the row itself (e.g., to display
 * the plan name); use `hasProSubscription` when only a boolean is needed.
 */
export async function getProSubscription(
  deps: AccessDeps,
  subject: SubjectRef,
): Promise<SubscriptionRow | null> {
  const rows = await deps.db
    .select()
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.subjectType, subject.type),
        eq(customersTable.subjectId, subject.id),
        inArray(subscriptionsTable.status, [...PRO_STATUSES]),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? row.subscriptions : null;
}

export async function hasProSubscription(deps: AccessDeps, subject: SubjectRef): Promise<boolean> {
  return (await getProSubscription(deps, subject)) !== null;
}
