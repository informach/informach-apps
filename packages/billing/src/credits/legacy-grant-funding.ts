import type { Database } from "@informach/db";
import { creditLedger, subscriptionPaymentPeriods, type subscriptions } from "@informach/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { BillingError } from "../errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Associate historical grants with verified invoice lines. The caller holds the
 * subscription row and the original wallet lock. Amounts, expiry and original
 * financial references remain unchanged; ambiguous provenance is never inferred.
 */
export async function bindLegacySubscriptionGrants(
  tx: Tx,
  input: {
    app: "cozya" | "agenda-da-turma";
    userId: string;
    subscription: typeof subscriptions.$inferSelect;
  },
) {
  const periods = await tx
    .select()
    .from(subscriptionPaymentPeriods)
    .where(eq(subscriptionPaymentPeriods.subscriptionId, input.subscription.id));
  const grants = await tx
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.app, input.app),
        eq(creditLedger.ownerType, "user"),
        eq(creditLedger.ownerId, input.userId),
        eq(creditLedger.entryType, "bonus_grant"),
        gt(creditLedger.amount, 0),
        or(
          sql`${creditLedger.metadata}->>'subscriptionId' = ${input.subscription.id}`,
          sql`${creditLedger.metadata}->>'providerSubscriptionId' = ${input.subscription.providerSubscriptionId}`,
          sql`exists (select 1 from billing.subscription_payment_periods p
            where p.subscription_id = ${input.subscription.id}::uuid
              and p.provider_invoice_id = ${creditLedger.metadata}->>'invoiceId')`,
        ),
      ),
    );
  for (const grant of grants) {
    if (
      (grant.metadata.subscriptionId !== undefined &&
        grant.metadata.subscriptionId !== input.subscription.id) ||
      (grant.metadata.providerSubscriptionId !== undefined &&
        grant.metadata.providerSubscriptionId !== input.subscription.providerSubscriptionId)
    )
      throw new BillingError("Legacy credit grant has conflicting subscription references");
    const invoiceId = grant.metadata.invoiceId;
    const anchor = grant.metadata.anchor;
    const instant = typeof anchor === "string" ? Date.parse(anchor) : Number.NaN;
    const candidates =
      typeof invoiceId === "string"
        ? periods.filter((period) => period.providerInvoiceId === invoiceId)
        : grant.metadata.grantKind === "annual_drip" && Number.isFinite(instant)
          ? periods.filter(
              (period) =>
                period.periodStart.getTime() <= instant && instant < period.periodEnd.getTime(),
            )
          : [];
    const period = candidates[0];
    if (candidates.length !== 1 || !period)
      throw new BillingError("Legacy credit grant has ambiguous invoice funding");
    if (grant.fundingPeriodId && grant.fundingPeriodId !== period.id)
      throw new BillingError("Legacy credit grant conflicts with its recorded funding");
    if (!grant.fundingPeriodId)
      await tx
        .update(creditLedger)
        .set({ fundingPeriodId: period.id })
        .where(and(eq(creditLedger.id, grant.id), isNull(creditLedger.fundingPeriodId)));
  }
}
