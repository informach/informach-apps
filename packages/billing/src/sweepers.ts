import type { Database } from "@informach/db";
import {
  creditLedger,
  customers as customersTable,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { safeLog, type Logger } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingProvider, SubscriptionStatus } from "./types";

export type ExpireMonthlyBonusDeps = {
  db: Database;
  logger?: Logger;
  /** Override "now" for tests / replay. Defaults to new Date(). */
  now?: Date;
  /** Hard cap on rows expired per run, to keep the cron-friendly. Default 1000. */
  batchSize?: number;
};

export type ExpireMonthlyBonusResult = {
  expired: number;
  totalCredits: number;
};

/**
 * Daily cron. Finds bonus_grant / promo_grant / purchase ledger rows whose
 * `expires_at <= now()` AND for which we have NOT already inserted a
 * compensating `expiration` entry, then inserts one negative `expiration` row
 * per source.
 *
 * The dedup uses `metadata->>'originalEntryId' = source.id` on the new
 * `expiration` rows. INSERT ... SELECT keeps it atomic and idempotent — running
 * the sweeper twice for the same window is safe.
 */
export async function expireMonthlyBonusCredits(
  deps: ExpireMonthlyBonusDeps,
): Promise<ExpireMonthlyBonusResult> {
  const now = deps.now ?? new Date();
  const batchSize = deps.batchSize ?? 1000;

  // Single round-trip: the SELECT inside the INSERT is the canonical "to-expire"
  // set, anti-joined against existing expiration rows via NOT EXISTS so the
  // operation is idempotent. RETURNING amount lets us aggregate without a
  // second query.
  const result = await deps.db.execute<{ amount: number | string }>(sql`
    INSERT INTO billing.credit_ledger
      (owner_type, owner_id, entry_type, amount, metadata)
    SELECT
      src.owner_type,
      src.owner_id,
      'expiration',
      -src.amount,
      jsonb_build_object(
        'originalEntryId', src.id::text,
        'originalExpiresAt', src.expires_at,
        'sweptAt', ${now.toISOString()}
      )
    FROM billing.credit_ledger src
    WHERE src.entry_type IN ('bonus_grant','promo_grant','purchase')
      AND src.amount > 0
      AND src.expires_at IS NOT NULL
      AND src.expires_at <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM billing.credit_ledger e
        WHERE e.entry_type = 'expiration'
          AND e.metadata->>'originalEntryId' = src.id::text
      )
    LIMIT ${batchSize}
    RETURNING amount
  `);

  const rows = result as unknown as Array<{ amount: number | string }>;
  const expired = rows.length;
  const totalCredits = rows.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);

  safeLog(deps.logger, "info", "billing.sweeper.expire_monthly_bonus", {
    expired,
    totalCredits,
    asOf: now.toISOString(),
  });
  return { expired, totalCredits };
}

export type ReleaseExpiredReservationsDeps = {
  db: Database;
  logger?: Logger;
  now?: Date;
  batchSize?: number;
};

export type ReleaseExpiredReservationsResult = {
  released: number;
};

/**
 * Cron (every ~5 min). Marks `creditReservations` rows as `expired` when their
 * `expires_at` has passed and they were never committed/released. Frees the
 * implicit lock on the owner's available balance.
 */
export async function releaseExpiredReservations(
  deps: ReleaseExpiredReservationsDeps,
): Promise<ReleaseExpiredReservationsResult> {
  const now = deps.now ?? new Date();
  const batchSize = deps.batchSize ?? 500;

  const result = await deps.db.execute<{ id: string }>(sql`
    UPDATE billing.credit_reservations
    SET status = 'expired',
        resolved_at = ${now}
    WHERE id IN (
      SELECT id FROM billing.credit_reservations
      WHERE status = 'active'
        AND expires_at <= ${now}
      LIMIT ${batchSize}
    )
    RETURNING id
  `);
  const rows = result as unknown as Array<{ id: string }>;
  const released = rows.length;
  if (released > 0) {
    safeLog(deps.logger, "info", "billing.sweeper.release_expired_reservations", {
      released,
      asOf: now.toISOString(),
    });
  }
  return { released };
}

export type DunningSubject = {
  type: "user" | "organization";
  id: string;
};

export type DunningPayload = {
  subscriptionId: string;
  providerSubscriptionId: string;
  subject: DunningSubject;
  invoiceId: string;
  attempt: number;
};

/**
 * App-supplied function that actually delivers the dunning email/notification.
 * Receives a payload with everything the template needs. Idempotency on the
 * delivery side is the app's responsibility (e.g., `messageKey` in @informach/emails).
 */
