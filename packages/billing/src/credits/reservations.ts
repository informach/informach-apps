import { randomUUID } from "node:crypto";
import type { Database } from "@informach/db";
import { creditLedger, creditReservations } from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  BillingError,
  InsufficientCreditsError,
  ReservationAlreadyResolvedError,
  ReservationExpiredError,
  ReservationNotFoundError,
} from "./../errors";
import { type Logger, safeLog } from "./../logger";
import type {
  BillingAuditEvent,
  CreditOwner,
  ReservationHandle,
  ReservationReleaseReason,
} from "./../types";

/**
 * Either the top-level Drizzle client or a transaction handle. Drizzle types
 * `tx` inside `db.transaction(async (tx) => ...)` as `PgTransaction<...>` which
 * lacks `$client` / `transaction` but has every query method we use. Helpers
 * that don't open new transactions accept this wider type so they can run both
 * standalone (rare) and inside a tx.
 */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

import { getBalance } from "./balance";
import { lockCreditOwner } from "./locks";

const DEFAULT_TTL_SECONDS = 600;
const UUID_V4_OR_COMPATIBLE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReserveCreditsInput = {
  /**
   * Optional preallocated reservation UUID. When omitted, billing generates one.
   * `runId` defaults to this same UUID so ledger rows can be correlated with
   * ai.agent_runs and Mastra traces.
   */
  reservationId?: string;
  owner: CreditOwner;
  estimatedAmount: number;
  app: string;
  actorUserId?: string;
  personId?: string;
  feature: string;
  model?: string;
  runId?: string;
  requestId?: string;
  /** Default 600 (10 min). Bounded to [60, 3600]. */
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
};

export type CommitReservationInput = {
  reservationId: string;
  actualAmount: number;
  metadata?: Record<string, unknown>;
};

export type CommitReservationResult = {
  ledgerEntryId: string;
  balanceAfter: number;
};

export type ReleaseReservationInput = {
  reservationId: string;
  reason: ReservationReleaseReason;
};

export type ConsumeCreditsInput = {
  owner: CreditOwner;
  amount: number;
  app: string;
  actorUserId?: string;
  personId?: string;
  feature: string;
  model?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
};

export type ConsumeCreditsResult =
  | { ok: true; ledgerEntryId: string; balanceAfter: number }
  | { ok: false; code: "INSUFFICIENT_BALANCE"; balance: number };

export type ReservationsDeps = {
  db: Database;
  /** Stable commercial scope; the input app records the actual consumer. */
  walletScope?: string;
  authorizeSpend?: (tx: Tx, input: ReserveCreditsInput | ConsumeCreditsInput) => Promise<void>;
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
};

function clampTtl(seconds?: number): number {
  const ttl = seconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new BillingError("ttlSeconds must be a positive integer");
  }
  return Math.min(Math.max(ttl, 60), 3600);
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new BillingError(`${field} must be a positive integer`);
  }
}

function assertUuid(value: string, field: string): void {
  if (!UUID_V4_OR_COMPATIBLE_RE.test(value)) {
    throw new BillingError(`${field} must be a UUID`);
  }
}

/**
 * Computes total and (optionally excluding a specific reservation) reserved
 * within an open transaction. The advisory lock on the owner must already be held.
 *
 * `app` é obrigatório para garantir que o saldo seja escopado ao app que está
 * fazendo a operação — caso contrário, créditos do Cozya entrariam no saldo
 * do Agenda da Turma quando o mesmo `user.id` aparece nos dois.
 */
async function readBalanceForOwner(
  tx: Tx,
  owner: CreditOwner,
  app: string,
  opts: { excludeReservationId?: string } = {},
): Promise<{ total: number; reserved: number }> {
  return getBalance({ db: tx, app }, owner, opts);
}

