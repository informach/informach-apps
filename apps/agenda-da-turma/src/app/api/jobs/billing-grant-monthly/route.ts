import { billing } from "@/lib/billing";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Cron sweeper — recommended cadence: ~daily.
 *
 * Drips monthly bonus credits to annual subscriptions whose
 * `next_credit_grant_at` has arrived. Annual plans charge once a year, so
 * `invoice.paid` cannot be the trigger; this job replaces it for the
 * non-renewal months. Idempotent via synthetic Stripe event id
 * (`drip:<subId>:<YYYY-MM-DD>`).
 */
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await billing.grantPendingMonthlyBonusCredits();
  return Response.json(result);
}
