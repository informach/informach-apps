import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import {
  customers as customersTable,
  subscriptions as subscriptionsTable,
} from "@informach/db/schema";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { grantBonusCredits } from "./credits/grant";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient, ProviderSubscriptionSummary } from "./providers";
import type { BillingAuditEvent, BillingProvider, SubscriptionStatus } from "./types";

/**
 * Drip cadence and TTL for monthly grants on annual plans. Mirrors the values
 * used by webhooks/invoice.ts so the credits feel identical on both flows.
 */
const ANNUAL_DRIP_INTERVAL_MS = 30 * 86_400_000;
const MONTHLY_BONUS_TTL_DAYS = 31;

export type ExpireMonthlyBonusDeps = {
  db: Database;
  /** App slug — só expira rows do próprio app, sem cross-bleed. */
  app: string;
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
 * `expires_at <= now()` AND for which we have NOT already inserted a historical
 * `expiration` entry, then inserts one negative `expiration` row per source.
 *
 * Balance queries already ignore expired positive rows by `expires_at`, so
 * `expiration` entries are audit/history only and are excluded from active
 * balance math.
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
  // second query. App-scoped: each app's sweeper only expires its own rows
  // and the compensating row inherits app=src.app (= deps.app pelo filtro).
  const result = await deps.db.execute<{ amount: number | string }>(sql`
    INSERT INTO billing.credit_ledger
      (owner_type, owner_id, app, entry_type, amount, expires_at, metadata)
    SELECT
      src.owner_type,
      src.owner_id,
      src.app,
      'expiration',
      -src.amount,
      src.expires_at,
      jsonb_build_object(
        'originalEntryId', src.id::text,
        'originalExpiresAt', src.expires_at,
        -- Cast explícito: jsonb_build_object é variadic "any", então o
        -- Postgres não infere o tipo do parâmetro pelo contexto e rejeita o
        -- prepare com "could not determine data type of parameter $1".
        'sweptAt', ${now.toISOString()}::timestamptz
      )
    FROM billing.credit_ledger src
    WHERE src.app = ${deps.app}
      AND src.entry_type IN ('bonus_grant','promo_grant','purchase')
      AND src.amount > 0
      AND src.expires_at IS NOT NULL
      AND src.expires_at <= ${now.toISOString()}
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
  /** App slug — só libera reservations do próprio app. */
  app: string;
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
        resolved_at = ${now.toISOString()}
    WHERE id IN (
      SELECT id FROM billing.credit_reservations
      WHERE status = 'active'
        AND app = ${deps.app}
        AND expires_at <= ${now.toISOString()}
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
  /** App slug — só processa subs cujo customer pertence a este app. */
  app: string;
  /** Provider scope — restringe ao provider configurado no app (stripe/asaas). */
  provider: BillingProvider;
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
    .where(
      and(
        eq(subscriptionsTable.status, "past_due"),
        eq(customersTable.provider, deps.provider),
        eq(customersTable.app, deps.app),
      ),
    )
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
  /** App slug — só reconcilia subs cujo customer pertence a este app. */
  app: string;
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
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        eq(subscriptionsTable.provider, deps.provider),
        eq(customersTable.app, deps.app),
        inArray(subscriptionsTable.status, [...RECONCILE_STATUSES]),
      ),
    )
    .limit(batchSize);

  let reconciled = 0;
  let mismatches = 0;
  let errors = 0;

  for (const local of candidates) {
    let summary: ProviderSubscriptionSummary | null;
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
      (remoteCancelAtPeriodEnd?.getTime() ?? null) !== (local.cancelAtPeriodEnd?.getTime() ?? null);

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

export type GrantMonthlyBonusDeps = {
  db: Database;
  /** App slug — só processa subs cujo customer pertence a este app. */
  app: string;
  /** Catalog used to resolve `bonusCreditsPerMonth` per product. */
  products: readonly Product[];
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  /** Override "now" for tests / replay. Defaults to new Date(). */
  now?: Date;
  /** Hard cap on subscriptions processed per run. Default 200. */
  batchSize?: number;
};

export type GrantMonthlyBonusResult = {
  scanned: number;
  granted: number;
  skipped: number;
  totalCredits: number;
};

/**
 * Daily cron. For every annual subscription whose `next_credit_grant_at` has
 * arrived, grants the monthly bonus and advances the anchor by 30 days. The
 * handler skips/clears anchors when the next drip would fall outside the paid
 * period. The candidate query already excludes:
 *   - canceled subscriptions (status filter)
 *   - non-ready anchors via `next_credit_grant_at <= now()`
 *
 * Idempotency comes from `creditLedger.stripe_event_id` UNIQUE — the synthetic
 * id `drip:<subscriptionId>:<YYYY-MM-DD>` makes each (sub, day) pair unique.
 * Replays in the same day are no-ops; re-running tomorrow lets the next
 * scheduled drip in.
 */
export async function grantPendingMonthlyBonusCredits(
  deps: GrantMonthlyBonusDeps,
): Promise<GrantMonthlyBonusResult> {
  const now = deps.now ?? new Date();
  const batchSize = deps.batchSize ?? 200;

  const candidates = await deps.db
    .select({
      id: subscriptionsTable.id,
      providerSubscriptionId: subscriptionsTable.providerSubscriptionId,
      productId: subscriptionsTable.productId,
      nextCreditGrantAt: subscriptionsTable.nextCreditGrantAt,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptionsTable.cancelAtPeriodEnd,
      subjectType: customersTable.subjectType,
      subjectId: customersTable.subjectId,
    })
    .from(subscriptionsTable)
    .innerJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(
      and(
        sql`${subscriptionsTable.nextCreditGrantAt} IS NOT NULL`,
        lte(subscriptionsTable.nextCreditGrantAt, now),
        inArray(subscriptionsTable.status, ["active", "trialing"]),
        eq(customersTable.app, deps.app),
      ),
    )
    .limit(batchSize);

  let granted = 0;
  let skipped = 0;
  let totalCredits = 0;

  for (const row of candidates) {
    if (!row.nextCreditGrantAt) {
      skipped++;
      continue;
    }
    const product = deps.products.find((p) => p.id === row.productId);
    if (!product) {
      safeLog(deps.logger, "warn", "billing.sweeper.drip.product_not_in_catalog", {
        subscriptionId: row.id,
        productId: row.productId,
      });
      skipped++;
      continue;
    }
    const bonus = product.bonusCreditsPerMonth ?? 0;
    if (bonus <= 0 || product.interval !== "year") {
      // Defensive: shouldn't have anchor for non-annual / no-bonus products.
      // Clear it so we stop scanning this row.
      await deps.db
        .update(subscriptionsTable)
        .set({ nextCreditGrantAt: null, updatedAt: new Date() })
        .where(eq(subscriptionsTable.id, row.id));
      skipped++;
      continue;
    }

    const anchor = row.nextCreditGrantAt;
    const nextAnchor = new Date(anchor.getTime() + ANNUAL_DRIP_INTERVAL_MS);
    const paidUntil = row.cancelAtPeriodEnd ?? row.currentPeriodEnd;
    // Do not mint the final "extra" batch: if advancing by one drip interval
    // would land past the period the user has paid for, this anchor is the stop
    // boundary, not an earned new grant.
    if (nextAnchor > paidUntil) {
      await deps.db
        .update(subscriptionsTable)
        .set({ nextCreditGrantAt: null, updatedAt: new Date() })
        .where(eq(subscriptionsTable.id, row.id));
      skipped++;
      continue;
    }

    const day = anchor.toISOString().slice(0, 10); // YYYY-MM-DD
    const syntheticEventId = `drip:${row.id}:${day}`;

    const result = await grantBonusCredits(
      {
        db: deps.db,
        app: deps.app,
        logger: deps.logger,
        onAudit: deps.onAudit,
      },
      {
        owner: { type: row.subjectType, id: row.subjectId },
        amount: bonus,
        reason: "subscription_monthly",
        expiresAt: new Date(anchor.getTime() + MONTHLY_BONUS_TTL_DAYS * 86_400_000),
        stripeEventId: syntheticEventId,
        metadata: {
          subscriptionId: row.id,
          providerSubscriptionId: row.providerSubscriptionId,
          productId: row.productId,
          interval: "year",
          grantKind: "annual_drip",
          anchor: anchor.toISOString(),
        },
      },
    );

    await deps.db
      .update(subscriptionsTable)
      .set({
        nextCreditGrantAt: nextAnchor,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, row.id));

    if (!result.alreadyProcessed) {
      granted++;
      totalCredits += bonus;
    } else {
      skipped++;
    }
  }

  if (granted > 0 || skipped > 0) {
    safeLog(deps.logger, "info", "billing.sweeper.drip.summary", {
      scanned: candidates.length,
      granted,
      skipped,
      totalCredits,
      asOf: now.toISOString(),
    });
  }

  return { scanned: candidates.length, granted, skipped, totalCredits };
}
