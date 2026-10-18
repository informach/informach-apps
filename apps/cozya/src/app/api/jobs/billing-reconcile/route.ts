import { reconcileBillingSubscriptions } from "@/features/billing/service";
import { rejectUnauthorizedCron } from "@/lib/cron";
import { recordJob } from "@/lib/job-runs";

export const runtime = "nodejs";

/** Cron sweeper — recommended cadence: ~daily. */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await recordJob("billing-reconcile", reconcileBillingSubscriptions);
  return Response.json(result);
}
