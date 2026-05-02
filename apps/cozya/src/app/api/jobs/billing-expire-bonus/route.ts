import { expireBillingMonthlyBonusCredits } from "@/features/billing/service";
import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: ~daily. Expires monthly bonus credits. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await expireBillingMonthlyBonusCredits();
  return Response.json(result);
}
