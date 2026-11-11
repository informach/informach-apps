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

describe("subscription funding transitions", () => {
  const suspend = (at: number) =>
    row("suspend", -200, at, undefined, {
      entryType: "funding_suspension",
      originalLedgerEntryId: "monthly",
    });
  const restore = (at: number) =>
    row("restore", 200, at, undefined, {
      entryType: "funding_restoration",
      originalLedgerEntryId: "monthly",
    });
  const grants = () => [row("monthly", 200, 1, 32), row("purchase", 100, 1)];

  it("freezes only the remaining financed lot, without charging purchases for past use", () => {
    const entries = [...grants(), row("accepted-use", -40, 2), suspend(3)];
    expect(balance(entries, 4).total).toBe(100);
    expect(balance([...entries, row("purchase-use", -10, 4), restore(5)], 6).total).toBe(250);
  });
  it("does not resurrect an expired monthly allowance after a dispute is won", () => {
    expect(balance([...grants(), suspend(2), restore(40)], 41).total).toBe(100);
  });
  it("keeps a later month's allowance independent of the suspended period", () => {
    expect(balance([...grants(), suspend(2), row("next-month", 200, 32, 60)], 33).total).toBe(300);
  });
  it("applies repeated state records without granting or deducting twice", () => {
    const entries = [
      ...grants(),
      suspend(2),
      { ...suspend(3), id: "repeat" },
      restore(4),
      { ...restore(5), id: "repeat-restore" },
    ];
    expect(balance(entries, 6).total).toBe(300);
  });
  it("uses the ledger sequence to order opposing transitions at an identical timestamp", () => {
    expect(
      balance([...grants(), { ...restore(2), sequence: 4 }, { ...suspend(2), sequence: 3 }], 3)
        .total,
    ).toBe(300);
  });
  it("preserves PostgreSQL microseconds when a reservation precedes restoration", () => {
    const entries = [
      ...grants(),
      suspend(2),
      { ...row("reservation", -10, 3), createdAt: "2026-01-03T00:00:00.000100+00:00" },
      { ...restore(3), createdAt: "2026-01-03T00:00:00.000200+00:00" },
    ];
    // During the dispute the reservation must spend the purchase, even after
    // restoration and expiration of the subscription lot.
    expect(balance(entries, 33).total).toBe(90);
    expect(projectCreditLedger(entries, "2026-01-03 00:00:00.000150+00").total).toBe(90);
  });
  it("rejects a funding control whose original grant is missing from the wallet", () => {
    expect(() => balance([suspend(2)], 3)).toThrow("unavailable credit grant");
  });
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
  it("preserves legacy same-transaction grant precedence after sequence backfill", () => {
    const entries = [
      { ...row("purchase", 10, 1), sequence: 1 },
      { ...row("usage", -20, 2), sequence: 2 },
      { ...row("bonus", 50, 2, 3), sequence: 3 },
    ];
    expect(balance(entries, 4).total).toBe(10);
  });
});
