import type { Database } from "@informach/db";
import { creditLedger } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { type Logger, safeLog } from "./../logger";
import type { BillingAuditEvent, CreditOwner, LedgerEntryType } from "./../types";

export type GrantBonusCreditsInput = {
  owner: CreditOwner;
  amount: number;
  reason: "subscription_monthly" | "promo" | "compensation";
  expiresAt?: Date | null;
  /** When set, INSERT becomes idempotent via `credit_ledger.stripe_event_id` UNIQUE. */
  stripeEventId?: string;
  metadata?: Record<string, unknown>;
};

export type GrantBonusCreditsResult = {
  ledgerEntryId: string;
  alreadyProcessed: boolean;
};

export type RefundCreditsInput = {
  owner: CreditOwner;
  /** ID of the original ledger row being refunded (e.g., the purchase entry). */
  originalLedgerEntryId: string;
  amount: number;
  /** Stripe webhook event id — required for idempotency. */
  stripeEventId: string;
  reason: string;
  metadata?: Record<string, unknown>;
};

export type RefundCreditsResult = {
  ledgerEntryId: string;
  alreadyProcessed: boolean;
};

export type CreditGrantDeps = {
  db: Database;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};

const REASON_TO_ENTRY_TYPE: Record<GrantBonusCreditsInput["reason"], LedgerEntryType> = {
  subscription_monthly: "bonus_grant",
  promo: "promo_grant",
  compensation: "adjustment",
};

/**
 * Inserts a positive ledger entry for bonus credits. Idempotent via
 * `(stripe_event_id)` UNIQUE partial index — if the same event_id is
 * presented twice, only the first INSERT wins; subsequent calls return
 * the existing row's id with `alreadyProcessed: true`.
 *
 * When `stripeEventId` is omitted (admin grant, promo via UI), the call is
 * not deduplicated — caller is responsible for not double-firing.
 */
export async function grantBonusCredits(
  deps: CreditGrantDeps,
  input: GrantBonusCreditsInput,
): Promise<GrantBonusCreditsResult> {
  const entryType = REASON_TO_ENTRY_TYPE[input.reason];
  const expiresAt = input.expiresAt ?? null;

  const inserted = await deps.db
    .insert(creditLedger)
    .values({
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      entryType,
      amount: input.amount,
      expiresAt,
      stripeEventId: input.stripeEventId ?? null,
      metadata: { reason: input.reason, ...(input.metadata ?? {}) },
    })
    .onConflictDoNothing({
      target: [creditLedger.stripeEventId],
    })
    .returning({ id: creditLedger.id });

  if (inserted.length > 0 && inserted[0]) {
    emitAudit(deps, "billing.credits_granted", {
      ledgerEntryId: inserted[0].id,
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      amount: input.amount,
      reason: input.reason,
      stripeEventId: input.stripeEventId ?? null,
    });
    safeLog(deps.logger, "info", "billing.credits.grant", {
      ledgerEntryId: inserted[0].id,
      amount: input.amount,
      reason: input.reason,
    });
    return { ledgerEntryId: inserted[0].id, alreadyProcessed: false };
  }

  // Conflict path: stripeEventId already in ledger. Re-read to return its id.
  if (!input.stripeEventId) {
    // Without a stripeEventId, INSERT cannot conflict — this branch is unreachable
    // unless someone violates the schema invariant. Fail loud.
    throw new Error(
      "@informach/billing: grantBonusCredits insert returned 0 rows without a stripeEventId — schema invariant broken",
    );
  }
  const existing = await deps.db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(eq(creditLedger.stripeEventId, input.stripeEventId))
    .limit(1);
  if (existing.length > 0 && existing[0]) {
    safeLog(deps.logger, "debug", "billing.credits.grant.idempotent_replay", {
      stripeEventId: input.stripeEventId,
      ledgerEntryId: existing[0].id,
    });
    return { ledgerEntryId: existing[0].id, alreadyProcessed: true };
  }
  throw new Error(
    `@informach/billing: grantBonusCredits insert returned 0 rows but no row found for stripeEventId='${input.stripeEventId}'`,
  );
}

/**
 * Refund: insert a negative ledger entry referencing the original via metadata.
 * Idempotent via `stripeEventId` UNIQUE — replaying the same Stripe refund event
 * never double-debits.
 */
export async function refundCredits(
  deps: CreditGrantDeps,
  input: RefundCreditsInput,
): Promise<RefundCreditsResult> {
  const inserted = await deps.db
    .insert(creditLedger)
    .values({
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      entryType: "refund",
      amount: -Math.abs(input.amount),
      stripeEventId: input.stripeEventId,
      metadata: {
        reason: input.reason,
        originalLedgerEntryId: input.originalLedgerEntryId,
        ...(input.metadata ?? {}),
      },
    })
    .onConflictDoNothing({
      target: [creditLedger.stripeEventId],
    })
    .returning({ id: creditLedger.id });

  if (inserted.length > 0 && inserted[0]) {
    emitAudit(deps, "billing.credits_refunded", {
      ledgerEntryId: inserted[0].id,
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      amount: input.amount,
      originalLedgerEntryId: input.originalLedgerEntryId,
      stripeEventId: input.stripeEventId,
    });
    safeLog(deps.logger, "info", "billing.credits.refund", {
      ledgerEntryId: inserted[0].id,
      amount: input.amount,
      originalLedgerEntryId: input.originalLedgerEntryId,
    });
    return { ledgerEntryId: inserted[0].id, alreadyProcessed: false };
  }

  // Conflict — re-read for idempotent reply.
  const existing = await deps.db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.stripeEventId, input.stripeEventId),
        eq(creditLedger.entryType, "refund"),
      ),
    )
    .limit(1);
  if (existing.length > 0 && existing[0]) {
    safeLog(deps.logger, "debug", "billing.credits.refund.idempotent_replay", {
      stripeEventId: input.stripeEventId,
      ledgerEntryId: existing[0].id,
    });
    return { ledgerEntryId: existing[0].id, alreadyProcessed: true };
  }
  throw new Error(
    `@informach/billing: refundCredits insert returned 0 rows but no row found for stripeEventId='${input.stripeEventId}'`,
  );
}

function emitAudit(
  deps: CreditGrantDeps,
  eventType: BillingAuditEvent["eventType"],
  payload: Record<string, unknown>,
): void {
  if (!deps.onAudit) return;
  try {
    deps.onAudit({
      eventType,
      actorId: null,
      payload,
      timestamp: new Date(),
    });
  } catch {
    // audit must never break the credits flow
  }
}