export async function reserveCredits(
  deps: ReservationsDeps,
  input: ReserveCreditsInput,
): Promise<ReservationHandle> {
  assertPositiveInteger(input.estimatedAmount, "estimatedAmount");
  const ttlSeconds = clampTtl(input.ttlSeconds);
  const reservationId = input.reservationId ?? randomUUID();
  assertUuid(reservationId, "reservationId");

  return deps.db.transaction(
    async (tx) => {
      if (input.owner.type === "family" && !deps.authorizeSpend)
        throw new BillingError("A shared wallet requires transactional spend authorization");
      await lockCreditOwner(tx, input.owner);
      await deps.authorizeSpend?.(tx, input);
      const walletScope = deps.walletScope ?? input.app;
      const { total, reserved } = await readBalanceForOwner(tx, input.owner, walletScope);
      const available = total - reserved;
      if (available < input.estimatedAmount) {
        safeLog(deps.logger, "info", "billing.credits.reserve.insufficient", {
          ownerType: input.owner.type,
          ownerId: input.owner.id,
          requested: input.estimatedAmount,
          available,
        });
        throw new InsufficientCreditsError(available, input.estimatedAmount);
      }

      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const inserted = await tx
        .insert(creditReservations)
        .values({
          id: reservationId,
          ownerType: input.owner.type,
          ownerId: input.owner.id,
          estimatedAmount: input.estimatedAmount,
          status: "active",
          app: walletScope,
          consumerApp: input.app,
          actorUserId: input.actorUserId ?? null,
          personId: input.personId ?? null,
          feature: input.feature,
          model: input.model ?? null,
          runId: input.runId ?? reservationId,
          requestId: input.requestId ?? null,
          expiresAt,
          createdAt: sql`clock_timestamp()`,
          metadata: input.metadata ?? {},
        })
        .returning({
          id: creditReservations.id,
          expiresAt: creditReservations.expiresAt,
        });
      const row = inserted[0];
      if (!row) {
        throw new Error("@informach/billing: reserveCredits insert returned 0 rows");
      }
      safeLog(deps.logger, "debug", "billing.credits.reserve.created", {
        reservationId: row.id,
        estimated: input.estimatedAmount,
        feature: input.feature,
      });
      return {
        id: row.id,
        ownerType: input.owner.type,
        ownerId: input.owner.id,
        estimatedAmount: input.estimatedAmount,
        expiresAt: row.expiresAt,
      };
    },
    { isolationLevel: "read committed" },
  );
}

