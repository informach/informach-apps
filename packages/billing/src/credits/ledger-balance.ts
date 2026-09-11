export type BalanceEntry = {
  id: string;
  amount: number;
  entryType: string;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  originalLedgerEntryId?: string | null;
};

/**
 * Replay the append-only ledger, spending the earliest-expiring credits first.
 * Excluding expired grants from SUM(amount) also subtracts their historical usage
 * from later grants. Instead, expiration removes only each grant's unspent remainder.
 * No financial history is rewritten. Expiration rows are audit records, not debits.
 */
export function projectCreditLedger(entries: readonly BalanceEntry[], now: Date) {
  type Bucket = { id: string; remaining: number; expires: number };
  const buckets: Bucket[] = [];
  const byId = new Map<string, Bucket>();
  let debt = 0;
  const time = now.getTime();
  const ordered = entries
    .filter((entry) => entry.entryType !== "expiration")
    .map((entry) => ({ ...entry, created: new Date(entry.createdAt).getTime() }))
    .sort(
      (a, b) =>
        a.created - b.created ||
        Number(b.amount > 0) - Number(a.amount > 0) ||
        a.id.localeCompare(b.id),
    );
  for (const entry of ordered) {
    if (entry.created > time) continue;
    if (entry.amount > 0) {
      const expires = entry.expiresAt ? new Date(entry.expiresAt).getTime() : Infinity;
      const paidDebt = expires > entry.created ? Math.min(debt, entry.amount) : 0;
      debt -= paidDebt;
      const bucket = { id: entry.id, remaining: entry.amount - paidDebt, expires };
      byId.set(entry.id, bucket);
      buckets.push(bucket);
      buckets.sort((a, b) => a.expires - b.expires || a.id.localeCompare(b.id));
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
      if (bucket.expires <= entry.created || bucket.remaining === 0) continue;
      const taken = Math.min(amount, bucket.remaining);
      bucket.remaining -= taken;
      amount -= taken;
    }
    debt += amount;
  }
  let total = 0 - debt;
  let expiringAmount = 0;
  let firstExpires = Infinity;
  for (const bucket of buckets) {
    if (bucket.expires <= time || bucket.remaining === 0) continue;
    total += bucket.remaining;
    if (bucket.expires <= time + 7 * 86_400_000) {
      expiringAmount += bucket.remaining;
      firstExpires = Math.min(firstExpires, bucket.expires);
    }
  }
  return {
    total,
    expiringSoon: {
      amount: expiringAmount,
      firstExpiresAt: Number.isFinite(firstExpires) ? new Date(firstExpires) : null,
    },
  };
}
