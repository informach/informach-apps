import { expect, it } from "vitest";
import { previewCreditConversion } from "../credits/conversion-preview";
import { type BalanceEntry, projectCreditLedger } from "../credits/ledger-balance";

const now = "2026-11-10T10:00:00.000001Z";
const expiring = "2026-11-11T10:00:00.000007Z";
const policy = { policyId: "synthetic-reviewed-tariff", numerator: 3, denominator: 2 };
function entry(id: string, amount: number, extra: Partial<BalanceEntry> = {}): BalanceEntry {
  return {
    id,
    amount,
    createdAt: "2026-11-09T10:00:00Z",
    expiresAt: null,
    entryType: amount > 0 ? "bonus_grant" : "consumption",
    ...extra,
  };
}
it("preserves each remaining expiry and rounds each converted lot in the customer's favor", () => {
  const rows = [
    entry("bought", 7),
    entry("monthly", 10, { expiresAt: expiring }),
    entry("used", -7, { createdAt: "2026-11-09T11:00:00Z" }),
  ];
  const result = previewCreditConversion(rows, now, policy);
  expect(result.sourceAmount).toBe(projectCreditLedger(rows, now).total);
  expect(result).toMatchObject({ sourceAmount: 10, amount: 16 });
  expect(result.lots).toEqual([
    { sourceEntryId: "monthly", sourceAmount: 3, amount: 5, expiresAt: expiring },
    { sourceEntryId: "bought", sourceAmount: 7, amount: 11, expiresAt: null },
  ]);
});
it("does not revive expired grants, convert spent credits or pull future renewals forward", () => {
  const rows = [
    entry("expired", 20, { expiresAt: "2026-11-10T10:00:00.000001Z" }),
    entry("spent", 10),
    entry("use", -30, { createdAt: "2026-11-09T11:00:00Z" }),
    entry("future", 200, { createdAt: "2026-12-01T00:00:00Z" }),
  ];
  expect(previewCreditConversion(rows, now, policy)).toMatchObject({
    sourceAmount: 0,
    amount: 0,
    lots: [],
  });
});
it("refuses unsettled debt or a frozen lot; restored funding preserves the old expiry", () => {
  expect(() => previewCreditConversion([entry("refunded", -2)], now, policy)).toThrow(/debt/);
  const monthly = entry("monthly", 10, { expiresAt: expiring });
  const suspended = entry("hold", -10, {
    entryType: "funding_suspension",
    originalLedgerEntryId: "monthly",
    createdAt: "2026-11-09T11:00:00Z",
  });
  expect(() => previewCreditConversion([monthly, suspended], now, policy)).toThrow(/suspended/);
  const restored = entry("restore", 10, {
    entryType: "funding_restoration",
    originalLedgerEntryId: "monthly",
    createdAt: "2026-11-09T12:00:00Z",
  });
  expect(previewCreditConversion([monthly, suspended, restored], now, policy).lots).toEqual([
    { sourceEntryId: "monthly", sourceAmount: 10, amount: 15, expiresAt: expiring },
  ]);
});
it("has no implicit conversion rate and refuses integer overflow before any mutation", () => {
  expect(() => previewCreditConversion([], now, { ...policy, denominator: 0 })).toThrow(/policy/);
  expect(() => previewCreditConversion([entry("large", 2_147_483_647)], now, policy)).toThrow(
    /ledger limit/,
  );
  expect(
    previewCreditConversion([entry("precise", 2_147_483_647)], now, {
      ...policy,
      numerator: 2_147_483_646,
      denominator: 2_147_483_647,
    }).amount,
  ).toBe(2_147_483_646);
});