export async function commitReservation(
  deps: ReservationsDeps,
  input: CommitReservationInput,
): Promise<CommitReservationResult> {
  assertPositiveInteger(input.actualAmount, "actualAmount");
  const outcome = await deps.db.transaction(
    async (tx) => {
      const found = await tx
        .select({
          id: creditReservations.id,
          ownerType: creditReservations.ownerType,
          ownerId: creditReservations.ownerId,
          app: creditReservations.app,
          status: creditReservations.status,
          expiresAt: creditReservations.expiresAt,
          runId: creditReservations.runId,
          feature: creditReservations.feature,
          model: creditReservations.model,
          consumerApp: creditReservations.consumerApp,
          actorUserId: creditReservations.actorUserId,
          personId: creditReservations.personId,
          createdAt: creditReservations.createdAt,
          estimatedAmount: creditReservations.estimatedAmount,
        })
        .from(creditReservations)
        .where(eq(creditReservations.id, input.reservationId))
        .limit(1);
      const reservation = found[0];
      if (!reservation) {
        throw new ReservationNotFoundError(input.reservationId);
      }
      if (deps.walletScope && reservation.app !== deps.walletScope)
        throw new ReservationNotFoundError(input.reservationId);
      const owner: CreditOwner = { type: reservation.ownerType, id: reservation.ownerId };
      await lockCreditOwner(tx, owner);

      // Re-read after lock to avoid TOCTOU: another concurrent commit/release on
      // this same reservation would have changed `status`.
      const fresh = await tx
        .select({
          status: creditReservations.status,
          expiresAt: creditReservations.expiresAt,
        })
        .from(creditReservations)
        .where(eq(creditReservations.id, input.reservationId))
        .for("update")
        .limit(1);
      const current = fresh[0];
      if (!current) {
        throw new ReservationNotFoundError(input.reservationId);
      }
      if (current.status !== "active") {
        throw new ReservationAlreadyResolvedError(input.reservationId, current.status);
      }
      const isExpired = current.expiresAt.getTime() <= Date.now();
      if (isExpired) {
        // Mark as expired so a future replay cannot commit, then bail out.
        await tx
          .update(creditReservations)
          .set({ status: "expired", resolvedAt: new Date() })
          .where(
            and(
              eq(creditReservations.id, input.reservationId),
              eq(creditReservations.status, "active"),
            ),
          );
        return { expired: true as const };
      }

      if (input.actualAmount > reservation.estimatedAmount)
        throw new BillingError("Actual credits exceed the accepted reservation ceiling");

      await tx
        .update(creditReservations)
        .set({ status: "committed", resolvedAt: new Date() })
        .where(eq(creditReservations.id, input.reservationId));

      const ledgerInserted = await tx
        .insert(creditLedger)
        .values({
          ownerType: owner.type,
          ownerId: owner.id,
          app: reservation.app,
          consumerApp: reservation.consumerApp,
          actorUserId: reservation.actorUserId,
          personId: reservation.personId,
          effectiveAt: sql`(select created_at from billing.credit_reservations where id = ${input.reservationId}::uuid)`,
          createdAt: sql`clock_timestamp()`,
          entryType: "consumption",
          amount: -Math.abs(input.actualAmount),
          reservationId: input.reservationId,
          runId: reservation.runId,
          metadata: {
            feature: reservation.feature,
            model: reservation.model,
            ...(input.metadata ?? {}),
          },
        })
        .returning({ id: creditLedger.id });
      const ledgerRow = ledgerInserted[0];
      if (!ledgerRow) {
        throw new Error("@informach/billing: commitReservation ledger insert returned 0 rows");
      }

      // Compute balance AFTER the commit. The committed reservation is no longer
      // active so it doesn't subtract from `total - reserved`. The ledger entry
      // already reduces total. We exclude this reservation from `reserved` for safety.
      const { total, reserved } = await readBalanceForOwner(tx, owner, reservation.app, {
        excludeReservationId: input.reservationId,
      });
      const balanceAfter = total - reserved;

      if (deps.onAudit) {
        try {
          deps.onAudit({
            eventType: "billing.credits_consumed",
            actorId: reservation.actorUserId,
            payload: {
              reservationId: input.reservationId,
              ledgerEntryId: ledgerRow.id,
              ownerType: owner.type,
              ownerId: owner.id,
              amount: input.actualAmount,
              feature: reservation.feature,
              model: reservation.model,
              runId: reservation.runId,
            },
            timestamp: new Date(),
          });
        } catch {
          // audit must never break the commit
        }
      }

      safeLog(deps.logger, "info", "billing.credits.commit", {
        reservationId: input.reservationId,
        ledgerEntryId: ledgerRow.id,
        actualAmount: input.actualAmount,
        balanceAfter,
      });

      return { ledgerEntryId: ledgerRow.id, balanceAfter };
    },
    { isolationLevel: "read committed" },
  );
  if ("expired" in outcome) throw new ReservationExpiredError(input.reservationId);
  return outcome;
}

