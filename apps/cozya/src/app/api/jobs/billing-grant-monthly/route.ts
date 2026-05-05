import { grantPendingBillingMonthlyBonusCredits } from "@/features/billing/service";
import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";

/**
 * Cron sweeper — recommended cadence: ~daily.
 *
 * Drips monthly bonus credits to annual subscriptions whose
 * `next_credit_grant_at` has arrived. Annual plans charge once a year, so
 * `invoice.paid` cannot be the trigger; this job replaces it for the 11
 * non-renewal months. Idempotent via synthetic Stripe event id
 * (`drip:<subId>:<YYYY-MM-DD>`).
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await grantPendingBillingMonthlyBonusCredits();
  return Response.json(result);
}
