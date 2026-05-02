import { retryBillingDunningEmails } from "@/features/billing/service";
import { rejectUnauthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: every 6h. Sends dunning emails for past_due subs. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await retryBillingDunningEmails();
  return Response.json(result);
}
