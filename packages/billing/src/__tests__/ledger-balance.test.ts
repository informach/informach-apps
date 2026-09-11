import { describe, expect, it } from "vitest";
import { type BalanceEntry, projectCreditLedger } from "../credits/ledger-balance";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const row = (
  id: string,
  amount: number,
  created: number,
  expires?: number,
  extra: Partial<BalanceEntry> = {},
): BalanceEntry => ({
  id,
  amount,
  createdAt: day(created),
  expiresAt: expires ? day(expires) : null,
  entryType: amount > 0 ? "bonus_grant" : "consumption",
  ...extra,
});
const balance = (entries: BalanceEntry[], at: number) => projectCreditLedger(entries, day(at));

describe("credit validity and historical consumption", () => {
  it("does not charge trial consumption again after the trial expires", () => {
    expect(
      balance([row("trial", 3, 1, 15), row("use", -3, 2), row("pro", 50, 20, 51)], 21).total,
    ).toBe(50);
  });
  it("expires only unspent credits between monthly renewals", () => {
    expect(
      balance([row("jan", 50, 1, 32), row("use", -20, 2), row("feb", 50, 32, 63)], 33).total,
    ).toBe(50);
  });
  it("spends expiring bonuses before non-expiring purchased credits", () => {
    const entries = [row("pack", 10, 1), row("bonus", 50, 2, 33), row("use", -20, 3)];
    expect(balance(entries, 30)).toEqual({
      total: 40,
      expiringSoon: { amount: 30, firstExpiresAt: day(33) },
    });
    expect(balance(entries, 34).total).toBe(10);
  });
  it("allocates consumption across overlapping grants by expiration", () => {
    const entries = [row("late", 10, 1, 20), row("early", 3, 2, 10), row("use", -5, 3)];
    expect(balance(entries, 11).total).toBe(8);
    expect(balance(entries, 21).total).toBe(0);
  });
  it("does not let already-expired funds pay later usage", () => {
    expect(balance([row("old", 3, 1, 2), row("new", 10, 3), row("use", -4, 4)], 5).total).toBe(6);
  });
  it("keeps real overdraft debt when consumption exceeds all grants", () => {
    const entries = [row("grant", 3, 1, 15), row("overage", -5, 2)];
    expect(balance(entries, 16).total).toBe(-2);
    expect(balance([...entries, row("next", 50, 20)], 21).total).toBe(48);
  });
  it("refunds the referenced purchase before touching a sooner-expiring bonus", () => {
    const entries = [
      row("pack", 10, 1),
      row("bonus", 3, 2, 10),
      row("refund", -10, 3, undefined, { entryType: "refund", originalLedgerEntryId: "pack" }),
    ];
    expect(balance(entries, 4).total).toBe(3);
    expect(balance(entries, 11).total).toBe(0);
  });
  it("retains a debit for refunded credits that were already spent", () => {
    expect(
      balance(
        [
          row("pack", 10, 1),
          row("use", -8, 2),
          row("refund", -10, 3, undefined, { entryType: "refund", originalLedgerEntryId: "pack" }),
        ],
        4,
      ).total,
    ).toBe(-8);
  });
  it("does not double-revoke expired unused credits on a refund", () => {
    expect(
      balance(
        [
          row("grant", 10, 1, 3),
          row("refund", -10, 4, undefined, { entryType: "refund", originalLedgerEntryId: "grant" }),
          row("new", 50, 5),
        ],
        6,
      ).total,
    ).toBe(50);
  });
  it("restores compensated usage independently of the old grant's expiration", () => {
    expect(
      balance(
        [
          row("trial", 3, 1, 15),
          row("use", -1, 2),
          row("restore", 1, 16, undefined, { entryType: "adjustment" }),
        ],
        17,
      ).total,
    ).toBe(1);
  });
  it("ignores expiration audit rows and future grants, including at the exact deadline", () => {
    expect(
      balance(
        [
          row("grant", 10, 1, 3),
          row("audit", -10, 3, 3, { entryType: "expiration" }),
          row("future", 50, 5),
        ],
        3,
      ).total,
    ).toBe(0);
  });
  it("handles PostgreSQL timestamps, arbitrary row order and grants/debits in one transaction", () => {
    const entries = [row("z-grant", 10, 1, 3), row("a-use", -5, 1), row("new", 50, 4)];
    expect(
      balance(
        [...entries]
          .reverse()
          .map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt).toISOString() })),
        5,
      ).total,
    ).toBe(50);
  });
});
