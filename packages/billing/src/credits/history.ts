import type { Database } from "@informach/db";
import { type CreditLedgerEntry, creditLedger } from "@informach/db/schema";
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { CreditOwner, LedgerEntryType } from "./../types";

export type LedgerHistoryFilters = {
  from?: Date;
  to?: Date;
  entryTypes?: LedgerEntryType[];
  /** Opaque keyset cursor returned by a previous call. */
  cursor?: string;
  /** Default 50, max 200. */
  limit?: number;
};

export type LedgerHistoryPage = {
  entries: CreditLedgerEntry[];
  nextCursor: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Returns a keyset-paginated page of ledger entries for an owner. Sorted by
 * (createdAt DESC, id DESC) — matches `credit_ledger_owner_created_idx`.
 *
 * The cursor is opaque base64(`<iso>|<uuid>`); callers should pass it back
 * verbatim. Last page is signalled by `nextCursor === null`.
 */
export async function getCreditHistory(
  deps: { db: Database },
  owner: CreditOwner,
  filters: LedgerHistoryFilters = {},
): Promise<LedgerHistoryPage> {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const conditions = [eq(creditLedger.ownerType, owner.type), eq(creditLedger.ownerId, owner.id)];
  if (filters.from) conditions.push(gte(creditLedger.createdAt, filters.from));
  if (filters.to) conditions.push(lte(creditLedger.createdAt, filters.to));
  if (filters.entryTypes && filters.entryTypes.length > 0) {
    conditions.push(inArray(creditLedger.entryType, filters.entryTypes));
  }
  if (filters.cursor) {
    const decoded = decodeCursor(filters.cursor);
    if (decoded) {
      // Keyset: rows strictly before (createdAt, id). Composite tuple comparison
      // expressed as a clean OR (createdAt < pivot OR (= AND id < pivotId)) to keep
      // the index `(owner_type, owner_id, created_at)` usable.
      const cursorClause = or(
        lt(creditLedger.createdAt, decoded.createdAt),
        and(eq(creditLedger.createdAt, decoded.createdAt), lt(creditLedger.id, decoded.id)),
      );
      if (cursorClause) conditions.push(cursorClause);
    }
  }

  const rows = await deps.db
    .select()
    .from(creditLedger)
    .where(and(...conditions))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { entries: page, nextCursor };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = decoded.indexOf("|");
    if (sep === -1) return null;
    const isoPart = decoded.slice(0, sep);
    const idPart = decoded.slice(sep + 1);
    const date = new Date(isoPart);
    if (Number.isNaN(date.getTime()) || idPart.length === 0) return null;
    return { createdAt: date, id: idPart };
  } catch {
    return null;
  }
}

// Re-export sql in case downstream callers want to compose extra WHERE clauses.
export { sql };
