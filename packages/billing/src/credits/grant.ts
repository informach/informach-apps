import type { Database } from "@informach/db";
import { creditLedger } from "@informach/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { BillingError } from "./../errors";
import { type Logger, safeLog } from "./../logger";
import type { BillingAuditEvent, CreditOwner, LedgerEntryType } from "./../types";
import { lockCreditOwner } from "./locks";
import { forwardMigratedCreditEntry } from "./migration-forwarding";

export type GrantBonusCreditsInput = {
  owner: CreditOwner;
  amount: number;
  reason: "subscription_monthly" | "promo" | "compensation";
  expiresAt?: Date | null;
  effectiveAt?: Date;
  /** Reconciled paid period backing a calendar grant; never inferred from status. */
  fundingPeriodId?: string;
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
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
  /** App slug — escopo de isolamento gravado em `credit_ledger.app`. */
  app: string;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};
type LockedGrantDeps = Omit<CreditGrantDeps, "db"> & {
  db: Parameters<Parameters<Database["transaction"]>[0]>[0];
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
  assertPositiveInteger(input.amount, "amount");
  return deps.db.transaction(async (tx) => {
    await lockCreditOwner(tx, input.owner);
    return grantLocked({ ...deps, db: tx }, input);
  });
}

async function grantLocked(
  deps: LockedGrantDeps,
  input: GrantBonusCreditsInput,
): Promise<GrantBonusCreditsResult> {
  const entryType = REASON_TO_ENTRY_TYPE[input.reason];
  const expiresAt = input.expiresAt ?? null;

  const inserted = await deps.db
    .insert(creditLedger)
    .values({
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      app: deps.app,
      entryType,
      amount: input.amount,
      expiresAt,
      effectiveAt: input.effectiveAt,
      fundingPeriodId: input.fundingPeriodId,
      stripeEventId: input.stripeEventId ?? null,
      createdAt: sql`clock_timestamp()`,
      metadata: { ...(input.metadata ?? {}), reason: input.reason },
    })
    .onConflictDoNothing({
      target: [creditLedger.stripeEventId],
    })
    .returning({ id: creditLedger.id });

  if (inserted.length > 0 && inserted[0]) {
    await forwardMigratedCreditEntry(deps.db, inserted[0].id, {
      app: deps.app,
      owner: input.owner,
    });
    emitAudit(deps, "billing.credits_granted", {
      ledgerEntryId: inserted[0].id,
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      app: deps.app,
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
    .where(
      and(
        eq(creditLedger.stripeEventId, input.stripeEventId),
        eq(creditLedger.ownerType, input.owner.type),
        eq(creditLedger.ownerId, input.owner.id),
        eq(creditLedger.app, deps.app),
        eq(creditLedger.entryType, entryType),
        eq(creditLedger.amount, input.amount),
        expiresAt ? eq(creditLedger.expiresAt, expiresAt) : isNull(creditLedger.expiresAt),
        input.fundingPeriodId
          ? eq(creditLedger.fundingPeriodId, input.fundingPeriodId)
          : isNull(creditLedger.fundingPeriodId),
      ),
    )
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
  assertPositiveInteger(input.amount, "amount");
  if (!input.stripeEventId.trim()) {
    throw new BillingError("stripeEventId is required for refundCredits");
  }
  return deps.db.transaction(async (tx) => {
    await lockCreditOwner(tx, input.owner);
    return refundLocked({ ...deps, db: tx }, input);
  });
}

async function refundLocked(
  deps: LockedGrantDeps,
  input: RefundCreditsInput,
): Promise<RefundCreditsResult> {
  const [replay] = await deps.db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.stripeEventId, input.stripeEventId));
  if (replay) {
    if (
      replay.ownerType !== input.owner.type ||
      replay.ownerId !== input.owner.id ||
      replay.app !== deps.app ||
      replay.entryType !== "refund" ||
      replay.amount !== -input.amount ||
      (replay.sourceEntryId ?? replay.metadata?.originalLedgerEntryId) !==
        input.originalLedgerEntryId
    )
      throw new BillingError("Refund event conflicts with its recorded financial scope");
    return { ledgerEntryId: replay.id, alreadyProcessed: true };
  }
  const [original] = await deps.db
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.id, input.originalLedgerEntryId),
        eq(creditLedger.ownerType, input.owner.type),
        eq(creditLedger.ownerId, input.owner.id),
        eq(creditLedger.app, deps.app),
      ),
    );
  if (
    !original ||
    original.amount <= 0 ||
    !["purchase", "bonus_grant", "promo_grant", "adjustment"].includes(original.entryType)
  )
    throw new BillingError("Refund source is not a credit grant in this wallet");
  const [refunded] = await deps.db
    .select({ amount: sql<number>`coalesce(sum(-${creditLedger.amount}), 0)`.mapWith(Number) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.ownerType, input.owner.type),
        eq(creditLedger.ownerId, input.owner.id),
        eq(creditLedger.app, deps.app),
        eq(creditLedger.entryType, "refund"),
        sql`coalesce(${creditLedger.sourceEntryId}::text, ${creditLedger.metadata}->>'originalLedgerEntryId') = ${input.originalLedgerEntryId}`,
      ),
    );
  if ((refunded?.amount ?? 0) + input.amount > original.amount)
    throw new BillingError("Refund exceeds the original credit grant");
  const inserted = await deps.db
    .insert(creditLedger)
    .values({
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      app: deps.app,
      entryType: "refund",
      amount: -Math.abs(input.amount),
      stripeEventId: input.stripeEventId,
      sourceEntryId: original.id,
      createdAt: sql`clock_timestamp()`,
      metadata: {
        ...(input.metadata ?? {}),
        reason: input.reason,
        originalLedgerEntryId: input.originalLedgerEntryId,
      },
    })
    .onConflictDoNothing({
      target: [creditLedger.stripeEventId],
    })
    .returning({ id: creditLedger.id });

  if (inserted.length > 0 && inserted[0]) {
    await forwardMigratedCreditEntry(deps.db, inserted[0].id, {
      app: deps.app,
      owner: input.owner,
    });
    emitAudit(deps, "billing.credits_refunded", {
      ledgerEntryId: inserted[0].id,
      ownerType: input.owner.type,
      ownerId: input.owner.id,
      app: deps.app,
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
        eq(creditLedger.ownerType, input.owner.type),
        eq(creditLedger.ownerId, input.owner.id),
        eq(creditLedger.app, deps.app),
        eq(creditLedger.amount, -input.amount),
        eq(creditLedger.sourceEntryId, input.originalLedgerEntryId),
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

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new BillingError(`${field} must be a positive integer`);
  }
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
