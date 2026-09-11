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
  const result = await deps.db.execute(sql`
    SELECT statement_timestamp() AS as_of,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', id, 'amount', amount, 'entryType', entry_type,
          'createdAt', created_at, 'expiresAt', expires_at,
          'originalLedgerEntryId', metadata->>'originalLedgerEntryId'
        ))
        FROM billing.credit_ledger
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND app = ${deps.app}
          AND entry_type <> 'expiration'
      ), '[]'::json) AS ledger,
      COALESCE((
        SELECT SUM(estimated_amount) FROM billing.credit_reservations
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} AND app = ${deps.app}
          AND status = 'active' AND expires_at > statement_timestamp()
          AND (${excludedId}::uuid IS NULL OR id <> ${excludedId}::uuid)
      ), 0) AS reserved
  `);
  const row = (result as unknown as BalanceRow[])[0];
  const projected = projectCreditLedger(row?.ledger ?? [], new Date(row?.as_of ?? Date.now()));
  const reserved = Number(row?.reserved ?? 0);
  return { ...projected, reserved, available: projected.total - reserved };
}
