export type BalanceEntry = {
  id: string;
  amount: number;
  entryType: string;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  originalLedgerEntryId?: string | null;
  sequence?: number | null;
};

/**
 * Replay the append-only ledger, spending the earliest-expiring credits first.
 * Excluding expired grants from SUM(amount) also subtracts their historical usage
 * from later grants. Instead, expiration removes only each grant's unspent remainder.
 * No financial history is rewritten. Expiration rows are audit records, not debits.
 */
function projectCreditState(entries: readonly BalanceEntry[], now: Date | string) {
  type Bucket = { id: string; remaining: number; expires: bigint | null; blocked: boolean };
  const buckets: Bucket[] = [];
  const byId = new Map<string, Bucket>();
  let debt = 0;
  const time = timestampMicros(now);
  const ordered = entries
    .filter((entry) => entry.entryType !== "expiration")
    .map((entry) => ({ ...entry, created: timestampMicros(entry.createdAt) }))
    .sort(
      (a, b) =>
        compareTime(a.created, b.created) ||
        Number(isGrant(b)) - Number(isGrant(a)) ||
        (a.sequence != null && b.sequence != null ? a.sequence - b.sequence : 0) ||
        Number(b.amount > 0) - Number(a.amount > 0) ||
        a.id.localeCompare(b.id),
    );
  for (const entry of ordered) {
    if (entry.created > time) continue;
    if (entry.entryType === "funding_suspension" || entry.entryType === "funding_restoration") {
      const original = entry.originalLedgerEntryId
        ? byId.get(entry.originalLedgerEntryId)
        : undefined;
      if (!original) throw new Error("Funding transition references an unavailable credit grant");
      // A dispute freezes the original remaining lot. It cannot debit another
      // purchase or turn a restoration into a new, non-expiring grant.
      original.blocked = entry.entryType === "funding_suspension";
      continue;
    }
    if (entry.amount > 0) {
      const expires = entry.expiresAt ? timestampMicros(entry.expiresAt) : null;
      const paidDebt =
        expires === null || expires > entry.created ? Math.min(debt, entry.amount) : 0;
      debt -= paidDebt;
      const bucket = { id: entry.id, remaining: entry.amount - paidDebt, expires, blocked: false };
      byId.set(entry.id, bucket);
      buckets.push(bucket);
      buckets.sort((a, b) => compareExpiry(a.expires, b.expires) || a.id.localeCompare(b.id));
      continue;
    }
    let amount = -entry.amount;
    // Revoke the referenced purchase first, even if its unused credits expired.
    // Already-spent refunded credits still reduce other funds or become debt.
    const original =
      entry.entryType === "refund" && entry.originalLedgerEntryId
        ? byId.get(entry.originalLedgerEntryId)
        : undefined;
    if (original) {
      const taken = Math.min(amount, original.remaining);
      original.remaining -= taken;
      amount -= taken;
    }
    for (const bucket of buckets) {
      if (amount === 0) break;
      if (
        bucket.blocked ||
        (bucket.expires !== null && bucket.expires <= entry.created) ||
        bucket.remaining === 0
      )
        continue;
      const taken = Math.min(amount, bucket.remaining);
      bucket.remaining -= taken;
      amount -= taken;
    }
    debt += amount;
  }
  return { buckets, debt, time };
}

/** Remaining original lots, including frozen/expired ones for financial review.
 * Shares the exact replay used for spendable balance; never reconstruct from SUM(amount).
 */
export function projectCreditLots(entries: readonly BalanceEntry[], now: Date | string) {
  const { buckets, debt, time } = projectCreditState(entries, now);
  const sources = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    debt,
    lots: buckets.map((bucket) => {
      const source = sources.get(bucket.id);
      if (!source) throw new Error("Projected credit lot has no source");
      return {
        sourceEntryId: bucket.id,
        remaining: bucket.remaining,
        expiresAt: source.expiresAt,
        blocked: bucket.blocked,
        expired: bucket.expires !== null && bucket.expires <= time,
      };
    }),
  };
}

export function projectCreditLedger(entries: readonly BalanceEntry[], now: Date | string) {
  const { buckets, debt, time } = projectCreditState(entries, now);
  let total = 0 - debt;
  let expiringAmount = 0;
  let firstExpires: bigint | null = null;
  for (const bucket of buckets) {
    if (
      bucket.blocked ||
      (bucket.expires !== null && bucket.expires <= time) ||
      bucket.remaining === 0
    )
      continue;
    total += bucket.remaining;
    if (bucket.expires !== null && bucket.expires <= time + 604_800_000_000n) {
      expiringAmount += bucket.remaining;
      if (firstExpires === null || bucket.expires < firstExpires) firstExpires = bucket.expires;
    }
  }
  return {
    total,
    expiringSoon: {
      amount: expiringAmount,
      firstExpiresAt: firstExpires === null ? null : new Date(Number(firstExpires / 1000n)),
    },
  };
}

// PostgreSQL timestamps have microsecond precision. Date alone collapses distinct
// reserve/suspend/restore events into the same millisecond and can spend the wrong lot.
function timestampMicros(value: Date | string): bigint {
  const millis = new Date(value).getTime();
  if (!Number.isFinite(millis)) throw new Error("Invalid credit ledger timestamp");
  const fraction =
    typeof value === "string" ? /\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)?.[1] : undefined;
  return BigInt(millis) * 1000n + BigInt(fraction?.slice(3, 6).padEnd(3, "0") || "0");
}

function compareTime(a: bigint, b: bigint) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function isGrant(entry: BalanceEntry) {
  return entry.amount > 0 && entry.entryType !== "funding_restoration";
}
function compareExpiry(a: bigint | null, b: bigint | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareTime(a, b);
}
