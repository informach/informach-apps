import { BillingError } from "../errors";
import { type BalanceEntry, projectCreditLots } from "./ledger-balance";
import { CreditMigrationBlockedError } from "./migration-errors";

export type CreditConversion = {
  /** A caller must supply the reviewed tariff policy; there is no default 1:1 rate. */
  policyId: string;
  numerator: number;
  denominator: number;
};

/** Pure financial preview, not permission to migrate or mutate a wallet.
 * Actual migration must re-read under both wallet locks, reject unresolved reservations,
 * verify provenance/current authority, and close the old spending source atomically.
 */
export function previewCreditConversion(
  entries: readonly BalanceEntry[],
  now: Date | string,
  conversion: CreditConversion,
) {
  if (
    !/^[a-z0-9][a-z0-9_.-]{0,99}$/.test(conversion.policyId) ||
    !Number.isSafeInteger(conversion.numerator) ||
    conversion.numerator <= 0 ||
    !Number.isSafeInteger(conversion.denominator) ||
    conversion.denominator <= 0
  )
    throw new BillingError("A reviewed credit conversion policy is required");
  const projected = projectCreditLots(entries, now);
  if (projected.debt > 0) throw new CreditMigrationBlockedError("debt");
  if (projected.lots.some((lot) => lot.blocked && !lot.expired && lot.remaining > 0))
    throw new CreditMigrationBlockedError("suspended");
  const numerator = BigInt(conversion.numerator),
    denominator = BigInt(conversion.denominator);
  const lots = projected.lots
    .filter((lot) => !lot.expired && lot.remaining > 0)
    .map((lot) => {
      if (!Number.isSafeInteger(lot.remaining)) throw new BillingError("Invalid legacy lot amount");
      // Round each original lot upward. Rounding the total would silently move value
      // between expiry dates, and floating-point arithmetic can lose a user's fraction.
      const amount = (BigInt(lot.remaining) * numerator + denominator - 1n) / denominator;
      if (amount > 2_147_483_647n)
        throw new BillingError("Converted credit lot exceeds the ledger limit");
      return {
        sourceEntryId: lot.sourceEntryId,
        sourceAmount: lot.remaining,
        amount: Number(amount),
        expiresAt: lot.expiresAt,
      };
    });
  const sourceAmount = lots.reduce((sum, lot) => sum + lot.sourceAmount, 0);
  const amount = lots.reduce((sum, lot) => sum + lot.amount, 0);
  if (!Number.isSafeInteger(sourceAmount) || !Number.isSafeInteger(amount))
    throw new BillingError("Converted balance exceeds exact integer precision");
  return { policy: { ...conversion }, sourceAmount, amount, lots };
}
