import type { Database } from "@informach/db";
import { sql } from "drizzle-orm";
import type { CreditBalance, CreditOwner } from "./../types";
import { type BalanceEntry, projectCreditLedger } from "./ledger-balance";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type BalanceRow = {
  ledger: BalanceEntry[];
  reserved: number | string;
  as_of: Date | string;
};

/** One database snapshot, shared by the displayed balance and locked spending checks. */
export async function getBalance(
  deps: { db: Database | Tx; app: string },
  owner: CreditOwner,
  options: { excludeReservationId?: string } = {},
): Promise<CreditBalance> {
  const excludedId = options.excludeReservationId ?? null;
  const result = await deps.db.execute<BalanceRow>(sql`
    WITH entries AS (
      SELECT id, amount, entry_type, coalesce(effective_at, created_at) AS occurred_at,
        expires_at, coalesce(source_entry_id::text, metadata->>'originalLedgerEntryId') AS original_id, sequence
      FROM billing.credit_ledger
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND app = ${deps.app}
        AND entry_type <> 'expiration'
        AND NOT EXISTS (
          SELECT 1 FROM billing.credit_wallet_migrations
          WHERE ${owner.type} = 'user' AND source_user_id = ${owner.id} AND source_app = ${deps.app}
        )
      UNION ALL
      SELECT id, -estimated_amount, 'consumption', created_at, NULL, NULL, NULL
      FROM billing.credit_reservations
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND app = ${deps.app}
        AND status = 'active' AND expires_at > statement_timestamp()
        AND (${excludedId}::uuid IS NULL OR id <> ${excludedId}::uuid)
    )
    SELECT statement_timestamp()::text AS as_of,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', id, 'amount', amount, 'entryType', entry_type,
          'createdAt', occurred_at, 'expiresAt', expires_at,
          'originalLedgerEntryId', original_id, 'sequence', sequence
        ))
        FROM entries
      ), '[]'::json) AS ledger,
      COALESCE((
        SELECT SUM(estimated_amount) FROM billing.credit_reservations
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND app = ${deps.app}
          AND status = 'active' AND expires_at > statement_timestamp()
          AND (${excludedId}::uuid IS NULL OR id <> ${excludedId}::uuid)
      ), 0) AS reserved
  `);
  const row = result[0];
  const projected = projectCreditLedger(row?.ledger ?? [], row?.as_of ?? new Date());
  const reserved = Number(row?.reserved ?? 0);
  // Active reservations participate at their acceptance time, holding expiring
  // grants until the reservation resolves. They never consume a later grant twice.
  return { ...projected, total: projected.total + reserved, reserved, available: projected.total };
}