export async function releaseReservation(
  deps: ReservationsDeps,
  input: ReleaseReservationInput,
): Promise<void> {
  // Idempotent: only updates if currently active. Already-resolved reservations
  // become a silent no-op (no error) — the caller can replay safely.
  const updated = await deps.db.transaction(async (tx) => {
    const [reservation] = await tx
      .select({
        ownerType: creditReservations.ownerType,
        ownerId: creditReservations.ownerId,
        app: creditReservations.app,
      })
      .from(creditReservations)
      .where(eq(creditReservations.id, input.reservationId))
      .limit(1);
    if (!reservation || (deps.walletScope && reservation.app !== deps.walletScope)) return [];
    await lockCreditOwner(tx, { type: reservation.ownerType, id: reservation.ownerId });
    return tx
      .update(creditReservations)
      .set({
        status: "released",
        resolvedAt: new Date(),
        metadata: sql`${creditReservations.metadata} || ${JSON.stringify({ release_reason: input.reason })}::jsonb`,
      })
      .where(
        and(
          eq(creditReservations.id, input.reservationId),
          eq(creditReservations.status, "active"),
        ),
      )
      .returning({ id: creditReservations.id });
  });

  if (updated.length === 0) {
    safeLog(deps.logger, "debug", "billing.credits.release.noop", {
      reservationId: input.reservationId,
      reason: input.reason,
    });
    return;
  }
  safeLog(deps.logger, "info", "billing.credits.release", {
    reservationId: input.reservationId,
    reason: input.reason,
  });
}

export async function consumeCredits(
  deps: ReservationsDeps,
  input: ConsumeCreditsInput,
): Promise<ConsumeCreditsResult> {
  assertPositiveInteger(input.amount, "amount");
  // Single transaction: reserve + commit in one shot. Same advisory lock holds
  // for both phases since they share the tx.
  return deps.db.transaction(
    async (tx) => {
      if (input.owner.type === "family" && !deps.authorizeSpend)
        throw new BillingError("A shared wallet requires transactional spend authorization");
      await lockCreditOwner(tx, input.owner);
      await deps.authorizeSpend?.(tx, input);
      const walletScope = deps.walletScope ?? input.app;
      const { total, reserved } = await readBalanceForOwner(tx, input.owner, walletScope);
      const available = total - reserved;
      if (available < input.amount) {
        safeLog(deps.logger, "info", "billing.credits.consume.insufficient", {
          ownerType: input.owner.type,
          ownerId: input.owner.id,
          requested: input.amount,
          available,
        });
        return {
          ok: false as const,
          code: "INSUFFICIENT_BALANCE" as const,
          balance: available,
        };
      }

      const ledgerInserted = await tx
        .insert(creditLedger)
        .values({
          ownerType: input.owner.type,
          ownerId: input.owner.id,
          app: walletScope,
          consumerApp: input.app,
          actorUserId: input.actorUserId ?? null,
          personId: input.personId ?? null,
          createdAt: sql`clock_timestamp()`,
          entryType: "consumption",
          amount: -Math.abs(input.amount),
          runId: input.runId ?? null,
          metadata: {
            feature: input.feature,
            model: input.model ?? null,
            ...(input.metadata ?? {}),
          },
        })
        .returning({ id: creditLedger.id });
      const ledgerRow = ledgerInserted[0];
      if (!ledgerRow) {
        throw new Error("@informach/billing: consumeCredits ledger insert returned 0 rows");
      }

      if (deps.onAudit) {
        try {
          deps.onAudit({
            eventType: "billing.credits_consumed",
            actorId: null,
            payload: {
              ledgerEntryId: ledgerRow.id,
              ownerType: input.owner.type,
              ownerId: input.owner.id,
              amount: input.amount,
              feature: input.feature,
              app: input.app,
              model: input.model ?? null,
              runId: input.runId ?? null,
            },
            timestamp: new Date(),
          });
        } catch {
          // audit must never break the commit
        }
      }

      safeLog(deps.logger, "info", "billing.credits.consume", {
        ledgerEntryId: ledgerRow.id,
        amount: input.amount,
        balanceAfter: available - input.amount,
      });

      return {
        ok: true as const,
        ledgerEntryId: ledgerRow.id,
        balanceAfter: available - input.amount,
      };
    },
    { isolationLevel: "read committed" },
  );
}
