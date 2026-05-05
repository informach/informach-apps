import type { Database } from "@informach/db";
import { sql } from "drizzle-orm";
import type { CreditBalance, CreditOwner } from "./../types";

type BalanceRow = {
  total: number | string | null;
  reserved: number | string | null;
  expiring_amount: number | string | null;
  expiring_first: Date | string | null;
};

/**
 * Returns the current balance for an owner in a single Postgres round-trip.
 *
 *   total      = SUM(ledger.amount) WHERE entry_type != expiration AND not expired
 *   reserved   = SUM(reservations.estimated_amount) WHERE status='active' AND expires_at > now()
 *   available  = total - reserved
 *   expiringSoon.amount         = SUM(positive ledger entries) expiring within next 7 days
 *   expiringSoon.firstExpiresAt = MIN(expires_at) of the above
 *
 * The query uses scalar subqueries (no FROM clause) so it returns exactly one row.
 * SUM of int4 returns bigint in Postgres, which postgres-js may surface as `string`;
 * we coerce via Number() at the boundary.
 */
export async function getBalance(
  deps: { db: Database },
  owner: CreditOwner,
): Promise<CreditBalance> {
  const result = await deps.db.execute(sql`
    SELECT
      COALESCE((
        SELECT SUM(amount)
        FROM billing.credit_ledger
        WHERE owner_type = ${owner.type}
          AND owner_id = ${owner.id}
          AND entry_type <> 'expiration'
          AND (expires_at IS NULL OR expires_at > now())
      ), 0) AS total,
      COALESCE((
        SELECT SUM(estimated_amount)
        FROM billing.credit_reservations
        WHERE owner_type = ${owner.type}
          AND owner_id = ${owner.id}
          AND status = 'active'
          AND expires_at > now()
      ), 0) AS reserved,
      COALESCE((
        SELECT SUM(amount)
        FROM billing.credit_ledger
        WHERE owner_type = ${owner.type}
          AND owner_id = ${owner.id}
          AND amount > 0
          AND expires_at IS NOT NULL
          AND expires_at BETWEEN now() AND now() + interval '7 days'
      ), 0) AS expiring_amount,
      (
        SELECT MIN(expires_at)
        FROM billing.credit_ledger
        WHERE owner_type = ${owner.type}
          AND owner_id = ${owner.id}
          AND amount > 0
          AND expires_at IS NOT NULL
          AND expires_at BETWEEN now() AND now() + interval '7 days'
      ) AS expiring_first
  `);

  const rows = result as unknown as BalanceRow[];
  const row = rows[0];
  if (!row) {
    return {
      total: 0,
      reserved: 0,
      available: 0,
      expiringSoon: { amount: 0, firstExpiresAt: null },
    };
  }

  const total = Number(row.total ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const expiringAmount = Number(row.expiring_amount ?? 0);
  const expiringFirst =
    row.expiring_first === null || row.expiring_first === undefined
      ? null
      : row.expiring_first instanceof Date
        ? row.expiring_first
        : new Date(row.expiring_first);

  return {
    total,
    reserved,
    available: total - reserved,
    expiringSoon: {
      amount: expiringAmount,
      firstExpiresAt: expiringFirst,
    },
  };
}