export type DunningSendFn = (payload: DunningPayload) => Promise<void>;

export type RetryDunningEmailsDeps = {
  db: Database;
  send?: DunningSendFn;
  logger?: Logger;
  /** Default 3. Subscription rows that already had this many attempts are skipped. */
  maxAttempts?: number;
  /** Default 24 (h). Subscriptions notified more recently than this are skipped. */
  cooldownHours?: number;
  now?: Date;
  batchSize?: number;
};

export type RetryDunningEmailsResult = {
  scanned: number;
  sent: number;
  skipped: number;
};

/**
 * Cron (every ~6h). Scans `past_due` subscriptions whose dunning metadata says
 * they're pending, throttles per-subscription via metadata.dunning fields, and
 * delegates the actual delivery to `deps.send`. When `send` is omitted, the
 * sweeper just reports what it WOULD have done — useful for staging.
 */
export async function retryFailedDunningEmails(
  deps: RetryDunningEmailsDeps,
): Promise<RetryDunningEmailsResult> {
  const now = deps.now ?? new Date();
  const maxAttempts = deps.maxAttempts ?? 3;
  const cooldownMs = (deps.cooldownHours ?? 24) * 3_600_000;
  const batchSize = deps.batchSize ?? 100;

  const candidates = await deps.db
    .select({
      id: subscriptionsTable.id,
      providerSubscriptionId: subscriptionsTable.providerSubscriptionId,
      metadata: subscriptionsTable.metadata,
      customerId: subscriptionsTable.customerId,
      subjectType: customersTable.subjectType,
      subjectId: customersTable.subjectId,
    })
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(eq(subscriptionsTable.status, "past_due"))
    .limit(batchSize);

  let sent = 0;
  let skipped = 0;
  for (const sub of candidates) {
    const dunning = readDunning(sub.metadata);
    if (!dunning?.pending || !dunning.lastInvoiceId) {
      skipped++;
      continue;
    }
    const attempt = (dunning.attempts ?? 0) + 1;
    if (attempt > maxAttempts) {
      skipped++;
      continue;
    }
    const lastSentAtMs = dunning.lastSentAt ? new Date(dunning.lastSentAt).getTime() : 0;
    if (lastSentAtMs && now.getTime() - lastSentAtMs < cooldownMs) {
      skipped++;
      continue;
    }

    if (!deps.send) {
      safeLog(deps.logger, "warn", "billing.sweeper.dunning.dry_run", {
        subscriptionId: sub.id,
        invoiceId: dunning.lastInvoiceId,
        attempt,
      });
      continue;
    }

    try {
      await deps.send({
        subscriptionId: sub.id,
        providerSubscriptionId: sub.providerSubscriptionId,
        subject: { type: sub.subjectType as "user" | "organization", id: sub.subjectId },
        invoiceId: dunning.lastInvoiceId,
        attempt,
      });
      const updatedDunning = {
        ...dunning,
        attempts: attempt,
        lastSentAt: now.toISOString(),
        // Mark non-pending after maxAttempts so we don't keep retrying.
        pending: attempt < maxAttempts,
      };
      await deps.db
        .update(subscriptionsTable)
        .set({
          metadata: { ...sub.metadata, dunning: updatedDunning },
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.id, sub.id));
      sent++;
    } catch (err) {
      safeLog(deps.logger, "error", "billing.sweeper.dunning.send_error", {
        subscriptionId: sub.id,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  if (sent > 0 || skipped > 0) {
    safeLog(deps.logger, "info", "billing.sweeper.dunning_summary", {
      scanned: candidates.length,
      sent,
      skipped,
      asOf: now.toISOString(),
    });
  }
  return { scanned: candidates.length, sent, skipped };
}

type DunningMetadata = {
  pending?: boolean;
  attempts?: number;
  lastSentAt?: string;
  lastFailedAt?: string;
  lastInvoiceId?: string;
  lastEventId?: string;
};

function readDunning(metadata: Record<string, unknown>): DunningMetadata | null {
  const raw = metadata.dunning;
  if (!raw || typeof raw !== "object") return null;
  return raw as DunningMetadata;
}

export type ReconcileSubscriptionsDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  logger?: Logger;
  /** Hard cap per run to keep cron-friendly. Default 200. */
  batchSize?: number;
};

export type ReconcileSubscriptionsResult = {
  scanned: number;
  reconciled: number;
  mismatches: number;
  errors: number;
};

const RECONCILE_STATUSES: ReadonlyArray<SubscriptionStatus> = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
  "paused",
];

/**
 * Cron (~daily). Detects drift between local subscription rows and Stripe.
 * For each non-terminal local subscription, fetches the live state from the
 * provider; when status / cancelAtPeriodEnd / currentPeriodEnd diverge, updates
 * the local row to match. Stripe is the source of truth.
 *
 * Drift sources we recover from:
 *   - missed `customer.subscription.updated` webhook
 *   - subscription deleted directly in Stripe Dashboard (returns null → mark canceled)
 *   - clock skew on period boundaries
 *
 * Errors per-row are counted, not thrown — one bad row doesn't kill the sweep.
 */
export async function reconcileSubscriptionStatuses(
  deps: ReconcileSubscriptionsDeps,
): Promise<ReconcileSubscriptionsResult> {
  const batchSize = deps.batchSize ?? 200;
  const candidates = await deps.db
    .select({
      id: subscriptionsTable.id,
      providerSubscriptionId: subscriptionsTable.providerSubscriptionId,
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptionsTable.cancelAtPeriodEnd,
      canceledAt: subscriptionsTable.canceledAt,
    })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.provider, deps.provider),
        inArray(subscriptionsTable.status, [...RECONCILE_STATUSES]),
      ),
    )
    .limit(batchSize);

  let reconciled = 0;
  let mismatches = 0;
  let errors = 0;

  for (const local of candidates) {
    let summary;
    try {
      summary = await deps.providerClient.retrieveSubscription(local.providerSubscriptionId);
    } catch (err) {
      errors++;
      safeLog(deps.logger, "error", "billing.sweeper.reconcile.fetch_error", {
        subscriptionId: local.id,
        providerSubscriptionId: local.providerSubscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!summary) {
      // Subscription gone from Stripe → mark canceled locally.
      mismatches++;
      try {
        await deps.db
          .update(subscriptionsTable)
          .set({
            status: "canceled",
            canceledAt: local.canceledAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(subscriptionsTable.id, local.id));
        reconciled++;
        safeLog(deps.logger, "warn", "billing.sweeper.reconcile.deleted_in_stripe", {
          subscriptionId: local.id,
          providerSubscriptionId: local.providerSubscriptionId,
        });
      } catch (err) {
        errors++;
        safeLog(deps.logger, "error", "billing.sweeper.reconcile.update_error", {
          subscriptionId: local.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    const remoteStatus = normalizeStatus(summary.status);
    const remoteCancelAtPeriodEnd = summary.cancelAtPeriodEnd
      ? (summary.currentPeriodEnd ?? local.currentPeriodEnd)
      : null;
    const periodEndChanged =
      summary.currentPeriodEnd !== null &&
      summary.currentPeriodEnd.getTime() !== local.currentPeriodEnd.getTime();
    const statusChanged = remoteStatus !== local.status;
    const cancelAtChanged =
      (remoteCancelAtPeriodEnd?.getTime() ?? null) !==
      (local.cancelAtPeriodEnd?.getTime() ?? null);

    if (!statusChanged && !cancelAtChanged && !periodEndChanged) {
      continue;
    }

    mismatches++;
    try {
      await deps.db
        .update(subscriptionsTable)
        .set({
          status: remoteStatus,
          currentPeriodEnd: summary.currentPeriodEnd ?? local.currentPeriodEnd,
          cancelAtPeriodEnd: remoteCancelAtPeriodEnd,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.id, local.id));
      reconciled++;
      safeLog(deps.logger, "info", "billing.sweeper.reconcile.drift_fixed", {
        subscriptionId: local.id,
        providerSubscriptionId: local.providerSubscriptionId,
        oldStatus: local.status,
        newStatus: remoteStatus,
        cancelAtChanged,
        periodEndChanged,
      });
    } catch (err) {
      errors++;
      safeLog(deps.logger, "error", "billing.sweeper.reconcile.update_error", {
        subscriptionId: local.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (mismatches > 0 || errors > 0) {
    safeLog(deps.logger, "info", "billing.sweeper.reconcile.summary", {
      scanned: candidates.length,
      reconciled,
      mismatches,
      errors,
    });
  }

  return { scanned: candidates.length, reconciled, mismatches, errors };
}

function normalizeStatus(raw: string): SubscriptionStatus {
  const valid: ReadonlyArray<SubscriptionStatus> = [
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
    ? (raw as SubscriptionStatus)
    : "incomplete";
}

// Suppress unused-import warning when only types used.
void lte;
void and;
